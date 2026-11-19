import test from "node:test";
import assert from "node:assert/strict";
import { renderCuts } from "../services/ffmpeg.js";

test("missing FFmpeg rejects render instead of causing an uncaught process error", async () => {
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = "/nonexistent-karkascut-test-bin";
    await assert.rejects(renderCuts("synthetic-input.mp4", [{ start: 0, end: 1 }], "synthetic-output.mp4"),
      /Could not start FFmpeg:.*ENOENT/);
  } finally {
    process.env.PATH = previousPath;
  }
});
