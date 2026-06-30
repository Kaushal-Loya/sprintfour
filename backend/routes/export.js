// routes/export.js
// POST /api/export/pdf — accepts an original PDF file + spans JSON,
// calls pdf_redactor.py (PyMuPDF) to burn real redactions into the PDF,
// and streams the redacted PDF back to the client.

import { Router } from "express";
import multer from "multer";
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/** Resolve a working Python interpreter. */
function resolvePython() {
  for (const candidate of [process.env.PYTHON, "python3", "python"]) {
    if (!candidate) continue;
    const r = spawnSync(candidate, ["-c", "import sys; print(sys.executable)"], { encoding: "utf-8" });
    if (r.status === 0) return candidate;
  }
  return null;
}

/** Ensure a temp directory exists and return its path. */
function ensureTempDir() {
  const dir = join(__dirname, "..", "tmp");
  mkdirSync(dir, { recursive: true });
  return dir;
}

router.post("/pdf", upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No PDF file provided." });
  }

  const rawSpans = req.body.spans;
  if (!rawSpans) {
    return res.status(400).json({ error: "No spans provided." });
  }

  let spans;
  try {
    spans = typeof rawSpans === "string" ? JSON.parse(rawSpans) : rawSpans;
  } catch {
    return res.status(400).json({ error: "Invalid spans JSON." });
  }

  const python = resolvePython();
  if (!python) {
    return res.status(500).json({
      error: "Python not found on this server. Install Python and PyMuPDF (pip install pymupdf) to enable PDF redaction.",
    });
  }

  const tmpDir = ensureTempDir();
  const ts = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath  = join(tmpDir, `${ts}-source.pdf`);
  const outputPath = join(tmpDir, `${ts}-redacted.pdf`);
  const spansPath  = join(tmpDir, `${ts}-spans.json`);

  try {
    writeFileSync(inputPath, file.buffer);
    writeFileSync(spansPath, JSON.stringify(spans), "utf-8");

    const scriptPath = join(__dirname, "..", "pdf_redactor.py");
    const result = spawnSync(python, [scriptPath, inputPath, outputPath, spansPath], {
      encoding: "utf-8",
      timeout: 60_000,
    });

    if (result.status !== 0) {
      const detail = result.stderr || result.stdout || "pdf_redactor.py returned non-zero exit.";
      console.error("[/api/export/pdf] Redaction failed:", detail);
      return res.status(500).json({ error: "PDF redaction failed.", detail });
    }

    const pdfBuffer = readFileSync(outputPath);
    const originalName = file.originalname.replace(/\.pdf$/i, "") || "document";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${originalName}-redacted.pdf"`);
    res.send(pdfBuffer);
  } finally {
    // Clean up temp files
    for (const p of [inputPath, outputPath, spansPath]) {
      if (existsSync(p)) {
        try { unlinkSync(p); } catch { /* ignore */ }
      }
    }
  }
});

export default router;
