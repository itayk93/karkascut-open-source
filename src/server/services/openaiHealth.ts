import OpenAI from "openai";
import { env } from "../config/env.js";

export interface KeyValidation {
  valid: boolean;
  error?: string;
}

/**
 * Cheap liveness check for an OpenAI key: lists models (no tokens billed).
 * Used as a pre-flight gate so a bad key blocks processing up front instead
 * of failing deep inside the pipeline and leaving a project stuck in "error".
 */
export async function validateOpenAiKey(customApiKey?: string): Promise<KeyValidation> {
  const apiKey = (customApiKey || env.OPENAI_API_KEY || "").trim();
  if (apiKey.length < 20) {
    return { valid: false, error: "מפתח OpenAI API חסר או קצר מדי. הזן מפתח תקין בהגדרות." };
  }

  try {
    const openai = new OpenAI({ apiKey, timeout: 15000, maxRetries: 0 });
    await openai.models.list();
    return { valid: true };
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      return { valid: false, error: "מפתח OpenAI API שגוי (401). בדוק את המפתח בהגדרות." };
    }
    if (status === 429) {
      return { valid: false, error: "חריגה ממכסת OpenAI (429). בדוק חיוב/מכסה בחשבון." };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `בדיקת מפתח OpenAI נכשלה: ${message}` };
  }
}
