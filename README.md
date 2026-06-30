# Conseal — Trust & Explainability Prototype

A document PII redaction viewer built for skeptics. Every redaction comes with the AI's reasoning. Every redaction can be verified against the actual underlying text. Non-redacted text can be interrogated too.

Built for Sprintfour Hackathon — Problem 1 (Trust & Explainability), Marcus persona.

---

## Setup

### Prerequisites
- Node.js 18+
- A Gemini API key ([get one here](https://aistudio.google.com/))

### 1. Add your API key

Create a `.env` file in the project root (next to `/backend` and `/frontend`):

```
GEMINI_API_KEY=your_key_here
```

### 2. Start the backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:3001`. Verify with:
```
GET http://localhost:3001/api/health
→ { "status": "ok", "apiKeySet": true }
```

### 3. Start the frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`. Open it in your browser.

---

## How it works

1. **Pick a sample document** and click **Analyze for PII**
2. The backend sends the document to Gemini (`gemini-2.5-flash`) with a prompt asking for PII spans with *type*, *confidence*, and *plain-English reasoning*
3. Spans are validated server-side (hallucinated/unverifiable spans are dropped)
4. The document renders with redacted pills color-coded by confidence band:
   - 🟢 **High** (≥85%) — green
   - 🟡 **Medium** (60–85%) — amber
   - 🔴 **Low** (<60%) — red, pulsing — *must be reviewed*
5. **Click any redaction** → see type, confidence, and reasoning in the panel
6. **Reveal & Verify** → see the actual underlying text to check if the AI's claim holds
7. **Select non-redacted text** → ask "why wasn't this flagged?" — the AI explains honestly, including admitting if the call was wrong

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check + API key status |
| GET | `/api/detect/docs` | List sample documents |
| GET | `/api/detect/docs/:id` | Fetch a single document |
| POST | `/api/detect` | Run PII detection on `{ text }` |
| POST | `/api/explain` | Explain non-redaction for `{ documentText, selectedText }` |

---

## Architecture

```
/backend
  server.js                  Express entry point
  routes/detect.js           GET /docs, POST /detect
  routes/explain.js          POST /explain
  services/llmClient.js      Gemini API wrapper (thin)
  services/detection.js      Prompt logic, JSON parsing, span validation
  data/sampleDocs.js         Two sample docs with mixed PII + near-misses

/frontend
  src/
    App.jsx                  Top-level state and layout
    api/client.js            Fetch wrappers
    components/
      DocumentView.jsx       Redaction renderer + text selection
      RedactionPanel.jsx     Inspect + reveal/verify toggle
      WhyNotPanel.jsx        "Why wasn't this flagged?" flow
      ConfidenceBadge.jsx    Reusable confidence indicator
      SummaryBar.jsx         Audit summary with band breakdown
    styles/
      components.css         All component styles
    index.css                Design tokens (dark-mode system)
```

---

## Deliberately not built

- **No auth** — single-session, single-document. Marcus's fear is about the redaction logic being verifiable, not about who else can access his account.
- **No persistence/database** — in-memory only. Storing unredacted PII server-side would undercut the exact trust story this build is making.
- **No batch/multi-doc handling** — that's Problem 2's territory (Maya's persona), not Problem 1.
- **No correction/editing workflow** — that's Problem 3 (Sam's persona). This build assumes redactions are given and focuses on understanding/verifying them.
- **No custom PII model** — LLM call is the means, not the point. Trust-building only matters when detection is realistically imperfect, which is why the cloud LLM was chosen over a mock backend.

---

## Edge cases handled

- **Malformed LLM JSON** → caught server-side, returns a clear 502 error (not a silent empty document)
- **Hallucinated spans** (text not found in document) → validated and dropped server-side with a console warning
- **Overlapping spans** → resolved by keeping the longest span, documented policy
- **Low confidence spans** → visually distinct pulsing treatment, prominent "review" tag in summary bar — never buried

---

*Built by Kaushal Loya — CB.SC.U4CSE23627*
