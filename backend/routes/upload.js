import express from "express";
import multer from "multer";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");
import mammoth from "mammoth";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { originalname, buffer, mimetype } = req.file;
  let text = "";

  try {
    if (mimetype === "application/pdf" || originalname.endsWith(".pdf")) {
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      text = data.text;
    } else if (
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      originalname.endsWith(".docx")
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (
      mimetype.startsWith("text/") ||
      originalname.endsWith(".txt") ||
      originalname.endsWith(".md")
    ) {
      text = buffer.toString("utf-8");
    } else {
      return res.status(415).json({
        error: "Unsupported file type. Please upload a PDF, DOCX, or text file.",
      });
    }

    if (!text || text.trim() === "") {
      return res.status(422).json({ error: "Could not extract any text from the document." });
    }

    const docId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    res.json({
      id: docId,
      title: originalname,
      text: text.trim(),
    });
  } catch (error) {
    console.error("[upload] Error parsing document:", error);
    res.status(500).json({ error: "Failed to parse document: " + error.message });
  }
});

export default router;
