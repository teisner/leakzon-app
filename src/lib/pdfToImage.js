import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

/**
 * Renders the first page of a PDF file to a PNG File.
 * @param {File} pdfFile
 * @returns {Promise<File>} PNG file
 */
export async function pdfToPngFile(pdfFile) {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  // Render at 2x for clarity
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const baseName = pdfFile.name.replace(/\.pdf$/i, "");
  return new File([blob], `${baseName}.png`, { type: "image/png" });
}