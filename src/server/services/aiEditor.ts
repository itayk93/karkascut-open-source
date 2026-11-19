import OpenAI from "openai";
import { speechEditCandidates, excludeSpeechFromSilence } from "./speechProtection.js";
import { Word, CutSegment, CutCategory } from "../types.js";
import { DetectedSilence } from "./ffmpeg.js";
import { generateId } from "../utils/id.js";

export interface AICutResult {
  start: number;
  end: number;
  type: "filler" | "false_start" | "retake" | "repetition" | "correction" | "dead_content";
  confidence: number;
  reason: string;
  text: string;
}

import { env } from "../config/env.js";

const EDITOR_TYPE_ENUM = ["filler", "false_start", "retake", "repetition", "correction", "dead_content"] as const;

/**
 * Split a long word list into overlapping windows so the LLM never has to reason
 * over a diluted context. A single global pass on a 10-minute video misses local
 * stumbles; per-window passes with overlap keep every stumble in focus.
 */
export function chunkWords(
  words: Word[],
  windowSec = 90,
  overlapSec = 15
): Array<{ words: Word[]; from: number; to: number }> {
  if (words.length === 0) return [];
  const total = words[words.length - 1]!.end;
  if (total <= windowSec) return [{ words, from: 0, to: total }];

  const chunks: Array<{ words: Word[]; from: number; to: number }> = [];
  let cursor = 0;
  while (cursor < total) {
    const from = cursor;
    const to = Math.min(total, cursor + windowSec);
    const slice = words.filter((w) => w.end > from - 0.01 && w.start < to + 0.01);
    if (slice.length > 0) chunks.push({ words: slice, from, to });
    if (to >= total) break;
    cursor = to - overlapSec;
  }
  return chunks;
}

/** Drop duplicate / fully-contained cuts produced by overlapping windows or multiple detectors. */
export function dedupeCuts(cuts: AICutResult[]): AICutResult[] {
  const sorted = [...cuts].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: AICutResult[] = [];
  for (const c of sorted) {
    if (c.end - c.start < 0.05) continue;
    const dup = kept.find(
      (k) =>
        (Math.abs(k.start - c.start) < 0.2 && Math.abs(k.end - c.end) < 0.2) ||
        (k.start <= c.start + 0.05 && k.end >= c.end - 0.05)
    );
    if (dup) {
      if (c.confidence > dup.confidence) {
        dup.confidence = c.confidence;
        dup.reason = c.reason;
        dup.type = c.type;
      }
      continue;
    }
    kept.push({ ...c });
  }
  return kept.sort((a, b) => a.start - b.start);
}

export async function analyzeTranscriptWithAI(
  words: Word[],
  customApiKey?: string,
  originalScript?: string
): Promise<AICutResult[]> {
  const apiKey = (customApiKey || env.OPENAI_API_KEY).trim();
  if (!apiKey) {
    throw new Error("מפתח OpenAI API חסר. נא להזין את המפתח בממשק או בקובץ .env.");
  }

  if (words.length === 0) return [];

  const openai = new OpenAI({ apiKey });
  const model = env.OPENAI_EDITOR_MODEL;
  const systemPrompt = buildEditorSystemPrompt(originalScript);

  // 1. LLM layer: sliding overlapping windows, analyzed sequentially to avoid rate spikes
  const windows = chunkWords(words);
  const aiCuts: AICutResult[] = [];
  for (const w of windows) {
    try {
      const partial = await analyzeChunkWithAI(openai, model, w.words, systemPrompt);
      for (const c of partial) {
        // keep only cuts that actually belong to this window's exclusive span (minus overlap tail)
        if (c.start >= w.from - 0.05 && c.start <= w.to + 0.05) aiCuts.push(c);
      }
    } catch (err) {
      console.error(`AI window [${w.from.toFixed(0)}s-${w.to.toFixed(0)}s] failed:`, err);
    }
  }

  // 2. Deterministic layer: stutters, aborted prefixes, semantic retakes, unfinished sentences
  const deterministicCuts = [
    ...detectImmediateWordStutters(words),
    ...detectAbortedPhrases(words),
    ...detectSentenceRetakes(words),
    ...detectUnfinishedSentences(words),
    ...detectRepeatedPhraseRuns(words)
  ];

  // 3. Script alignment (highest-signal when a planned script exists): keep the last take
  const alignCuts =
    originalScript && originalScript.trim() ? alignTranscriptToScript(words, originalScript) : [];

  // alignment cuts first so dedupe keeps their higher confidence / span on overlap
  return dedupeCuts([...alignCuts, ...aiCuts, ...deterministicCuts]);
}

