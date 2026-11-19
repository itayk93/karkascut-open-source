import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { persistEnvKey } from "../config/persistEnv.js";

function fixture(run: (target: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "autocut-settings-"));
  try { run(path.join(dir, ".env")); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("creates missing env and survives a fresh dotenv load", () => fixture((target) => {
  persistEnvKey("OPENAI_API_KEY", "sk-test-persistent", target);
  assert.equal(dotenv.parse(fs.readFileSync(target)).OPENAI_API_KEY, "sk-test-persistent");
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
}));

test("replaces spaced/export/duplicate assignments without modifying comments or other keys", () => fixture((target) => {
  fs.writeFileSync(target, '# OPENAI_API_KEY=example\nexport OPENAI_API_KEY = old\nOPENAI_API_KEY=duplicate\nPORT=3050\n');
  persistEnvKey("OPENAI_API_KEY", "sk-new-test", target);
  const saved = fs.readFileSync(target, "utf8");
  assert.ok(saved.includes("# OPENAI_API_KEY=example"));
  assert.deepEqual(dotenv.parse(saved), { OPENAI_API_KEY: "sk-new-test", PORT: "3050" });
  assert.equal(saved.split('\n').filter((line) => line.startsWith('OPENAI_API_KEY=')).length, 1);
}));

test("reports write failures instead of claiming persistence", () => fixture((target) => {
  assert.throws(() => persistEnvKey("OPENAI_API_KEY", "sk-test", path.join(target, "missing", ".env")));
}));

test("rejects newlines without altering the saved key", () => fixture((target) => {
  persistEnvKey("OPENAI_API_KEY", "sk-original", target);
  assert.throws(() => persistEnvKey("OPENAI_API_KEY", "sk-new\nPORT=9000", target));
  assert.equal(dotenv.parse(fs.readFileSync(target)).OPENAI_API_KEY, "sk-original");
}));
