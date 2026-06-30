import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import html2pdf from 'html2pdf.js';

// ─── Anonymous replacement labels ────────────────────────────────────────────

const ANON_LABELS = {
  PERSON_NAME:    '[REDACTED NAME]',
  EMAIL:          '[REDACTED EMAIL]',
  PHONE:          '[REDACTED PHONE]',
  SSN:            '[REDACTED SSN]',
  ADDRESS:        '[REDACTED ADDRESS]',
  DATE_OF_BIRTH:  '[REDACTED DOB]',
  ACCOUNT_NUMBER: '[REDACTED ACCOUNT]',
  FINANCIAL:      '[REDACTED FINANCIAL]',
  URL:            '[REDACTED URL]',
  ORG:            '[REDACTED ORG]',
  JOB_TITLE:      '[REDACTED ROLE]',
  OTHER:          '[REDACTED]',
};

/**
 * Determine the effective export action for a span.
 * Unreviewed spans default to 'redact' for safe export.
 */
function effectiveAction(span) {
  if (span.action === 'keep-visible') return 'keep-visible';
  if (span.action === 'anonymous')    return 'anonymous';
  return 'redact'; // 'redact' or null (unreviewed) → redact
}

/**
 * Get the replacement text for a span given its action.
 */
function getReplacementText(span) {
  const action = effectiveAction(span);
  if (action === 'keep-visible') return span.text;
  if (action === 'anonymous')    return ANON_LABELS[span.type] || '[REDACTED]';
  // 'redact' → solid block characters
  return '█'.repeat(Math.max(span.text.length, 3));
}

// ─── Plain text redaction (for diff view) ────────────────────────────────────

/**
 * Build a redacted plain text string from document text + spans.
 * Used for the diff panel preview.
 * @param {string} text
 * @param {Array} spans
 * @returns {string}
 */
export function buildRedactedText(text, spans) {
  const sorted = [...spans]
    .filter(s => effectiveAction(s) !== 'keep-visible')
    .sort((a, b) => a.startIndex - b.startIndex);

  let output = '';
  let cursor = 0;

  for (const span of sorted) {
    if (span.startIndex < cursor) continue; // overlapping — skip
    output += text.slice(cursor, span.startIndex);
    output += getReplacementText(span);
    cursor = span.endIndex;
  }

  output += text.slice(cursor);
  return output;
}

// ─── HTML → PDF (fallback for non-PDF uploads or when PyMuPDF unavailable) ──

export const exportToPDF = (element, filename) => {
  if (!element) return;

  const originalStyles = {
    height:    element.style.height,
    maxHeight: element.style.maxHeight,
    overflow:  element.style.overflow,
    overflowY: element.style.overflowY,
    position:  element.style.position,
    flex:      element.style.flex,
  };

  element.style.height    = 'auto';
  element.style.maxHeight = 'none';
  element.style.overflow  = 'visible';
  element.style.overflowY = 'visible';
  element.style.position  = 'static';
  element.style.flex      = 'none';

  const opt = {
    margin:      [10, 10, 10, 10],
    filename:    filename || 'redacted_document.pdf',
    image:       { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
  };

  setTimeout(() => {
    html2pdf().set(opt).from(element).save().then(() => {
      Object.assign(element.style, originalStyles);
    }).catch(err => {
      console.error('PDF export failed:', err);
      Object.assign(element.style, originalStyles);
    });
  }, 100);
};

// ─── DOCX export (action-aware) ───────────────────────────────────────────────

export const exportToDocx = async (text, spans, filename) => {
  const sortedSpans = [...spans].sort((a, b) => a.startIndex - b.startIndex);
  const lines = text.split('\n');
  const paragraphs = [];
  let globalIndex = 0;

  for (const line of lines) {
    const lineEnd = globalIndex + line.length;
    const runs = [];
    let linePos = globalIndex;

    const lineSpans = sortedSpans.filter(s =>
      (s.startIndex >= globalIndex && s.startIndex < lineEnd) ||
      (s.endIndex   >  globalIndex && s.endIndex   <= lineEnd) ||
      (s.startIndex <  globalIndex && s.endIndex   >  lineEnd)
    );

    if (lineSpans.length === 0) {
      runs.push(new TextRun(line.length > 0 ? line : ''));
    } else {
      for (const span of lineSpans) {
        const start = Math.max(span.startIndex, globalIndex);
        const end   = Math.min(span.endIndex,   lineEnd);

        if (start > linePos) {
          runs.push(new TextRun(text.substring(linePos, start)));
        }

        const action = effectiveAction(span);

        if (action === 'keep-visible') {
          // Show original text — no formatting change
          runs.push(new TextRun(span.text));
        } else if (action === 'anonymous') {
          // [REDACTED TYPE] — grey background
          runs.push(new TextRun({
            text:    ANON_LABELS[span.type] || '[REDACTED]',
            bold:    true,
            color:   '444444',
            shading: { type: 'clear', color: 'auto', fill: 'DDDDDD' },
          }));
        } else {
          // Solid redaction — black background with block chars
          runs.push(new TextRun({
            text:    '█'.repeat(Math.max(span.text.length, 3)),
            color:   '000000',
            shading: { type: 'clear', color: 'auto', fill: '000000' },
          }));
        }

        linePos = end;
      }

      if (linePos < lineEnd) {
        runs.push(new TextRun(text.substring(linePos, lineEnd)));
      }
    }

    paragraphs.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
    globalIndex = lineEnd + 1; // +1 for newline
  }

  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename || 'redacted_document.docx');
};
