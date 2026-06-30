// components/RedactionPanel.jsx
// Side panel for a selected redaction span.
// Shows: type, confidence badge, reasoning, and the reveal/verify toggle.
// The reveal toggle is the single most important trust feature — it converts
// "trust my explanation" into "verify it yourself."

import { useState } from 'react';
import ConfidenceBadge from './ConfidenceBadge.jsx';

const TYPE_LABELS = {
  PERSON_NAME: 'Person Name',
  EMAIL:       'Email Address',
  PHONE:       'Phone Number',
  SSN:         'Social Security Number',
  ADDRESS:     'Physical Address',
  DATE_OF_BIRTH: 'Date of Birth',
  ORG:         'Organization',
  JOB_TITLE:   'Job Title / Role',
  ACCOUNT_NUMBER: 'Account / Policy Number',
  FINANCIAL:   'Financial Information',
  OTHER:       'Other PII',
};

const TYPE_ICONS = {
  PERSON_NAME: '👤',
  EMAIL:       '✉️',
  PHONE:       '📞',
  SSN:         '🔑',
  ADDRESS:     '📍',
  DATE_OF_BIRTH: '🗓',
  ORG:         '🏢',
  JOB_TITLE:   '💼',
  ACCOUNT_NUMBER: '🪪',
  FINANCIAL:   '💰',
  OTHER:       '⚠️',
};

/**
 * @param {{
 *   span: PIISpan | null,
 *   revealedIds: Set<string>,
 *   onReveal: (id: string) => void,
 *   onHide: (id: string) => void,
 * }} props
 */
export default function RedactionPanel({ span, revealedIds, onReveal, onHide }) {
  if (!span) {
    return (
      <div className="panel panel-empty">
        <div className="panel-empty-icon">🔍</div>
        <p className="panel-empty-title">Click any redaction to inspect it</p>
        <p className="panel-empty-hint">
          Each redacted item includes the AI's reasoning and a confidence level.
          You can also reveal the underlying text to verify the AI's claim yourself.
        </p>
      </div>
    );
  }

  const isRevealed = revealedIds.has(span.id);
  const isLowConfidence = span.confidence < 0.60;
  const isMediumConfidence = span.confidence >= 0.60 && span.confidence < 0.85;

  return (
    <div className="panel panel-redaction">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-header-left">
          <span className="panel-type-icon">{TYPE_ICONS[span.type] || '⚠️'}</span>
          <div>
            <div className="panel-type-label">{TYPE_LABELS[span.type] || span.type}</div>
            <div className="panel-type-id">ID: {span.id}</div>
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div style={{ padding: 'var(--space-4) var(--space-5) 0' }}>
        <ConfidenceBadge confidence={span.confidence} />
      </div>

      {/* Low confidence warning */}
      {isLowConfidence && (
        <div className="panel-warning panel-warning-low">
          <span>⚠</span>
          <span>Low confidence — the AI is uncertain about this redaction. Review carefully.</span>
        </div>
      )}
      {isMediumConfidence && (
        <div className="panel-warning panel-warning-medium">
          <span>◈</span>
          <span>Medium confidence — plausible but worth a quick check.</span>
        </div>
      )}

      {/* Reasoning */}
      <div className="panel-section">
        <div className="panel-section-title">Why was this flagged?</div>
        <p className="panel-reasoning">{span.reasoning}</p>
      </div>

      {/* Reveal / Verify toggle — the key trust mechanic */}
      <div className="panel-section">
        <div className="panel-section-title">Verify</div>
        <p className="panel-verify-hint">
          {isRevealed
            ? "You're seeing the actual text. Does it match the AI's claim above?"
            : "Reveal the underlying text to verify the AI's reasoning yourself."}
        </p>

        {isRevealed ? (
          <div className="panel-revealed-box">
            <div className="panel-revealed-label">Actual text</div>
            <div className="panel-revealed-text">{span.text}</div>
            <button
              className="btn-hide"
              onClick={() => onHide(span.id)}
            >
              Re-redact
            </button>
          </div>
        ) : (
          <button
            className="btn-reveal"
            onClick={() => onReveal(span.id)}
          >
            <span>👁</span> Reveal & Verify
          </button>
        )}
      </div>

      {/* Meta */}
      <div className="panel-meta">
        <span>Position: chars {span.startIndex}–{span.endIndex}</span>
        <span>·</span>
        <span>{span.endIndex - span.startIndex} characters</span>
      </div>
    </div>
  );
}
