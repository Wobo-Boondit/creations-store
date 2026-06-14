/**
 * Migration script: Download all non-CDN icon images and re-upload to S3.
 *
 * Usage:
 *   node scripts/migrate-icons-to-s3.mjs
 *
 * Requires env vars (from .env):
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_PUBLIC_URL
 *
 * What it does:
 *   1. Fetches all creations from Supabase
 *   2. Finds rows where icon_url or favicon points to a non-CDN host
 *   3. Downloads the image, re-uploads to S3 under bccs/icons/
 *   4. Updates the DB row with the new CDN URL
 */

import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { extname } from "path";
import { randomUUID } from "crypto";

// --- Config from env ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || "https://cdn.boondit.site";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!S3_ENDPOINT || !S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET) {
  console.error("Missing S3 config. Need S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET");
  process.exit(1);
}

const CDN_HOST = (() => {
  try {
    return new URL(S3_PUBLIC_URL).hostname;
  } catch {
    return "cdn.boondit.site";
  }
})();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  try {
    return new URL(url).hostname === CDN_HOST;
  } catch {
    return false;
  }
}

function guessExtension(url, contentType) {
  // Try content-type first
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("png")) return ".png";
    if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
    if (ct.includes("gif")) return ".gif";
    if (ct.includes("webp")) return ".webp";
    if (ct.includes("svg")) return ".svg";
    if (ct.includes("ico")) return ".ico";
  }
  // Fall back to URL extension
  try {
    const path = new URL(url).pathname;
    const ext = extname(path).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"].includes(ext)) {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {}
  return ".png"; // default
}

async function downloadAndUpload(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());

  // Skip if unreasonably large (> 5MB for an icon)
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error(`Image too large: ${buffer.length} bytes`);
  }

  const ext = guessExtension(url, contentType);
  const key = `bccs/icons/${randomUUID()}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || "image/png",
      ACL: "public-read",
    })
  );

  return `${S3_PUBLIC_URL}/${key}`;
}

async function migrateField(row, fieldName) {
  const url = row[fieldName];
  if (!url || isCdnUrl(url)) return null;

  try {
    const newUrl = await downloadAndUpload(url);
    console.log(`  ${fieldName}: ${url} -> ${newUrl}`);
    return newUrl;
  } catch (err) {
    console.error(`  ${fieldName}: FAILED to migrate ${url}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(`CDN host: ${CDN_HOST}`);
  console.log("Fetching all creations...\n");

  const { data: creations, error } = await supabase
    .from("store_creations")
    .select("id, title, icon_url, favicon")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch creations:", error.message);
    process.exit(1);
  }

  let migrated = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of creations) {
    const needsIconMigration = row.icon_url && !isCdnUrl(row.icon_url);
    const needsFaviconMigration = row.favicon && !isCdnUrl(row.favicon);

    if (!needsIconMigration && !needsFaviconMigration) {
      skipped++;
      continue;
    }

    console.log(`[${row.id}] ${row.title}`);

    const updates = {};

    if (needsIconMigration) {
      const newUrl = await migrateField(row, "icon_url");
      if (newUrl) {
        updates.icon_url = newUrl;
        migrated++;
      } else {
        failed++;
      }
    }

    if (needsFaviconMigration) {
      const newUrl = await migrateField(row, "favicon");
      if (newUrl) {
        updates.favicon = newUrl;
        migrated++;
      } else {
        failed++;
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("store_creations")
        .update(updates)
        .eq("id", row.id);

      if (updateError) {
        console.error(`  DB update failed: ${updateError.message}`);
      }
    }

    // Small delay to avoid hammering external servers
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone. Migrated: ${migrated}, Failed: ${failed}, Already CDN: ${skipped}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
