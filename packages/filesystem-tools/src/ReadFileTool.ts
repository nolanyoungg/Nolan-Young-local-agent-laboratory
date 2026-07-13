import { lstat, readFile } from "node:fs/promises";
import {
  readFileActionSchema,
  type ToolResult,
} from "@laboratory/shared-types";
import type { WorkspaceGuard } from "@laboratory/workspace-security";
import { isBinary, truncateUtf8 } from "./FileUtilities.js";
export class ReadFileTool {
  constructor(
    private readonly guard: WorkspaceGuard,
    private readonly maximumFileBytes = 1_000_000,
    private readonly maximumOutputBytes = 100_000,
  ) {}
  async execute(input: unknown): Promise<ToolResult> {
    const action = readFileActionSchema.parse(input);
    const target = await this.guard.resolve(action.path, "read");
    const stat = await lstat(target);
    if (!stat.isFile())
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Target is not a regular file" },
      };
    if (stat.size > this.maximumFileBytes)
      return {
        ok: false,
        error: {
          code: "FILE_TOO_LARGE",
          message: `File exceeds ${this.maximumFileBytes} bytes`,
        },
      };
    const buffer = await readFile(target);
    if (isBinary(buffer))
      return {
        ok: false,
        error: {
          code: "BINARY_FILE",
          message: "Binary files are not supported",
        },
      };
    const result = truncateUtf8(
      buffer.toString("utf8"),
      this.maximumOutputBytes,
    );
    return {
      ok: true,
      output: result.value,
      truncated: result.truncated,
      originalBytes: result.originalBytes,
      returnedBytes: result.returnedBytes,
    };
  }
}
