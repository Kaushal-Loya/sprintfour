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
  // Primary PII — directly identifies a person
  "PERSON_NAME",
  "EMAIL",
  "PHONE",
  "SSN",
  "ADDRESS",
  "DATE_OF_BIRTH",
  "ACCOUNT_NUMBER",
  "FINANCIAL",
  // Contextual PII — indirectly identifying / quasi-identifiers
  "ORG",
  "JOB_TITLE",
  "OTHER",
];

/**
 * Build the detection prompt for Gemini.
 * @param {string} documentText
 * @returns {string}
 */
function buildDetectionPrompt(documentText) {
  return `You are a PII detection assistant operating a TWO-TIER detection model. Your job is to identify ALL sensitive information in the document and return a strict JSON array.

## TIER 1 — Primary PII (directly identifies a person)
Use these types for high-sensitivity data:
- PERSON_NAME: Full names, first names used in salutation context
- EMAIL: Email addresses
- PHONE: Phone or fax numbers
- SSN: Social Security Numbers or national ID numbers
- ADDRESS: Physical street addresses, zip codes
- DATE_OF_BIRTH: Birthdates when explicitly labeled as such
- ACCOUNT_NUMBER: Policy numbers, member IDs, account numbers, reference numbers that are EXPLICITLY linked to a named individual (e.g. "your policy number is HX-8821-99", "your account ID is ACC-442"). Flag these even if they look like codes.
- FINANCIAL: Salary, compensation, personal income figures tied to an identified individual (e.g. "$145,000 per year")

## TIER 2 — Contextual PII (quasi-identifiers, indirectly identifying)
Use these types for information that narrows down identity when combined with other data:
- ORG: Company names, employer names, organization names that appear in a personal document context (e.g. the signing company on an offer letter, the insurance company processing a claim)
- JOB_TITLE: Job titles, roles, positions (e.g. "Senior Claims Adjuster", "VP of People Operations")
- Any other forms of Contextual PII you can identify.

For each PII span found, return:
- "text": the exact substring as it appears in the document
- "type": one of PERSON_NAME, EMAIL, PHONE, SSN, ADDRESS, DATE_OF_BIRTH, ACCOUNT_NUMBER, FINANCIAL, ORG, JOB_TITLE, OTHER
- "startIndex": character index where this text starts (0-based)
- "endIndex": character index where this text ends (exclusive, like slice)
- "confidence": 0–1, how confident you are this is PII of that type
- "reasoning": one plain-English sentence explaining WHY this is flagged

Rules:
1. Be honest about uncertainty — give lower confidence (0.4–0.6) when unsure, and say why.
2. ALWAYS flag Tier 1 PII. Never skip names, SSNs, emails, phones, addresses, or account/policy numbers linked to a person. Assign confidence 0.9–1.0 for these.
3. Flag Tier 2 (ORG, JOB_TITLE) when they appear in a personal document context. You MUST flag EVERY occurrence of the organization name and job title, including in the signature block or header. Assign confidence 0.7–0.8 for these to place them in the Medium confidence band.
4. Do NOT flag: generic time durations ("30-day window"), procedural dates not linked to a person's identity, generic prices unlinked to an individual, or State names when used as a legal jurisdiction (e.g. "California employment law").
5. startIndex and endIndex MUST match the exact "text" substring in the document. Verify before returning.
6. Return ONLY the JSON array — no markdown, no explanation, no code fences.

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
  const usedFallbackIndices = new Set();

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
      // We look for the occurrence that is closest to the AI's provided index and hasn't been used yet.
      let bestIndex = -1;
      let minDistance = Infinity;
      let pos = 0;
      
      while ((pos = documentText.indexOf(span.text, pos)) !== -1) {
        if (!usedFallbackIndices.has(pos)) {
          const distance = Math.abs(pos - span.startIndex);
          if (distance < minDistance) {
            minDistance = distance;
            bestIndex = pos;
          }
        }
        pos += 1;
      }

      if (bestIndex === -1) {
        dropped++;
        console.warn(
          `[detection] Dropping hallucinated/duplicate span — text not found or already covered: "${span.text}"`
        );
        continue;
      }
      
      // Correct the indices
      usedFallbackIndices.add(bestIndex);
      span.startIndex = bestIndex;
      span.endIndex = bestIndex + span.text.length;
    } else {
      // If the AI actually got it perfectly right, record the index so fallback doesn't reuse it
      usedFallbackIndices.add(span.startIndex);
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
