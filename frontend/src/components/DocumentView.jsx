// components/DocumentView.jsx
// Renders the document text with redaction highlights.
// - Splits text into segments: plain text and PII spans
// - Each span is rendered as a redacted pill (or revealed text if toggled)
// - Confidence band colors are applied visually from the first glance
// - Text selection on non-redacted text triggers the "why not?" flow (P1)

import { useRef, useCallback } from 'react';

/**
 * @param {{
 *   text: string,
 *   spans: PIISpan[],
 *   selectedSpanId: string | null,
 *   revealedIds: Set<string>,
 *   onSpanClick: (span: PIISpan) => void,
 *   onTextSelection: (selectedText: string) => void,
 * }} props
 */
export default function DocumentView({
  text,
  spans,
  selectedSpanId,
  revealedIds,
  onSpanClick,
  onTextSelection,
}) {
  const containerRef = useRef(null);

  // Split document text into alternating plain/span segments
  const segments = buildSegments(text, spans);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selected = selection.toString().trim();
    if (!selected || selected.length < 2 || selected.length > 500) return;

    // Don't trigger if selection is entirely within a redacted span
    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;

    // Check if the selection overlaps with a redacted element
    const node = range.commonAncestorContainer;
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (el.closest('[data-span-id]')) return; // inside a redaction — skip

    onTextSelection(selected);
  }, [onTextSelection]);

  return (
    <div
      className="document-view"
      ref={containerRef}
      onMouseUp={handleMouseUp}
    >
      <div className="document-content">
        {segments.map((seg, i) => {
          if (seg.type === 'text') {
            return (
              <span key={i} className="doc-text">
                {seg.content}
              </span>
            );
          }

          // PII span
          const span = seg.span;
          const isSelected = span.id === selectedSpanId;
          const isRevealed = revealedIds.has(span.id);
          const band = getConfidenceBand(span.confidence);

          if (isRevealed) {
            return (
              <span
                key={i}
                data-span-id={span.id}
                className={`doc-span doc-span-revealed band-${band}`}
                onClick={() => onSpanClick(span)}
                title={`${span.type} — ${Math.round(span.confidence * 100)}% confidence (revealed)`}
              >
                {span.text}
                <span className="span-revealed-indicator" title="Text revealed for verification">👁</span>
              </span>
            );
          }

          return (
            <span
              key={i}
              data-span-id={span.id}
              className={`doc-span doc-span-redacted band-${band} ${isSelected ? 'span-selected' : ''}`}
              onClick={() => onSpanClick(span)}
              title={`Click to inspect — ${span.type}, ${Math.round(span.confidence * 100)}% confidence`}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSpanClick(span)}
              aria-label={`Redacted: ${span.type}, ${Math.round(span.confidence * 100)}% confidence`}
            >
              <span className="span-label">{formatType(span.type)}</span>
              {span.confidence < 0.60 && (
                <span className="span-uncertain" title="Low confidence — AI is uncertain">?</span>
              )}
            </span>
          );
        })}
      </div>

      <div className="document-legend">
        <span className="legend-item">
          <span className="legend-dot dot-high" /> Primary PII
        </span>
        <span className="legend-item">
          <span className="legend-dot dot-medium" /> Contextual PII
        </span>
        <span className="legend-item">
          <span className="legend-dot dot-low" /> Low confidence
        </span>
        <span className="legend-sep" />
        <span className="legend-hint">Click a redaction to inspect · Select text to ask why it wasn't flagged</span>
      </div>
    </div>
  );
}

/** Split the document into plain text and span segments in order */
function buildSegments(text, spans) {
  if (!spans || spans.length === 0) return [{ type: 'text', content: text }];

  const segments = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.startIndex > cursor) {
      segments.push({ type: 'text', content: text.slice(cursor, span.startIndex) });
    }
    segments.push({ type: 'span', span });
    cursor = span.endIndex;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', content: text.slice(cursor) });
  }

  return segments;
}

function getConfidenceBand(confidence) {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.60) return 'medium';
  return 'low';
}

function formatType(type) {
  const map = {
    PERSON_NAME: 'Name',
    EMAIL:       'Email',
    PHONE:       'Phone',
    SSN:         'SSN',
    ADDRESS:     'Address',
    DATE_OF_BIRTH: 'DOB',
    ORG:         'Org',
    JOB_TITLE:   'Role',
    ACCOUNT_NUMBER: 'Acct#',
    FINANCIAL:   '$$$',
    OTHER:       'PII',
  };
  return map[type] || type;
}
