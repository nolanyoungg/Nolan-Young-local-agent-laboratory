import { readdir } from "node:fs/promises";
import path from "node:path";
import { IgnoreMatcher } from "@laboratory/workspace-security";
import type { CheckDefinition, CheckResult } from "./CheckDefinition.js";
export class ForbiddenFileCheck implements CheckDefinition {
  readonly id = "forbidden-files";
  readonly mandatory = true;
  constructor(
    private readonly root: string,
    private readonly patterns: readonly string[],
  ) {}
  async run(): Promise<CheckResult> {
    const matcher = new IgnoreMatcher(this.patterns);
    const found: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        const relative = path
          .relative(this.root, absolute)
          .replaceAll("\\", "/");
        if (
          matcher.matches(relative) ||
          (entry.isDirectory() && matcher.matches(`${relative}/__entry__`))
        ) {
          found.push(relative);
          continue;
        }
        if (entry.isDirectory()) await walk(absolute);
      }
    };
    await walk(this.root);
    return {
      id: this.id,
      type: "forbidden-file",
      mandatory: true,
      success: found.length === 0,
      message:
        found.length === 0
          ? "No forbidden release files were found."
          : `Found ${found.length} forbidden release paths.`,
      details: { paths: found.sort() },
    };
  }
}
