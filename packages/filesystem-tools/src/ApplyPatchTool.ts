import { readFile } from "node:fs/promises";
import {
  applyPatchActionSchema,
  type ToolResult,
} from "@laboratory/shared-types";
import type { WorkspaceGuard } from "@laboratory/workspace-security";
import { WriteFileTool } from "./WriteFileTool.js";
const marker = "\n---REPLACE-WITH---\n";
export class ApplyPatchTool {
  constructor(private readonly guard: WorkspaceGuard) {}
  async execute(input: unknown): Promise<ToolResult> {
    const action = applyPatchActionSchema.parse(input);
    const readTarget = await this.guard.resolve(action.path, "read");
    await this.guard.resolve(action.path, "write");
    const current = await readFile(readTarget, "utf8");
    const parts = action.patch.split(marker);
    if (parts.length !== 2)
      return {
        ok: false,
        error: {
          code: "INVALID_PATCH",
          message: `Patch must contain one exact marker: ${marker.trim()}`,
        },
      };
    const [oldText = "", newText = ""] = parts;
    if (!oldText)
      return {
        ok: false,
        error: {
          code: "INVALID_PATCH",
          message: "Patch old text must not be empty",
        },
      };
    const occurrences = current.split(oldText).length - 1;
    if (occurrences !== 1)
      return {
        ok: false,
        error: {
          code: "HUNK_FAILED",
          message:
            occurrences === 0
              ? "Exact patch hunk was not found; no changes applied"
              : "Exact patch hunk is ambiguous; no changes applied",
        },
      };
    return new WriteFileTool(this.guard).execute({
      type: "write_file",
      path: action.path,
      content: current.replace(oldText, newText),
      dryRun: action.dryRun,
    });
  }
}
