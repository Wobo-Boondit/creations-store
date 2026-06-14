import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * S3 client for creations-store image uploads.
 * Uses the same Linode Object Storage bucket as rhythm,
 * but all objects are stored under the "bccs/" prefix.
 */

const BCCS_PREFIX = "bccs";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = () => process.env.S3_BUCKET!;

export function publicUrl(key: string): string {
  return `${process.env.S3_PUBLIC_URL}/${key}`;
}

/**
 * Upload an image to S3 under bccs/<subpath>.
 * Returns the public URL.
 */
export async function uploadImage(
  filename: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const key = `${BCCS_PREFIX}/${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: "public-read",
    }),
  );

  return publicUrl(key);
}

/**
 * Delete an image from S3 by its key.
 */
export async function deleteImage(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET(),
      Key: key,
    }),
  );
}
