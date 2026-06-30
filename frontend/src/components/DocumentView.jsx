// components/DocumentView.jsx
// Renders the document text with redaction highlights.
// - Splits text into segments: plain text and PII spans
// - Each span is rendered as a redacted pill (or revealed text if toggled)
// - Confidence band colors are applied visually from the first glance
// - Text selection on non-redacted text triggers the "why not?" flow (P1)

import { useRef, useCallback, useEffect } from 'react';

/**
 * @param {{
 *   text: string,
 *   spans: PIISpan[],
 *   selectedSpanId: string | null,
 *   onSpanClick: (span: PIISpan) => void,
 *   onTextSelection: (selectedText: string) => void,
 * }} props
 */
export default function DocumentView({
  text,
  spans,
  selectedSpanId,
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

    // Find the closest text segment element to get its global offset
    const textSegmentEl = el.closest('.doc-text');
    let startIndex = null;
    let endIndex = null;

    if (textSegmentEl) {
      const globalOffsetStr = textSegmentEl.getAttribute('data-offset');
      if (globalOffsetStr != null) {
        const globalOffset = parseInt(globalOffsetStr, 10);
        startIndex = globalOffset + Math.min(range.startOffset, range.endOffset);
        endIndex = globalOffset + Math.max(range.startOffset, range.endOffset);
      }
    }

    if (startIndex == null) {
      // Fallback: search for the text in the document
      // This handles selections across multiple nodes or from the margin
      startIndex = text.indexOf(selected);
      if (startIndex === -1) return; // Not found exactly (maybe spanned across redacted pills)
      endIndex = startIndex + selected.length;
    }

    const rect = range.getBoundingClientRect();
    onTextSelection({ text: selected, startIndex, endIndex, rect });
  }, [onTextSelection]);

  // Scroll to selected span
  useEffect(() => {
    if (selectedSpanId && containerRef.current) {
      const container = containerRef.current;
      const el = container.querySelector(`[data-span-id="${selectedSpanId}"]`);
      if (el) {
        // Use offsetTop which is relative to the offsetParent (now .document-view)
        const targetScrollTop = el.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2);
        
        setTimeout(() => {
          container.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });
        }, 10);
      }
    }
  }, [selectedSpanId]);

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
              <span key={i} className="doc-text" data-offset={seg.startIndex}>
                {seg.content}
              </span>
            );
          }

          // PII span
          const span = seg.span;
          const isSelected  = span.id === selectedSpanId;
          const action       = span.action ?? null;
          const isKeepVisible = action === 'keep-visible';
          const isAnonymous   = action === 'anonymous';
          const band = getConfidenceBand(span.confidence);

          // keep-visible: show original text with a subtle green underline
          if (isKeepVisible) {
            return (
              <span
                key={i}
                data-span-id={span.id}
                className="doc-span doc-span-visible"
                onClick={() => onSpanClick(span)}
                title={`${span.type} — kept visible`}
              >
                {span.text}
              </span>
            );
          }

          // anonymous: show [TYPE] in purple pill
          if (isAnonymous) {
            return (
              <span
                key={i}
                data-span-id={span.id}
                className={`doc-span doc-span-anonymous ${isSelected ? 'span-selected' : ''}`}
                onClick={() => onSpanClick(span)}
                title={`${span.type} — will export as label`}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onSpanClick(span)}
              >
                <span className="span-label">{formatAnonLabel(span.type)}</span>
              </span>
            );
          }

          // redact: solid blackout pill
          if (action === 'redact') {
            return (
              <span
                key={i}
                data-span-id={span.id}
                className={`doc-span doc-span-blackout ${isSelected ? 'span-selected' : ''}`}
                onClick={() => onSpanClick(span)}
                title={`${span.type} — redacted`}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onSpanClick(span)}
              >
                <span className="span-label">{span.text}</span>
              </span>
            );
          }

          // default: unreviewed pill
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
              <sub className="span-number left">{span.groupIndex}</sub>
              <span className="span-label">{formatType(span.type)}</span>
              {span.confidence < 0.60 && (
                <span className="span-uncertain" title="Low confidence — AI is uncertain">?</span>
              )}
              <sub className="span-number right">{span.globalIndex}</sub>
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
      segments.push({ type: 'text', content: text.slice(cursor, span.startIndex), startIndex: cursor });
    }
    segments.push({ type: 'span', span });
    cursor = span.endIndex;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', content: text.slice(cursor), startIndex: cursor });
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
    PERSON_NAME: 'NAME',
    EMAIL:       'EMAIL',
    PHONE:       'PHONE',
    SSN:         'SSN',
    ADDRESS:     'ADDRESS',
    DATE_OF_BIRTH: 'DOB',
    ORG:         'ORG',
    JOB_TITLE:   'ROLE',
    ACCOUNT_NUMBER: 'ACCT#',
    FINANCIAL:   '$$$',
    URL:         'URL',
    OTHER:       'PII',
  };
  return map[type] || type;
}

function formatAnonLabel(type) {
  const map = {
    PERSON_NAME:    '[NAME]',
    EMAIL:          '[EMAIL]',
    PHONE:          '[PHONE]',
    SSN:            '[SSN]',
    ADDRESS:        '[ADDRESS]',
    DATE_OF_BIRTH:  '[DOB]',
    ORG:            '[ORG]',
    JOB_TITLE:      '[ROLE]',
    ACCOUNT_NUMBER: '[ACCOUNT]',
    FINANCIAL:      '[FINANCIAL]',
    URL:            '[URL]',
    OTHER:          '[REDACTED]',
  };
  return map[type] || '[REDACTED]';
}
