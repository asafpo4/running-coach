import { GoogleGenAI } from "@google/genai";

// Free tier: https://aistudio.google.com/apikey — generous free daily quota
// on the "flash" models, no billing account required.
export const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Pinned rather than "gemini-flash-latest" so the coach's behavior/tone
// doesn't shift out from under us on a silent model swap. Verify against
// `ai.models.list()` if this ever 404s — Google retires model versions for
// new API keys over time.
export const COACH_MODEL = "gemini-3.5-flash";
