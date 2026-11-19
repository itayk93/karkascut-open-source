import test from "node:test";
import assert from "node:assert/strict";
import { acousticSilences, validateAcousticAnalysis, acousticCacheKey } from "../services/acousticAnalysis.js";

const base = {
  version: 1 as const,
  duration: 10,
  vadModel: "silero-vad-6.2.0",
  alignmentModel: "whisperx-3.7.4"
};

test("acousticSilences returns the complement of detected speech", () => {
  const analysis = {
    ...base,
    speech: [
      { start: 0, end: 2 },
      { start: 5, end: 6 },
      { start: 8, end: 9 }
    ]
  };
  assert.deepEqual(acousticSilences(analysis, 0.85), [
    { start: 2, end: 5, duration: 3 },
    { start: 6, end: 8, duration: 2 },
    { start: 9, end: 10, duration: 1 }
  ]);
});

test("acousticSilences ignores gaps shorter than the minimum", () => {
  const analysis = { ...base, speech: [{ start: 0, end: 4 }, { start: 4.3, end: 10 }] };
  assert.deepEqual(acousticSilences(analysis, 0.85), []);
});

test("acousticSilences is not vetoed by any transcript timestamp (regression: stretched word)", () => {
  // ASR stretched one word across 133.04-140.50; VAD found real speech 137.2-140.5
  // then silence to 145.68. The pause must survive.
  const analysis = {
    ...base,
    duration: 150,
    speech: [{ start: 133.4, end: 133.9 }, { start: 137.2, end: 140.5 }, { start: 145.68, end: 149.5 }]
  };
  const silences = acousticSilences(analysis, 0.85, 133, 150);
  assert.ok(silences.some((s) => Math.abs(s.start - 140.5) < 0.01 && Math.abs(s.end - 145.68) < 0.01));
});

test("validateAcousticAnalysis rejects a mismatched word list", () => {
  const raw = {
    ...base,
    speech: [],
    words: [{ word: "a", start: 0, end: 1, aligned: true }],
    alignedCount: 1,
    totalWords: 1
  };
  assert.throws(() => validateAcousticAnalysis(raw, [{ word: "b", start: 0, end: 1 }]));
  assert.doesNotThrow(() => validateAcousticAnalysis(raw, [{ word: "a", start: 0, end: 1 }]));
});

test("acoustic cache identity includes worker content and every analysis input", () => {
  const input = { audioPath: "/tmp/audio.wav", size: 100, mtime: 123,
    words: [{ word: "שלום", start: 0, end: 1 }], language: "he", workerSource: "raw worker" };
  const key = acousticCacheKey(input);
  assert.equal(key, acousticCacheKey({ ...input }));
  for (const change of [
    { workerSource: "normalized worker" }, { audioPath: "/tmp/other.wav" },
    { size: 101 }, { mtime: 124 }, { language: "en" },
    { words: [{ word: "שלום", start: 0, end: 0.9 }] }
  ]) {
    assert.notEqual(key, acousticCacheKey({ ...input, ...change }));
  }
  assert.match(key, /^[a-f0-9]{64}$/);
});

test("acoustic validation rejects backward, overlapping and zero-length word intervals", () => {
  const seeds = [{ word: "א", start: 0, end: 1 }, { word: "ב", start: 1, end: 2 }];
  for (const intervals of [[[1, 2], [0, 1]], [[0, 2], [1, 3]], [[0, 0], [1, 2]], [[0, 1], [9, 10.05]]]) {
    const raw = { ...base, speech: [], words: seeds.map((w, i) => ({ ...w, start: intervals[i]![0], end: intervals[i]![1], aligned: true })), alignedCount: 2, totalWords: 2 };
    assert.throws(() => validateAcousticAnalysis(raw, seeds));
  }
  const valid = { ...base, speech: [], words: seeds.map(w => ({ ...w, aligned: false })), alignedCount: 0, totalWords: 2 };
  assert.doesNotThrow(() => validateAcousticAnalysis(valid, seeds));
});
