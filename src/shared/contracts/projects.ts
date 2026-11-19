import { z } from "zod";

export const CutTypeSchema = z.enum([
  "silence",
  "filler",
  "false_start",
  "retake",
  "repetition",
  "correction",
  "dead_content",
  "manual"
]);
export type CutCategory = z.infer<typeof CutTypeSchema>;

export const CutSegmentSchema = z.object({
  id: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  type: CutTypeSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  status: z.enum(["cut", "restored"]),
  text: z.string().optional(),
  wordCount: z.number().optional(),
  locked: z.boolean().optional()
});
export type CutSegment = z.infer<typeof CutSegmentSchema>;

export const TranscriptWordSchema = z.object({
  word: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative()
});
export type TranscriptWord = z.infer<typeof TranscriptWordSchema>;

export const CaptionsStyleSchema = z.enum([
  "hormozi",
  "beast",
  "minimal",
  "impact2",
  "prism",
  "paper",
  "prime",
  "lens",
  "vista"
]);
export type CaptionsStyle = z.infer<typeof CaptionsStyleSchema>;

export const RenderPreferencesSchema = z.object({
  makeVertical: z.boolean().optional(),
  burnCaptions: z.boolean().optional(),
  captionsStyle: CaptionsStyleSchema.optional(),
  studioAudio: z.boolean().optional(),
  autoZoom: z.boolean().optional(),
  transitionSfx: z.boolean().optional(),
  backgroundMusic: z
    .object({
      enabled: z.boolean(),
      trackId: z.string(),
      volume: z.number().min(0).max(1)
    })
    .optional(),
  faceGlow: z.boolean().optional()
});
export type RenderPreferences = z.infer<typeof RenderPreferencesSchema>;

export const BrollOverlaySchema = z.object({
  id: z.string(),
  assetId: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  reason: z.string().default(""),
  position: z.enum(["center", "pip", "fullscreen"]).optional()
});
export type BrollOverlay = z.infer<typeof BrollOverlaySchema>;

export const BrollAssetSchema = z.object({
  id: z.string(),
  filename: z.string(),
  originalName: z.string(),
  keywords: z.array(z.string()),
  duration: z.number().optional()
});
export type BrollAsset = z.infer<typeof BrollAssetSchema>;

export const ProjectStatsSchema = z.object({
  originalDuration: z.number(),
  cutDuration: z.number(),
  savingsPercent: z.number(),
  silenceCount: z.number(),
  fillerCount: z.number(),
  retakeCount: z.number()
});
export type ProjectStats = z.infer<typeof ProjectStatsSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  originalVideoPath: z.string(),
  processedVideoPath: z.string().optional(),
  duration: z.number(),
  status: z.enum(["uploaded", "processing", "ready", "error"]),
  cuts: z.array(CutSegmentSchema),
  transcript: z.array(TranscriptWordSchema).optional(),
  originalScript: z.string().optional(),
  stats: ProjectStatsSchema.optional(),
  renderPreferences: RenderPreferencesSchema.optional(),
  brollAssets: z.array(BrollAssetSchema).optional(),
  brollOverlays: z.array(BrollOverlaySchema).optional(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional()
});
export type Project = z.infer<typeof ProjectSchema>;

export const RotateProjectSchema = z.object({
  degrees: z
    .union([z.literal(90), z.literal(180), z.literal(270), z.literal("90"), z.literal("180"), z.literal("270")])
    .transform((v) => Number(v) as 90 | 180 | 270)
});
export type RotateProjectInput = z.infer<typeof RotateProjectSchema>;

export const UpdateCutsSchema = z.object({
  cuts: z.array(CutSegmentSchema)
});
export type UpdateCutsInput = z.infer<typeof UpdateCutsSchema>;

export const UpdateTranscriptSchema = z.object({
  words: z.array(TranscriptWordSchema)
});
export type UpdateTranscriptInput = z.infer<typeof UpdateTranscriptSchema>;

export const UpdateBrollOverlaysSchema = z.object({
  overlays: z.array(BrollOverlaySchema)
});
export type UpdateBrollOverlaysInput = z.infer<typeof UpdateBrollOverlaysSchema>;
