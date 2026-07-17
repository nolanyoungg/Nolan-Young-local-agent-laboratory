import type { AgentAction, ToolResult } from "@laboratory/shared-types";
import type { WorkspaceGuard } from "@laboratory/workspace-security";
import { ListFilesTool } from "./ListFilesTool.js";
import { ReadFileMetadataTool } from "./ReadFileMetadataTool.js";
import { ReadFileTool } from "./ReadFileTool.js";
import { SearchTextTool } from "./SearchTextTool.js";
import { PhpSyntaxCheckTool } from "./PhpSyntaxCheckTool.js";
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
      case "php_syntax_check":
        return new PhpSyntaxCheckTool(this.guard);
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
