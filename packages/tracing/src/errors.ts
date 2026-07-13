export class TracingError extends Error {
  constructor(
    readonly code: "RUN_DIRECTORY" | "TRACE_WRITE" | "REPORT_WRITE",
    message: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "TracingError";
  }
}
