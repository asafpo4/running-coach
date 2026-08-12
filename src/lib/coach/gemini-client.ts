import { GoogleGenAI } from "@google/genai";

// Free tier: https://aistudio.google.com/apikey — generous free daily quota
// on the "flash" models, no billing account required.
export const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const COACH_MODEL = "gemini-2.5-flash";
