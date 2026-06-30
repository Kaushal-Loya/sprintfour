// api/client.js
// Fetch wrappers for backend endpoints.
// All paths use /api — proxied to localhost:3001 by Vite in dev.
// In production (Vercel), set VITE_API_URL to the Render backend URL (e.g., https://your-backend.onrender.com/api)

const BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Fetch the list of sample documents.
 * @returns {Promise<{ id: string, title: string }[]>}
 */
export async function fetchDocs() {
  const res = await fetch(`${BASE}/detect/docs`);
  if (!res.ok) throw new Error('Failed to load sample documents.');
  const data = await res.json();
  return data.docs;
}

/**
 * Fetch a single sample document by id.
 * @param {string} docId
 * @returns {Promise<{ id: string, title: string, text: string }>}
 */
export async function fetchDoc(docId) {
  const res = await fetch(`${BASE}/detect/docs/${docId}`);
  if (!res.ok) throw new Error('Failed to load document.');
  return res.json();
}

/**
 * Upload a document to extract text.
 * @param {File} file
 * @returns {Promise<{ id: string, title: string, text: string, wordBoxes?: Array<any>, pages?: Array<any>, isImagePDF?: boolean }>}
 */
export async function uploadDoc(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to upload document.');
  return data;
}

/**
 * Send a rendered PDF page image to the server for Tesseract OCR.
 * Returns extracted text and per-word bounding boxes in image pixel coordinates.
 * @param {Blob} imageBlob - PNG blob of the rendered page
 * @param {number} imageWidth - Canvas width (pixels)
 * @param {number} imageHeight - Canvas height (pixels)
 * @returns {Promise<{
 *   text: string,
 *   wordBoxes: Array<{ word: string, startIndex: number, endIndex: number, bbox: { x0, y0, x1, y1 }, confidence: number }>,
 *   imageWidth: number,
 *   imageHeight: number
 * }>}
 */
export async function ocrPage(imageBlob, imageWidth, imageHeight) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'page.png');
  formData.append('imageWidth', imageWidth.toString());
  formData.append('imageHeight', imageHeight.toString());

  const res = await fetch(`${BASE}/ocr`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'OCR processing failed.');
  
  return {
    ...data,
    imageWidth,
    imageHeight
  };
}

/**
 * Run PII detection on a document text.
 * @param {string} text
 * @returns {Promise<{ spans: PIISpan[], meta: object }>}
 */
export async function detectPII(text) {
  const res = await fetch(`${BASE}/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Detection failed. Please try again.');
  }

  return data;
}

/**
 * Explain why a selected text was NOT flagged as PII.
 * @param {string} documentText - Full document text for context
 * @param {string} selectedText - The text the user selected
 * @returns {Promise<string>} - Plain-English explanation
 */
export async function explainSelection(documentText, selectedText) {
  const res = await fetch(`${BASE}/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentText, selectedText }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Could not generate explanation.');
  }

  return data.explanation;
}

/**
 * Export a PDF with real PyMuPDF redactions burned in.
 * @param {File} pdfFile - The original uploaded PDF File object
 * @param {Array} spans - Span array with action field (redact/anonymous/keep-visible)
 * @returns {Promise<Blob>} - The redacted PDF as a Blob
 */
export async function exportPDF(pdfFile, spans) {
  const formData = new FormData();
  formData.append('file', pdfFile, pdfFile.name);
  formData.append('spans', JSON.stringify(spans));

  const res = await fetch(`${BASE}/export/pdf`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'PDF export failed.');
  }

  return res.blob();
}
