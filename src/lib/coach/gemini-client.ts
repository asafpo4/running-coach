import { ApiError, GoogleGenAI } from "@google/genai";

// Free tier: https://aistudio.google.com/apikey — generous free daily quota
// on the "flash" models, no billing account required.
export const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Free-tier quota is allocated per model, not just per account — heavy use
// in one day can exhaust one model's daily quota while others on the same
// key still have headroom, and a specific model can independently go down
// under sustained load regardless of account status. Verified both of
// these happening within the same day. So: a candidate list, tried in
// order, not a single pinned/aliased model — the app should keep working
// even when one specific model doesn't.
export const COACH_MODEL_CANDIDATES = [
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-pro-latest",
];

const RETRYABLE_STATUS_CODES = new Set([429, 503]);

/**
 * Calls `attempt` once per candidate model, in order, moving to the next
 * on a retryable error (quota exhausted / overloaded) instead of retrying
 * the same model repeatedly. Throws the last error if every candidate
 * fails.
 */
export async function withGeminiFallback<T>(
  attempt: (model: string) => Promise<T>,
  candidates: string[] = COACH_MODEL_CANDIDATES,
): Promise<T> {
  let lastError: unknown;
  for (const model of candidates) {
    try {
      return await attempt(model);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof ApiError && RETRYABLE_STATUS_CODES.has(err.status);
      if (!retryable) throw err;
    }
  }
  throw lastError;
}
