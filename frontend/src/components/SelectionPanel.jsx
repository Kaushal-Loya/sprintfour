import { useState, useEffect } from 'react';

const TYPE_OPTIONS = [
  { value: 'PERSON_NAME', label: 'Person Name' },
  { value: 'EMAIL', label: 'Email Address' },
  { value: 'PHONE', label: 'Phone Number' },
  { value: 'SSN', label: 'Social Security Number' },
  { value: 'ADDRESS', label: 'Physical Address' },
  { value: 'DATE_OF_BIRTH', label: 'Date of Birth' },
  { value: 'ORG', label: 'Organization' },
  { value: 'JOB_TITLE', label: 'Job Title / Role' },
  { value: 'ACCOUNT_NUMBER', label: 'Account / Policy Number' },
  { value: 'FINANCIAL', label: 'Financial Information' },
  { value: 'URL', label: 'Website / Social Link' },
  { value: 'OTHER', label: 'Other PII' },
];

/**
 * @param {{
 *   selection: { text: string, startIndex: number, endIndex: number } | null,
 *   explanation: string | null,
 *   isLoading: boolean,
 *   error: string | null,
 *   onClear: () => void,
 *   onAskExplain: () => void,
 *   onAddManualRedaction: (type: string) => void,
 * }} props
 */
export default function SelectionPanel({
  selection,
  explanation,
  isLoading,
  error,
  onClear,
  onAskExplain,
  onAddManualRedaction,
}) {
  const [mode, setMode] = useState('menu'); // 'menu', 'explain', 'redact'
  const [selectedType, setSelectedType] = useState(TYPE_OPTIONS[0].value);

  // When selection changes, reset to menu
  useEffect(() => {
    if (selection) {
      setMode('menu');
    }
  }, [selection]);

  if (!selection) {
    return (
      <div className="panel panel-empty panel-why-hint">
        <div className="panel-empty-icon" style={{ display: 'none' }}></div>
        <p className="panel-empty-title">Inspect or correct the AI</p>
        <p className="panel-empty-hint">
          Select any non-redacted text in the document. You can either ask the AI why it skipped it, or manually mark it as sensitive.
        </p>
      </div>
    );
  }

  const handleAskExplain = () => {
    setMode('explain');
    onAskExplain();
  };

  const handleSaveRedaction = () => {
    onAddManualRedaction(selectedType);
    setMode('menu'); // reset after save
  };

  const isBottom = selection?.rect?.bottom > window.innerHeight - 300;

  const popupStyle = selection?.rect ? {
    position: 'fixed',
    ...(isBottom 
      ? { bottom: window.innerHeight - selection.rect.top + 8 }
      : { top: selection.rect.bottom + 8 }
    ),
    left: selection.rect.left,
    zIndex: 1000,
    width: '320px',
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--color-border)',
    maxHeight: '400px',
    overflowY: 'auto'
  } : {};

  return (
    <div className="panel panel-why" style={popupStyle}>
      <div className="panel-header">
        <div className="panel-header-left">
          <span className="panel-type-icon" style={{ display: 'none' }}></span>
          <div>
            <div className="panel-type-label">Text Selected</div>
          </div>
        </div>
        {!isLoading && (
          <button className="btn-clear" onClick={onClear} title="Clear">✕</button>
        )}
      </div>

      <div className="panel-section">
        <div className="panel-section-title">Selected text</div>
        <div className="panel-selected-text">"{selection.text}"</div>
      </div>

      {mode === 'menu' && (
        <div className="panel-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <button className="btn-analyze" onClick={handleAskExplain}>
            Ask AI: Why wasn't this flagged?
          </button>
          <button 
            className="doc-picker-select" 
            style={{ width: '100%', textAlign: 'center', minWidth: 'auto', background: 'var(--color-surface-2)', fontWeight: 'var(--weight-medium)', border: '1px solid var(--color-border)' }} 
            onClick={() => setMode('redact')}
          >
            Manually Redact (Missed PII)
          </button>
        </div>
      )}

      {mode === 'redact' && (
        <div className="panel-section">
          <div className="panel-section-title">Manual Redaction</div>
          <p className="panel-verify-hint" style={{ marginBottom: 'var(--space-3)' }}>
            Mark this text as sensitive to hide it from the AI.
          </p>
          <select
            className="doc-picker-select"
            style={{ width: '100%', marginBottom: 'var(--space-3)' }}
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
          >
            {TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn-hide" onClick={handleSaveRedaction} style={{ flex: 1 }}>Save Redaction</button>
            <button className="btn-clear" onClick={() => setMode('menu')} style={{ padding: '0 var(--space-4)', background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'explain' && (
        <>
          {isLoading && (
            <div className="panel-loading">
              <div className="spinner spinner-sm" />
              <span>Asking the AI to explain its decision…</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="panel-warning panel-warning-low">
              <span style={{ display: 'none' }}></span>
              <span>{error}</span>
            </div>
          )}

          {explanation && !isLoading && (
            <div className="panel-section">
              <div className="panel-section-title">AI's reasoning</div>
              <p className="panel-reasoning">{explanation}</p>
              <p className="panel-verify-hint" style={{ marginTop: 'var(--space-3)' }}>
                Note: the AI is instructed to admit if this text actually should have been flagged.
                A candid "this might be borderline" is a trust signal, not a failure.
              </p>
              <button className="btn-hide" style={{ marginTop: 'var(--space-3)', width: '100%', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => setMode('redact')}>
                Still disagree? Manually redact it
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
