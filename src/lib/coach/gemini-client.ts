import { ApiError, GoogleGenAI } from "@google/genai";

// Free tier: https://aistudio.google.com/apikey — generous free daily quota
// on the "flash" models, no billing account required.
export const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Pinned rather than "gemini-flash-latest" so the coach's behavior/tone
// doesn't shift out from under us on a silent model swap. Verify against
// `ai.models.list()` if this ever 404s — Google retires model versions for
// new API keys over time.
export const COACH_MODEL = "gemini-3.5-flash";

const RETRYABLE_STATUS_CODES = new Set([429, 503]);

/**
 * Gemini's free tier returns transient 503 "high demand" / 429 rate-limit
 * errors fairly routinely — wrap every call through this instead of
 * surfacing them as user-facing failures on the first bad roll.
 */
export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof ApiError && RETRYABLE_STATUS_CODES.has(err.status);
      if (!retryable || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw new Error("unreachable");
}
