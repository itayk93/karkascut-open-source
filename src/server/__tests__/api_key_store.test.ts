import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readApiKeys, saveApiKey } from "../config/apiKeyStore.js";

function fixture(run: (target: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "autocut-key-store-"));
  try { run(path.join(dir, "keys.json")); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("saved key survives a new process and preserves the other provider", () => fixture((target) => {
  saveApiKey("OPENAI_API_KEY", "sk-test-first", target);
  saveApiKey("NVIDIA_API_KEY", "nv-test", target);
  saveApiKey("OPENAI_API_KEY", "sk-test-new", target);
  const fresh = JSON.parse(execFileSync(process.execPath, ["-e", "process.stdout.write(require('fs').readFileSync(process.argv[1], 'utf8'))", target], { encoding: "utf8" }));
  assert.deepEqual(fresh, { OPENAI_API_KEY: "sk-test-new", NVIDIA_API_KEY: "nv-test" });
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
}));

test("missing file is empty; invalid file is reported without overwriting it", () => fixture((target) => {
  assert.deepEqual(readApiKeys(target), {});
  fs.writeFileSync(target, "broken");
  assert.throws(() => saveApiKey("OPENAI_API_KEY", "sk-test", target));
  assert.equal(fs.readFileSync(target, "utf8"), "broken");
}));

test("invalid keys and write failures propagate", () => fixture((target) => {
  assert.throws(() => saveApiKey("OPENAI_API_KEY", " \n", target));
  assert.throws(() => saveApiKey("OPENAI_API_KEY", "sk-test", path.join(target, "missing.json")));
}));
