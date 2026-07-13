import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WorkflowIdentifier } from "@laboratory/shared-types";
import { TracingError } from "./errors.js";
import { redact } from "./Redaction.js";
export interface RunDirectory {
  readonly runId: string;
  readonly directory: string;
  readonly tracePath: string;
  readonly startedAt: string;
}
export class RunDirectoryManager {
  static async create(
    baseDirectory: string,
    application: WorkflowIdentifier,
    metadata: Record<string, unknown> = {},
  ): Promise<RunDirectory> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const timestamp = startedAt.replaceAll(":", "-").replaceAll(".", "-");
    const directory = path.resolve(
      baseDirectory,
      `${timestamp}-${application}-${runId}`,
    );
    try {
      await mkdir(directory, { recursive: true });
      const tracePath = path.join(directory, "trace.jsonl");
      await writeFile(tracePath, "", { encoding: "utf8", mode: 0o600 });
      await writeFile(
        path.join(directory, "run-metadata.json"),
        `${JSON.stringify({ runId, application, startedAt, ...(redact(metadata) as Record<string, unknown>) }, null, 2)}\n`,
        "utf8",
      );
      return { runId, directory, tracePath, startedAt };
    } catch (error) {
      throw new TracingError(
        "RUN_DIRECTORY",
        `Unable to create run directory: ${directory}`,
        error,
      );
    }
  }
}
