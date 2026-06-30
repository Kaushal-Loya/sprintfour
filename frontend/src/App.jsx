import './App.css'

// Temporary scaffold — full implementation coming in Part 4.
// This confirms the design system and build pipeline are working.

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">🔒</div>
          <span className="app-logo-name">Conseal</span>
          <span className="app-logo-badge">Trust & Explainability</span>
        </div>
      </header>
      <main className="app-main">
        <div className="state-empty">
          <div className="spinner" />
          <p>Loading components… (scaffold in progress)</p>
        </div>
      </main>
    </div>
  )
}
