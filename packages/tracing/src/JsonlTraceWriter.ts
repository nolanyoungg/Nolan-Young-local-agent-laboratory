import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TracingError } from "./errors.js";
export class JsonlTraceWriter {
  private initialized = false;
  constructor(readonly filePath: string) {}
  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, "", {
        encoding: "utf8",
        flag: "a",
        mode: 0o600,
      });
      this.initialized = true;
    } catch (error) {
      throw new TracingError(
        "TRACE_WRITE",
        `Unable to initialize trace: ${this.filePath}`,
        error,
      );
    }
  }
  async append(value: unknown): Promise<void> {
    await this.initialize();
    try {
      await appendFile(this.filePath, `${JSON.stringify(value)}\n`, "utf8");
    } catch (error) {
      throw new TracingError(
        "TRACE_WRITE",
        `Unable to append trace: ${this.filePath}`,
        error,
      );
    }
  }
}
