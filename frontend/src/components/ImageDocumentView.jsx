// components/ImageDocumentView.jsx
// Renders image-based PDF pages (Aadhaar, scanned docs) with visual PII redaction.
// 
// Architecture:
//   - Each page is an <img> with a precisely positioned <svg> overlay
//   - The SVG uses viewBox matching the original image dimensions, so bbox
//     coordinates from Tesseract map directly onto the image without JS scaling math
//   - Redacted spans → filled black <rect> elements
//   - Revealed spans → semi-transparent yellow <rect> elements
//   - Selected span → blue border on its rect
//   - Hover → tooltip showing PII type + confidence

import { useMemo } from "react";

/**
 * @param {{
 *   pages: Array<{ dataUrl: string, width: number, height: number }>,
 *   wordBoxes: Array<{
 *     word: string, startIndex: number, endIndex: number,
 *     bbox: { x0, y0, x1, y1 }, pageIndex: number,
 *     pageWidth: number, pageHeight: number
 *   }>,
 *   spans: PIISpan[],
 *   selectedSpanId: string | null,
 *   onSpanClick: (span: PIISpan) => void,
 * }} props
 */
export default function ImageDocumentView({
  pages,
  wordBoxes,
  spans,
  selectedSpanId,
  onSpanClick,
  pdfDims,
}) {
  // Build a list of redaction overlay rectangles per page.
  // Each span may produce multiple rects if it covers multiple lines.
  const overlaysByPage = useMemo(
    () => buildOverlays(spans, wordBoxes, pages.length),
    [spans, wordBoxes, pages.length]
  );

  if (!pages || pages.length === 0) {
    return (
      <div className="document-view" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
        Rendering PDF pages…
      </div>
    );
  }

  return (
    <div className="document-view image-document-view">
      {pages.map((page, pageIdx) => {
        const pageOverlays = overlaysByPage[pageIdx] ?? [];

        return (
          <div
            key={pageIdx}
            className="pdf-page-wrapper"
            style={{ marginBottom: pageIdx < pages.length - 1 ? "var(--space-6)" : 0 }}
          >
            {/* Page label for multi-page docs */}
            {pages.length > 1 && (
              <div className="pdf-page-label">Page {pageIdx + 1}</div>
            )}

            {/* Page image + SVG overlay container */}
            <div style={{ position: "relative", display: "block", lineHeight: 0 }}>
              <img
                src={page.dataUrl}
                alt={`Page ${pageIdx + 1}`}
                style={{ display: "block", width: "100%", height: "auto" }}
                draggable={false}
              />

              {/*
                SVG overlay: viewBox matches original image pixel dimensions.
                The SVG stretches 100%×100% over the image, so Tesseract bbox
                coordinates (which are in image pixel space) map directly onto
                the displayed image without any JS scaling computation.
              */}
              <svg
                viewBox={`0 0 ${pdfDims?.[pageIdx]?.width || page.width} ${pdfDims?.[pageIdx]?.height || page.height}`}
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  overflow: "visible",
                }}
              >
                {pageOverlays.map((overlay, i) => {
                  const { span, bbox } = overlay;
                  const isSelected = span.id === selectedSpanId;
                  const action = span.action ?? null;
                  
                  let fill = "black";
                  if (action === null) {
                    fill = "rgba(245, 158, 11, 0.6)"; // amber (unreviewed)
                  } else if (action === 'keep-visible') {
                    fill = "rgba(74, 222, 128, 0.25)"; // transparent green
                  } else if (action === 'anonymous') {
                    fill = "rgba(139, 92, 246, 0.85)"; // purple
                  }

                  let stroke = isSelected ? "var(--color-accent, #6c63ff)" : "none";
                  if (action === 'keep-visible' && !isSelected) {
                    stroke = "rgba(74, 222, 128, 0.8)";
                  }

                  const w = bbox.x1 - bbox.x0;
                  const h = bbox.y1 - bbox.y0;

                  return (
                    <g key={i} style={{ cursor: "pointer" }} onClick={() => onSpanClick(span)}>
                      <rect
                        x={bbox.x0}
                        y={bbox.y0}
                        width={w}
                        height={h}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={isSelected || action === 'keep-visible' ? Math.max(2, page.width * 0.002) : 0}
                        rx={Math.max(1, page.width * 0.001)}
                      />
                      <title>{span.type} — {action ?? 'unreviewed'}</title>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })}

      {/* Legend — matches the text view legend */}
      <div className="document-legend">
        <span className="legend-item" style={{ gap: "var(--space-2)", display: "flex", alignItems: "center" }}>
          <span style={{ display: "inline-block", width: 14, height: 10, background: "rgba(245, 158, 11, 0.6)", borderRadius: 2 }} />
          Unreviewed
        </span>
        <span className="legend-item" style={{ gap: "var(--space-2)", display: "flex", alignItems: "center" }}>
          <span style={{ display: "inline-block", width: 14, height: 10, background: "black", borderRadius: 2 }} />
          Redacted
        </span>
        <span className="legend-item" style={{ gap: "var(--space-2)", display: "flex", alignItems: "center" }}>
          <span style={{ display: "inline-block", width: 14, height: 10, background: "rgba(74, 222, 128, 0.25)", border: "1px solid rgba(74, 222, 128, 0.8)", borderRadius: 2 }} />
          Visible
        </span>
        <span className="legend-item" style={{ gap: "var(--space-2)", display: "flex", alignItems: "center" }}>
          <span style={{ display: "inline-block", width: 14, height: 10, background: "rgba(139, 92, 246, 0.85)", borderRadius: 2 }} />
          Anonymous
        </span>
        <span className="legend-sep" />
        <span className="legend-hint">Click a redaction to inspect</span>
      </div>
    </div>
  );
}

/**
 * Build SVG overlay rectangles for all spans across all pages.
 *
 * Strategy:
 * 1. For each span, find all wordBoxes whose char range falls inside the span.
 * 2. Group matched boxes by page index.
 * 3. Within each page, group boxes into visual lines (similar Y coordinates).
 * 4. For each line group, compute a union bounding box → one SVG <rect>.
 * This handles multi-word PII (e.g. full names) and multi-line PII (e.g. addresses).
 *
 * @param {PIISpan[]} spans
 * @param {Array<object>} wordBoxes
 * @param {number} numPages
 * @returns {Array<Array<{ span, bbox }>>} - indexed by page
 */
function buildOverlays(spans, wordBoxes, numPages) {
  const result = Array.from({ length: numPages }, () => []);

  for (const span of spans) {
    // Match word boxes whose character range overlaps this span
    const matched = wordBoxes.filter(
      (wb) => wb.startIndex < span.endIndex && wb.endIndex > span.startIndex
    );

    if (matched.length === 0) continue;

    // Group by page
    const byPage = {};
    for (const wb of matched) {
      if (!byPage[wb.pageIndex]) byPage[wb.pageIndex] = [];
      byPage[wb.pageIndex].push(wb);
    }

    for (const [pageIdx, boxes] of Object.entries(byPage)) {
      const idx = parseInt(pageIdx, 10);
      if (idx >= numPages) continue;

      // Group boxes into visual lines by Y proximity
      // Two boxes are on the same line if they overlap vertically
      const sorted = [...boxes].sort((a, b) => a.bbox.y0 - b.bbox.y0);
      const lines = [];

      for (const box of sorted) {
        const lastLine = lines[lines.length - 1];
        if (!lastLine || box.bbox.y0 >= lastLine.maxY1) {
          lines.push({ boxes: [box], maxY1: box.bbox.y1 });
        } else {
          lastLine.boxes.push(box);
          lastLine.maxY1 = Math.max(lastLine.maxY1, box.bbox.y1);
        }
      }

      // One rect per visual line
      for (const line of lines) {
        const x0 = Math.min(...line.boxes.map((b) => b.bbox.x0));
        const y0 = Math.min(...line.boxes.map((b) => b.bbox.y0));
        const x1 = Math.max(...line.boxes.map((b) => b.bbox.x1));
        const y1 = Math.max(...line.boxes.map((b) => b.bbox.y1));

        result[idx].push({ span, bbox: { x0, y0, x1, y1 } });
      }
    }
  }

  return result;
}
