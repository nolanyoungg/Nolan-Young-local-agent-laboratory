import { readFile } from "node:fs/promises";
import {
  writeFileActionSchema,
  type ToolResult,
} from "@laboratory/shared-types";
import type { WorkspaceGuard } from "@laboratory/workspace-security";
import { atomicWriteUtf8, isBinary, sha256 } from "./FileUtilities.js";
export class WriteFileTool {
  constructor(
    private readonly guard: WorkspaceGuard,
    private readonly maximumFileBytes = 1_000_000,
  ) {}
  async execute(input: unknown): Promise<ToolResult> {
    const action = writeFileActionSchema.parse(input);
    if (Buffer.byteLength(action.content) > this.maximumFileBytes)
      return {
        ok: false,
        error: {
          code: "FILE_TOO_LARGE",
          message: `Write exceeds ${this.maximumFileBytes} bytes`,
        },
      };
    const target = await this.guard.resolve(action.path, "write");
    let before: Buffer | undefined;
    try {
      before = await readFile(target);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      )
        throw error;
    }
    if (before && isBinary(before))
      return {
        ok: false,
        error: {
          code: "BINARY_FILE",
          message: "Binary files cannot be overwritten",
        },
      };
    const beforeHash = before ? sha256(before) : null;
    const afterHash = sha256(action.content);
    const changed = beforeHash !== afterHash;
    if (!action.dryRun && changed)
      await atomicWriteUtf8(target, action.content);
    return {
      ok: true,
      output: {
        path: action.path,
        beforeHash,
        afterHash,
        changed,
        dryRun: action.dryRun,
      },
    };
  }
}
