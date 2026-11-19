import { CutCategory, CutSegment, KeepSegment, ProjectStats } from "../types.js";
import { DetectedSilence } from "./ffmpeg.js";
import { AICutResult } from "./aiEditor.js";
import { generateId } from "../utils/id.js";

// Cut types that sit on a sentence boundary → give them a wider safety buffer
// so the surrounding clean speech never gets clipped.
const BOUNDARY_CUT_TYPES = new Set<CutCategory>(["silence", "false_start", "retake", "correction"]);

export function buildCutSegments(
  totalDuration: number,
  silences: DetectedSilence[],
  aiCuts: AICutResult[],
  silenceThresholdSec = 0.45,
  silencePadSec = 0.22,
  cutPaddingMs = 120,
  _confidenceThresholdAuto = 0.9,
  silencePadSentenceSec = 0.32,
  boundaryPaddingMs = 200
): CutSegment[] {
  const cuts: CutSegment[] = [];
  const paddingSec = cutPaddingMs / 1000;
  const boundaryPaddingSec = boundaryPaddingMs / 1000;

  // 1. Process silences: shorten silence > threshold to a natural pause.
  //    Longer silences read as sentence breaks → keep a slightly bigger pause.
  for (const s of silences) {
    if (s.duration >= silenceThresholdSec) {
      const pad = s.duration >= 0.9 ? silencePadSentenceSec : silencePadSec;
      const cutStart = Math.round((s.start + pad / 2) * 1000) / 1000;
      const cutEnd = Math.round((s.end - pad / 2) * 1000) / 1000;

      if (cutEnd > cutStart + 0.05) {
        cuts.push({
          id: generateId("silence"),
          start: cutStart,
          end: cutEnd,
          type: "silence",
          confidence: 1.0,
          reason: `קיצור שתיקה ארוכה (${s.duration.toFixed(2)} שניות) להפוגה טבעית של ${pad.toFixed(2)} שניות`,
          status: "cut",
          text: "[שתיקה]"
        });
      }
    }
  }

  // 2. Process AI cuts with safety padding (wider around sentence-boundary cuts)
  for (const ai of aiCuts) {
    const pad = BOUNDARY_CUT_TYPES.has(ai.type as CutCategory) ? boundaryPaddingSec : paddingSec;
    const paddedStart = Math.min(ai.end, ai.start + pad);
    const paddedEnd = Math.max(ai.start, ai.end - pad);

    if (paddedEnd > paddedStart + 0.05) {
      cuts.push({
        id: generateId(`ai_${ai.type}`),
        start: Math.round(paddedStart * 1000) / 1000,
        end: Math.round(paddedEnd * 1000) / 1000,
        type: ai.type as CutCategory,
        confidence: Math.round(ai.confidence * 100) / 100,
        reason: ai.reason,
        status: "cut",
        text: ai.text
      });
    }
  }

  cuts.sort((a, b) => a.start - b.start);
  return mergeOverlappingCuts(cuts);
}

export function mergeOverlappingCuts(cuts: CutSegment[]): CutSegment[] {
  if (cuts.length <= 1) return cuts;

  const sorted = [...cuts].sort((a, b) => a.start - b.start);
  const result: CutSegment[] = [];

  for (const c of sorted) {
    if (result.length === 0) {
      result.push({ ...c });
      continue;
    }

    const prev = result[result.length - 1]!;
    // If overlapping or adjacent within 30ms and same status
    if (c.start <= prev.end + 0.03 && c.status === prev.status) {
      prev.end = Math.max(prev.end, c.end);
      if (c.type !== prev.type && prev.type === "silence") {
        prev.type = c.type;
        prev.reason = c.reason;
      }
      if (c.text && !prev.text?.includes(c.text)) {
        prev.text = prev.text ? `${prev.text} ${c.text}` : c.text;
      }
    } else {
      result.push({ ...c });
    }
  }

  return result;
}

export function computeKeepTimeline(totalDuration: number, cuts: CutSegment[]): KeepSegment[] {
  const activeCuts = cuts
    .filter((c) => c.status === "cut")
    .map((c) => ({
      start: Math.max(0, c.start),
      end: Math.min(totalDuration, c.end)
    }))
    .sort((a, b) => a.start - b.start);

  const mergedCuts: Array<{ start: number; end: number }> = [];
  for (const c of activeCuts) {
    if (mergedCuts.length === 0) {
      mergedCuts.push({ ...c });
    } else {
      const prev = mergedCuts[mergedCuts.length - 1];
      if (prev && c.start <= prev.end + 0.03) {
        prev.end = Math.max(prev.end, c.end);
      } else {
        mergedCuts.push({ ...c });
      }
    }
  }

  const keep: KeepSegment[] = [];
  let currentPos = 0;

  for (const cut of mergedCuts) {
    if (cut.start > currentPos + 0.08) {
      keep.push({
        start: Math.round(currentPos * 1000) / 1000,
        end: Math.round(cut.start * 1000) / 1000
      });
    }
    currentPos = Math.max(currentPos, cut.end);
  }

  if (currentPos < totalDuration - 0.08) {
    keep.push({
      start: Math.round(currentPos * 1000) / 1000,
      end: Math.round(totalDuration * 1000) / 1000
    });
  }

  if (keep.length === 0) {
    keep.push({ start: 0, end: totalDuration });
  }

  return keep;
}

export function calculateProjectStats(
  totalDuration: number,
  cuts: CutSegment[],
  keepTimeline: KeepSegment[]
): ProjectStats {
  const cleanedDuration = keepTimeline.reduce((acc, seg) => acc + (seg.end - seg.start), 0);
  const totalRemoved = Math.max(0, totalDuration - cleanedDuration);

  const breakdown: Record<CutCategory, number> = {
    silence: 0,
    filler: 0,
    false_start: 0,
    retake: 0,
    repetition: 0,
    correction: 0,
    dead_content: 0,
    manual: 0
  };

  cuts
    .filter((c) => c.status === "cut")
    .forEach((c) => {
      const dur = Math.max(0, c.end - c.start);
      if (breakdown[c.type] !== undefined) {
        breakdown[c.type] += dur;
      }
    });

  Object.keys(breakdown).forEach((k) => {
    breakdown[k as CutCategory] = Math.round(breakdown[k as CutCategory] * 10) / 10;
  });

  return {
    originalDuration: Math.round(totalDuration * 10) / 10,
    cleanedDuration: Math.round(cleanedDuration * 10) / 10,
    totalRemovedSeconds: Math.round(totalRemoved * 10) / 10,
    breakdown
  };
}
