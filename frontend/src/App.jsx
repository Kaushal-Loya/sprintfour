import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import './App.css'

import { fetchDocs, fetchDoc, detectPII, uploadDoc, explainSelection, exportPDF } from './api/client.js';
import { renderPDFPages, renderAndOcrPDF } from './utils/pdfUtils.js';
import { exportToPDF, exportToDocx, buildRedactedText } from './utils/exportUtils.js';
import SummaryBar from './components/SummaryBar.jsx';
import DocumentView from './components/DocumentView.jsx';
import ImageDocumentView from './components/ImageDocumentView.jsx';
import AllRedactionsPanel from './components/AllRedactionsPanel.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import SelectionPanel      from './components/SelectionPanel.jsx'
import ExportMenu          from './components/ExportMenu.jsx'

export default function App() {
  // --- Theme ---
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('conseal_theme');
    return saved || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('conseal_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  // --- Document state ---
  const [docs,       setDocs]       = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  
  // --- Detection state ---
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // --- Image PDF state (Aadhaar / scanned docs) ---
  const [pdfPages,  setPdfPages]  = useState([]); // [{ dataUrl, width, height }]
  const [wordBoxes, setWordBoxes] = useState([]); // per-word pixel bboxes  // -- Active Analysis --
  const [currentDoc, setCurrentDoc] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [spans, setSpans] = useState([]);
  const [selectedSpan, setSelectedSpan] = useState(null);
  const [isOcring,  setIsOcring]  = useState(false);

  // --- Why-not / Manual Redaction state ---
  const [selection,         setSelection]         = useState(null); // { text, startIndex, endIndex, rect }
  const [whyNotExplanation, setWhyNotExplanation] = useState(null);
  const [isExplaining,      setIsExplaining]      = useState(false);
  const [explainError,      setExplainError]      = useState(null);

  // --- Drag and Drop State ---
  const [isDragging, setIsDragging] = useState(false);

  // --- Resize state ---
  const [docWidthPct, setDocWidthPct] = useState(65); // percent of workspace
  const workspaceRef = useRef(null);
  const isResizing   = useRef(false);

  // --- Augment spans with global/group indexes ---
  const augmentedSpans = useMemo(() => {
    // Sort spans by startIndex to determine global order
    const sorted = [...spans].sort((a, b) => a.startIndex - b.startIndex);
    const typeCounts = {};
    return sorted.map((span, idx) => {
      const type = span.type;
      if (!typeCounts[type]) typeCounts[type] = 0;
      typeCounts[type]++;
      return {
        ...span,
        globalIndex: idx + 1,
        groupIndex: typeCounts[type]
      };
    });
  }, [spans]);

  // -- Derived progress metrics --
  const totalCount = spans.length;
  const reviewedCount = spans.filter(s => s.status !== 'unreviewed').length;
  const unreviewedCount = totalCount - reviewedCount;
  const allReviewed = totalCount > 0 && reviewedCount === totalCount;

  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent) => {
      if (!isResizing.current || !workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const newPct = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      setDocWidthPct(Math.min(80, Math.max(30, newPct)));
    };

    const onMouseUp = () => {
      isResizing.current = false;
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
    setDetectError(null);
    setWhyNotExplanation(null);
    setExplainError(null);
    setIsDetecting(true);

    try {
      const doc = await fetchDoc(selectedDocId);
      setCurrentDoc(doc);
      setUploadedFile(null); // Not a local upload

      const result = await detectPII(doc.text);
      setSpans(result.spans.map(s => ({ ...s, status: 'unreviewed', action: null })));

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
    // Clear why-not state when switching to a redaction
    setWhyNotExplanation(null);
    setExplainError(null);
    setSelection(null);
  }, []);

  const handleUpdateSpan = useCallback((id, patch) => {
    setSpans(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const handleNextUnreviewed = useCallback(() => {
    const unreviewed = spans.filter(s => s.status === 'unreviewed').sort((a, b) => a.confidence - b.confidence);
    if (unreviewed.length > 0) {
      setSelectedSpan(unreviewed[0]);
    }
  }, [spans]);

  const handleConfirmHighConfidence = useCallback(() => {
    setSpans(prev => prev.map(s => {
      if (s.confidence >= 0.85 && s.status === 'unreviewed') {
        return { ...s, status: 'confirmed', action: 'redact' };
      }
      return s;
    }));
  }, []);

  const handleRemoveSpan = useCallback((id) => {
    setSpans(prev => prev.filter(s => s.id !== id));
    if (selectedSpan?.id === id) {
      setSelectedSpan(null);
    }
  }, [selectedSpan]);

  // --- Upload Document ---
  const handleFileUpload = useCallback(async (e) => {
    let file = null;
    if (e.target && e.target.files) {
      file = e.target.files[0];
    } else if (e.dataTransfer && e.dataTransfer.files) {
      file = e.dataTransfer.files[0];
    }
    if (!file) return;

    // Reset file input so we can upload the same file again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setIsDragging(false);
    setIsUploading(true);
    setDetectError(null);

    // Clear all previous state
    setSpans([]);
    setSelectedSpan(null);
    setSelection(null);
    setWhyNotExplanation(null);
    setExplainError(null);
    setPdfPages([]);
    setWordBoxes([]);

    try {
      const uploadedDoc = await uploadDoc(file);
      setUploadedFile(file);
      // Prepend to docs list and select
      setDocs(prev => [uploadedDoc, ...prev]);
      setSelectedDocId(uploadedDoc.id);

      if (uploadedDoc.isImagePDF && uploadedDoc.text === "") {
        // ── Image PDF path (pure scanned images where PyMuPDF failed) ──────────────────────────
        // 1. Show a stub doc so the workspace appears while OCR runs
        setCurrentDoc({ ...uploadedDoc, text: '' });
        setIsUploading(false);
        setIsOcring(true);

        // 2. Render pages in browser + OCR each page on the server
        const { pages, wordBoxes: wbs, fullText } = await renderAndOcrPDF(file);
        setPdfPages(pages);
        setWordBoxes(wbs);
        setCurrentDoc({ ...uploadedDoc, text: fullText });
        setIsOcring(false);

        if (!fullText.trim()) {
          setDetectError('OCR could not extract any text from this document.');
          return;
        }

        // 3. Run PII detection on the OCR text
        setIsDetecting(true);
        const result = await detectPII(fullText);
        setSpans(result.spans.map(s => ({ ...s, status: 'unreviewed', action: null })));
        if (result.meta?.droppedInvalidOrOverlapping > 0) {
          console.info(`[detection] ${result.meta.droppedInvalidOrOverlapping} spans dropped`);
        }
      } else if (uploadedDoc.isImagePDF) {
        // ── Vector PDF path (PyMuPDF succeeded in backend) ──────────────────────────
        // 1. Show a stub doc so the workspace appears while rendering runs
        setCurrentDoc({ ...uploadedDoc, text: uploadedDoc.text });
        setIsUploading(false);
        setIsOcring(true); // Reusing this flag for visual rendering

        // 2. Render pages in browser for visual display
        const pages = await renderPDFPages(file);
        setPdfPages(pages);
        setWordBoxes(uploadedDoc.wordBoxes || []);
        setIsOcring(false);

        // 3. Run PII detection on the text
        setIsDetecting(true);
        const result = await detectPII(uploadedDoc.text);
        setSpans(result.spans.map(s => ({ ...s, status: 'unreviewed', action: null })));
        if (result.meta?.droppedInvalidOrOverlapping > 0) {
          console.info(`[detection] ${result.meta.droppedInvalidOrOverlapping} spans dropped`);
        }
      } else {
        // ── Text PDF / DOCX / TXT path (unchanged) ──────────────────────────
        setCurrentDoc(uploadedDoc);
        setIsUploading(false);
        setIsDetecting(true);

        const result = await detectPII(uploadedDoc.text);
        setSpans(result.spans.map(s => ({ ...s, status: 'unreviewed', action: null })));
        if (result.meta?.droppedInvalidOrOverlapping > 0) {
          console.info(`[detection] ${result.meta.droppedInvalidOrOverlapping} spans dropped`);
        }
      }
    } catch (err) {
      setDetectError(err.message);
    } finally {
      setIsUploading(false);
      setIsOcring(false);
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
      status: 'confirmed',
      action: 'redact',
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
  }, []);

  // --- Drag and Drop Handlers ---
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e);
  }, [handleFileUpload]);

  // --- Export Handlers ---
  const handleExportPDF = useCallback(async () => {
    if (!currentDoc) return;
    
    // Fallback to visual HTML export for sample documents or non-PDFs
    if (!uploadedFile) {
      const documentViewEl = document.querySelector('.document-view');
      if (documentViewEl) {
        exportToPDF(documentViewEl, `${currentDoc.title.replace(/\.[^/.]+$/, "")}_redacted.pdf`);
      }
      return;
    }
    
    try {
      const blob = await exportPDF(uploadedFile, spans);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentDoc.title.replace(/\.[^/.]+$/, "")}_redacted.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(err.message || 'PDF export failed');
    }
  }, [currentDoc, spans, uploadedFile]);

  const handleExportDocx = useCallback(() => {
    if (!currentDoc) return;
    exportToDocx(currentDoc.text, spans, `${currentDoc.title.replace(/\.[^/.]+$/, "")}_redacted.docx`);
  }, [currentDoc, spans]);

  const hasDocument = Boolean(currentDoc);
  const canAnalyze = Boolean(selectedDocId && !isDetecting);
  const isImagePDF = Boolean(currentDoc?.isImagePDF);

  return (
    <div className="app-container">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon" style={{ display: 'none' }}></div>
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
      <main 
        className="app-main"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ position: 'relative' }}
      >
        {isDragging && (
          <div className="drag-overlay">
            <div className="drag-overlay-content">
              <span style={{ fontSize: 40 }}></span>
              <p>Drop file to upload</p>
            </div>
          </div>
        )}

        {/* Document picker */}
        <div className="doc-picker">
          <span className="doc-picker-label">Select Document:</span>
          <select
            id="doc-select"
            className="doc-picker-select"
            value={selectedDocId || ""}
            onChange={e => {
              setSelectedDocId(e.target.value);
              setSpans([]);
              setSelection(null);
            }}
            disabled={isDetecting || isUploading}
          >
            <option value="">-- Select a document --</option>
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

          {hasDocument && !isDetecting && (
            <>
              <button
                className="btn-hide"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                style={{ 
                  minWidth: 'auto', 
                  padding: 'var(--space-2) var(--space-4)', 
                  background: 'var(--color-surface-2)', 
                  border: '1px solid var(--color-border)', 
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  color: 'var(--color-text-primary)',
                  fontWeight: 'var(--weight-medium)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isUploading ? 'Uploading...' : 'Upload File'}
              </button>

              <button
                className="btn-clear"
                onClick={() => {
                  setSelectedDocId('');
                  setSpans([]);
                  setSelection(null);
                  setCurrentDoc(null);
                  setDetectError(null);
                }}
                disabled={isUploading || isDetecting}
                style={{ 
                  minWidth: 'auto', 
                  padding: 'var(--space-2) var(--space-4)', 
                  background: 'transparent', 
                  border: '1px solid transparent', 
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  fontWeight: 'var(--weight-medium)',
                }}
                onMouseEnter={(e) => { e.target.style.background = 'var(--color-surface-2)'; e.target.style.color = 'var(--color-text-primary)'; }}
                onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--color-text-muted)'; }}
              >
                Close Document
              </button>

              <div style={{ marginLeft: 'auto' }}>
                <ExportMenu 
                  onExportPDF={handleExportPDF} 
                  onExportDocx={handleExportDocx}
                  allReviewed={allReviewed}
                  unreviewedCount={unreviewedCount}
                />
              </div>
            </>
          )}
          
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileUpload}
            accept=".pdf,.docx,.txt,.md"
          />
        </div>

        {/* Summary bar when detecting or OCR-ing */}
        {(isDetecting || isOcring) && (
          <SummaryBar spans={spans} isLoading={true} />
        )}

        {/* OCR in progress banner */}
        {isOcring && !isDetecting && (
          <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            🔍 Running OCR on scanned document… this may take a moment.
          </div>
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
        {!isDetecting && !hasDocument && !detectError && (
          <div 
            className="state-empty" 
            onClick={() => fileInputRef.current?.click()}
            style={{ cursor: 'pointer' }}
          >
            <span style={{ fontSize: 40, display: 'none' }}></span>
            <p style={{ fontWeight: 'var(--weight-semibold)' }}>
              Drag and drop a file here, or click to upload
            </p>
            <p style={{ fontSize: 'var(--text-sm)', maxWidth: 380, textAlign: 'center' }}>
              Alternatively, select a sample document from the dropdown above and click Analyze.
            </p>
          </div>
        )}

        {/* Workspace: document + resize handle + side panel */}
        {hasDocument && !isDetecting && !isOcring && (
          <div className="workspace" ref={workspaceRef}>
            <div style={{ width: `${docWidthPct}%`, minWidth: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <ProgressBar 
                reviewedCount={reviewedCount}
                totalCount={totalCount}
                unreviewedCount={unreviewedCount}
                allReviewed={allReviewed}
                onNextUnreviewed={handleNextUnreviewed}
                onConfirmHighConfidence={handleConfirmHighConfidence}
              />
              <SummaryBar spans={augmentedSpans} isLoading={false} />
              {isImagePDF ? (
                <ImageDocumentView
                  pages={pdfPages}
                  wordBoxes={wordBoxes}
                  spans={augmentedSpans}
                  selectedSpanId={selectedSpan?.id ?? null}
                  onSpanClick={handleSpanClick}
                  pdfDims={currentDoc.isImagePDF && currentDoc.text === "" ? pdfPages : currentDoc.pages}
                />
              ) : (
                <DocumentView
                  text={currentDoc.text}
                  spans={augmentedSpans}
                  selectedSpanId={selectedSpan?.id ?? null}
                  onSpanClick={handleSpanClick}
                  onTextSelection={handleTextSelection}
                />
              )}
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
              <AllRedactionsPanel
                spans={augmentedSpans}
                selectedSpanId={selectedSpan?.id}
                onSpanClick={handleSpanClick}
                onUpdateSpan={handleUpdateSpan}
                onRemove={handleRemoveSpan}
              />
            </div>
          </div>
        )}
      </main>

      {/* Floating Selection Panel */}
      {selection && selection.rect && (
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
    </div>
  );
}
