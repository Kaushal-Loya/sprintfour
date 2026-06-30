// components/SummaryBar.jsx
// Top-of-page audit summary: total spans, breakdown by confidence band.
// Gives Marcus an at-a-glance trust signal before reading line by line.

import ConfidenceBadge from './ConfidenceBadge.jsx';

/**
 * @param {{ spans: PIISpan[], isLoading: boolean }} props
 */
export default function SummaryBar({ spans, isLoading }) {
  if (isLoading) {
    return (
      <div className="summary-bar summary-bar-loading">
        <div className="spinner spinner-sm" />
        <span>Analyzing document for PII…</span>
      </div>
    );
  }

  if (!spans || spans.length === 0) return null;

  const high   = spans.filter(s => s.confidence >= 0.85).length;
  const medium = spans.filter(s => s.confidence >= 0.60 && s.confidence < 0.85).length;
  const low    = spans.filter(s => s.confidence < 0.60).length;

  const types = [...new Set(spans.map(s => s.type))];

  return (
    <div className="summary-bar">
      <div className="summary-stat summary-total">
        <span className="summary-number">{spans.length}</span>
        <span className="summary-label">PII items found</span>
      </div>

      <div className="summary-divider" />

      <div className="summary-bands">
        <div className="summary-band" title={`${high} primary PII redactions (Tier 1)`}>
          <span className="band-count band-count-high">{high}</span>
          <ConfidenceBadge confidence={0.9} showValue={false} size="sm" />
        </div>
        <div className="summary-band" title={`${medium} contextual PII redactions (Tier 2)`}>
          <span className="band-count band-count-medium">{medium}</span>
          <ConfidenceBadge confidence={0.7} showValue={false} size="sm" />
        </div>
        {low > 0 && (
          <div className="summary-band" title={`${low} low-confidence — please review`}>
            <span className="band-count band-count-low">{low}</span>
            <ConfidenceBadge confidence={0.4} showValue={false} size="sm" />
            <span className="summary-review-tag">review</span>
          </div>
        )}
      </div>

      <div className="summary-divider" />

      <div className="summary-types">
        <span className="summary-label">Types:</span>
        {types.map(type => (
          <span key={type} className="type-chip">{formatType(type)}</span>
        ))}
      </div>

      {low > 0 && (
        <div className="summary-alert">
          ⚠ {low} item{low > 1 ? 's' : ''} flagged with low confidence — click to inspect
        </div>
      )}
    </div>
  );
}

function formatType(type) {
  const map = {
    PERSON_NAME: 'Name',
    EMAIL: 'Email',
    PHONE: 'Phone',
    SSN: 'SSN',
    ADDRESS: 'Address',
    DATE_OF_BIRTH: 'DOB',
    ORG: 'Org',
    JOB_TITLE: 'Role',
    ACCOUNT_NUMBER: 'Acct#',
    FINANCIAL: 'Financial',
    OTHER: 'Other',
  };
  return map[type] || type;
}
