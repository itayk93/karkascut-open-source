import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Word } from "../types.js";
import type { DetectedSilence } from "./ffmpeg.js";

const interval = z.object({ start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative() });
const resultSchema = z.object({
  version: z.literal(1), duration: z.number().finite().positive(),
  speech: z.array(interval),
  words: z.array(interval.extend({ word: z.string(), aligned: z.boolean() })),
  alignedCount: z.number().int().nonnegative(), totalWords: z.number().int().nonnegative(),
  vadModel: z.string(), alignmentModel: z.string()
});
export type AcousticAnalysis = z.infer<typeof resultSchema>;
const script = fileURLToPath(new URL("../../../scripts/analyze_speech.py", import.meta.url));
const defaultPython = fileURLToPath(new URL("../../../.venv-speech/bin/python", import.meta.url));
const pending = new Map<string, Promise<AcousticAnalysis>>();
let queue: Promise<unknown> = Promise.resolve();

export function validateAcousticAnalysis(raw: unknown, words: Word[]): AcousticAnalysis {
  const result = resultSchema.parse(raw);
  if (result.words.length !== words.length || result.totalWords !== words.length ||
      result.words.some((w, i) => w.word !== words[i]?.word || w.end <= w.start || w.end > result.duration ||
        (i > 0 && w.start < result.words[i - 1]!.end)) ||
      result.alignedCount !== result.words.filter((w) => w.aligned).length ||
      result.speech.some((s, i) => s.end <= s.start || s.end > result.duration || (i > 0 && s.start < result.speech[i - 1]!.end))) {
    throw new Error("Invalid acoustic analysis result");
  }
  return result;
}

/** Complement of actual speech. Transcript timestamps never veto an acoustic pause. */
export function acousticSilences(analysis: Pick<AcousticAnalysis, "speech" | "duration">, minDuration = 0.85,
  start = 0, end = analysis.duration): Array<{ start: number; end: number; duration: number }> {
  const from = Math.max(0, start);
  const to = Math.min(analysis.duration, end);
  const result: Array<{ start: number; end: number; duration: number }> = [];
  let cursor = from;
  for (const speech of analysis.speech) {
    if (speech.end <= from) continue;
    if (speech.start >= to) break;
    const gapEnd = Math.min(to, speech.start);
    if (gapEnd - cursor >= minDuration) result.push({ start: cursor, end: gapEnd, duration: gapEnd - cursor });
    cursor = Math.max(cursor, speech.end);
  }
  if (to - cursor >= minDuration) result.push({ start: cursor, end: to, duration: to - cursor });
  return result;
}

export interface SpeechSilenceResult {
  silences: DetectedSilence[];
  analysis: AcousticAnalysis;
}

/**
 * VAD-based silence detection for a whole clip. Speech position comes from the
 * audio itself, so a wrong ASR timestamp can no longer hide or invent a pause.
 * Returns null (never throws) when the local speech engine is missing or fails,
 * so callers fall back to the FFmpeg + transcript heuristic.
 */
export async function detectSpeechSilences(
  audioPath: string, words: Word[], minDuration = 0.85
): Promise<SpeechSilenceResult | null> {
  try {
    const analysis = await analyzeAcoustics(audioPath, words);
    const silences = acousticSilences(analysis, minDuration).map((s) => ({
      start: s.start, end: s.end, duration: s.duration
    }));
    return { silences, analysis };
  } catch (err) {
    console.warn("Acoustic speech detection unavailable, using FFmpeg fallback:",
      err instanceof Error ? err.message : err);
    return null;
  }
}

function runWorker(audioPath: string, words: Word[], language: string): Promise<AcousticAnalysis> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.SPEECH_PYTHON || defaultPython, [script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, HOME: process.env.HOME, HF_HOME: process.env.HF_HOME,
        OMP_NUM_THREADS: "4", TOKENIZERS_PARALLELISM: "false" }
    });
    let output = "";
    let errorTail = "";
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 10 * 60_000);
    child.stdout.on("data", (data: Buffer) => {
      output += data.toString();
      if (output.length > 20_000_000) child.kill("SIGKILL");
    });
    child.stderr.on("data", (data: Buffer) => { errorTail = (errorTail + data.toString()).slice(-2000); });
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("מנוע זיהוי הדיבור המקומי אינו מותקן. הרץ npm run setup:speech בשרת."));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.error("Acoustic analysis worker failed:", errorTail);
        reject(new Error(timedOut ? "זיהוי הדיבור חרג מזמן ההמתנה. נסה שוב." : "זיהוי הדיבור או יישור המילים נכשלו. לא הוחלה חלוקה חדשה."));
        return;
      }
      try { resolve(validateAcousticAnalysis(JSON.parse(output), words)); }
      catch { reject(new Error("מנוע הדיבור החזיר תוצאה לא תקינה. לא הוחלה חלוקה חדשה.")); }
    });
    child.stdin.on("error", () => { /* Process failure is handled above. */ });
    child.stdin.end(JSON.stringify({ audioPath, words, language }));
  });
}

/** Worker content is part of cache identity, so code fixes cannot reuse old results. */
export function acousticCacheKey(input: {
  audioPath: string; size: number; mtime: number; words: Word[]; language: string; workerSource: string;
}): string {
  const { workerSource, ...audio } = input;
  const workerDigest = createHash("sha256").update(workerSource).digest("hex");
  return createHash("sha256").update(JSON.stringify({ version: 2, ...audio, workerDigest })).digest("hex");
}

export async function analyzeAcoustics(audioPath: string, words: Word[]): Promise<AcousticAnalysis> {
  const stat = await fs.stat(audioPath);
  const language = process.env.SPEECH_LANGUAGE || (words.some((w) => /[\u0590-\u05ff]/.test(w.word)) ? "he" : "en");
  const key = acousticCacheKey({ audioPath, size: stat.size, mtime: stat.mtimeMs, words, language,
    workerSource: await fs.readFile(script, "utf8") });
  const cache = path.join(path.dirname(audioPath), `acoustic-${key}.json`);
  const existing = pending.get(key);
  if (existing) return existing;
  const task = (async () => {
    try { return validateAcousticAnalysis(JSON.parse(await fs.readFile(cache, "utf8")), words); }
    catch { /* Missing or invalid cache must be recomputed. */ }
    // One model at a time bounds CPU/RAM usage across concurrent requests.
    const work = queue.then(() => runWorker(audioPath, words, language));
    queue = work.catch(() => {});
    const result = await work;
    const temporary = `${cache}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(result), { mode: 0o600 });
      await fs.rename(temporary, cache);
    } finally { await fs.rm(temporary, { force: true }); }
    return result;
  })();
  pending.set(key, task);
  try { return await task; }
  finally { pending.delete(key); }
}
