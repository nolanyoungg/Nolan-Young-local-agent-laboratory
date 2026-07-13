import { readFile } from "node:fs/promises";
import {
  createFileActionSchema,
  type ToolResult,
} from "@laboratory/shared-types";
import type { WorkspaceGuard } from "@laboratory/workspace-security";
import { WriteFileTool } from "./WriteFileTool.js";
export class CreateFileTool {
  constructor(
    private readonly guard: WorkspaceGuard,
    private readonly maximumFileBytes = 1_000_000,
  ) {}
  async execute(input: unknown): Promise<ToolResult> {
    const action = createFileActionSchema.parse(input);
    const target = await this.guard.resolve(action.path, "write");
    try {
      await readFile(target);
      return {
        ok: false,
        error: {
          code: "ALREADY_EXISTS",
          message: "create_file cannot overwrite an existing file",
        },
      };
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      )
        throw error;
    }
    return new WriteFileTool(this.guard, this.maximumFileBytes).execute({
      ...action,
      type: "write_file",
    });
  }
}
