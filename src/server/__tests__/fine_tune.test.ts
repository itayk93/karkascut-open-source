import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { replaceCutWindow } from "../../shared/replaceCutWindow.js";
import { computeKeepTimeline, mergeOverlappingCuts } from "../services/timeline.js";
import type { CutSegment } from "../types.js";

const cut = (id: string, start: number, end: number): CutSegment => ({
  id, start, end, status: "cut", type: "manual", confidence: 1, reason: "test"
});
const id = () => "split-right";

describe("Fine tuning window replacement", () => {
  test("preserves adjacent silence cuts and green speech after save/reload normalization", () => {
    const before = cut("before", 25, 32.56);
    const after = cut("after", 65.64, 70);
    const replacements = [cut("silence1", 36.74, 43.75), cut("silence2", 46.18, 49.39)];
    const result = replaceCutWindow([before, after], replacements, 32.56, 65.64, id);
    assert.equal(result[0], before);
    assert.equal(result.at(-1), after);
    const saved = mergeOverlappingCuts(result);
    const keep = computeKeepTimeline(75, saved);
    assert.ok(keep.some((s) => s.start === 32.56 && s.end === 36.74));
    assert.ok(keep.some((s) => s.start === 43.75 && s.end === 46.18));
    assert.deepEqual(replaceCutWindow(result, replacements, 32.56, 65.64, id), result);
  });

  test("splits a crossing cut without deleting the parts outside the window", () => {
    const original = cut("parent", 10, 50);
    assert.deepEqual(replaceCutWindow([original], [cut("new", 25, 30)], 20, 40, id), [
      { ...original, end: 20 }, cut("new", 25, 30), { ...original, id: "split-right", start: 40 }
    ]);
    assert.equal(original.end, 50);
  });

  test("all-green removes the parent and preserves locked cuts", () => {
    const locked = { ...cut("locked", 22, 23), locked: true };
    assert.deepEqual(replaceCutWindow([cut("parent", 20, 40), locked], [], 20, 40, id), [locked]);
  });

  test("clips new cuts to the analyzed window and rejects invalid intervals", () => {
    assert.deepEqual(replaceCutWindow([], [cut("wide", 0, 50), cut("bad", NaN, 30), cut("outside", 45, 48)], 20, 40, id), [cut("wide", 20, 40)]);
  });
});
