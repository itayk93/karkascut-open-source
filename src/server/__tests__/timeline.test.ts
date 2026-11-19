import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildCutSegments, computeKeepTimeline, calculateProjectStats } from "../services/timeline.js";
import { DetectedSilence } from "../services/ffmpeg.js";
import { AICutResult, detectImmediateWordStutters } from "../services/aiEditor.js";

describe("Timeline Engine & Cut Padding", () => {
  test("Shortens a long (sentence-break) silence to the sentence pause (0.32s)", () => {
    const silences: DetectedSilence[] = [
      { start: 2.0, end: 4.0, duration: 2.0 } // 2s silence → treated as a sentence break
    ];
    const aiCuts: AICutResult[] = [];

    const cuts = buildCutSegments(10, silences, aiCuts, 0.45, 0.22, 120, 0.9, 0.32, 200);

    assert.equal(cuts.length, 1);
    const cut0 = cuts[0]!;
    assert.equal(cut0.type, "silence");
    assert.ok(cut0.start > 2.0 && cut0.start < 2.3);
    assert.ok(cut0.end > 3.6 && cut0.end < 4.0);
    // Leaves a ~0.32s natural pause
    const cutDur = cut0.end - cut0.start;
    assert.ok(Math.abs(cutDur - 1.68) < 0.05);
  });

  test("Shortens a short in-sentence pause using the tighter pad (0.22s)", () => {
    const silences: DetectedSilence[] = [{ start: 2.0, end: 2.6, duration: 0.6 }];
    const cuts = buildCutSegments(10, silences, [], 0.45, 0.22, 120, 0.9, 0.32, 200);
    assert.equal(cuts.length, 1);
    const cutDur = cuts[0]!.end - cuts[0]!.start;
    assert.ok(Math.abs(cutDur - 0.38) < 0.05);
  });

  test("Applies safety cut padding (60ms) to AI speech cuts", () => {
    const silences: DetectedSilence[] = [];
    const aiCuts: AICutResult[] = [
      {
        start: 5.0,
        end: 7.0,
        type: "filler",
        confidence: 0.95,
        reason: "מילת מילוי",
        text: "אממ רגע"
      }
    ];

    const cuts = buildCutSegments(10, silences, aiCuts, 0.7, 0.25, 60, 0.9);

    assert.equal(cuts.length, 1);
    // Padding = 60ms = 0.06s. Start: 5.0 + 0.06 = 5.06, End: 7.0 - 0.06 = 6.94
    const cut0 = cuts[0]!;
    assert.equal(cut0.start, 5.06);
    assert.equal(cut0.end, 6.94);
    assert.equal(cut0.type, "filler");
  });

  test("Computes correct KEEP timeline from CUT segments", () => {
    const cuts = [
      {
        id: "c1",
        start: 2.0,
        end: 3.0,
        type: "silence" as const,
        confidence: 1.0,
        reason: "שתיקה",
        status: "cut" as const
      },
      {
        id: "c2",
        start: 6.0,
        end: 8.0,
        type: "retake" as const,
        confidence: 0.95,
        reason: "טייק חוזר",
        status: "cut" as const
      }
    ];

    const keep = computeKeepTimeline(10.0, cuts);

    // Should keep: [0, 2.0], [3.0, 6.0], [8.0, 10.0]
    assert.equal(keep.length, 3);
    assert.equal(keep[0]!.start, 0);
    assert.equal(keep[0]!.end, 2.0);
    assert.equal(keep[1]!.start, 3.0);
    assert.equal(keep[1]!.end, 6.0);
    assert.equal(keep[2]!.start, 8.0);
    assert.equal(keep[2]!.end, 10.0);
  });

  test("Restored cut is excluded from KEEP timeline calculation", () => {
    const cuts = [
      {
        id: "c1",
        start: 2.0,
        end: 3.0,
        type: "silence" as const,
        confidence: 1.0,
        reason: "שתיקה",
        status: "cut" as const
      },
      {
        id: "c2",
        start: 6.0,
        end: 8.0,
        type: "retake" as const,
        confidence: 0.95,
        reason: "טייק ששוחזר",
        status: "restored" as const // Restored!
      }
    ];

    const keep = computeKeepTimeline(10.0, cuts);

    // Since c2 is restored, it is kept! So [0, 2.0] and [3.0, 10.0]
    assert.equal(keep.length, 2);
    assert.equal(keep[0]!.start, 0);
    assert.equal(keep[0]!.end, 2.0);
    assert.equal(keep[1]!.start, 3.0);
    assert.equal(keep[1]!.end, 10.0);
  });

  test("Calculates correct ProjectStats breakdown", () => {
    const cuts = [
      {
        id: "c1",
        start: 1.0,
        end: 3.0,
        type: "silence" as const,
        confidence: 1.0,
        reason: "שתיקה",
        status: "cut" as const
      },
      {
        id: "c2",
        start: 5.0,
        end: 6.0,
        type: "filler" as const,
        confidence: 0.95,
        reason: "גמגום",
        status: "cut" as const
      }
    ];

    const keep = computeKeepTimeline(10.0, cuts);
    const stats = calculateProjectStats(10.0, cuts, keep);

    assert.equal(stats.originalDuration, 10.0);
    assert.equal(stats.cleanedDuration, 7.0);
    assert.equal(stats.totalRemovedSeconds, 3.0);
    assert.equal(stats.breakdown.silence, 2.0);
    assert.equal(stats.breakdown.filler, 1.0);
  });

  test("detectImmediateWordStutters identifies consecutive duplicated word as repetition cut", () => {
    const words = [
      { word: "שלום", start: 0.1, end: 0.4 },
      { word: "אני", start: 0.5, end: 0.7 },
      { word: "אני", start: 0.8, end: 1.0 }, // stutter!
      { word: "מדבר", start: 1.1, end: 1.5 }
    ];

    const stutters = detectImmediateWordStutters(words);
    assert.equal(stutters.length, 1);
    assert.equal(stutters[0]?.type, "repetition");
    assert.equal(stutters[0]?.start, 0.5);
    assert.equal(stutters[0]?.end, 0.7);
    assert.equal(stutters[0]?.text, "אני");
  });
});
