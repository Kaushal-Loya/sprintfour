import { useState, useMemo } from 'react';
import ConfidenceBadge from './ConfidenceBadge.jsx';

const TYPE_LABELS = {
  PERSON_NAME:    'NAME',
  EMAIL:          'EMAIL',
  PHONE:          'PHONE',
  SSN:            'SSN',
  ADDRESS:        'ADDRESS',
  DATE_OF_BIRTH:  'DOB',
  ORG:            'ORG',
  JOB_TITLE:      'ROLE',
  ACCOUNT_NUMBER: 'ACCT#',
  FINANCIAL:      '$$$',
  URL:            'URL',
  OTHER:          'PII',
};

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

export default function AllRedactionsPanel({
  spans,
  selectedSpanId,
  onSpanClick,
  onUpdateSpan,
  onRemove,
}) {
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [sortBy, setSortBy] = useState('confidence');

  const selectedSpan = useMemo(() => spans.find(s => s.id === selectedSpanId), [spans, selectedSpanId]);

  const groupedSpans = useMemo(() => {
    const groups = {};
    spans.forEach(span => {
      if (!groups[span.type]) groups[span.type] = [];
      groups[span.type].push(span);
    });
    return Object.entries(groups).sort(([typeA, spansA], [typeB, spansB]) => {
      if (sortBy === 'alphabetical') {
        return (TYPE_LABELS[typeA] || typeA).localeCompare(TYPE_LABELS[typeB] || typeB);
      }
      return Math.max(...spansB.map(s => s.confidence)) - Math.max(...spansA.map(s => s.confidence));
    });
  }, [spans, sortBy]);

  const toggleGroup = (type) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  if (spans.length === 0) {
    return (
      <div className="panel panel-empty" style={{ height: '100%' }}>
        <p className="panel-empty-title">No redactions yet</p>
        <p className="panel-empty-hint">Select a document and click Analyze to detect PII.</p>
      </div>
    );
  }

  return (
    <div className="all-redactions-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="panel-header" style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>Detected PII</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ fontSize: 'var(--text-xs)', padding: '2px 6px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
          >
            <option value="confidence">Sort: Confidence</option>
            <option value="alphabetical">Sort: A–Z</option>
          </select>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
            {spans.length} items
          </span>
        </div>
      </div>

      <div className="accordion-list" style={{ overflowY: 'auto', flex: 1, padding: '0 0 var(--space-8) 0' }}>
        {groupedSpans.map(([type, groupSpans]) => {
          const isExpanded = expandedGroups.has(type);
          const label = TYPE_LABELS[type] || type;
          const unreviewedInGroup = groupSpans.filter(s => s.status === 'unreviewed').length;

          return (
            <div key={type} className="accordion-group" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <button
                className="accordion-header"
                onClick={() => toggleGroup(type)}
                aria-expanded={isExpanded}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-4) var(--space-5)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>{label}</span>
                  <span style={{ fontSize: 'var(--text-xs)', background: 'var(--color-surface-3)', color: 'var(--color-text-muted)', padding: '2px 8px', borderRadius: '10px' }}>
                    {groupSpans.length}
                  </span>
                  {unreviewedInGroup > 0 && (
                    <span style={{ fontSize: '10px', color: 'var(--color-warning, #f59e0b)', background: 'rgba(245,158,11,0.12)', padding: '1px 6px', borderRadius: '10px' }}>
                      {unreviewedInGroup} pending
                    </span>
                  )}
                </div>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{isExpanded ? '▼' : '▶'}</span>
              </button>

              {isExpanded && (
                <div className="accordion-content">
                  {groupSpans.map(span => (
                    <RedactionListItem
                      key={span.id}
                      span={span}
                      isSelected={selectedSpanId === span.id}
                      onClick={() => onSpanClick(span)}
                      totalSpans={spans.length}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detail Dialog */}
      {selectedSpan && (
        <div
          className="redaction-dialog-overlay"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
        >
          <div className="redaction-dialog" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', width: '100%', maxHeight: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border)' }}>
            <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>Redaction Details</h4>
              <button onClick={() => onSpanClick(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--color-text-muted)' }}>✕</button>
            </div>
            <div style={{ padding: 0, overflowY: 'auto' }}>
              <RedactionDetailContent
                span={selectedSpan}
                spans={spans}
                onUpdateSpan={onUpdateSpan}
                onRemove={() => { onRemove(selectedSpan.id); onSpanClick(null); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getBandClass(confidence) {
  if (confidence >= 0.85) return 'band-high';
  if (confidence >= 0.60) return 'band-medium';
  return 'band-low';
}

function getRowBg(confidence) {
  if (confidence >= 0.85) return 'var(--color-high-bg)';
  if (confidence >= 0.60) return 'var(--color-medium-bg)';
  return 'var(--color-low-bg)';
}

function RedactionListItem({ span, isSelected, onClick, totalSpans }) {
  const action = span.action ?? null;
  const bandClass = getBandClass(span.confidence);
  const bgVar = getRowBg(span.confidence);

  let displayLabel;
  if (action === 'keep-visible') {
    displayLabel = <span style={{ color: 'var(--color-success, #4ade80)', fontFamily: 'inherit' }}>{span.text}</span>;
  } else if (action === 'anonymous') {
    displayLabel = <span className={`doc-span doc-span-anonymous`} style={{ pointerEvents: 'none', padding: '2px 6px' }}>{ANON_LABELS[span.type] || '[REDACTED]'}</span>;
  } else {
    displayLabel = <span className={`doc-span ${bandClass}`} style={{ padding: '2px 6px', pointerEvents: 'none' }}>{TYPE_LABELS[span.type] || span.type}</span>;
  }

  const statusIcon = action === 'keep-visible' ? '◉' : action === 'anonymous' ? '⬡' : action === 'redact' ? '■' : '?';

  return (
    <div className={`redaction-list-item ${isSelected ? 'selected' : ''}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <button
        className="redaction-item-header"
        onClick={onClick}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-5)', background: isSelected ? 'var(--color-surface-2)' : bgVar, border: 'none', cursor: 'pointer', transition: 'background var(--transition-fast)' }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-surface-2)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = bgVar; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }} title={`Action: ${action ?? 'unreviewed'}`}>{statusIcon}</span>
          {displayLabel}
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
            {span.globalIndex} / {totalSpans}
          </span>
        </div>
        <ConfidenceBadge confidence={span.confidence} size="sm" />
      </button>
    </div>
  );
}

function RedactionDetailContent({ span, spans, onUpdateSpan, onRemove }) {
  const [isRevealed, setIsRevealed] = useState(false);

  const action = span.action ?? null;
  const isLow  = span.confidence < 0.60;
  const isMed  = span.confidence >= 0.60 && span.confidence < 0.85;

  // Duplicate warning
  const duplicateCount = spans.filter(s => s.text === span.text && s.id !== span.id && s.status === 'unreviewed').length;

  const setAction = (newAction) => {
    const newStatus = newAction === 'keep-visible' ? 'dismissed' : 'confirmed';
    onUpdateSpan(span.id, { action: newAction, status: newStatus });
  };

  const actionButtons = [
    { value: 'redact',       label: '■ Redact',      title: 'Burn solid black redaction' },
    { value: 'anonymous',    label: '⬡ Anonymous',   title: `Replace with ${ANON_LABELS[span.type] || '[REDACTED]'}` },
  ];

  return (
    <div style={{ padding: 'var(--space-4)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontWeight: 'var(--weight-medium)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {TYPE_LABELS[span.type] || span.type} · {span.globalIndex} / {spans.length}
        </span>
        <ConfidenceBadge confidence={span.confidence} />
      </div>

      {/* Warnings */}
      {isLow && (
        <div className="panel-warning panel-warning-low" style={{ marginBottom: 'var(--space-3)' }}>
          Low confidence — the AI is uncertain. Review carefully.
        </div>
      )}
      {isMed && (
        <div className="panel-warning panel-warning-medium" style={{ marginBottom: 'var(--space-3)' }}>
          Medium confidence — plausible but worth a quick check.
        </div>
      )}
      {duplicateCount > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning, #f59e0b)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-3)' }}>
          ⚠ {duplicateCount} other span{duplicateCount > 1 ? 's' : ''} with the same text still unreviewed.
        </div>
      )}

      {/* Reasoning */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Why was this flagged?</div>
        <p style={{ fontSize: 'var(--text-sm)', margin: 0, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>{span.reasoning}</p>
      </div>

      {/* Peek / Verify */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Verify</div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: '0 0 var(--space-2)' }}>
          {isRevealed ? "Actual text — does it match the AI's reasoning?" : "Reveal to verify the AI's claim."}
        </p>
        {isRevealed ? (
          <div style={{ background: 'var(--color-surface-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)' }}>Actual text</div>
            <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-2)' }}>{span.text}</div>
            <button onClick={() => setIsRevealed(false)} style={{ width: '100%', fontSize: 'var(--text-xs)', padding: '6px', background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
              Hide
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsRevealed(true)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-2)', background: 'var(--color-accent-dim)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}
          >
            Reveal &amp; Verify
          </button>
        )}
      </div>

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Export action</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
          {actionButtons.map(btn => (
            <button
              key={btn.value}
              onClick={() => setAction(btn.value)}
              title={btn.title}
              style={{
                padding: 'var(--space-2)',
                fontSize: '11px',
                fontWeight: action === btn.value ? 'var(--weight-bold)' : 'var(--weight-medium)',
                border: action === btn.value ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                background: action === btn.value
                  ? 'var(--color-accent-dim)'
                  : 'var(--color-surface-2)',
                color: action === btn.value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
        {action && (
          <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)', marginBottom: 0 }}>
            {action === 'redact'       && 'Will be replaced with solid black in export.'}
            {action === 'anonymous'    && `Will export as: ${ANON_LABELS[span.type] || '[REDACTED]'}`}
          </p>
        )}
      </div>

      {/* Remove */}
      <div style={{ borderTop: '1px dashed var(--border-subtle)', paddingTop: 'var(--space-4)' }}>
        <button
          onClick={onRemove}
          style={{ width: '100%', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', transition: 'color 0.2s' }}
          onMouseEnter={e => { e.target.style.color = 'var(--color-error)'; e.target.style.borderColor = 'rgba(248,113,113,0.3)'; e.target.style.background = 'var(--color-error-bg)'; }}
          onMouseLeave={e => { e.target.style.color = 'var(--color-text-secondary)'; e.target.style.borderColor = 'var(--color-border)'; e.target.style.background = 'transparent'; }}
        >
          Remove Redaction (False Positive)
        </button>
      </div>
    </div>
  );
}
