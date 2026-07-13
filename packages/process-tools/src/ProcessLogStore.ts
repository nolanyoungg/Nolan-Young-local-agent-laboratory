export interface ProcessLogs {
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}
interface MutableLogs {
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}
export class ProcessLogStore {
  private readonly logs = new Map<string, MutableLogs>();
  constructor(private readonly maximumBytes = 100_000) {}
  initialize(id: string): void {
    this.logs.set(id, {
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
    });
  }
  append(
    id: string,
    stream: "stdout" | "stderr",
    chunk: Buffer | string,
  ): void {
    const entry = this.logs.get(id);
    if (!entry) return;
    const next = entry[stream] + chunk.toString();
    const buffer = Buffer.from(next);
    if (buffer.length <= this.maximumBytes) entry[stream] = next;
    else {
      entry[stream] = buffer
        .subarray(buffer.length - this.maximumBytes)
        .toString("utf8");
      entry[`${stream}Truncated`] = true;
    }
  }
  get(id: string): ProcessLogs | undefined {
    const value = this.logs.get(id);
    return value ? { ...value } : undefined;
  }
}
