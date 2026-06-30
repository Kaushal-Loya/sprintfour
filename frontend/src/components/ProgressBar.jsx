// components/ProgressBar.jsx
// Shows review progress: [bar] X/Y reviewed | → Next unreviewed | ✓ Confirm all ≥85%
// Hidden when no spans exist.

export default function ProgressBar({
  reviewedCount,
  totalCount,
  unreviewedCount,
  allReviewed,
  onNextUnreviewed,
  onConfirmHighConfidence,
}) {
  if (totalCount === 0) return null;

  const pct = totalCount > 0 ? (reviewedCount / totalCount) * 100 : 0;

  return (
    <div className="progress-bar-wrapper">
      {/* Bar + counter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className="progress-label"
          style={{ color: allReviewed ? 'var(--color-success, #4ade80)' : 'var(--color-text-secondary)' }}
        >
          {allReviewed ? '✓ All reviewed' : `${reviewedCount} / ${totalCount} reviewed`}
        </span>
      </div>

      {/* Action buttons — hidden when all reviewed */}
      {!allReviewed && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button
            className="btn-progress-action"
            onClick={onNextUnreviewed}
            disabled={unreviewedCount === 0}
          >
            → Next unreviewed
            <span className="progress-badge">{unreviewedCount}</span>
          </button>
          <button
            className="btn-progress-action btn-progress-action-secondary"
            onClick={onConfirmHighConfidence}
          >
            ✓ Confirm all ≥85%
          </button>
        </div>
      )}
    </div>
  );
}
