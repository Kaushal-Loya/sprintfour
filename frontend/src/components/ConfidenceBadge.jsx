// components/ConfidenceBadge.jsx
// Reusable confidence level indicator.
// The visual weight of this badge is the first trust signal Marcus sees.

const BAND_CONFIG = {
  HIGH:   { label: 'High',     className: 'badge-high' },
  MEDIUM: { label: 'Medium',   className: 'badge-medium' },
  LOW:    { label: 'Low',      className: 'badge-low' },
};

/**
 * @param {{ confidence: number, showValue?: boolean, size?: 'sm' | 'md' }} props
 */
export default function ConfidenceBadge({ confidence, showValue = true, size = 'md' }) {
  const band =
    confidence >= 0.85 ? 'HIGH' :
    confidence >= 0.60 ? 'MEDIUM' : 'LOW';

  const config = BAND_CONFIG[band];
  const pct = Math.round(confidence * 100);

  return (
    <span className={`confidence-badge ${config.className} badge-${size}`}>
      <span className="badge-dot" />
      <span className="badge-label">{config.label}</span>
      {showValue && <span className="badge-value">{pct}%</span>}
    </span>
  );
}
