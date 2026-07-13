import { minimatch } from "minimatch";
export class IgnoreMatcher {
  constructor(private readonly patterns: readonly string[]) {}
  matches(relativePath: string): boolean {
    return this.patterns.some((pattern) =>
      minimatch(relativePath, pattern, {
        dot: true,
        nocase: process.platform === "win32",
      }),
    );
  }
}
