import { useState, useMemo } from 'react';
import ConfidenceBadge from './ConfidenceBadge.jsx';

const TYPE_LABELS = {
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

export default function AllRedactionsPanel({ 
  spans, 
  selectedSpanId, 
  revealedIds, 
  onSpanClick, 
  onReveal, 
  onHide, 
  onRemove 
}) {
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [sortBy, setSortBy] = useState('confidence'); // 'confidence' | 'alphabetical'
  
  const selectedSpan = useMemo(() => {
    return spans.find(s => s.id === selectedSpanId);
  }, [spans, selectedSpanId]);

  // Group spans by type
  const groupedSpans = useMemo(() => {
    const groups = {};
    spans.forEach(span => {
      if (!groups[span.type]) groups[span.type] = [];
      groups[span.type].push(span);
    });
    
    // Sort groups
    return Object.entries(groups).sort(([typeA, spansA], [typeB, spansB]) => {
      if (sortBy === 'alphabetical') {
        const labelA = TYPE_LABELS[typeA] || typeA;
        const labelB = TYPE_LABELS[typeB] || typeB;
        return labelA.localeCompare(labelB);
      } else {
        // Sort by confidence (highest max confidence first)
        const maxConfA = Math.max(...spansA.map(s => s.confidence));
        const maxConfB = Math.max(...spansB.map(s => s.confidence));
        return maxConfB - maxConfA;
      }
    });
  }, [spans, sortBy]);

  const toggleGroup = (type) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  if (spans.length === 0) {
    return (
      <div className="panel panel-empty" style={{ height: '100%' }}>
        <div className="panel-empty-icon" style={{ display: 'none' }}></div>
        <p className="panel-empty-title">No redactions yet</p>
        <p className="panel-empty-hint">
          Select a document and click Analyze to detect PII.
        </p>
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
            onChange={(e) => setSortBy(e.target.value)}
            style={{ fontSize: 'var(--text-xs)', padding: '2px 6px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
          >
            <option value="confidence">Sort: Confidence</option>
            <option value="alphabetical">Sort: A-Z</option>
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

          return (
            <div key={type} className="accordion-group" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <button 
                className="accordion-header" 
                onClick={() => toggleGroup(type)}
                aria-expanded={isExpanded}
                style={{ 
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                  padding: 'var(--space-4) var(--space-5)', background: 'transparent', border: 'none', cursor: 'pointer' 
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span className="accordion-label" style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>{label}</span>
                  <span className="accordion-count" style={{ fontSize: 'var(--text-xs)', background: 'var(--color-surface-3)', color: 'var(--color-text-muted)', padding: '2px 8px', borderRadius: '10px' }}>{groupSpans.length}</span>
                </div>
                <span className="accordion-chevron" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{isExpanded ? '▼' : '▶'}</span>
              </button>
              
              {isExpanded && (
                <div className="accordion-content">
                  {groupSpans.map(span => (
                    <RedactionListItem 
                      key={span.id}
                      span={span}
                      isSelected={selectedSpanId === span.id}
                      isRevealed={revealedIds.has(span.id)}
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

      {/* Floating Dialog Box for Selected Item */}
      {selectedSpan && (
        <div className="redaction-dialog-overlay" style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(2px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-4)'
        }}>
          <div className="redaction-dialog" style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            width: '100%',
            maxHeight: '100%',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--color-border)'
          }}>
            <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h4 style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>Redaction Details</h4>
               <button className="btn-clear" onClick={() => onSpanClick(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--color-text-muted)' }}>✕</button>
            </div>
            
            <div style={{ padding: 0, overflowY: 'auto' }}>
              <RedactionDetailContent 
                span={selectedSpan}
                isRevealed={revealedIds.has(selectedSpan.id)}
                onReveal={() => onReveal(selectedSpan.id)}
                onHide={() => onHide(selectedSpan.id)}
                onRemove={() => onRemove(selectedSpan.id)}
                totalSpans={spans.length}
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

function RedactionListItem({ span, isSelected, isRevealed, onClick, totalSpans }) {
  const displayTitle = isRevealed ? span.text : (TYPE_LABELS[span.type] || span.type);
  const bandClass = getBandClass(span.confidence);
  const bgVar = getRowBg(span.confidence);

  return (
    <div className={`redaction-list-item ${isSelected ? 'selected' : ''}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Clickable summary header */}
      <button 
        className="redaction-item-header" 
        onClick={onClick}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-5)', background: isSelected ? 'var(--color-surface-2)' : bgVar, border: 'none', cursor: 'pointer', transition: 'background var(--transition-fast)' }}
        onMouseEnter={(e) => { if(!isSelected) e.currentTarget.style.background = 'var(--color-surface-2)'; }}
        onMouseLeave={(e) => { if(!isSelected) e.currentTarget.style.background = bgVar; }}
      >
        <div className="redaction-item-title" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span className="redaction-item-text" style={{ fontFamily: isRevealed ? 'inherit' : 'var(--font-mono)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {!isRevealed && (
              <span className={`doc-span ${bandClass}`} style={{ padding: '2px 6px', pointerEvents: 'none' }}>
                {displayTitle}
              </span>
            )}
            {isRevealed && displayTitle}
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
              {span.globalIndex} / {totalSpans}
            </span>
          </span>
        </div>
        <ConfidenceBadge confidence={span.confidence} size="sm" />
      </button>
    </div>
  );
}

function RedactionDetailContent({ span, isRevealed, onReveal, onHide, onRemove, totalSpans }) {
  const isLowConfidence = span.confidence < 0.60;
  const isMediumConfidence = span.confidence >= 0.60 && span.confidence < 0.85;

  return (
    <div className="redaction-item-details" style={{ padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontWeight: 'var(--weight-medium)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {TYPE_LABELS[span.type] || span.type} {span.globalIndex} / {totalSpans}
        </span>
        <ConfidenceBadge confidence={span.confidence} />
      </div>

      {/* Low confidence warning */}
      {isLowConfidence && (
        <div className="panel-warning panel-warning-low" style={{ marginBottom: 'var(--space-3)' }}>
          <span>Low confidence — the AI is uncertain about this redaction. Review carefully.</span>
        </div>
      )}
      {isMediumConfidence && (
        <div className="panel-warning panel-warning-medium" style={{ marginBottom: 'var(--space-3)' }}>
          <span>Medium confidence — plausible but worth a quick check.</span>
        </div>
      )}

      {/* Reasoning */}
      <div className="panel-section" style={{ marginTop: 'var(--space-2)' }}>
        <div className="panel-section-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Why was this flagged?</div>
        <p className="panel-reasoning" style={{ fontSize: 'var(--text-sm)', margin: 0, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>{span.reasoning}</p>
      </div>

      {/* Reveal / Verify toggle */}
      <div className="panel-section" style={{ marginTop: 'var(--space-4)' }}>
        <div className="panel-section-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Verify</div>
        <p className="panel-verify-hint" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)', marginTop: 0 }}>
          {isRevealed
            ? "You're seeing the actual text. Does it match the AI's claim above?"
            : "Reveal the underlying text to verify the AI's reasoning yourself."}
        </p>

        {isRevealed ? (
          <div className="panel-revealed-box" style={{ background: 'var(--color-surface-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
            <div className="panel-revealed-label" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>Actual text</div>
            <div className="panel-revealed-text" style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-3)' }}>{span.text}</div>
            <button
              className="btn-hide"
              onClick={(e) => { e.stopPropagation(); onHide(); }}
              style={{ width: '100%', fontSize: 'var(--text-xs)', padding: '8px', background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
            >
              Re-redact
            </button>
          </div>
        ) : (
          <button
            className="btn-reveal"
            onClick={(e) => { e.stopPropagation(); onReveal(); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-3)', background: 'var(--color-accent-dim)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'var(--weight-semibold)' }}
          >
            Reveal & Verify
          </button>
        )}

        <div style={{ marginTop: 'var(--space-5)', borderTop: '1px dashed var(--border-subtle)', paddingTop: 'var(--space-4)' }}>
          <button
            className="btn-hide"
            style={{ width: '100%', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'color 0.2s', fontWeight: 'var(--weight-medium)' }}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            onMouseEnter={(e) => { e.target.style.color = 'var(--color-error)'; e.target.style.borderColor = 'rgba(248,113,113,0.3)'; e.target.style.background = 'var(--color-error-bg)'; }}
            onMouseLeave={(e) => { e.target.style.color = 'var(--color-text-secondary)'; e.target.style.borderColor = 'var(--color-border)'; e.target.style.background = 'transparent'; }}
          >
            Remove Redaction (False Positive)
          </button>
        </div>
      </div>
    </div>
  );
}
