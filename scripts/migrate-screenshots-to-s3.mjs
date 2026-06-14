#!/usr/bin/env node
/**
 * Migrates all non-CDN screenshot_url values in store_creations
 * and non-CDN url values in store_screenshots to S3 (cdn.boondit.site).
 *
 * Downloads each image, uploads to S3 under bccs/screenshots/,
 * then updates the DB row via Supabase REST API.
 *
 * Uses plain fetch (no supabase-js) for Node 20 compat on nugget.
 */

import crypto from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_REGION = process.env.S3_REGION;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL;

if (!SUPABASE_URL || !SERVICE_KEY || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
  console.error("Missing required env vars. Check .env");
  process.exit(1);
}

// --- AWS Signature V4 helpers ---
function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}
function hexhmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function uploadToS3(buffer, key, contentType) {
  const date = new Date();
  const dateStamp = date.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = date.toISOString().slice(0, 19).replace(/[:-]/g, "") + "Z";

  const payloadHash = sha256(buffer);

  const canonicalUri = "/" + S3_BUCKET + "/" + key;
  const canonicalQueryString = "";
  const canonicalHeaders =
    `host:${S3_BUCKET}.${S3_REGION}.linodeobjects.com\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${S3_REGION}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const kDate = hmac("AWS4" + S3_SECRET_KEY, dateStamp);
  const kRegion = hmac(kDate, S3_REGION);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hexhmac(kSigning, stringToSign);

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${S3_ACCESS_KEY}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const hostname = `${S3_BUCKET}.${S3_REGION}.linodeobjects.com`;
  const url = `https://${hostname}/${key}`;

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Host: hostname,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authHeader,
      "Content-Type": contentType,
      "Content-Length": buffer.length,
    },
    body: buffer,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`S3 upload failed (${resp.status}): ${text}`);
  }

  return `${S3_PUBLIC_URL}/${key}`;
}

function guessContentType(url) {
  const ext = url.split(".").pop()?.toLowerCase().split("?")[0];
  const map = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return map[ext] || "image/jpeg";
}

function isCdn(url) {
  if (!url) return true; // empty is fine
  return url.includes("cdn.boondit.site");
}

async function migrate() {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  // 1. Get all non-CDN screenshot_url from store_creations
  console.log("Fetching store_creations...");
  const creq = await fetch(
    `${SUPABASE_URL}/rest/v1/store_creations?select=id,title,icon_url,screenshot_url,favicon,screenshot,og_image`,
    { headers }
  );
  const creations = await creq.json();
  console.log(`  ${creations.length} total creations`);

  let migrated = 0;
  let failed = 0;
  let skipped = 0;

  const urlFields = ["icon_url", "screenshot_url", "favicon", "screenshot", "og_image"];

  for (const c of creations) {
    const updates = {};

    for (const field of urlFields) {
      const val = c[field];
      if (val && !isCdn(val) && val.startsWith("http")) {
        try {
          console.log(`  [${field}] ${c.title?.slice(0, 30)}: downloading...`);
          const imgResp = await fetch(val, { redirect: "follow" });
          if (!imgResp.ok) {
            console.error(`    DOWNLOAD FAILED (${imgResp.status}): ${val}`);
            failed++;
            continue;
          }
          const buffer = Buffer.from(await imgResp.arrayBuffer());
          const ext = val.split(".").pop()?.toLowerCase().split("?")[0] || "jpg";
          const hash = crypto.createHash("md5").update(buffer).digest("hex").slice(0, 12);
          const key = `bccs/screenshots/${hash}.${ext}`;
          const contentType = guessContentType(val);
          const cdnUrl = await uploadToS3(buffer, key, contentType);
          console.log(`    uploaded: ${cdnUrl}`);
          updates[field] = cdnUrl;
          migrated++;
        } catch (e) {
          console.error(`    ERROR: ${e.message}`);
          failed++;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      const patchResp = await fetch(
        `${SUPABASE_URL}/rest/v1/store_creations?id=eq.${c.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify(updates),
        }
      );
      if (!patchResp.ok) {
        console.error(`    DB UPDATE FAILED: ${await patchResp.text()}`);
        failed++;
      } else {
        console.log(`    DB updated for ${c.title?.slice(0, 30)}`);
      }
    }
  }

  // 2. Get all non-CDN url from store_screenshots
  console.log("\nFetching store_screenshots...");
  const sreq = await fetch(
    `${SUPABASE_URL}/rest/v1/store_screenshots?select=id,creation_id,url`,
    { headers }
  );
  const screenshots = await sreq.json();
  console.log(`  ${screenshots.length} total screenshots`);

  for (const s of screenshots) {
    const val = s.url;
    if (val && !isCdn(val) && val.startsWith("http")) {
      try {
        console.log(`  [screenshot ${s.id.slice(0, 8)}]: downloading...`);
        const imgResp = await fetch(val, { redirect: "follow" });
        if (!imgResp.ok) {
          console.error(`    DOWNLOAD FAILED (${imgResp.status}): ${val}`);
          failed++;
          continue;
        }
        const buffer = Buffer.from(await imgResp.arrayBuffer());
        const ext = val.split(".").pop()?.toLowerCase().split("?")[0] || "jpg";
        const hash = crypto.createHash("md5").update(buffer).digest("hex").slice(0, 12);
        const key = `bccs/screenshots/${hash}.${ext}`;
        const contentType = guessContentType(val);
        const cdnUrl = await uploadToS3(buffer, key, contentType);
        console.log(`    uploaded: ${cdnUrl}`);

        const patchResp = await fetch(
          `${SUPABASE_URL}/rest/v1/store_screenshots?id=eq.${s.id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ url: cdnUrl }),
          }
        );
        if (!patchResp.ok) {
          console.error(`    DB UPDATE FAILED: ${await patchResp.text()}`);
          failed++;
        } else {
          console.log(`    DB updated for screenshot ${s.id.slice(0, 8)}`);
          migrated++;
        }
      } catch (e) {
        console.error(`    ERROR: ${e.message}`);
        failed++;
      }
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Failed:   ${failed}`);
  console.log(`Skipped:  ${skipped}`);
}

migrate().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
