import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  chunkWords,
  dedupeCuts,
  segmentIntoSentences,
  detectSentenceRetakes,
  detectUnfinishedSentences,
  snapCutToWordBoundaries,
  fuzzyTokenEq,
  scriptSentences,
  alignTranscriptToScript,
  detectRepeatedPhraseRuns,
  analyzeSegmentForDeadTime
} from "../services/aiEditor.js";
import type { AICutResult } from "../services/aiEditor.js";
import { Word } from "../types.js";

// helper: build a word list from [word, start, end] triples
const W = (rows: Array<[string, number, number]>): Word[] =>
  rows.map(([word, start, end]) => ({ word, start, end }));

describe("Dead-time detectors", () => {
  test("chunkWords splits long input into overlapping windows", () => {
    const words = W(Array.from({ length: 200 }, (_, i) => [`w${i}`, i * 1.5, i * 1.5 + 1.2]));
    const chunks = chunkWords(words, 90, 15);
    assert.ok(chunks.length >= 3);
    // consecutive windows overlap
    assert.ok(chunks[1]!.from < chunks[0]!.to);
    // full coverage
    assert.ok(chunks[chunks.length - 1]!.to >= words[words.length - 1]!.end - 0.01);
  });

  test("segmentIntoSentences breaks on speech pauses", () => {
    const words = W([
      ["שלום", 0, 0.4],
      ["לכולם", 0.4, 0.9],
      ["היום", 2.0, 2.4], // 1.1s gap -> new sentence
      ["נדבר", 2.4, 2.9]
    ]);
    const sentences = segmentIntoSentences(words, 0.55);
    assert.equal(sentences.length, 2);
    assert.equal(sentences[0]!.words.length, 2);
  });

  test("detectSentenceRetakes cuts the earlier near-duplicate sentence", () => {
    const words = W([
      ["המוצר", 0.0, 0.4],
      ["הזה", 0.4, 0.7],
      ["עוזר", 0.7, 1.1],
      ["מאוד", 1.1, 1.5],
      ["המוצר", 2.4, 2.8], // long gap -> new take
      ["הזה", 2.8, 3.1],
      ["עוזר", 3.1, 3.5],
      ["מאוד", 3.5, 3.9],
      ["ללקוחות", 3.9, 4.4]
    ]);
    const cuts = detectSentenceRetakes(words);
    assert.equal(cuts.length, 1);
    assert.equal(cuts[0]!.type, "retake");
    assert.ok(cuts[0]!.start < 0.1 && cuts[0]!.end > 1.4 && cuts[0]!.end < 1.6);
  });

  test("detectUnfinishedSentences flags a short trailed-off start", () => {
    const words = W([
      ["אז", 0.0, 0.3],
      ["בעצם", 0.3, 0.8], // hangs on a stopword, then long pause
      ["בואו", 2.0, 2.4],
      ["נתחיל", 2.4, 2.9],
      ["מהבסיס", 2.9, 3.5]
    ]);
    const cuts = detectUnfinishedSentences(words);
    assert.equal(cuts.length, 1);
    assert.equal(cuts[0]!.type, "false_start");
  });

  test("snapCutToWordBoundaries keeps a whole-word aborted run bounded by a pause", () => {
    const words = W([
      ["אז", 0.0, 0.3],
      ["בואו", 0.3, 0.7],
      ["נתחיל", 0.7, 1.2], // aborted take ends here, 0.8s pause
      ["בואו", 2.0, 2.4], // clean take
      ["נתחיל", 2.4, 2.9],
      ["מהבסיס", 2.9, 3.5]
    ]);
    const cut: AICutResult = { start: 0.0, end: 2.0, type: "retake", confidence: 0.95, reason: "x", text: "" };
    const snapped = snapCutToWordBoundaries(cut, words);
    assert.ok(snapped);
    assert.ok(snapped!.end <= 2.0 && snapped!.end >= 1.2);
    assert.ok(snapped!.text.includes("נתחיל"));
  });

  test("snapCutToWordBoundaries rejects a cut that lands mid-sentence", () => {
    const words = W([
      ["המוצר", 0.0, 0.4],
      ["הזה", 0.4, 0.7],
      ["עוזר", 0.7, 1.1],
      ["מאוד", 1.1, 1.5],
      ["ללקוחות", 1.5, 2.0]
    ]);
    // try to cut "הזה עוזר" out of a continuous sentence -> no pauses -> null
    const cut: AICutResult = { start: 0.4, end: 1.1, type: "false_start", confidence: 0.8, reason: "x", text: "" };
    assert.equal(snapCutToWordBoundaries(cut, words), null);
  });

  test("fuzzyTokenEq matches Hebrew prefix + small typos", () => {
    assert.ok(fuzzyTokenEq("בית", "בית"));
    assert.ok(fuzzyTokenEq("והבית", "הבית"));
    assert.ok(fuzzyTokenEq("שלום", "שלוום"));
    assert.ok(!fuzzyTokenEq("כלב", "חתול"));
  });

  test("scriptSentences splits and normalizes", () => {
    const s = scriptSentences("שלום לכולם. היום נדבר על עריכה!");
    assert.equal(s.length, 2);
    assert.deepEqual(s[0], ["שלום", "לכולם"]);
  });

  test("alignTranscriptToScript cuts the failed take and keeps the last", () => {
    // script: "היום נדבר על עריכה אוטומטית"
    // speaker: "היום נדבר על ... [pause] היום נדבר על עריכה אוטומטית"
    const words = W([
      ["היום", 0.0, 0.4],
      ["נדבר", 0.4, 0.8],
      ["על", 0.8, 1.0], // aborted here
      ["היום", 2.0, 2.4], // retry starts (within retry window)
      ["נדבר", 2.4, 2.8],
      ["על", 2.8, 3.0],
      ["עריכה", 3.0, 3.5],
      ["אוטומטית", 3.5, 4.1]
    ]);
    const cuts = alignTranscriptToScript(words, "היום נדבר על עריכה אוטומטית.", {
      retryWindowWords: 10
    });
    assert.equal(cuts.length, 1);
    assert.ok(cuts[0]!.start < 0.1);
    // cut ends where the kept take begins (~2.0s)
    assert.ok(cuts[0]!.end > 1.5 && cuts[0]!.end <= 2.0);
    assert.equal(cuts[0]!.type, "false_start"); // only 3/5 tokens matched
  });

  test("alignTranscriptToScript leaves a clean single take alone", () => {
    const words = W([
      ["היום", 0.0, 0.4],
      ["נדבר", 0.4, 0.8],
      ["על", 0.8, 1.0],
      ["עריכה", 1.0, 1.5]
    ]);
    assert.equal(alignTranscriptToScript(words, "היום נדבר על עריכה.").length, 0);
  });

  test("detectRepeatedPhraseRuns cuts >=3 repeats and keeps the last take", () => {
    // "וככה זה הולך נשאר שבוע" x4, last one continues into the full line
    const phrase = ["וככה", "זה", "הולך", "נשאר", "שבוע"];
    const rows: [string, number, number][] = [];
    let t = 0;
    const attemptStarts: number[] = [];
    for (let rep = 0; rep < 4; rep++) {
      attemptStarts.push(t);
      for (const w of phrase) {
        rows.push([w, t, t + 0.3]);
        t += 0.35;
      }
      t += 0.6; // pause between attempts
    }
    for (const w of ["הכל", "טוב", "הוא", "רגוע", "ומבסוט"]) {
      rows.push([w, t, t + 0.3]);
      t += 0.35;
    }
    const cuts = detectRepeatedPhraseRuns(W(rows), { phraseLen: 4 });
    assert.equal(cuts.length, 1);
    assert.equal(cuts[0]!.type, "retake");
    assert.ok(cuts[0]!.start < 0.1);
    // cut ends at the start of the last (4th) attempt
    assert.ok(Math.abs(cuts[0]!.end - attemptStarts[3]!) < 0.05);
  });

  test("detectRepeatedPhraseRuns ignores a phrase said just twice", () => {
    const phrase = ["וככה", "זה", "הולך", "נשאר", "שבוע"];
    const rows: [string, number, number][] = [];
    let t = 0;
    for (let rep = 0; rep < 2; rep++) {
      for (const w of phrase) {
        rows.push([w, t, t + 0.3]);
        t += 0.35;
      }
      t += 0.6;
    }
    assert.equal(detectRepeatedPhraseRuns(W(rows), { phraseLen: 4 }).length, 0);
  });

  test("detectRepeatedPhraseRuns ignores a phrase said once", () => {
    const words = W([
      ["וככה", 0, 0.3],
      ["זה", 0.4, 0.7],
      ["הולך", 0.8, 1.1],
      ["נשאר", 1.2, 1.5],
      ["שבוע", 1.6, 1.9],
      ["הכל", 2.0, 2.3],
      ["טוב", 2.4, 2.7]
    ]);
    assert.equal(detectRepeatedPhraseRuns(words).length, 0);
  });

  test("analyzeSegmentForDeadTime without API key returns deterministic cuts and usedAI=false", async () => {
    // "וככה זה הולך" said 3x, then the clean take — repeated-phrase detector should fire
    const rows: Array<[string, number, number]> = [];
    let t = 90;
    for (let rep = 0; rep < 4; rep++) {
      for (const w of ["וככה", "זה", "הולך", "נשאר"]) {
        rows.push([w, t, t + 0.3]);
        t += 0.4;
      }
      t += 0.3;
    }
    for (const w of ["וככה", "זה", "הולך", "נשאר", "שבוע", "הכל", "טוב"]) {
      rows.push([w, t, t + 0.3]);
      t += 0.4;
    }
    const words = W(rows);

    const res = await analyzeSegmentForDeadTime(words, 90, t, " ");
    assert.equal(res.usedAI, false);
    assert.ok(Array.isArray(res.cuts));
    assert.ok(res.cuts.length >= 1, "deterministic repeated-phrase cut should still be found");
    for (const c of res.cuts) {
      assert.ok(c.start >= 90 - 0.01 && c.end <= t + 0.01, "cut stays inside the window");
    }
  });

  test("dedupeCuts drops contained + duplicate ranges, keeps higher confidence", () => {
    const merged = dedupeCuts([
      { start: 1.0, end: 3.0, type: "retake", confidence: 0.8, reason: "a", text: "" },
      { start: 1.1, end: 2.0, type: "retake", confidence: 0.9, reason: "b", text: "" },
      { start: 5.0, end: 6.0, type: "filler", confidence: 0.7, reason: "c", text: "" }
    ]);
    assert.equal(merged.length, 2);
  });
});
