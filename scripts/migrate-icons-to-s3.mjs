/**
 * Migration script: Download all non-CDN icon images and re-upload to S3.
 * Uses plain fetch (no Supabase JS client) to avoid WebSocket dependency.
 *
 * Usage:
 *   set -a && source .env && set +a && node scripts/migrate-icons-to-s3.mjs
 */

import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { extname } from "path";
import { randomUUID } from "crypto";

// --- Config from env ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || "https://cdn.boondit.site";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!S3_ENDPOINT || !S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET) {
  console.error("Missing S3 config");
  process.exit(1);
}

const CDN_HOST = (() => {
  try { return new URL(S3_PUBLIC_URL).hostname; } catch { return "cdn.boondit.site"; }
})();

// --- Plain REST helpers (no WebSocket needed) ---
async function sbSelect(table, columns, orderBy) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set("select", columns);
  if (orderBy) {
    url.searchParams.set("order", orderBy);
  }
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`REST select failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbUpdate(table, id, updates) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set("id", `eq.${id}`);
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`REST update failed: ${res.status} ${await res.text()}`);
}

// --- S3 client ---
const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

function isCdnUrl(url) {
  if (!url) return true;
  try { return new URL(url).hostname === CDN_HOST; } catch { return false; }
}

function guessExtension(url, contentType) {
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("png")) return ".png";
    if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
    if (ct.includes("gif")) return ".gif";
    if (ct.includes("webp")) return ".webp";
    if (ct.includes("svg")) return ".svg";
    if (ct.includes("ico")) return ".ico";
  }
  try {
    const ext = extname(new URL(url).pathname).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"].includes(ext)) {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {}
  return ".png";
}

async function downloadAndUpload(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error(`Image too large: ${buffer.length} bytes`);
  }

  const ext = guessExtension(url, contentType);
  const key = `bccs/icons/${randomUUID()}${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || "image/png",
    ACL: "public-read",
  }));

  return `${S3_PUBLIC_URL}/${key}`;
}

async function migrateField(row, fieldName) {
  const url = row[fieldName];
  if (!url || isCdnUrl(url)) return null;

  try {
    const newUrl = await downloadAndUpload(url);
    console.log(`  ${fieldName}: ${url.substring(0, 60)}... -> ${newUrl}`);
    return newUrl;
  } catch (err) {
    console.error(`  ${fieldName}: FAILED ${url.substring(0, 60)}... : ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(`CDN host: ${CDN_HOST}`);
  console.log("Fetching all creations...\n");

  const rows = await sbSelect(
    "store_creations",
    "id,title,icon_url,favicon",
    "created_at.asc"
  );

  let migrated = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const needsIcon = row.icon_url && !isCdnUrl(row.icon_url);
    const needsFavicon = row.favicon && !isCdnUrl(row.favicon);

    if (!needsIcon && !needsFavicon) {
      skipped++;
      continue;
    }

    console.log(`[${row.id}] ${row.title}`);

    const updates = {};

    if (needsIcon) {
      const newUrl = await migrateField(row, "icon_url");
      if (newUrl) { updates.icon_url = newUrl; migrated++; }
      else failed++;
    }

    if (needsFavicon) {
      const newUrl = await migrateField(row, "favicon");
      if (newUrl) { updates.favicon = newUrl; migrated++; }
      else failed++;
    }

    if (Object.keys(updates).length > 0) {
      await sbUpdate("store_creations", row.id, updates);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone. Migrated: ${migrated}, Failed: ${failed}, Already CDN: ${skipped}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
