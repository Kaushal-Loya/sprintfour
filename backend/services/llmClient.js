// services/llmClient.js
// Single responsibility: wrap the Gemini API. Prompt logic lives in callers.

import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error(
    "[llmClient] GEMINI_API_KEY is not set. Detection and explain endpoints will fail."
  );
}

const ai = new GoogleGenAI({ apiKey });

/**
 * Send a prompt to Gemini and return the raw text response.
 * @param {string} prompt - The full prompt string to send.
 * @returns {Promise<string>} - Raw text from the model.
 */
export async function callGemini(prompt) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  return response.text;
}
