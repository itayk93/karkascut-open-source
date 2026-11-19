import test from "node:test";
import assert from "node:assert/strict";
import { excludeSpeechFromSilence, speechEditCandidates } from "../services/speechProtection.js";

test("rejects a model dead-air span containing fluent speech", () => {
  const speech = { start: 147, end: 147.5, type: "repetition" };
  assert.deepEqual(speechEditCandidates([{ start: 137.22, end: 146.36, type: "dead_content" }, speech]), [speech]);
});

test("recorded passage: protects speech at both ends of the acoustic silence", () => {
  const result = excludeSpeechFromSilence([{ start: 140.27, end: 145.805 }], [
    { word: "ומבסוט", start: 139.24, end: 140.42 },
    { word: "נשארו", start: 145.76, end: 146.36 }
  ]);
  assert.equal(result.length, 1);
  assert.ok(Math.abs(result[0]!.start - 140.5) < 0.001);
  assert.ok(Math.abs(result[0]!.end - 145.68) < 0.001);
});

test("splits false silence around quiet speech, including zero-duration words", () => {
  const candidate = { start: 2, end: 8, reason: "silence" };
  assert.deepEqual(excludeSpeechFromSilence([candidate], [{ word: "hello", start: 4, end: 5 }], 0), [
    { ...candidate, end: 4 }, { ...candidate, start: 5 }
  ]);
  assert.equal(excludeSpeechFromSilence([candidate], [{ word: "hello", start: 4, end: 4 }]).length, 2);
  assert.equal(candidate.end, 8);
});

test("keeps pure trailing silence and rejects tiny residual gaps", () => {
  assert.deepEqual(excludeSpeechFromSilence([{ start: 10, end: 12 }], []), [{ start: 10, end: 12 }]);
  assert.deepEqual(excludeSpeechFromSilence([{ start: 10, end: 12 }], [{ word: "speech", start: 10.1, end: 12 }]), []);
});

test("focused analysis does not treat distinct script lines sharing a prefix as retakes", async () => {
  const { analyzeSegmentForDeadTime } = await import("../services/aiEditor.js");
  const result = await analyzeSegmentForDeadTime([
    { word: "נשאר", start: 137.22, end: 137.22 },
    { word: "שבוע", start: 137.22, end: 137.6 },
    { word: "הכל", start: 137.98, end: 138.2 },
    { word: "טוב", start: 138.2, end: 138.54 },
    { word: "הוא", start: 138.9, end: 138.94 },
    { word: "רגוע", start: 138.94, end: 139.24 },
    { word: "ומבסוט", start: 139.24, end: 140.42 },
    { word: "נשארו", start: 145.76, end: 146.36 },
    { word: "איזה", start: 146.36, end: 146.56 },
    { word: "ארבע", start: 146.56, end: 146.74 },
    { word: "ימים", start: 146.74, end: 147.14 }
  ], 137.22, 149.55, " ", "נשאר שבוע הכל טוב הוא רגוע ומבסוט. נשארו איזה ארבע ימים.");
  assert.deepEqual(result.cuts, []);
});

test("stretched ASR word does not hide a detected multi-second interior silence", () => {
  const result = excludeSpeechFromSilence([{ start: 133.401, end: 135.684 }], [
    { word: "וככה", start: 133.04, end: 136.3 },
    { word: "זה", start: 136.3, end: 136.58 },
    { word: "הולך", start: 136.58, end: 136.66 }
  ]);
  assert.equal(result.length, 1);
  assert.ok(Math.abs(result[0]!.start - 133.47) < 0.001);
  assert.equal(result[0]!.end, 135.684);
});

test("long words without detected silence remain untouched; short interior gaps stay protected", () => {
  const words = [{ word: "וככה", start: 133.04, end: 136.3 }];
  assert.deepEqual(excludeSpeechFromSilence([], words), []);
  assert.deepEqual(excludeSpeechFromSilence([{ start: 134, end: 134.5 }], words), []);
});

test("another normal word inside a stretched timestamp still protects speech", () => {
  const result = excludeSpeechFromSilence([{ start: 2, end: 5 }], [
    { word: "stretched", start: 1, end: 6 },
    { word: "quiet", start: 3, end: 4 }
  ]);
  assert.equal(result.length, 2);
  assert.ok(result.every((piece) => piece.end <= 2.92 || piece.start >= 4.08));
});
