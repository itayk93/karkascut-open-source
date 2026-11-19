import test from "node:test";
import assert from "node:assert/strict";
import { EnvSchema } from "../config/env.js";

test("refinement is enabled by default and accepts boolean environment strings", () => {
  assert.equal(EnvSchema.parse({}).REFINE_LONG_CUTS, true);
  for (const value of [false, "false", " FALSE "]) {
    assert.equal(EnvSchema.parse({ REFINE_LONG_CUTS: value }).REFINE_LONG_CUTS, false);
  }
  for (const value of [true, "true", " TRUE "]) {
    assert.equal(EnvSchema.parse({ REFINE_LONG_CUTS: value }).REFINE_LONG_CUTS, true);
  }
});

test("invalid boolean values fail instead of silently enabling paid AI refinement", () => {
  for (const value of ["", "no", "0", "yes", 0, 1]) {
    assert.equal(EnvSchema.safeParse({ REFINE_LONG_CUTS: value }).success, false);
  }
});

test("Python defaults to PATH and supports a configured virtual environment", () => {
  assert.equal(EnvSchema.parse({}).PYTHON_BIN, "python3");
  assert.equal(EnvSchema.parse({ PYTHON_BIN: "/tmp/custom python/bin/python" }).PYTHON_BIN,
    "/tmp/custom python/bin/python");
  assert.equal(EnvSchema.safeParse({ PYTHON_BIN: " " }).success, false);
});
