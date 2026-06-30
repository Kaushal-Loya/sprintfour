// api/client.js
// Fetch wrappers for backend endpoints.
// All paths use /api — proxied to localhost:3001 by Vite in dev.

const BASE = '/api';

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
