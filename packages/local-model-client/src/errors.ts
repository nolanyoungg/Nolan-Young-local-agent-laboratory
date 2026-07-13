export type ModelClientErrorCode =
  | "OLLAMA_UNAVAILABLE"
  | "MODEL_NOT_INSTALLED"
  | "TIMEOUT"
  | "MALFORMED_OUTPUT"
  | "EMPTY_RESPONSE"
  | "CONNECTION_FAILURE"
  | "UNKNOWN_PROVIDER";
export class ModelClientError extends Error {
  constructor(
    readonly code: ModelClientErrorCode,
    message: string,
    readonly retryable = false,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "ModelClientError";
  }
}
