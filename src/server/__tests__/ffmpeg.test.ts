import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { getVideoDuration, extractAudio, detectSilences, renderCuts, extractCutAudio } from "../services/ffmpeg.js";

const TEST_DIR = path.resolve(process.cwd(), "data/test_tmp");

describe("FFmpeg Audio, Silence & Render Pipeline", () => {
  const testVideoPath = path.join(TEST_DIR, "test_input.mp4");
  const testAudioPath = path.join(TEST_DIR, "test_audio.mp3");
  const testOutputPath = path.join(TEST_DIR, "test_output.mp4");

  before(() => {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

    // Generate a 6-second video with 2s tone, 2s silence, 2s tone
    execSync(
      `ffmpeg -y -f lavfi -i "sine=frequency=440:duration=2" ` +
        `-f lavfi -i "anullsrc=r=44100:cl=mono:d=2" ` +
        `-f lavfi -i "sine=frequency=440:duration=2" ` +
        `-filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]" ` +
        `-f lavfi -i "color=c=navy:s=320x240:d=6" ` +
        `-map 3:v -map "[a]" -c:v libx264 -preset ultrafast -c:a aac "${testVideoPath}"`,
      { stdio: "pipe" }
    );
  });

  after(() => {
    try {
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      }
    } catch {}
  });

  test("Measures exact video duration with ffprobe", async () => {
    const dur = await getVideoDuration(testVideoPath);
    assert.ok(Math.abs(dur - 6.0) < 0.2, `Expected duration ~6.0s, got ${dur}`);
  });

  test("Extracts audio to 16kHz mono MP3", async () => {
    await extractAudio(testVideoPath, testAudioPath);
    assert.ok(fs.existsSync(testAudioPath), "Audio file was not created");
    const stats = fs.statSync(testAudioPath);
    assert.ok(stats.size > 1000, "Audio file is too small or empty");
  });

  test("Detects the silence interval between 2s and 4s", async () => {
    const silences = await detectSilences(testAudioPath, 0.7, -30);
    assert.ok(silences.length >= 1, `Expected at least 1 silence detected, got ${silences.length}`);
    const silence = silences[0];
    assert.ok(silence, "Expected silence to be defined");
    assert.ok(silence.start >= 1.8 && silence.start <= 2.2, `Expected start near 2.0, got ${silence.start}`);
    assert.ok(silence.end >= 3.8 && silence.end <= 4.2, `Expected end near 4.0, got ${silence.end}`);
    assert.ok(
      silence.duration >= 1.7 && silence.duration <= 2.2,
      `Expected duration near 2.0s, got ${silence.duration}`
    );
  });

  test("Renders cuts using multi-segment concat filter", async () => {
    // Keep 0 to 2s, and 4 to 6s (cutting the silence in the middle)
    const keepSegments = [
      { start: 0, end: 2.0 },
      { start: 4.0, end: 6.0 }
    ];

    await renderCuts(testVideoPath, keepSegments, testOutputPath);
    assert.ok(fs.existsSync(testOutputPath), "Rendered video was not created");

    const outDur = await getVideoDuration(testOutputPath);
    // Should be approx 4.0s (2.0s + 2.0s)
    assert.ok(Math.abs(outDur - 4.0) < 0.3, `Expected output duration ~4.0s, got ${outDur}`);
  });

  test("Cancels renderCuts cleanly when onProcess is killed with SIGTERM", async () => {
    const keepSegments = [{ start: 0, end: 5.0 }];
    const cancelOutputPath = path.join(TEST_DIR, "test_cancelled.mp4");

    await assert.rejects(
      async () => {
        await renderCuts(testVideoPath, keepSegments, cancelOutputPath, {
          onProcess: (proc) => {
            setTimeout(() => {
              proc.kill("SIGTERM");
            }, 30);
          }
        });
      },
      (err: unknown) => err instanceof Error && err.message === "RENDER_CANCELLED"
    );
  });

  test("Extracts clean cut audio matching keepSegments duration", async () => {
    const keepSegments = [
      { start: 0, end: 2.0 },
      { start: 4.0, end: 6.0 }
    ];
    const cutAudioOut = path.join(TEST_DIR, "test_cut_audio.mp3");

    await extractCutAudio(testVideoPath, keepSegments, cutAudioOut);
    assert.ok(fs.existsSync(cutAudioOut), "Cut audio file was not created");
    const stats = fs.statSync(cutAudioOut);
    assert.ok(stats.size > 1000, "Cut audio file is too small or empty");
  });
});
