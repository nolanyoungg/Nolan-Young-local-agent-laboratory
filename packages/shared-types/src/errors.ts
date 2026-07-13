import { z } from "zod";

export const structuredErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
  retryable: z.boolean().default(false),
});
export interface StructuredError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  readonly retryable?: boolean;
}

export class LaboratoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly retryable = false,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toStructuredError(): StructuredError {
    return structuredErrorSchema.parse({
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
    });
  }
}
