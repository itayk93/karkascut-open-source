import dotenv from "dotenv";
import { readApiKeys } from "./apiKeyStore.js";
import { z } from "zod";
import { envPath } from "./persistEnv.js";

dotenv.config({ path: envPath });

export const EnvSchema = z.object({
  PYTHON_BIN: z.string().trim().min(1).default("python3"),
  PORT: z.coerce.number().default(3050),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("whisper-1"),
  OPENAI_EDITOR_MODEL: z.string().default("gpt-4o"),
  NVIDIA_API_KEY: z.string().default(""),
  NVIDIA_FUNCTION_ID: z.string().default("480bffcb-6fea-4571-9741-eb50212c9c0f"),
  NVIDIA_TARGET: z.string().default("grpc.nvcf.nvidia.com:443"),
  // Only trim silences noticeably longer than a natural breath, and leave a
  // generous pause behind so the cut never sounds clipped.
  SILENCE_THRESHOLD_SECONDS: z.coerce.number().default(0.85),
  SILENCE_PAD_SECONDS: z.coerce.number().default(0.35),
  SILENCE_PAD_SENTENCE_SECONDS: z.coerce.number().default(0.5),
  // Silence gate: measured relative to the clip's own noise floor.
  // effective noise dB = clamp(meanVolumeDb + SILENCE_NOISE_MARGIN_DB, floor, ceil)
  SILENCE_NOISE_MARGIN_DB: z.coerce.number().default(3),
  SILENCE_NOISE_FLOOR_DB: z.coerce.number().default(-45),
  SILENCE_NOISE_CEIL_DB: z.coerce.number().default(-26),
  CUT_PADDING_MS: z.coerce.number().default(150),
  CUT_PADDING_BOUNDARY_MS: z.coerce.number().default(240),
  CONFIDENCE_THRESHOLD_AUTO: z.coerce.number().default(0.9),
  // Auto fine-tune: any AI cut longer than this (seconds) is re-analyzed and,
  // if real content would come back, split into precise micro-cuts.
  REFINE_LONG_CUTS: z.preprocess(
    (value) => typeof value === "string"
      ? ({ true: true, false: false } as Record<string, boolean>)[value.trim().toLowerCase()] ?? value
      : value,
    z.boolean().default(true)
  ),
  REFINE_MIN_SEC: z.coerce.number().default(5),
  // Script alignment ("keep the last take" against the planned script)
  SCRIPT_ALIGN_MAX_GAP: z.coerce.number().default(3), // unmatched words tolerated inside one attempt
  SCRIPT_ALIGN_RETRY_WINDOW: z.coerce.number().default(8), // a retry must restart within N words of the failed attempt
  SCRIPT_ALIGN_COMPLETE_RATIO: z.coerce.number().default(0.7) // matched/total below this = "false_start", above = "retake"
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse({ ...process.env, ...readApiKeys() });
  if (!result.success) {
    console.error("Invalid environment configuration:", result.error.format());
    throw new Error("Failed to validate environment configuration");
  }
  return result.data;
}

export const env: Env = parseEnv();

export function setOpenAiKey(key: string): void {
  env.OPENAI_API_KEY = key;
  process.env.OPENAI_API_KEY = key;
}

export function setNvidiaKey(key: string): void {
  env.NVIDIA_API_KEY = key;
  process.env.NVIDIA_API_KEY = key;
}