function buildEditorSystemPrompt(originalScript?: string): string {
  let systemPrompt = `You are a world-class professional video editor for social media (Talking Head, Reels, TikTok, YouTube Shorts).
Your job is to analyze the speech transcript with exact timestamps and identify parts that MUST be deleted to create a punchy, concise, professional cut.

You must categorize unnecessary content into strictly 6 cut categories:
1. "filler": Hesitations, verbal tics, and filler words (e.g. "um", "ah", "אממ", "אה", "כאילו", "בעצם", "רגע", "טוב אז", "יעני", "נו").
2. "false_start": CRITICAL: Sentences or thoughts started and aborted mid-way (e.g. speaker starts a phrase, pauses, and restarts or abandons it). You MUST cut the aborted start completely!
3. "retake": CRITICAL: When the speaker attempts a sentence multiple times until getting it right (e.g. "וככה זה הולך... נשאר שבוע... וככה זה הולך... נשאר שבוע הכל טוב..."). You MUST CUT ALL EARLIER INCOMPLETE OR FAILED TAKES, keeping ONLY the single best, most complete take!
4. "repetition": CRITICAL STUTTERS & REPEATS: Pointless word or phrase loops, repeated beginnings, and stutters (e.g. "אני... אני", "זה זה", "שאנחנו שאנחנו"). Cut the first duplicated stutter instance with confidence 1.0!
5. "correction": Explicit speech corrections (e.g., "לא, בעצם...", "רגע, סליחה", "התכוונתי ל...").
6. "dead_content": Unproductive rambling words, coughs, cleared throat sounds, or failed attempts that add zero value.

Aggressive Stutter & Incomplete Sentence Rules:
- When a word or short phrase is repeated consecutively due to a stutter (e.g., "אנחנו... אנחנו"), cut the initial stutter instance ("repetition") keeping only the clean delivered word.
- Any sentence that was started, interrupted by a pause, and then restarted or rephrased MUST have its first attempt marked as "false_start" or "retake" with confidence 1.0!
- Never leave a sentence hanging without a conclusion if the speaker re-did it right after.

Rules:
- Give exact start and end timestamps matching the words from the input.
- Assign confidence score (0.00 to 1.00). Assign 0.95 - 1.00 for all stutters, aborted sentences and retakes.
- Give a brief reason in Hebrew for each cut.
- Do NOT cut meaningful content from the final successful take.`;

  if (originalScript && originalScript.trim()) {
    systemPrompt += `\n\nCRITICAL CONTEXT: The creator provided the original planned script:
"""
${originalScript.trim()}
"""
Compare the transcript words directly against this planned script!
- Whenever the speaker attempts a sentence from the script, stumbles, and retakes it: mark the earlier flawed take as "retake" or "false_start" so only the clean take matching the script survives.
- Identify off-script rambles or mistakes as "dead_content" or "correction".`;
  }

  return systemPrompt;
}

