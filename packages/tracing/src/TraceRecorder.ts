import type { TraceEvent } from "@laboratory/shared-types";
import { JsonlTraceWriter } from "./JsonlTraceWriter.js";
import { redact } from "./Redaction.js";
export class TraceRecorder {
  private sequence = 0;
  private readonly writer: JsonlTraceWriter;
  constructor(
    readonly runId: string,
    fileOrWriter: string | JsonlTraceWriter,
  ) {
    this.writer =
      typeof fileOrWriter === "string"
        ? new JsonlTraceWriter(fileOrWriter)
        : fileOrWriter;
  }
  async initialize(): Promise<void> {
    await this.writer.initialize();
  }
  async record(
    type: TraceEvent["type"],
    data: Record<string, unknown> = {},
  ): Promise<void> {
    const event: TraceEvent = {
      timestamp: new Date().toISOString(),
      type,
      runId: this.runId,
      sequence: ++this.sequence,
      data: redact(data) as Record<string, unknown>,
    };
    await this.writer.append(event);
  }
}
