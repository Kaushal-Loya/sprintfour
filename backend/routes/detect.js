// routes/detect.js
// POST /api/detect — accepts document text, runs PII detection, returns spans.
// Handles: missing input, LLM failures, malformed output.

import { Router } from "express";
import { detectPII } from "../services/detection.js";
import { sampleDocs } from "../data/sampleDocs.js";

const router = Router();

// GET /api/docs — returns the list of sample documents (id + title only)
router.get("/docs", (_req, res) => {
  const docs = sampleDocs.map(({ id, title }) => ({ id, title }));
  res.json({ docs });
});

// GET /api/docs/:id — returns a single sample document's full text
router.get("/docs/:id", (req, res) => {
  const doc = sampleDocs.find((d) => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: "Document not found." });
  }
  res.json({ id: doc.id, title: doc.title, text: doc.text });
});

// POST /api/detect — run PII detection on the provided document text
router.post("/", async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({
      error: "Request body must include a non-empty 'text' field.",
    });
  }

  if (text.length > 20000) {
    return res.status(400).json({
      error: "Document too long. Maximum 20,000 characters.",
    });
  }

  try {
    const { spans, dropped } = await detectPII(text);
    res.json({
      spans,
      meta: {
        totalFound: spans.length,
        droppedInvalidOrOverlapping: dropped,
        documentLength: text.length,
      },
    });
  } catch (err) {
    console.error("[/api/detect] Detection failed:", err.message);

    // Distinguish between LLM parse errors and network/API errors
    const isParseError =
      err.message.startsWith("LLM returned malformed") ||
      err.message.startsWith("LLM response is not");

    res.status(502).json({
      error: isParseError
        ? "The AI model returned an unexpected response format. Please try again."
        : "Failed to reach the AI model. Check your API key and network connection.",
      detail: err.message,
    });
  }
});

export default router;
