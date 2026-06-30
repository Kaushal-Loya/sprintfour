// server.js — Express app entry point
// Mounts routes, configures middleware, starts the server.
// API key is read from process.env, loaded via the --env-file flag
// in the npm script (Node 20.6+ built-in env loader — no dotenv needed).

import express from "express";
import cors from "cors";
import detectRouter from "./routes/detect.js";
import explainRouter from "./routes/explain.js";
import uploadRouter from "./routes/upload.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: "http://localhost:5173" })); // Vite dev server
app.use(express.json({ limit: "1mb" }));

// Routes
app.use("/api/detect", detectRouter);
app.use("/api/explain", explainRouter);
app.use("/api/upload", uploadRouter);

// Sample doc routes live under /api/detect/docs (see detect.js)

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    apiKeySet: !!process.env.GROQ_API_KEY,
  });
});

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`\n✅ Conseal backend running on http://localhost:${PORT}`);
  console.log(`   API key set: ${!!process.env.GROQ_API_KEY}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});