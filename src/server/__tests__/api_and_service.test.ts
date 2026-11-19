import test from "node:test";
import assert from "node:assert/strict";
import { saveKeySchema, updateCutsSchema, rotateProjectSchema, importJsonSchema } from "../schemas/api.schemas.js";
import { jobManager } from "../services/jobManager.js";
import { generateId } from "../utils/id.js";
import { ProcessProjectRequestSchema, AppError } from "../../shared/contracts/index.js";

test("API Schemas: validates saveKeySchema", () => {
  const valid = saveKeySchema.safeParse({ apiKey: "sk-proj-1234567890" });
  assert.equal(valid.success, true);

  const invalid = saveKeySchema.safeParse({ apiKey: "" });
  assert.equal(invalid.success, false);
});

test("API Schemas: validates rotateProjectSchema", () => {
  const valid90 = rotateProjectSchema.safeParse({ degrees: 90 });
  assert.equal(valid90.success, true);
  if (valid90.success) {
    assert.equal(valid90.data.degrees, 90);
  }

  const validString = rotateProjectSchema.safeParse({ degrees: "180" });
  assert.equal(validString.success, true);
  if (validString.success) {
    assert.equal(validString.data.degrees, 180);
  }

  const invalid = rotateProjectSchema.safeParse({ degrees: 45 });
  assert.equal(invalid.success, false);
});

test("API Schemas: validates updateCutsSchema", () => {
  const valid = updateCutsSchema.safeParse({
    cuts: [
      {
        id: "cut_1",
        start: 0,
        end: 1.5,
        type: "silence",
        confidence: 0.95,
        reason: "long silence",
        status: "cut"
      }
    ]
  });
  assert.equal(valid.success, true);

  const invalid = updateCutsSchema.safeParse({ cuts: "not an array" });
  assert.equal(invalid.success, false);
});

test("JobManager: registers, checks, and cancels jobs cleanly", () => {
  let killed = false;
  const projId = generateId("test_proj");

  jobManager.register(projId, () => {
    killed = true;
  });

  assert.equal(jobManager.has(projId), true);
  const cancelResult = jobManager.cancel(projId);
  assert.equal(cancelResult, true);
  assert.equal(killed, true);
  assert.equal(jobManager.has(projId), false);
});

test("Contracts: validates ProcessProjectRequestSchema and AppError", () => {
  const validReq = ProcessProjectRequestSchema.safeParse({
    apiKey: "sk-test",
    renderPreferences: {
      makeVertical: true,
      burnCaptions: true,
      captionsStyle: "hormozi"
    },
    idempotencyKey: "proj-1-hash"
  });
  assert.equal(validReq.success, true);

  const appErr = new AppError({
    code: "TRANSCRIPTION_FAILED",
    message: "Whisper audio conversion failed",
    statusCode: 502,
    retryable: true
  });
  assert.equal(appErr.code, "TRANSCRIPTION_FAILED");
  assert.equal(appErr.statusCode, 502);
  assert.equal(appErr.retryable, true);
  assert.equal(appErr instanceof Error, true);
});

// Zod 4 requires explicit record key and value schemas.
test("API Schemas: imported plan accepts string keys with heterogeneous values", () => {
  const plan = { cuts: [], renderPreferences: { eyeContact: false }, title: "synthetic", version: 1 };
  assert.deepEqual(importJsonSchema.parse(plan), plan);
  assert.equal(importJsonSchema.safeParse(null).success, false);
  assert.equal(importJsonSchema.safeParse([]).success, false);
});
