// services/detection.js
// Handles PII detection: builds the prompt, calls Gemini, parses and validates
// the response. Prompt logic lives here — not in the route.

import { callGemini } from "./llmClient.js";

// Confidence band thresholds — kept here as the single source of truth.
export const CONFIDENCE_BANDS = {
  HIGH: { min: 0.85, label: "HIGH", description: "High confidence" },
  MEDIUM: { min: 0.6, label: "MEDIUM", description: "Medium confidence" },
  LOW: { min: 0, label: "LOW", description: "Low confidence — please review" },
};

export function getConfidenceBand(confidence) {
  if (confidence >= CONFIDENCE_BANDS.HIGH.min) return CONFIDENCE_BANDS.HIGH;
  if (confidence >= CONFIDENCE_BANDS.MEDIUM.min) return CONFIDENCE_BANDS.MEDIUM;
  return CONFIDENCE_BANDS.LOW;
}

const VALID_PII_TYPES = [
  "PERSON_NAME",
  "EMAIL",
  "PHONE",
  "SSN",
  "ADDRESS",
  "DATE_OF_BIRTH",
  "ORG",
  "OTHER",
];

/**
 * Build the detection prompt for Gemini.
 * @param {string} documentText
 * @returns {string}
 */
function buildDetectionPrompt(documentText) {
  return `You are a PII detection assistant. Your job is to find all Personally Identifiable Information (PII) in the document below and return a strict JSON array.

For each PII span found, return an object with these exact fields:
- "text": the exact substring as it appears in the document
- "type": one of PERSON_NAME, EMAIL, PHONE, SSN, ADDRESS, DATE_OF_BIRTH, ORG, OTHER
- "startIndex": the character index where this text starts in the document (0-based)
- "endIndex": the character index where this text ends (exclusive, like slice)
- "confidence": a number between 0 and 1 representing how confident you are this is PII
- "reasoning": a single plain-English sentence explaining WHY this is flagged at this confidence level

Important rules:
1. Be honest about uncertainty. If something looks like PII but you're not sure, give it a lower confidence (e.g. 0.4–0.6) and explain why in the reasoning.
2. Do NOT flag generic dates (e.g. "30-day processing window"), company names, or policy/reference numbers as PII unless there is clear personal identification context.
3. startIndex and endIndex must exactly match the "text" field as a substring of the document. Double-check this.
4. Return ONLY the JSON array — no markdown, no explanation, no code fences.

Document:
"""
${documentText}
"""

Return format (JSON array only):
[
  {
    "text": "...",
    "type": "...",
    "startIndex": 0,
    "endIndex": 0,
    "confidence": 0.0,
    "reasoning": "..."
  }
]`;
}

/**
 * Parse and validate the raw LLM JSON response into PIISpan objects.
 * Drops spans where the text cannot be verified against the actual document.
 * Resolves overlapping spans by keeping the longest one.
 *
 * @param {string} rawResponse - Raw text from Gemini
 * @param {string} documentText - Original document text for verification
 * @returns {{ spans: PIISpan[], dropped: number }}
 */
function parseAndValidateSpans(rawResponse, documentText) {
  // Strip any accidental markdown fences the model may have added
  const cleaned = rawResponse
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let rawSpans;
  try {
    rawSpans = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `LLM returned malformed JSON. Raw response: ${rawResponse.slice(0, 200)}`
    );
  }

  if (!Array.isArray(rawSpans)) {
    throw new Error("LLM response is not a JSON array.");
  }

  let dropped = 0;
  const validated = [];

  for (const span of rawSpans) {
    // Schema check
    if (
      typeof span.text !== "string" ||
      typeof span.startIndex !== "number" ||
      typeof span.endIndex !== "number" ||
      typeof span.confidence !== "number" ||
      typeof span.reasoning !== "string"
    ) {
      dropped++;
      console.warn("[detection] Dropping span — missing required fields:", span);
      continue;
    }

    // Normalize type
    const type = VALID_PII_TYPES.includes(span.type) ? span.type : "OTHER";

    // Verify the span text actually exists at the claimed position
    const actualText = documentText.slice(span.startIndex, span.endIndex);
    if (actualText !== span.text) {
      // Try to find the text elsewhere as a fallback (LLM sometimes gets index slightly wrong)
      const foundIndex = documentText.indexOf(span.text);
      if (foundIndex === -1) {
        dropped++;
        console.warn(
          `[detection] Dropping hallucinated span — text not found in document: "${span.text}"`
        );
        continue;
      }
      // Correct the indices
      span.startIndex = foundIndex;
      span.endIndex = foundIndex + span.text.length;
    }

    validated.push({
      text: span.text,
      type,
      startIndex: span.startIndex,
      endIndex: span.endIndex,
      confidence: Math.min(1, Math.max(0, span.confidence)),
      reasoning: span.reasoning,
    });
  }

  // Resolve overlapping spans: sort by length desc, keep non-overlapping
  validated.sort((a, b) => b.text.length - a.text.length);
  const nonOverlapping = [];
  const covered = new Set();

  for (const span of validated) {
    let overlaps = false;
    for (let i = span.startIndex; i < span.endIndex; i++) {
      if (covered.has(i)) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) {
      dropped++;
      console.warn(
        `[detection] Dropping overlapping span: "${span.text}" (keeping longer span)`
      );
      continue;
    }
    for (let i = span.startIndex; i < span.endIndex; i++) {
      covered.add(i);
    }
    nonOverlapping.push(span);
  }

  // Sort by position in document for the frontend
  nonOverlapping.sort((a, b) => a.startIndex - b.startIndex);

  // Assign stable IDs and redacted flag
  const spans = nonOverlapping.map((span, index) => ({
    id: `span_${String(index + 1).padStart(3, "0")}`,
    ...span,
    redacted: true,
  }));

  return { spans, dropped };
}

/**
 * Run PII detection on a document.
 * @param {string} documentText
 * @returns {Promise<{ spans: PIISpan[], dropped: number }>}
 */
export async function detectPII(documentText) {
  const prompt = buildDetectionPrompt(documentText);
  const rawResponse = await callGemini(prompt);
  return parseAndValidateSpans(rawResponse, documentText);
}

/**
 * Build the "why wasn't this flagged?" explanation prompt.
 * Uses honesty-over-defensiveness: the model is asked to say if it was wrong.
 * @param {string} documentText
 * @param {string} selectedText
 * @returns {string}
 */
function buildExplainPrompt(documentText, selectedText) {
  return `You are a PII detection assistant reviewing your own decisions.

A user selected the following text from a document and is asking why it was NOT flagged as PII:

Selected text: "${selectedText}"

Full document context:
"""
${documentText}
"""

Your task: Explain in 2–3 plain-English sentences why this text was not flagged as PII. Be honest. If on reflection this text actually looks like it should have been flagged, say so clearly — do not defend a wrong call. If it's borderline, say it's borderline and explain what makes it ambiguous. Only say it's clearly not PII if you are confident.

Do not use bullet points or headers. Just write 2–3 sentences directly.`;
}

/**
 * Explain why a selected piece of text was NOT flagged as PII.
 * @param {string} documentText
 * @param {string} selectedText
 * @returns {Promise<string>} - Plain-English explanation
 */
export async function explainNonRedaction(documentText, selectedText) {
  const prompt = buildExplainPrompt(documentText, selectedText);
  const response = await callGemini(prompt);
  return response.trim();
}
