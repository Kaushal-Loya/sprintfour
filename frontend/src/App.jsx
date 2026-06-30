import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

import { fetchDocs, fetchDoc, detectPII, explainSelection, uploadDoc } from './api/client.js'
import SummaryBar     from './components/SummaryBar.jsx'
import DocumentView   from './components/DocumentView.jsx'
import RedactionPanel from './components/RedactionPanel.jsx'
import SelectionPanel from './components/SelectionPanel.jsx'

// Panel modes — only one side panel is shown at a time
const PANEL_MODE = {
  REDACTION: 'redaction',
  WHY_NOT:   'why_not',
};

export default function App() {
  // --- Theme ---
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  // --- Document state ---
  const [docs,       setDocs]       = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [currentDoc, setCurrentDoc] = useState(null); // { id, title, text }

  // --- Detection state ---
  const [spans,      setSpans]      = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // --- Selection / reveal state ---
  const [selectedSpan, setSelectedSpan]   = useState(null);
  const [revealedIds,  setRevealedIds]    = useState(new Set());
  const [panelMode,    setPanelMode]      = useState(PANEL_MODE.REDACTION);

  // --- Why-not / Manual Redaction state ---
  const [selection,         setSelection]         = useState(null); // { text, startIndex, endIndex }
  const [whyNotExplanation, setWhyNotExplanation] = useState(null);
  const [isExplaining,      setIsExplaining]      = useState(false);
  const [explainError,      setExplainError]      = useState(null);

  // --- Resize state ---
  const [docWidthPct, setDocWidthPct] = useState(65); // percent of workspace
  const workspaceRef = useRef(null);
  const isDragging   = useRef(false);

  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent) => {
      if (!isDragging.current || !workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const newPct = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      setDocWidthPct(Math.min(80, Math.max(30, newPct)));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // --- Fetch sample docs on mount ---
  useEffect(() => {
    fetchDocs()
      .then(list => {
        setDocs(list);
        if (list.length > 0) setSelectedDocId(list[0].id);
      })
      .catch(err => console.error('Failed to fetch docs:', err));
  }, []);

  // --- Analyze: load doc text + run detection ---
  const handleAnalyze = useCallback(async () => {
    if (!selectedDocId) return;

    // Reset all state for the new analysis
    setCurrentDoc(null);
    setSpans([]);
    setSelectedSpan(null);
    setRevealedIds(new Set());
    setDetectError(null);
    setWhyNotText(null);
    setWhyNotExplanation(null);
    setExplainError(null);
    setPanelMode(PANEL_MODE.REDACTION);
    setIsDetecting(true);

    try {
      const doc = await fetchDoc(selectedDocId);
      setCurrentDoc(doc);

      const result = await detectPII(doc.text);
      setSpans(result.spans);

      if (result.meta.droppedInvalidOrOverlapping > 0) {
        console.info(
          `[detection] ${result.meta.droppedInvalidOrOverlapping} spans dropped (invalid/overlapping)`
        );
      }
    } catch (err) {
      setDetectError(err.message);
    } finally {
      setIsDetecting(false);
    }
  }, [selectedDocId]);

  // --- Click a redaction span ---
  const handleSpanClick = useCallback((span) => {
    setSelectedSpan(span);
    setPanelMode(PANEL_MODE.REDACTION);
    // Clear why-not state when switching to a redaction
    setWhyNotText(null);
    setWhyNotExplanation(null);
    setExplainError(null);
  }, []);

  // --- Reveal / hide a span ---
  const handleReveal = useCallback((id) => {
    setRevealedIds(prev => new Set([...prev, id]));
  }, []);

  const handleHide = useCallback((id) => {
    setRevealedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleRemoveSpan = useCallback((id) => {
    setSpans(prev => prev.filter(s => s.id !== id));
    if (selectedSpan?.id === id) {
      setSelectedSpan(null);
    }
  }, [selectedSpan]);

  // --- Upload Document ---
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset file input so we can upload the same file again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setIsUploading(true);
    setDetectError(null);

    try {
      const uploadedDoc = await uploadDoc(file);
      // Prepend to docs list
      setDocs(prev => [uploadedDoc, ...prev]);
      // Select it and trigger analyze
      setSelectedDocId(uploadedDoc.id);
      setCurrentDoc(uploadedDoc);
      // Let the useEffect handle the text selection, but we want to immediately analyze
      
      // Clear old state
      setSpans([]);
      setSelectedSpan(null);
      setRevealedIds(new Set());
      setSelection(null);
      setWhyNotExplanation(null);
      setExplainError(null);
      setPanelMode(PANEL_MODE.REDACTION);
      setIsDetecting(true);

      const result = await detectPII(uploadedDoc.text);
      setSpans(result.spans);
      if (result.meta?.droppedInvalidOrOverlapping > 0) {
        console.info(`[detection] ${result.meta.droppedInvalidOrOverlapping} spans dropped`);
      }
    } catch (err) {
      setDetectError(err.message);
    } finally {
      setIsUploading(false);
      setIsDetecting(false);
    }
  }, []);

  // --- Text selection ---
  const handleTextSelection = useCallback((newSelection) => {
    if (!currentDoc) return;

    setSelection(newSelection);
    setWhyNotExplanation(null);
    setExplainError(null);
    setSelectedSpan(null);
    setPanelMode(PANEL_MODE.WHY_NOT); // We'll keep this mode name but it renders SelectionPanel
  }, [currentDoc]);

  // --- Ask AI (from selection) ---
  const handleAskExplain = useCallback(async () => {
    if (!currentDoc || !selection) return;

    setIsExplaining(true);
    setExplainError(null);

    try {
      const explanation = await explainSelection(currentDoc.text, selection.text);
      setWhyNotExplanation(explanation);
    } catch (err) {
      setExplainError(err.message);
    } finally {
      setIsExplaining(false);
    }
  }, [currentDoc, selection]);

  // --- Add Manual Redaction ---
  const handleAddManualSpan = useCallback((type) => {
    if (!selection) return;

    const newSpan = {
      id: `manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: selection.text,
      type: type,
      startIndex: selection.startIndex,
      endIndex: selection.endIndex,
      confidence: 1.0, // Manual redactions are 100% confident
      reasoning: "Manually added by user.",
    };

    setSpans(prev => {
      // Add and sort by startIndex
      const updated = [...prev, newSpan];
      updated.sort((a, b) => a.startIndex - b.startIndex);
      return updated;
    });

    handleClearWhyNot();
  }, [selection]);

  // --- Clear selection panel ---
  const handleClearWhyNot = useCallback(() => {
    setSelection(null);
    setWhyNotExplanation(null);
    setExplainError(null);
    setPanelMode(PANEL_MODE.REDACTION);
  }, []);

  const hasResults = currentDoc && spans.length > 0;
  const canAnalyze = selectedDocId && !isDetecting;

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">🔒</div>
          <span className="app-logo-name">Conseal</span>
          <span className="app-logo-badge">Trust & Explainability</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <p className="app-tagline">
            Every redaction is interrogatable. Every decision is verifiable.
          </p>
          <button
            id="theme-toggle"
            className="btn-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">

        {/* Document picker */}
        <div className="doc-picker">
          <span className="doc-picker-label">Select Document:</span>
          <select
            id="doc-select"
            className="doc-picker-select"
            value={selectedDocId}
            onChange={e => setSelectedDocId(e.target.value)}
            disabled={isDetecting || isUploading}
          >
            {docs.length === 0 && (
              <option>Loading documents…</option>
            )}
            {docs.map(doc => (
              <option key={doc.id} value={doc.id}>{doc.title}</option>
            ))}
          </select>

          <button
            id="analyze-btn"
            className="btn-analyze"
            onClick={handleAnalyze}
            disabled={!canAnalyze || isUploading}
          >
            {isDetecting ? 'Analyzing…' : 'Analyze for PII'}
          </button>
          
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileUpload}
            accept=".pdf,.docx,.txt,.md"
          />
          <button
            className="btn-analyze"
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' }}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isDetecting}
          >
            {isUploading ? 'Uploading…' : 'Upload File'}
          </button>
        </div>

        {/* Summary bar */}
        {(isDetecting || hasResults) && (
          <SummaryBar spans={spans} isLoading={isDetecting} />
        )}

        {/* Error State */}
        {detectError && !isDetecting && !isUploading && (
          <div className="state-error" role="alert">
            <span>⚠</span>
            <strong>{detectError.includes('upload') ? 'Upload failed' : 'Detection failed'}</strong>
            <p>{detectError}</p>
            {!detectError.includes('upload') && !detectError.includes('404') && (
              <p style={{ fontSize: 'var(--text-xs)', opacity: 0.7 }}>
                Check that your GEMINI_API_KEY is set and the backend is running.
              </p>
            )}
          </div>
        )}

        {/* Empty state */}
        {!isDetecting && !currentDoc && !detectError && (
          <div className="state-empty">
            <span style={{ fontSize: 40 }}>🔒</span>
            <p style={{ fontWeight: 'var(--weight-semibold)' }}>
              Select a document and click Analyze
            </p>
            <p style={{ fontSize: 'var(--text-sm)', maxWidth: 380, textAlign: 'center' }}>
              The AI will detect PII and explain every decision —
              including what it's uncertain about.
            </p>
          </div>
        )}

        {/* Workspace: document + resize handle + side panel */}
        {hasResults && (
          <div className="workspace" ref={workspaceRef}>
            <div style={{ width: `${docWidthPct}%`, minWidth: 280, flexShrink: 0 }}>
              <DocumentView
                text={currentDoc.text}
                spans={spans}
                selectedSpanId={selectedSpan?.id ?? null}
                revealedIds={revealedIds}
                onSpanClick={handleSpanClick}
                onTextSelection={handleTextSelection}
              />
            </div>

            {/* Drag handle */}
            <div
              className="resize-handle"
              onMouseDown={handleResizeMouseDown}
              title="Drag to resize"
            >
              <div className="resize-handle-bar" />
            </div>

            {/* Side panel */}
            <div className="side-panel" style={{ flex: 1, minWidth: 280 }}>
              {panelMode === PANEL_MODE.REDACTION ? (
                <RedactionPanel
                  span={selectedSpan}
                  revealedIds={revealedIds}
                  onReveal={handleReveal}
                  onHide={handleHide}
                  onRemove={handleRemoveSpan}
                />
              ) : (
                <SelectionPanel
                  selection={selection}
                  explanation={whyNotExplanation}
                  isLoading={isExplaining}
                  error={explainError}
                  onClear={handleClearWhyNot}
                  onAskExplain={handleAskExplain}
                  onAddManualRedaction={handleAddManualSpan}
                />
              )}

              {(selectedSpan || selection) && (
                <div className="panel-tabs">
                  <button
                    id="tab-redaction"
                    className={`panel-tab ${panelMode === PANEL_MODE.REDACTION ? 'tab-active' : ''}`}
                    onClick={() => setPanelMode(PANEL_MODE.REDACTION)}
                  >
                    🔍 Redaction
                  </button>
                  <button
                    id="tab-why-not"
                    className={`panel-tab ${panelMode === PANEL_MODE.WHY_NOT ? 'tab-active' : ''}`}
                    onClick={() => setPanelMode(PANEL_MODE.WHY_NOT)}
                  >
                    💬 Why Not?
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
