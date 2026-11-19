import { z } from "zod";

export const ErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "NOT_FOUND",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "PROJECT_NOT_FOUND",
  "INVALID_VIDEO",
  "TRANSCRIPTION_FAILED",
  "AI_RATE_LIMITED",
  "RENDER_FAILED",
  "JOB_CANCELLED",
  "INTERNAL_ERROR"
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional()
  })
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly details?: unknown;

  constructor(options: {
    code: ErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    details?: unknown;
  }) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
