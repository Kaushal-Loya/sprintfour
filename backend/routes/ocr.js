import express from "express";
import multer from "multer";
import Tesseract from "tesseract.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image provided." });
  }

  try {
    const worker = await Tesseract.createWorker("eng+hin", 1, {
      logger: () => {}, // Suppress per-progress logs
    });
    
    // In Tesseract.js v7, extended outputs like 'blocks' must be explicitly requested
    const { data } = await worker.recognize(req.file.buffer, {}, { blocks: true });
    await worker.terminate();

    let text = "";
    let charIndex = 0;
    const wordBoxes = [];

    const blocks = data.blocks || [];
    for (const block of blocks) {
      const paragraphs = block.paragraphs || [];
      for (const paragraph of paragraphs) {
        const lines = paragraph.lines || [];
        for (const line of lines) {
          const words = line.words || [];
          let lineHasWords = false;

          for (const word of words) {
            const wText = word.text;
            if (!wText.trim()) continue;

            lineHasWords = true;
            if (text && !text.endsWith(" ") && !text.endsWith("\n")) {
              text += " ";
              charIndex += 1;
            }

            const startIndex = charIndex;
            text += wText;
            const endIndex = charIndex + wText.length;
            charIndex = endIndex;

            wordBoxes.push({
              word: wText,
              startIndex,
              endIndex,
              bbox: word.bbox,
              confidence: word.confidence
            });
          }
          if (lineHasWords) {
            text += "\n";
            charIndex += 1;
          }
        }
        text += "\n";
        charIndex += 1;
      }
    }

    res.json({ text: text.trim(), wordBoxes });
  } catch (error) {
    console.error("[ocr] Error during OCR:", error);
    res.status(500).json({ error: "OCR processing failed: " + error.message });
  }
});

export default router;
