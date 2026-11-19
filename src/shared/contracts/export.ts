import { z } from "zod";

export const ExportFormatSchema = z.enum(["xml", "json", "video"]);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const ImportJsonSchema = z.record(z.string(), z.unknown());
export type ImportJsonInput = z.infer<typeof ImportJsonSchema>;

export const SaveKeyRequestSchema = z.object({
  apiKey: z.string().min(1, "API key is required")
});
export type SaveKeyRequest = z.infer<typeof SaveKeyRequestSchema>;
