import { IgnoreMatcher } from "./IgnoreMatcher.js";
export class WritePolicy {
  private readonly matcher: IgnoreMatcher;
  constructor(patterns: readonly string[]) {
    this.matcher = new IgnoreMatcher(patterns);
  }
  allows(relativePath: string): boolean {
    return relativePath === "." || this.matcher.matches(relativePath);
  }
}
