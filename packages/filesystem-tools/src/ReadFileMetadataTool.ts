import { lstat, readFile } from "node:fs/promises";
import {
  readFileMetadataActionSchema,
  type ToolResult,
} from "@laboratory/shared-types";
import type { WorkspaceGuard } from "@laboratory/workspace-security";
import { isBinary, sha256 } from "./FileUtilities.js";
export class ReadFileMetadataTool {
  constructor(private readonly guard: WorkspaceGuard) {}
  async execute(input: unknown): Promise<ToolResult> {
    const action = readFileMetadataActionSchema.parse(input);
    const target = await this.guard.resolve(action.path, "read");
    const stat = await lstat(target);
    const buffer = stat.isFile() ? await readFile(target) : undefined;
    return {
      ok: true,
      output: {
        path: action.path,
        type: stat.isFile()
          ? "file"
          : stat.isDirectory()
            ? "directory"
            : stat.isSymbolicLink()
              ? "symlink"
              : "other",
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        binary: buffer ? isBinary(buffer) : undefined,
        sha256: buffer ? sha256(buffer) : undefined,
      },
    };
  }
}
