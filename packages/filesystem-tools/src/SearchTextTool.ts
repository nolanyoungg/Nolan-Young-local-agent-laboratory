import { lstat } from "node:fs/promises";
import path from "node:path";
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
    const target = await this.guard.resolve(action.path, "read");
    const targetStat = await lstat(target);
    let files: string[];
    let listingTruncated = false;
    if (targetStat.isFile()) {
      files = [path.relative(this.guard.root, target).replaceAll("\\", "/")];
    } else if (targetStat.isDirectory()) {
      const listed = await new ListFilesTool(this.guard).execute({
        type: "list_files",
        path: action.path,
      });
      if (!listed.ok) return listed;
      if (!Array.isArray(listed.output))
        return {
          ok: false,
          error: {
            code: "INVALID_TOOL_RESULT",
            message: "list_files returned an invalid result",
          },
        };
      files = listed.output.filter(
        (file): file is string => typeof file === "string",
      );
      listingTruncated = Boolean(listed.truncated);
    } else {
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_PATH",
          message:
            "search_text.path must reference a regular file or directory",
        },
      };
    }
    const query = action.caseSensitive
      ? action.query
      : action.query.toLocaleLowerCase();
    const matches: string[] = [];
    for (const file of files) {
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
      truncated: result.truncated || listingTruncated,
      originalBytes: result.originalBytes,
      returnedBytes: result.returnedBytes,
    };
  }
}
