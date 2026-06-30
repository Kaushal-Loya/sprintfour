// routes/explain.js
// POST /api/explain — on-demand explanation for why a text selection was NOT flagged.
// The model is prompted with honesty-over-defensiveness: admit if the call was wrong.

import { Router } from "express";
import { explainNonRedaction } from "../services/detection.js";

const router = Router();

// POST /api/explain
router.post("/", async (req, res) => {
  const { documentText, selectedText } = req.body;

  if (
    !documentText ||
    typeof documentText !== "string" ||
    documentText.trim().length === 0
  ) {
    return res.status(400).json({
      error: "Request body must include a non-empty 'documentText' field.",
    });
  }

  if (
    !selectedText ||
    typeof selectedText !== "string" ||
    selectedText.trim().length === 0
  ) {
    return res.status(400).json({
      error: "Request body must include a non-empty 'selectedText' field.",
    });
  }

  if (selectedText.length > 500) {
    return res.status(400).json({
      error: "Selected text too long. Maximum 500 characters.",
    });
  }

  // Sanity check: the selected text should exist in the document
  if (!documentText.includes(selectedText)) {
    return res.status(400).json({
      error: "Selected text was not found in the provided document.",
    });
  }

  try {
    const explanation = await explainNonRedaction(documentText, selectedText);
    res.json({ explanation });
  } catch (err) {
    console.error("[/api/explain] Explanation failed:", err.message);
    res.status(502).json({
      error:
        "Failed to generate an explanation. Check your API key and network connection.",
      detail: err.message,
    });
  }
});

export default router;
