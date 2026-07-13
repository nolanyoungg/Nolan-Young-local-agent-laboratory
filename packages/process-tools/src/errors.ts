export class ProcessToolError extends Error {
  constructor(
    readonly code:
      | "UNKNOWN_COMMAND"
      | "INVALID_COMMAND"
      | "SPAWN_FAILED"
      | "PROCESS_TIMEOUT"
      | "UNKNOWN_PROCESS"
      | "WATCHER_EARLY_EXIT",
    message: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "ProcessToolError";
  }
}
