import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { generateHormoziAssSubtitles } from "../services/subtitles.js";
import { Word, KeepSegment } from "../types.js";

const TEST_DIR = path.resolve(process.cwd(), "data/test_tmp_subs");

describe("Hormozi Subtitles Generator", () => {
  before(() => {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    try {
      if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  test("Generates valid ASS file with Hormozi styles and word highlights", () => {
    const words: Word[] = [
      { word: "שלום", start: 0.2, end: 0.6 },
      { word: "לכולם", start: 0.7, end: 1.2 },
      { word: "היום", start: 1.3, end: 1.7 }
    ];

    const keepSegments: KeepSegment[] = [{ start: 0, end: 5.0 }];

    const subFile = path.join(TEST_DIR, "test_hormozi.ass");
    generateHormoziAssSubtitles(words, keepSegments, subFile, 1080, 1920);

    assert.ok(fs.existsSync(subFile), "ASS file was not created");
    const content = fs.readFileSync(subFile, "utf-8");

    // Check ASS headers
    assert.ok(content.includes("[Script Info]"));
    assert.ok(content.includes("PlayResX: 1080"));
    assert.ok(content.includes("PlayResY: 1920"));
    assert.ok(content.includes("Style: Hormozi"));

    // Check Hebrew words and yellow highlight tag
    assert.ok(content.includes("שלום"));
    assert.ok(content.includes("לכולם"));
    assert.ok(content.includes("\\c&H002BFFF0&")); // Active highlight color tag
  });

  test("Generates valid ASS styles for all Captions templates", () => {
    const words: Word[] = [
      { word: "וידאו", start: 0.1, end: 0.5 },
      { word: "איכותי", start: 0.6, end: 1.0 }
    ];
    const keepSegments: KeepSegment[] = [{ start: 0, end: 3.0 }];

    const stylesToTest = [
      { preset: "impact2" as const, expectedStyle: "Style: Impact2", expectedHighlight: "\\c&H00FFF000&" },
      { preset: "prism" as const, expectedStyle: "Style: Prism", expectedHighlight: "\\c&H0061D0F5&" },
      { preset: "paper" as const, expectedStyle: "Style: Paper", expectedHighlight: "\\c&H00000000&" },
      { preset: "prime" as const, expectedStyle: "Style: Prime", expectedHighlight: "\\c&H001673F9&" },
      { preset: "lens" as const, expectedStyle: "Style: Lens", expectedHighlight: "\\c&H000C58EA&" },
      { preset: "vista" as const, expectedStyle: "Style: Vista", expectedHighlight: "\\c&H00E2E8F0&" }
    ];

    for (const item of stylesToTest) {
      const subFile = path.join(TEST_DIR, `test_${item.preset}.ass`);
      generateHormoziAssSubtitles(words, keepSegments, subFile, 1080, 1920, item.preset);
      assert.ok(fs.existsSync(subFile), `${item.preset} ASS file was not created`);
      const content = fs.readFileSync(subFile, "utf-8");
      assert.ok(content.includes(item.expectedStyle), `Missing style definition ${item.expectedStyle}`);
      assert.ok(content.includes(item.expectedHighlight), `Missing highlight tag ${item.expectedHighlight}`);
    }
  });

  test("Generates valid ASS subtitles directly from clean post-cut words (no keepSegments mapping)", () => {
    const cleanWords: Word[] = [
      { word: "סרטון", start: 0.1, end: 0.5 },
      { word: "ערוך", start: 0.6, end: 0.9 },
      { word: "מושלם", start: 1.0, end: 1.4 }
    ];

    const subFile = path.join(TEST_DIR, "test_clean_words.ass");
    generateHormoziAssSubtitles(cleanWords, undefined, subFile, 1080, 1920, "hormozi");

    assert.ok(fs.existsSync(subFile));
    const content = fs.readFileSync(subFile, "utf-8");
    assert.ok(content.includes("סרטון"));
    assert.ok(content.includes("ערוך"));
    assert.ok(content.includes("מושלם"));
    assert.ok(content.includes("0:00:00.10")); // Exact clean start timestamp
  });
  test("Preserves logical Hebrew and mixed-direction word order for libass bidi", () => {
    const cases = [
      ["עוצמתה", "החודרת", "השפיעה", "על"],
      ["גרסה", "2026", "KarkasCut", "מוכנה"],
      ["Hello", "world", "today", "again"]
    ];
    for (const [index, tokens] of cases.entries()) {
      const subFile = path.join(TEST_DIR, `test_bidi_${index}.ass`);
      generateHormoziAssSubtitles(tokens.map((word, i) => ({ word, start: i, end: i + 0.8 })),
        undefined, subFile, 640, 360, "minimal");
      const lines = fs.readFileSync(subFile, "utf8").split("\n").filter((line) => line.startsWith("Dialogue:"));
      assert.equal(lines.length, tokens.length);
      assert.equal(lines[0]?.includes("\u202B"), index < 2, "Hebrew-led lines need explicit RTL embedding");
      for (const line of lines) {
        const visible = line.split(",").slice(9).join(",").replace(/\{[^}]*\}/g, "").replace(/[\u202B\u202C]/g, "");
        assert.equal(visible.trim(), tokens.join(" "), "libass needs logical order, not pre-reversed Hebrew");
      }
    }
  });

});
