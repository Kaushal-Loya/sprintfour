"""
pdf_redactor.py
Burn PII redactions into a PDF using PyMuPDF (fitz).

Receives:
  argv[1] - input PDF path
  argv[2] - output PDF path
  argv[3] - JSON file of spans: [{text, type, action, ...}]

Actions per span:
  'redact'       → black filled rectangle (text destroyed)
  'anonymous'    → replace text with [REDACTED TYPE] label
  'keep-visible' → leave unchanged
  null / missing → treated as 'redact'
"""

import json
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("ERROR: PyMuPDF not installed. Run: pip install pymupdf", file=sys.stderr)
    sys.exit(1)


ANON_LABELS = {
    "PERSON_NAME":    "[REDACTED NAME]",
    "EMAIL":          "[REDACTED EMAIL]",
    "PHONE":          "[REDACTED PHONE]",
    "SSN":            "[REDACTED SSN]",
    "ADDRESS":        "[REDACTED ADDRESS]",
    "DATE_OF_BIRTH":  "[REDACTED DOB]",
    "ACCOUNT_NUMBER": "[REDACTED ACCOUNT]",
    "FINANCIAL":      "[REDACTED FINANCIAL]",
    "URL":            "[REDACTED URL]",
    "ORG":            "[REDACTED ORG]",
    "JOB_TITLE":      "[REDACTED ROLE]",
    "OTHER":          "[REDACTED]",
}


def normalize(text: str) -> str:
    """Lowercase and collapse whitespace for fuzzy word matching."""
    return " ".join((text or "").lower().split())


def find_phrase_rects(page, phrase: str):
    """
    Find all bounding rectangles for 'phrase' on the page by matching
    consecutive words from PyMuPDF's word list.
    Returns a list of fitz.Rect objects (one per occurrence).
    """
    tokens = [t for t in phrase.split() if t]
    if not tokens:
        return []

    words = page.get_text("words")  # [(x0,y0,x1,y1, word, block, line, word_idx), ...]
    norm_words = [normalize(w[4]) for w in words]
    norm_tokens = [normalize(t) for t in tokens]
    rects = []

    for start in range(len(norm_words) - len(norm_tokens) + 1):
        if norm_words[start : start + len(norm_tokens)] != norm_tokens:
            continue
        matched = words[start : start + len(norm_tokens)]
        r = fitz.Rect(matched[0][0], matched[0][1], matched[0][2], matched[0][3])
        for w in matched[1:]:
            r.include_rect(fitz.Rect(w[0], w[1], w[2], w[3]))
        rects.append(r)

    return rects


def redact_pdf(input_path: str, output_path: str, spans: list) -> None:
    doc = fitz.open(input_path)

    for page in doc:
        for span in spans:
            text = (span.get("text") or "").strip()
            action = (span.get("action") or "redact").lower()

            if action == "keep-visible" or not text:
                continue  # Leave unchanged

            rects = find_phrase_rects(page, text)
            if not rects:
                continue

            span_type = (span.get("type") or "OTHER").upper()

            for rect in rects:
                if action == "anonymous":
                    label = ANON_LABELS.get(span_type, "[REDACTED]")
                    page.add_redact_annot(
                        rect,
                        text=label,
                        fontsize=7,
                        align=fitz.TEXT_ALIGN_CENTER,
                        fill=(0.9, 0.9, 0.9),   # light gray background
                        text_color=(0.1, 0.1, 0.1),
                    )
                else:
                    # 'redact' — solid black
                    page.add_redact_annot(rect, fill=(0, 0, 0))

        page.apply_redactions()

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: pdf_redactor.py <input.pdf> <output.pdf> <spans.json>", file=sys.stderr)
        sys.exit(1)

    input_path  = sys.argv[1]
    output_path = sys.argv[2]
    spans_path  = Path(sys.argv[3])

    spans = json.loads(spans_path.read_text(encoding="utf-8"))
    redact_pdf(input_path, output_path, spans)
    print("OK")
