import fs from "fs";
import OpenAI from "openai";
import { TranscriptData, Word } from "../types.js";
import { env } from "../config/env.js";

export async function transcribeAudio(
  audioFilePath: string,
  customApiKey?: string,
  scriptPrompt?: string
): Promise<TranscriptData> {
  const apiKey = (customApiKey || env.OPENAI_API_KEY).trim();
  if (!apiKey) {
    throw new Error("מפתח OpenAI API חסר. נא להזין את המפתח בממשק או בקובץ .env.");
  }

  const openai = new OpenAI({ apiKey });
  const model = env.OPENAI_TRANSCRIBE_MODEL;

  const fileStream = fs.createReadStream(audioFilePath);

  interface RawWordItem {
    word?: string;
    start?: number;
    end?: number;
  }

  const defaultFillerHint = "כולל מילות פילר, היסוסים, גמגומים וחזרות מילים: אממ, אה, כאילו, בעצם, רגע, טוב אז.";
  const effectivePrompt = scriptPrompt && scriptPrompt.trim()
    ? `${defaultFillerHint} סקריפט: ${scriptPrompt.trim()}`.slice(0, 800)
    : defaultFillerHint;

  const transcriptionParams = {
    file: fileStream,
    model: model,
    response_format: "verbose_json" as const,
    timestamp_granularities: ["word" as const],
    prompt: effectivePrompt
  };

  const response = await openai.audio.transcriptions.create(transcriptionParams);
  const verboseResponse = response as unknown as { text?: string; words?: RawWordItem[] };
  const rawWords = verboseResponse.words || [];
  const words: Word[] = rawWords
    .map((w: RawWordItem) => ({
      word: String(w.word || "").trim(),
      start: Math.round((Number(w.start) || 0) * 1000) / 1000,
      end: Math.round((Number(w.end) || 0) * 1000) / 1000
    }))
    .filter((w: Word) => w.word.length > 0);

  return {
    text: response.text || "",
    words
  };
}
