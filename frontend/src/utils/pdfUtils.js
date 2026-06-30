// utils/pdfUtils.js
// Renders PDF pages to PNG data URLs using pdfjs-dist (browser)
// so they can be displayed visually in ImageDocumentView.

import * as pdfjsLib from "pdfjs-dist";

// Wire up the pdfjs worker (Vite resolves this URL at build time)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

/**
 * Scale factor for PDF page rendering.
 * 2.0 = 200 DPI equivalent — high enough for good visual clarity.
 */
const RENDER_SCALE = 2.0;

/**
 * Render all pages of a PDF to data URLs for visual display.
 *
 * @param {File} file - The original PDF File object from the browser
 * @returns {Promise<Array<{ dataUrl: string, width: number, height: number }>>}
 */
export async function renderPDFPages(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    // Render page to an off-screen canvas
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Store the data URL for display
    const dataUrl = canvas.toDataURL("image/png");

    pages.push({
      dataUrl,
      width: canvas.width,
      height: canvas.height,
    });
  }

  return pages;
}
