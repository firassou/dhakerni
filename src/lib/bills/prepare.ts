/** The largest side of an uploaded photo, in pixels: sharp enough to read small print, small enough to send. */
const MAX_SIDE = 1800;
const MAX_BYTES = 3.5 * 1024 * 1024; // the server takes 4 MB

export class UnreadableFile extends Error {}

/**
 * A photo is shrunk and re-encoded as JPEG before it leaves the phone (this also turns HEIC into JPEG on
 * browsers that can show it). A PDF goes as it is, if it is small enough.
 */
export async function prepareBillFile(file: File | Blob): Promise<Blob> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_BYTES) throw new UnreadableFile("too_large");
    return file;
  }
  if (!file.type.startsWith("image/")) throw new UnreadableFile("type");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UnreadableFile("decode");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new UnreadableFile("too_large");
}