async function analyzeChunkWithAI(
  openai: OpenAI,
  model: string,
  words: Word[],
  systemPrompt: string
): Promise<AICutResult[]> {
  if (words.length === 0) return [];
  const formattedTranscript = words.map((w) => `[${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s] ${w.word}`).join(" ");

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Here is the speech transcript with word timestamps:\n\n${formattedTranscript}\n\nIdentify all sections that should be removed.`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "video_edit_cuts",
        strict: true,
        schema: {
          type: "object",
          properties: {
            cuts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  start: { type: "number", description: "Start timestamp in seconds" },
                  end: { type: "number", description: "End timestamp in seconds" },
                  type: { type: "string", enum: [...EDITOR_TYPE_ENUM] },
                  confidence: { type: "number", description: "Confidence score between 0 and 1" },
                  reason: { type: "string", description: "Brief explanation in Hebrew" },
                  text: { type: "string", description: "The exact words being removed" }
                },
                required: ["start", "end", "type", "confidence", "reason", "text"],
                additionalProperties: false
              }
            }
          },
          required: ["cuts"],
          additionalProperties: false
        }
      }
    }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];
  try {
    return (JSON.parse(content).cuts || []) as AICutResult[];
  } catch (err) {
    console.error("Failed to parse AI edit plan chunk:", err);
    return [];
  }
}

/**
 * Snap a cut so its edges land in the silence BETWEEN words, never inside a word
 * or in the middle of a still-flowing phrase:
 *  - start  -> the end of the last word that finishes at/before it (keep that word intact)
 *  - end    -> the start of the first word that begins at/after it (keep that word intact)
 * If the resulting window is not bounded by real gaps on both sides, the cut is
 * rejected (returns null) — that means the model tried to cut mid-sentence.
 */
export function snapCutToWordBoundaries(
  cut: AICutResult,
  words: Word[],
  minGapSec = 0.16
): AICutResult | null {
  if (words.length === 0) return null;

  // last word ending at or before cut.start (+ tiny tolerance)
  let before: Word | undefined;
  for (const w of words) if (w.end <= cut.start + 0.12) before = w;
  // first word starting at or after cut.end (- tiny tolerance)
  const after = words.find((w) => w.start >= cut.end - 0.12);

  const snappedStart = before ? Math.max(cut.start, before.end) : cut.start;
  const snappedEnd = after ? Math.min(cut.end, after.start) : cut.end;

  if (snappedEnd - snappedStart < 0.1) return null;

  // Require an actual pause on at least one side, unless the removed span is a
  // clean run of whole words (aborted take) with a real gap before the next word.
  const gapBefore = before && after ? after.start - before.end : Infinity;
  const removedWords = words.filter((w) => w.start >= snappedStart - 0.05 && w.end <= snappedEnd + 0.05);
  const isWholeWordRun = removedWords.length > 0;
  const gapAfterRun =
    removedWords.length > 0 && after
      ? after.start - removedWords[removedWords.length - 1]!.end
      : 0;

  if (!isWholeWordRun && gapBefore < minGapSec) return null;
  if (isWholeWordRun && gapAfterRun < minGapSec && (!before || removedWords[0]!.start - before.end < minGapSec)) {
    // a run with no pause on either side = we'd be slicing a continuous sentence
    return null;
  }

  return {
    ...cut,
    start: Math.round(snappedStart * 1000) / 1000,
    end: Math.round(snappedEnd * 1000) / 1000,
    text: removedWords.map((w) => w.word).join(" ") || cut.text
  };
}

/** Merge cuts whose gap is smaller than `joinSec` — avoids a choppy result. */
function coalesceCuts(cuts: AICutResult[], joinSec = 0.45): AICutResult[] {
  const sorted = [...cuts].sort((a, b) => a.start - b.start);
  const out: AICutResult[] = [];
  for (const c of sorted) {
    const prev = out[out.length - 1];
    if (prev && c.start - prev.end <= joinSec) {
      prev.end = Math.max(prev.end, c.end);
      prev.confidence = Math.min(prev.confidence, c.confidence);
      if (c.text && !prev.text.includes(c.text)) prev.text = `${prev.text} … ${c.text}`.trim();
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

/**
 * Focused re-analysis of ONE user-selected passage the user wants shredded into
 * clean pieces. Everything that is NOT fluent final delivery — aborted starts,
 * retakes, stutters, filler, self-corrections, dead air — is cut. Whatever is
 * left between the cuts is the keep. Aggressive by design: the user already
 * decided this passage needs work. Timestamps clamped to the window.
 */
export interface SegmentAnalysis {
  cuts: AICutResult[];
  usedAI: boolean;
  aiUnavailableReason?: "missing_key" | "no_transcript" | "request_failed";
}

export async function analyzeSegmentForDeadTime(
  words: Word[],
  segStart: number,
  segEnd: number,
  customApiKey?: string,
  originalScript?: string
): Promise<SegmentAnalysis> {
  const apiKey = (customApiKey || env.OPENAI_API_KEY).trim();

  const pad = 0.25;
  const segWords = words.filter((w) => w.end > segStart - pad && w.start < segEnd + pad);
  if (segWords.length === 0) return { cuts: [], usedAI: false, aiUnavailableReason: "no_transcript" };

  const openai = apiKey ? new OpenAI({ apiKey }) : null;
  const model = env.OPENAI_EDITOR_MODEL;

  const formattedTranscript = segWords
    .map((w) => `[${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s] ${w.word}`)
    .join(" ");
  const plainText = segWords.map((w) => w.word).join(" ");

  let systemPrompt = `You are a careful talking-head video editor. A user selected ONE passage (${segStart.toFixed(
    2
  )}s - ${segEnd.toFixed(2)}s) and wants the clear mistakes trimmed — NOT the whole thing shredded.

YOUR GOAL: cut ONLY spans that are unambiguously unusable. When in doubt, LEAVE IT IN. Whatever you leave uncut stays in the video, so err toward keeping.

What to cut (only clear cases, use the matching type):
- An aborted attempt the speaker then clearly restarts from the top ("false_start").
- A full earlier take of a line that is re-delivered again, more completely, right after ("retake") — only when it is obviously the same line twice, not just a similar idea.
- Obvious word / short-phrase stutters ("אני אני", "זה זה") ("repetition").
- Clear filler words ("filler": אה, אמ, כאילו, בעצם, יעני, נו).
- Explicit self-corrections ("לא, רגע", "התכוונתי") ("correction").
- Do not infer silence or return "dead_content". A separate audio detector handles all silence.

RULES:
- Prefer FEW cuts. Do NOT cut natural pauses, emphasis beats, or a phrase repeated once for rhetoric.
- Never cut inside a fluent delivery of the intended message.
- Every cut begins and ends on a pause / word boundary — never mid-word.
- Every timestamp must be >= ${segStart.toFixed(2)} and <= ${segEnd.toFixed(2)} and taken from the word list.
- If the passage is basically clean, return an empty list. That is a fine answer.
- reason: short, Hebrew.`;

  if (originalScript && originalScript.trim()) {
    systemPrompt += `\n\nThe creator's planned script (the clean take should match it):\n"""\n${originalScript.trim()}\n"""`;
  }

  // The LLM pass is best-effort: if it fails (bad key, rate limit, timeout) we
  // still return the deterministic script-alignment / repeated-phrase cuts.
  let aiCuts: AICutResult[] = [];
  let usedAI = false;
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Passage (plain text):\n"${plainText}"\n\nSame passage with word timestamps:\n${formattedTranscript}\n\nReturn the cuts that leave only the clean final take.`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "segment_micro_cuts",
            strict: true,
            schema: {
              type: "object",
              properties: {
                cuts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      start: { type: "number" },
                      end: { type: "number" },
                      type: { type: "string", enum: [...EDITOR_TYPE_ENUM] },
                      confidence: { type: "number" },
                      reason: { type: "string" },
                      text: { type: "string" }
                    },
                    required: ["start", "end", "type", "confidence", "reason", "text"],
                    additionalProperties: false
                  }
                }
              },
              required: ["cuts"],
              additionalProperties: false
            }
          }
        }
      });
      const content = response.choices[0]?.message?.content;
      if (content) {
        aiCuts = speechEditCandidates((JSON.parse(content).cuts || []) as AICutResult[]);
        usedAI = true;
      }
    } catch (err) {
      console.error("Segment LLM pass failed, falling back to deterministic cuts:", err);
    }
  }

  // A focused window may contain distinct script lines with similar openings.
  // Do not import global script-alignment cuts: they can label a complete line
  // as an earlier take based on a single fuzzy prefix match.
  const merged = dedupeCuts([...aiCuts, ...detectImmediateWordStutters(segWords)]);

  // Clamp to window, snap edges to real pauses, drop anything mid-sentence, coalesce.
  // Looser gap tolerance than the global pass (0.08s vs 0.16s): the user opted in
  // to shredding this passage, so fast-speech stumbles with tiny pauses still count.
  const snapped: AICutResult[] = [];
  for (const c of merged) {
    const clamped = {
      ...c,
      start: Math.max(segStart, Math.round(Math.min(c.start, c.end) * 1000) / 1000),
      end: Math.min(segEnd, Math.round(Math.max(c.start, c.end) * 1000) / 1000)
    };
    if (clamped.end - clamped.start < 0.1) continue;
    const s = snapCutToWordBoundaries(clamped, segWords, 0.08);
    if (s) snapped.push(s);
  }

  // Repeated-phrase runs ("keep the last take"): edges already sit on repeat
  // boundaries — they don't need pause-snapping and must not be dropped by it.
  const repeatRuns = detectRepeatedPhraseRuns(segWords)
    .map((c) => ({
      ...c,
      start: Math.max(segStart, c.start),
      end: Math.min(segEnd, c.end)
    }))
    .filter((c) => c.end - c.start >= 0.2);

  // joinSec 0.2 (vs 0.45 global): keep distinct stumbles as distinct cuts instead
  // of fusing them into one blob that swallows the good words between them.
  const finalCuts = coalesceCuts([...snapped, ...repeatRuns], 0.2)
    .filter((c) => c.end - c.start >= 0.15)
    .sort((a, b) => a.start - b.start);

  return { cuts: finalCuts, usedAI, aiUnavailableReason: usedAI ? undefined : apiKey ? "request_failed" : "missing_key" };
}

/**
 * "Keep the last take": within a passage where the speaker repeats roughly the
 * same phrase N times, cut from the first attempt up to the START of the last
 * attempt. Deterministic, needs no script — handles the classic
 * "וככה זה הולך... וככה זה הולך... וככה זה הולך נשאר שבוע הכל טוב" case.
 */
export function detectRepeatedPhraseRuns(
  words: Word[],
  opts: { phraseLen?: number; minSim?: number; maxRunGapSec?: number } = {}
): AICutResult[] {
  const phraseLen = opts.phraseLen ?? 4;
  const minSim = opts.minSim ?? 0.85;
  const maxRunGapSec = opts.maxRunGapSec ?? 12;
  if (words.length < phraseLen * 2) return [];

  const T = words.map((w) => normToken(w.word));
  const used = new Array<boolean>(words.length).fill(false);
  const cuts: AICutResult[] = [];

  const seqSim = (a: string[], b: string[]) => {
    let hit = 0;
    for (let k = 0; k < a.length; k++) if (fuzzyTokenEq(a[k]!, b[k]!)) hit++;
    return hit / a.length;
  };

  for (let i = 0; i + phraseLen <= words.length; i++) {
    if (used[i]) continue;
    const anchor = T.slice(i, i + phraseLen);
    if (anchor.some((t) => t.length <= 1)) continue;

    const occ = [i];
    let scanFrom = i + phraseLen;
    while (scanFrom + phraseLen <= words.length) {
      const lastEnd = words[occ[occ.length - 1]! + phraseLen - 1]!.end;
      let next = -1;
      for (let x = scanFrom; x + phraseLen <= words.length; x++) {
        if (words[x]!.start - lastEnd > maxRunGapSec) break;
        if (seqSim(anchor, T.slice(x, x + phraseLen)) >= minSim) {
          next = x;
          break;
        }
      }
      if (next === -1) break;
      occ.push(next);
      scanFrom = next + phraseLen;
    }

    // Need at least 3 attempts (2 clear duplicates before the keeper) — two
    // similar phrases are often just natural anaphora, not a failed retake.
    if (occ.length < 3) continue;

    const first = occ[0]!;
    const last = occ[occ.length - 1]!;
    const cutStart = words[first]!.start;
    const cutEnd = words[last]!.start;
    if (cutEnd - cutStart >= 0.3) {
      cuts.push({
        start: Math.round(cutStart * 1000) / 1000,
        end: Math.round(cutEnd * 1000) / 1000,
        type: "retake",
        confidence: occ.length >= 3 ? 0.92 : 0.82,
        reason: `הדובר חזר על "${words.slice(first, first + phraseLen).map((w) => w.word).join(" ")}" ${occ.length} פעמים — נשמר הטייק האחרון`,
        text: words
          .slice(first, last)
          .map((w) => w.word)
          .join(" ")
      });
    }
    for (let u = first; u < last; u++) used[u] = true;
  }

  return dedupeCuts(cuts);
}

/**
 * Deterministically scans for single-word stutters (e.g. "אני... אני")
 * separated by a short interval (< 0.85s).
 */
export function detectImmediateWordStutters(words: Word[]): AICutResult[] {
  const stutters: AICutResult[] = [];
  const clean = (w: string) => w.replace(/[.,!?;:״"׳'()]/g, "").trim().toLowerCase();

  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    if (!w1 || !w2) continue;

    const c1 = clean(w1.word);
    const c2 = clean(w2.word);

    // Consecutive identical words with short gap
    if (c1.length > 1 && c1 === c2 && (w2.start - w1.end) >= -0.05 && (w2.start - w1.end) <= 0.85) {
      stutters.push({
        start: Math.round(w1.start * 1000) / 1000,
        end: Math.round(w1.end * 1000) / 1000,
        type: "repetition",
        confidence: 0.99,
        reason: `גמגום / חזרה מילולית על "${w1.word}"`,
        text: w1.word
      });
    }
  }

  return stutters;
}

/**
 * Deterministically scans for identical 2-4 word prefixes separated by a pause,
 * marking the earlier incomplete prefix as an aborted retake.
 */
export function detectAbortedPhrases(words: Word[]): AICutResult[] {
  const extraCuts: AICutResult[] = [];
  if (words.length < 6) return extraCuts;

  for (let i = 0; i < words.length - 4; i++) {
    const phraseLen = 2;
    const phrase1 = words
      .slice(i, i + phraseLen)
      .map((w) => w.word.trim())
      .join(" ");

    // Look ahead within next 12 words for identical phrase start
    for (let j = i + phraseLen; j < Math.min(words.length - phraseLen, i + 15); j++) {
      const phrase2 = words
        .slice(j, j + phraseLen)
        .map((w) => w.word.trim())
        .join(" ");

      if (phrase1.length > 3 && phrase1 === phrase2) {
        const wordJ = words[j];
        const wordPrev = words[j - 1];
        const wordI = words[i];
        if (!wordJ || !wordPrev || !wordI) continue;

        const pauseBetween = wordJ.start - wordPrev.end;
        // If there is an audible pause or abort between the duplicate starts
        if (pauseBetween > 0.4 || j - i < 8) {
          const cutStart = wordI.start;
          const cutEnd = wordPrev.end;

          if (cutEnd > cutStart + 0.1 && cutEnd - cutStart < 15) {
            const cutWords = words
              .slice(i, j)
              .map((w) => w.word)
              .join(" ");
            extraCuts.push({
              start: Math.round(cutStart * 1000) / 1000,
              end: Math.round(cutEnd * 1000) / 1000,
              type: "retake",
              confidence: 0.98,
              reason: `חזרה שנעצרה: "${phrase1}" הוחלף בטייק שלם עוקב`,
              text: cutWords
            });
            break;
          }
        }
      }
    }
  }

  return extraCuts;
}

const HE_STOPWORDS = new Set([
  "אני", "אתה", "את", "הוא", "היא", "אנחנו", "אתם", "הם", "זה", "זאת", "של", "על", "עם",
  "ל", "ב", "כ", "מ", "ש", "ו", "או", "אבל", "כי", "אם", "גם", "רק", "כן", "לא", "מה",
  "יש", "אין", "הכל", "כל", "אז", "ואז", "וזה", "כאילו", "בעצם", "יעני", "נו", "אה", "אמ"
]);

function normToken(w: string): string {
  return w.replace(/[.,!?;:״"׳'()\[\]{}־–-]/g, "").trim().toLowerCase();
}

/** Split words into "sentences" using speech pauses (word gap >= gapSec starts a new sentence). */
export function segmentIntoSentences(
  words: Word[],
  gapSec = 0.55
): Array<{ words: Word[]; start: number; end: number; from: number; to: number }> {
  const sentences: Array<{ words: Word[]; start: number; end: number; from: number; to: number }> = [];
  let bucket: Word[] = [];
  let fromIdx = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const prev = words[i - 1];
    if (prev && w.start - prev.end >= gapSec && bucket.length > 0) {
      sentences.push({ words: bucket, start: bucket[0]!.start, end: bucket[bucket.length - 1]!.end, from: fromIdx, to: i - 1 });
      bucket = [];
      fromIdx = i;
    }
    bucket.push(w);
  }
  if (bucket.length > 0) {
    sentences.push({ words: bucket, start: bucket[0]!.start, end: bucket[bucket.length - 1]!.end, from: fromIdx, to: words.length - 1 });
  }
  return sentences;
}

function contentTokens(ws: Word[]): string[] {
  return ws.map((w) => normToken(w.word)).filter((t) => t.length > 1 && !HE_STOPWORDS.has(t));
}

/** Jaccard-style overlap of content tokens between two token lists (0..1). */
function tokenSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let hit = 0;
  for (const t of new Set(a)) if (setB.has(t)) hit++;
  return hit / new Set([...a, ...b]).size;
}

/**
 * Semantic retake detection: when two consecutive (or near-consecutive) spoken
 * sentences share most of their meaningful words, the earlier one is a failed
 * take. Catches rephrased retakes that the 2-word-prefix matcher misses.
 */
export function detectSentenceRetakes(words: Word[]): AICutResult[] {
  const cuts: AICutResult[] = [];
  if (words.length < 6) return cuts;

  const sentences = segmentIntoSentences(words);
  for (let i = 0; i < sentences.length - 1; i++) {
    const cur = sentences[i]!;
    const curTokens = contentTokens(cur.words);
    if (curTokens.length < 2) continue;

    // compare against the next up-to-2 sentences
    for (let j = i + 1; j <= Math.min(sentences.length - 1, i + 2); j++) {
      const nxt = sentences[j]!;
      const nxtTokens = contentTokens(nxt.words);
      if (nxtTokens.length < 2) continue;

      // Similar content is not enough when polarity or numeric facts differ.
      // Keeping an ambiguous take is safer than silently deleting a contrast.
      const meaningMarkers = (ws: Word[]) => ws.map(w => normToken(w.word))
        .filter(t => ["לא", "ולא", "אין", "ואין", "בלי", "אל", "not", "no", "never", "without"].includes(t) || /\d/.test(t));
      if (JSON.stringify(meaningMarkers(cur.words)) !== JSON.stringify(meaningMarkers(nxt.words))) continue;
      const sim = tokenSimilarity(curTokens, nxtTokens);
      const nextIsAsComplete = nxtTokens.length >= curTokens.length;

      if (sim >= 0.72 && nextIsAsComplete) {
        cuts.push({
          start: Math.round(cur.start * 1000) / 1000,
          end: Math.round(cur.end * 1000) / 1000,
          type: "retake",
          confidence: sim >= 0.8 ? 0.97 : 0.9,
          reason: `טייק חוזר: המשפט נאמר שוב מיד אחרי (דמיון ${Math.round(sim * 100)}%)`,
          text: cur.words.map((w) => w.word).join(" ")
        });
        break;
      }
    }
  }
  return cuts;
}

/**
 * Unfinished-sentence detection: a short spoken run that trails off into a long
 * pause and is followed by a fresh start (not a continuation). The speaker began
 * a thought, dropped it, and started over.
 */
export function detectUnfinishedSentences(words: Word[]): AICutResult[] {
  const cuts: AICutResult[] = [];
  if (words.length < 5) return cuts;

  const sentences = segmentIntoSentences(words, 0.6);
  for (let i = 0; i < sentences.length - 1; i++) {
    const cur = sentences[i]!;
    const nxt = sentences[i + 1]!;
    const gapAfter = nxt.start - cur.end;
    const curContent = contentTokens(cur.words);

    // Heuristics for an abandoned thought (kept conservative — only clear cases):
    // - filler-only run (2..4 words), OR ends on an unfinished connector
    // A short complete phrase or negative answer is not automatically disposable.
    // - followed by a long pause (>= 0.9s) and the next run starts a fresh thought
    const lastTok = normToken(cur.words[cur.words.length - 1]!.word);
    const hangingEnd = new Set(["כי", "אם", "של", "על", "עם", "ש", "ו", "או", "אבל"]).has(lastTok)
      && !/[.!?]$/.test(cur.words[cur.words.length - 1]!.word);
    const fillerOnly = cur.words.length >= 2 && cur.words.length <= 4
      && cur.words.every(w => new Set(["אה", "אמ", "אז", "בעצם", "כאילו", "יעני", "נו"]).has(normToken(w.word)));

    if (gapAfter >= 0.9 && (fillerOnly || hangingEnd) && curContent.length <= 3) {
      // don't double-cut something a retake already covers
      cuts.push({
        start: Math.round(cur.start * 1000) / 1000,
        end: Math.round(cur.end * 1000) / 1000,
        type: "false_start",
        confidence: hangingEnd ? 0.92 : 0.85,
        reason: hangingEnd
          ? `משפט שנקטע באמצע ("...${cur.words[cur.words.length - 1]!.word}") ולא הושלם`
          : "התחלת משפט קצרה שננטשה לפני השלמה",
        text: cur.words.map((w) => w.word).join(" ")
      });
    }
  }
  return cuts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Script alignment — the method scripted-video editors (TimeBolt, etc.) use:
// align the spoken transcript against the planned script; every time the speaker
// attempts a script sentence and stumbles, cut the failed attempt and KEEP THE
// LAST ONE. Deterministic, needs no LLM, and is the most reliable retake cutter
// when a script exists.
// ─────────────────────────────────────────────────────────────────────────────

const HE_PREFIX_RE = /^[בהוכלמש]/;

function levNoMoreThan1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  edits += a.length - i + (b.length - j);
  return edits <= 1;
}

/** Loose token equality: exact, one stripped Hebrew prefix letter, or edit distance <= 1. */
export function fuzzyTokenEq(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const sa = a.replace(HE_PREFIX_RE, "");
  const sb = b.replace(HE_PREFIX_RE, "");
  if (sa === b || a === sb || (sa === sb && sa.length > 1)) return true;
  if (Math.min(a.length, b.length) >= 4 && levNoMoreThan1(a, b)) return true;
  return false;
}

/** Split a planned script into sentences of normalized tokens. */
export function scriptSentences(script: string): string[][] {
  return script
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) =>
      s
        .split(/\s+/)
        .map(normToken)
        .filter((t) => t.length > 0)
    )
    .filter((toks) => toks.length >= 2);
}

interface ScriptAttempt {
  startIdx: number;
  endIdx: number;
  matched: number;
  total: number;
}

/**
 * Starting at/after `from`, find the next transcript span that attempts `sentence`
 * as a subsequence, tolerating up to `maxGap` unmatched words between hits.
 * The attempt ends early if the speaker restarts the sentence (re-hits the first
 * script word after a pause) — that restart is the next attempt.
 */
function findAttempt(
  words: Word[],
  Wn: string[],
  sentence: string[],
  from: number,
  maxGap: number,
  scanWindow: number
): ScriptAttempt | null {
  const limit = Math.min(Wn.length, from + scanWindow);
  for (let start = from; start < limit; start++) {
    if (!fuzzyTokenEq(Wn[start]!, sentence[0]!)) continue;
    let si = 1;
    let wi = start + 1;
    let gap = 0;
    let lastHit = start;
    while (wi < Wn.length && si < sentence.length) {
      const restart =
        si >= 2 &&
        fuzzyTokenEq(Wn[wi]!, sentence[0]!) &&
        wi > 0 &&
        words[wi]!.start - words[wi - 1]!.end > 0.12;
      if (restart) break;

      if (fuzzyTokenEq(Wn[wi]!, sentence[si]!)) {
        si++;
        lastHit = wi;
        gap = 0;
      } else {
        gap++;
        if (gap > maxGap) break;
      }
      wi++;
    }
    return { startIdx: start, endIdx: lastHit, matched: si, total: sentence.length };
  }
  return null;
}

export function alignTranscriptToScript(
  words: Word[],
  script: string,
  opts: { maxGap?: number; retryWindowWords?: number; completeRatio?: number } = {}
): AICutResult[] {
  const sentences = scriptSentences(script);
  if (sentences.length === 0 || words.length === 0) return [];

  const maxGap = opts.maxGap ?? env.SCRIPT_ALIGN_MAX_GAP;
  const retryWindowWords = opts.retryWindowWords ?? env.SCRIPT_ALIGN_RETRY_WINDOW;
  const completeRatio = opts.completeRatio ?? env.SCRIPT_ALIGN_COMPLETE_RATIO;

  const Wn = words.map((w) => normToken(w.word));
  const cuts: AICutResult[] = [];
  let cursor = 0;

  for (const sen of sentences) {
    const attempts: ScriptAttempt[] = [];

    // first attempt: wide scan forward from the cursor
    let a = findAttempt(words, Wn, sen, cursor, maxGap, 500);
    while (a) {
      attempts.push(a);
      // another attempt only counts as a retake if it restarts SOON after this one
      const next = findAttempt(words, Wn, sen, a.endIdx + 1, maxGap, retryWindowWords + 2);
      if (!next || next.startIdx - a.endIdx > retryWindowWords) break;
      a = next;
    }

    if (attempts.length === 0) continue; // sentence not clearly spoken; keep scanning from same cursor

    const keep = attempts[attempts.length - 1]!;

    for (let k = 0; k < attempts.length - 1; k++) {
      const att = attempts[k]!;
      const nextAtt = attempts[k + 1]!;
      const cutStart = words[att.startIdx]!.start;
      const cutEnd = words[nextAtt.startIdx]!.start;
      if (cutEnd - cutStart >= 0.15) {
        const ratio = att.matched / att.total;
        cuts.push({
          start: Math.round(cutStart * 1000) / 1000,
          end: Math.round(cutEnd * 1000) / 1000,
          type: ratio < completeRatio ? "false_start" : "retake",
          confidence: 0.96,
          reason: `טייק כושל מול הסקריפט (ניסיון ${k + 1}/${attempts.length}) — נשמר הטייק האחרון`,
          text: words
            .slice(att.startIdx, nextAtt.startIdx)
            .map((w) => w.word)
            .join(" ")
        });
      }
    }

    cursor = keep.endIdx + 1;
  }

  return dedupeCuts(cuts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto fine-tune: a long AI cut is rarely 100% dead. Re-run the focused
// per-segment analysis on every cut over `minSec` and, if a meaningful chunk
// would come back, replace the one blob with the precise micro-cuts.
// ─────────────────────────────────────────────────────────────────────────────

const REFINABLE_TYPES = new Set<CutCategory>(["retake", "false_start", "dead_content", "correction"]);

export interface RefineResult {
  cuts: CutSegment[];
  refinedCount: number;
  restoredSeconds: number;
}

export async function refineLongCuts(
  cuts: CutSegment[],
  words: Word[],
  silences: DetectedSilence[],
  minSec: number,
  customApiKey?: string,
  originalScript?: string
): Promise<RefineResult> {
  const out: CutSegment[] = [];
  let refinedCount = 0;
  let restoredSeconds = 0;
  const silPad = env.SILENCE_PAD_SECONDS;

  for (const c of cuts) {
    const span = c.end - c.start;
    if (c.locked || c.status !== "cut" || c.type === "manual" || c.type === "silence" || !REFINABLE_TYPES.has(c.type) || span < minSec) {
      out.push(c);
      continue;
    }

    try {
      const { cuts: micro } = await analyzeSegmentForDeadTime(words, c.start, c.end, customApiKey, originalScript);

      const silenceCuts = excludeSpeechFromSilence(silences
        .filter((s) => s.end > c.start + 0.05 && s.start < c.end - 0.05)
        .map((s) => ({
          start: Math.max(c.start, s.start + silPad / 2),
          end: Math.min(c.end, s.end - silPad / 2),
          type: "silence" as CutCategory,
          reason: `שקט (${s.duration.toFixed(1)}s)`
        }))
        .filter((x) => x.end - x.start >= 0.15), words);

      const pieces = [
        ...micro.map((m) => ({ start: m.start, end: m.end, type: m.type as CutCategory, reason: m.reason })),
        ...silenceCuts
      ]
        .filter((x) => x.end - x.start >= 0.1)
        .sort((a, b) => a.start - b.start);

      // collapse overlaps
      const merged: typeof pieces = [];
      for (const p of pieces) {
        const prev = merged[merged.length - 1];
        if (prev && p.start <= prev.end - 0.1) {
          if (p.end > prev.end) prev.end = p.end;
          if (prev.type === "silence" && p.type !== "silence") {
            prev.type = p.type;
            prev.reason = p.reason;
          }
        } else {
          merged.push({ ...p });
        }
      }

      const microTotal = merged.reduce((s, x) => s + (x.end - x.start), 0);
      // Only replace if at least 0.6s of real content would return to the video.
      if (merged.length > 0 && microTotal < span - 0.6) {
        for (const m of merged) {
          out.push({
            id: generateId("cut_refine"),
            start: Math.round(m.start * 1000) / 1000,
            end: Math.round(m.end * 1000) / 1000,
            type: m.type,
            confidence: 0.9,
            reason: `עידון אוטומטי: ${m.reason}`.slice(0, 140),
            status: "cut",
            text: c.text
          });
        }
        refinedCount++;
        restoredSeconds += span - microTotal;
      } else {
        out.push(c);
      }
    } catch (err) {
      console.error(`refineLongCuts failed for [${c.start}-${c.end}]:`, err);
      out.push(c);
    }
  }

  return { cuts: out.sort((a, b) => a.start - b.start), refinedCount, restoredSeconds: Math.round(restoredSeconds * 10) / 10 };
}
