import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { renderCuts, getVideoDuration } from "../services/ffmpeg.js";
import { env } from "../config/env.js";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = "";
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} failed (${code}): ${stderr}`)));
  });
}

async function createVideo(target: string, duration: number): Promise<void> {
  await run("ffmpeg", ["-y", "-f", "lavfi", "-i", `testsrc=duration=${duration}:size=320x240:rate=25`,
    "-f", "lavfi", "-i", `sine=frequency=500:duration=${duration}`, "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac", target]);
}

describe("Advanced Features: Background Music Ducking & Eye Contact", () => {
  it("renders synthetic background music without a bundled or licensed asset", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "karkascut-duck-"));
    try {
      const video = path.join(dir, "voice.mp4");
      const music = path.join(dir, "music.wav");
      const output = path.join(dir, "ducked.mp4");
      await createVideo(video, 4);
      await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=1", music]);
      await renderCuts(video, [{ start: 0, end: 4 }], output, { backgroundMusicPath: music, musicVolume: 0.25 });
      assert.ok(fs.statSync(output).size > 1000);
      assert.ok(Math.abs(await getVideoDuration(output) - 4) < 0.3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  const pythonDependencies = spawnSync(env.PYTHON_BIN, ["-c", "import cv2, numpy"], { stdio: "ignore" });
  const pythonReady = pythonDependencies.status === 0;
  const requirePython = process.env.REQUIRE_EYE_CONTACT_TESTS === "1";
  it("runs local eye contact on a synthetic video", {
    skip: !pythonReady && !requirePython ? "Optional OpenCV runtime missing. See scripts/eye-contact-requirements.txt." : false
  }, async () => {
    assert.ok(pythonReady, "Install the optional Python runtime before requiring eye-contact integration tests.");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "karkascut-eye-integration-"));
    try {
      const input = path.join(dir, "input.mp4");
      const output = path.join(dir, "output.mp4");
      await createVideo(input, 1);
      // Direct local script invocation deliberately avoids the optional NVIDIA cloud path.
      await run(env.PYTHON_BIN, [path.resolve("scripts/eye_contact.py"), input, output]);
      assert.ok(fs.statSync(output).size > 1000);
      assert.ok(Math.abs(await getVideoDuration(output) - 1) < 0.3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
