import type { Word } from "../types.js";

/** Protect word edges from quiet-mic cuts. Abnormally stretched ASR words may
 * contain acoustic silence; protect both ends without shielding the whole gap. */
export function excludeSpeechFromSilence<T extends { start: number; end: number }>(
  candidates: T[], words: Word[], padding = 0.08
): T[] {
  return candidates.flatMap((candidate) => {
    let pieces = [candidate];
    for (const word of words) {
      if (!Number.isFinite(word.start) || !Number.isFinite(word.end)) continue;
      const start = word.start - padding;
      const end = word.end + padding;
      pieces = pieces.flatMap((piece) => {
        if (end <= piece.start || start >= piece.end) return [piece];
        // ASR sometimes stretches one word across a multi-second pause. Only
        // allow an already detected, substantial silence in its interior.
        // Keep 350ms at both word edges rather than guessing which edge is speech.
        if (word.end - word.start > 2.5) {
          const interiorStart = Math.max(piece.start, word.start + 0.35 + padding);
          const interiorEnd = Math.min(piece.end, word.end - 0.35 - padding);
          if (interiorEnd - interiorStart >= 0.85) {
            const remaining: T[] = [];
            if (start > piece.start) remaining.push({ ...piece, end: start });
            remaining.push({ ...piece, start: interiorStart, end: interiorEnd });
            if (end < piece.end) remaining.push({ ...piece, start: end });
            return remaining;
          }
        }
        const remaining: T[] = [];
        if (start > piece.start) remaining.push({ ...piece, end: start });
        if (end < piece.end) remaining.push({ ...piece, start: end });
        return remaining;
      });
    }
    return pieces.filter((piece) => piece.end - piece.start >= 0.15);
  });
}

/** Fine tuning uses acoustic detection for silence, never a model's inferred dead-air span. */
export function speechEditCandidates<T extends { type: string }>(cuts: T[]): T[] {
  return cuts.filter((cut) => cut.type !== "dead_content");
}
