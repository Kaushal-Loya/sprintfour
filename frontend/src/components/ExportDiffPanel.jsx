// components/ExportDiffPanel.jsx
// Shows a word-level diff (original vs redacted) after export.
// Toggle between diff view and redacted-only view. Copy button included.

import { useState } from 'react';

/**
 * @param {{
 *   originalText: string,
 *   redactedText: string,
 *   onClose: () => void,
 * }} props
 */
export default function ExportDiffPanel({ originalText, redactedText, onClose }) {
  const [view, setView]     = useState('diff');    // 'diff' | 'redacted'
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(redactedText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const diff = buildWordDiff(originalText, redactedText);

  return (
    <div className="export-diff-panel">
      {/* Header */}
      <div className="export-diff-header">
        <div style={{ display: 'flex', gap: 'var(--space-1)', background: 'var(--color-surface-2)', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
          <button
            className={`diff-tab ${view === 'diff' ? 'diff-tab-active' : ''}`}
            onClick={() => setView('diff')}
          >
            Diff view
          </button>
          <button
            className={`diff-tab ${view === 'redacted' ? 'diff-tab-active' : ''}`}
            onClick={() => setView('redacted')}
          >
            Redacted only
          </button>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <button className="diff-copy-btn" onClick={handleCopy}>
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '16px', lineHeight: 1 }}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="export-diff-content">
        {view === 'diff' ? (
          <div className="diff-text">
            {diff.map((seg, i) => {
              if (seg.type === 'same') {
                return <span key={i} className="diff-same">{seg.text}</span>;
              }
              return (
                <span key={i}>
                  <span className="diff-removed">{seg.original}</span>
                  {' '}
                  <span className="diff-added">{seg.redacted}</span>
                </span>
              );
            })}
          </div>
        ) : (
          <pre className="diff-text diff-text-mono">{redactedText}</pre>
        )}
      </div>
    </div>
  );
}

/**
 * Build a word-level diff between two strings.
 * Returns segments: { type: 'same', text } or { type: 'changed', original, redacted }
 */
function buildWordDiff(original, redacted) {
  const origWords    = original.split(/(\s+)/);
  const redactWords  = redacted.split(/(\s+)/);
  const maxLen       = Math.max(origWords.length, redactWords.length);
  const segments     = [];

  for (let i = 0; i < maxLen; i++) {
    const orig = origWords[i]  ?? '';
    const redc = redactWords[i] ?? '';
    if (orig === redc) {
      segments.push({ type: 'same', text: orig });
    } else {
      segments.push({ type: 'changed', original: orig, redacted: redc });
    }
  }

  return segments;
}
