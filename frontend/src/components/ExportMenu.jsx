import React, { useState, useRef, useEffect } from 'react';

export default function ExportMenu({ onExportPDF, onExportDocx, allReviewed, unreviewedCount }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="export-menu-container" ref={menuRef} style={{ position: 'relative' }}>
      <button
        className="btn-export"
        onClick={() => setIsOpen(!isOpen)}
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
        Export
        <span style={{ fontSize: '10px' }}>▼</span>
      </button>

      {isOpen && (
        <div className="export-dropdown" style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '4px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          minWidth: '200px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {!allReviewed && (
            <div style={{
              padding: '10px 16px',
              background: 'rgba(245, 158, 11, 0.1)',
              borderBottom: '1px solid var(--color-border)',
              color: 'var(--color-warning, #f59e0b)',
              fontSize: '11px',
              lineHeight: '1.4'
            }}>
              ⚠ {unreviewedCount} span{unreviewedCount > 1 ? 's' : ''} unreviewed.<br/>
              They will be redacted by default.
            </div>
          )}

          <button 
            onClick={() => {
              setIsOpen(false);
              onExportPDF();
            }}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)',
              borderBottom: '1px solid var(--color-border)'
            }}
            onMouseEnter={(e) => e.target.style.background = 'var(--color-surface-2)'}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}
          >
            Export as PDF
          </button>
          
          <button 
            onClick={() => {
              setIsOpen(false);
              onExportDocx();
            }}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)'
            }}
            onMouseEnter={(e) => e.target.style.background = 'var(--color-surface-2)'}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}
          >
            Export as DOCX
          </button>
        </div>
      )}
    </div>
  );
}
