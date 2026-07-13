import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  listFilesActionSchema,
  type ToolResult,
} from "@laboratory/shared-types";
import {
  IgnoreMatcher,
  type WorkspaceGuard,
} from "@laboratory/workspace-security";
export class ListFilesTool {
  constructor(
    private readonly guard: WorkspaceGuard,
    private readonly maximumFiles = 10_000,
    private readonly maximumOutputBytes = 100_000,
  ) {}
  async execute(input: unknown): Promise<ToolResult> {
    const action = listFilesActionSchema.parse(input);
    const root = await this.guard.resolve(action.path);
    const files: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      for (const entry of (
        await readdir(directory, { withFileTypes: true })
      ).sort((left, right) => left.name.localeCompare(right.name))) {
        if (files.length >= this.maximumFiles) return;
        const absolute = path.join(directory, entry.name);
        const relative = path
          .relative(this.guard.root, absolute)
          .replaceAll("\\", "/");
        try {
          await this.guard.resolve(relative, "read");
        } catch {
          continue;
        }
        if (entry.isDirectory()) await walk(absolute);
        else if (
          entry.isFile() &&
          (!action.pattern ||
            new IgnoreMatcher([action.pattern]).matches(relative))
        )
          files.push(relative);
      }
    };
    await walk(root);
    const joined = files.join("\n");
    const bytes = Buffer.byteLength(joined);
    if (bytes <= this.maximumOutputBytes)
      return {
        ok: true,
        output: files,
        truncated: files.length >= this.maximumFiles,
        originalBytes: bytes,
        returnedBytes: bytes,
      };
    const selected: string[] = [];
    let returnedBytes = 0;
    for (const file of files) {
      const size = Buffer.byteLength(`${file}\n`);
      if (returnedBytes + size > this.maximumOutputBytes) break;
      selected.push(file);
      returnedBytes += size;
    }
    return {
      ok: true,
      output: selected,
      truncated: true,
      originalBytes: bytes,
      returnedBytes,
    };
  }
}
