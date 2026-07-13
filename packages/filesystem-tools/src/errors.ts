export class FilesystemToolError extends Error {
  constructor(
    readonly code:
      | "FILE_TOO_LARGE"
      | "BINARY_FILE"
      | "ALREADY_EXISTS"
      | "NOT_FOUND"
      | "INVALID_PATCH"
      | "HUNK_FAILED"
      | "ENCODING_UNSUPPORTED"
      | "OUTPUT_LIMIT",
    message: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "FilesystemToolError";
  }
}
