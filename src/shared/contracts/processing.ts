import { z } from "zod";
import { RenderPreferencesSchema } from "./projects.js";

export const ProcessProjectRequestSchema = z.object({
  apiKey: z.string().optional(),
  originalScript: z.string().optional(),
  renderPreferences: RenderPreferencesSchema.optional(),
  idempotencyKey: z.string().optional()
});
export type ProcessProjectRequest = z.infer<typeof ProcessProjectRequestSchema>;

export const RenderProjectRequestSchema = z.object({
  renderPreferences: RenderPreferencesSchema.optional(),
  idempotencyKey: z.string().optional()
});
export type RenderProjectRequest = z.infer<typeof RenderProjectRequestSchema>;

export const JobStatusSchema = z.enum([
  "idle",
  "queued",
  "preparing",
  "transcribing",
  "analyzing",
  "rendering",
  "completed",
  "failed",
  "cancelled"
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobResponseSchema = z.object({
  jobId: z.string(),
  status: JobStatusSchema,
  message: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  createdAt: z.string().optional(),
  error: z.string().optional()
});
export type JobResponse = z.infer<typeof JobResponseSchema>;
