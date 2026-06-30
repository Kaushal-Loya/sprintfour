// components/WhyNotPanel.jsx
// Panel for "why wasn't this text flagged as PII?"
// This is the inverse of the obvious ask — it answers the second half
// of Marcus's question: why was something *kept* visible, not just what was hidden.

/**
 * @param {{
 *   selectedText: string | null,
 *   explanation: string | null,
 *   isLoading: boolean,
 *   error: string | null,
 *   onClear: () => void,
 * }} props
 */
export default function WhyNotPanel({ selectedText, explanation, isLoading, error, onClear }) {
  if (!selectedText && !isLoading) {
    return (
      <div className="panel panel-empty panel-why-hint">
        <div className="panel-empty-icon">💬</div>
        <p className="panel-empty-title">Why wasn't this flagged?</p>
        <p className="panel-empty-hint">
          Select any non-redacted text in the document and ask why the AI
          chose not to flag it. The AI will explain honestly — including
          if it thinks it made a mistake.
        </p>
      </div>
    );
  }

  return (
    <div className="panel panel-why">
      <div className="panel-header">
        <div className="panel-header-left">
          <span className="panel-type-icon">💬</span>
          <div>
            <div className="panel-type-label">Why wasn't this flagged?</div>
          </div>
        </div>
        {!isLoading && (
          <button className="btn-clear" onClick={onClear} title="Clear">✕</button>
        )}
      </div>

      {/* The selected text */}
      {selectedText && (
        <div className="panel-section">
          <div className="panel-section-title">Selected text</div>
          <div className="panel-selected-text">"{selectedText}"</div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="panel-loading">
          <div className="spinner spinner-sm" />
          <span>Asking the AI to explain its decision…</span>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="panel-warning panel-warning-low">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Explanation */}
      {explanation && !isLoading && (
        <div className="panel-section">
          <div className="panel-section-title">AI's reasoning</div>
          <p className="panel-reasoning">{explanation}</p>
          <p className="panel-verify-hint">
            Note: the AI is instructed to admit if this text actually should have been flagged.
            A candid "this might be borderline" is a trust signal, not a failure.
          </p>
        </div>
      )}
    </div>
  );
}
