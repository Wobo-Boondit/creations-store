// Client-side avatar resizing — center-crops any image to a square PNG via
// OffscreenCanvas. Mirrors rhythm's lib/image.ts so both apps produce the same
// 256×256 avatar shape before upload.

const AVATAR_SIZE = 256;

export async function resizeToSquarePng(
  file: File,
  size = AVATAR_SIZE,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    return await canvas.convertToBlob({ type: "image/png" });
  } finally {
    bitmap.close();
  }
}
