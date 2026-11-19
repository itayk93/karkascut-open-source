import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "../config/env.js";
import { runEyeContactCorrection } from "../services/eyeContact.js";

test("missing Python rejects without an uncaught process error", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "karkascut-eye-"));
  const input = path.join(dir, "input.mp4");
  fs.writeFileSync(input, "synthetic input, Python should never read it");
  const previous = { python: env.PYTHON_BIN, key: env.NVIDIA_API_KEY };
  try {
    env.PYTHON_BIN = path.join(dir, "missing-python");
    env.NVIDIA_API_KEY = ""; // This test must never call a cloud service.
    await assert.rejects(runEyeContactCorrection(input, path.join(dir, "out.mp4")),
      /Could not start eye contact Python.*ENOENT/);
  } finally {
    env.PYTHON_BIN = previous.python;
    env.NVIDIA_API_KEY = previous.key;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
