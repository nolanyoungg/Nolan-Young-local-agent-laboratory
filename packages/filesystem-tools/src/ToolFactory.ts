import type { AgentAction, ToolResult } from "@laboratory/shared-types";
import type { WorkspaceGuard } from "@laboratory/workspace-security";
import { ApplyPatchTool } from "./ApplyPatchTool.js";
import { CreateFileTool } from "./CreateFileTool.js";
import { ListFilesTool } from "./ListFilesTool.js";
import { ReadFileMetadataTool } from "./ReadFileMetadataTool.js";
import { ReadFileTool } from "./ReadFileTool.js";
import { SearchTextTool } from "./SearchTextTool.js";
import { WriteFileTool } from "./WriteFileTool.js";
export interface FilesystemToolExecutor {
  execute(input: unknown): Promise<ToolResult>;
}
export class FilesystemToolFactory {
  constructor(private readonly guard: WorkspaceGuard) {}
  create(name: AgentAction["type"]): FilesystemToolExecutor {
    switch (name) {
      case "list_files":
        return new ListFilesTool(this.guard);
      case "read_file":
        return new ReadFileTool(this.guard);
      case "read_file_metadata":
        return new ReadFileMetadataTool(this.guard);
      case "search_text":
        return new SearchTextTool(this.guard);
      case "create_file":
        return new CreateFileTool(this.guard);
      case "write_file":
        return new WriteFileTool(this.guard);
      case "apply_patch":
        return new ApplyPatchTool(this.guard);
      default:
        throw new Error(`Not a filesystem tool: ${name}`);
    }
  }
}
export class FilesystemTools {
  private readonly factory: FilesystemToolFactory;
  constructor(guard: WorkspaceGuard) {
    this.factory = new FilesystemToolFactory(guard);
  }
  async execute(action: AgentAction): Promise<ToolResult> {
    if (action.type === "finish") return { ok: true, output: action.result };
    return this.factory.create(action.type).execute(action);
  }
}
