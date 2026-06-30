import express from "express";
import multer from "multer";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import mammoth from "mammoth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { originalname, buffer, mimetype } = req.file;
  let text = "";
  let wordBoxes = [];
  let pagesInfo = [];
  let isImagePDF = false;

  try {
    const isPDF = mimetype === "application/pdf" || originalname.endsWith(".pdf");

    if (isPDF) {
      // Create a temporary file for PyMuPDF
      const tmpPath = path.join(os.tmpdir(), `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
      fs.writeFileSync(tmpPath, buffer);

      const scriptPath = path.join(__dirname, "..", "pdf_extractor.py");
      
      const pythonCommand = ["python3", "python"].find(candidate => {
        try {
          return spawnSync(candidate, ["-c", "import sys; print(sys.executable)"], { encoding: "utf-8" }).status === 0;
        } catch {
          return false;
        }
      });

      if (!pythonCommand) {
        fs.unlinkSync(tmpPath);
        return res.status(500).json({ error: "Python environment not found for PDF extraction." });
      }

      const result = spawnSync(pythonCommand, [scriptPath, tmpPath], {
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024, // 50MB
      });

      fs.unlinkSync(tmpPath);

      if (result.status !== 0) {
        console.error("[upload] PyMuPDF extraction failed:", result.stderr);
        return res.status(500).json({ error: "Failed to extract text from PDF." });
      }

      const parsed = JSON.parse(result.stdout);
      if (!parsed.success) {
        return res.status(500).json({ error: parsed.error || "PDF extraction returned failure." });
      }

      text = parsed.text;
      wordBoxes = parsed.wordBoxes;
      pagesInfo = parsed.pages;
      
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

    // If PyMuPDF couldn't extract any text, it's likely a true image PDF.
    // We signal the frontend to run Tesseract OCR on the client by returning text: ""
    if (isPDF && (!text || text.trim() === "")) {
      const docId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      return res.json({
        id: docId,
        title: originalname,
        text: "",
        wordBoxes: [],
        pages: pagesInfo,
        isImagePDF: true,
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
      wordBoxes: wordBoxes,
      pages: pagesInfo,
      isImagePDF: isPDF, // Render all PDFs with visual overlay since we have wordBoxes
    });
  } catch (error) {
    console.error("[upload] Error parsing document:", error);
    res.status(500).json({ error: "Failed to parse document: " + error.message });
  }
});

export default router;
