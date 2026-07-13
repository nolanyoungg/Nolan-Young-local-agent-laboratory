import {
  searchTextActionSchema,
  type ToolResult,
} from "@laboratory/shared-types";
import type { WorkspaceGuard } from "@laboratory/workspace-security";
import { ListFilesTool } from "./ListFilesTool.js";
import { ReadFileTool } from "./ReadFileTool.js";
import { truncateUtf8 } from "./FileUtilities.js";
export class SearchTextTool {
  constructor(
    private readonly guard: WorkspaceGuard,
    private readonly maximumOutputBytes = 100_000,
  ) {}
  async execute(input: unknown): Promise<ToolResult> {
    const action = searchTextActionSchema.parse(input);
    const listed = await new ListFilesTool(this.guard).execute({
      type: "list_files",
      path: action.path,
    });
    const query = action.caseSensitive
      ? action.query
      : action.query.toLocaleLowerCase();
    const matches: string[] = [];
    for (const file of listed.output as string[]) {
      const read = await new ReadFileTool(this.guard).execute({
        type: "read_file",
        path: file,
      });
      if (!read.ok) continue;
      String(read.output)
        .split(/\r?\n/)
        .forEach((line, index) => {
          const candidate = action.caseSensitive
            ? line
            : line.toLocaleLowerCase();
          if (candidate.includes(query))
            matches.push(`${file}:${index + 1}:${line}`);
        });
    }
    const result = truncateUtf8(matches.join("\n"), this.maximumOutputBytes);
    return {
      ok: true,
      output: result.value,
      truncated: result.truncated || Boolean(listed.truncated),
      originalBytes: result.originalBytes,
      returnedBytes: result.returnedBytes,
    };
  }
}
