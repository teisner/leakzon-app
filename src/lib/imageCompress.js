// Downscales/compresses a large image File before upload. Carbon-copy overlays
// (site plans, aerials, scans) are often many MB / very high resolution, which
// made uploads slow. We cap the longest side at MAX_DIM and re-encode; the
// result is visually identical on a map overlay but a fraction of the size.
const MAX_DIM = 2560;
const JPEG_QUALITY = 0.85;
// Below this, compressing isn't worth the work.
const SKIP_BELOW_BYTES = 400 * 1024;

export async function compressImageFile(file) {
  if (!file || !file.type?.startsWith("image/")) return file;
  // PNGs may carry transparency we must preserve; only re-encode PNG as PNG.
  const isPng = file.type === "image/png";
  if (file.size < SKIP_BELOW_BYTES) return file;

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return file; // if we can't decode it, upload the original
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  // If it's already small enough and not huge in bytes, keep the original.
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
    if (bitmap.close) bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  if (bitmap.close) bitmap.close();

  const type = isPng ? "image/png" : "image/jpeg";
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, type, isPng ? undefined : JPEG_QUALITY)
  );
  if (!blob || blob.size >= file.size) return file; // no gain — keep original

  const ext = isPng ? "png" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.${ext}`, { type });
}

function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Fallback for browsers without createImageBitmap
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
