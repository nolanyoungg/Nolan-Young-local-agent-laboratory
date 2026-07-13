import { access } from "node:fs/promises";
import path from "node:path";
import type { CheckDefinition, CheckResult } from "./CheckDefinition.js";
export class FilePresenceCheck implements CheckDefinition {
  readonly id: string;
  readonly mandatory = true;
  constructor(
    private readonly root: string,
    private readonly relativePath: string,
  ) {
    this.id = `required-file:${relativePath}`;
  }
  async run(): Promise<CheckResult> {
    try {
      await access(path.join(this.root, this.relativePath));
      return {
        id: this.id,
        type: "required-file",
        mandatory: true,
        success: true,
        message: `${this.relativePath} is present.`,
      };
    } catch {
      return {
        id: this.id,
        type: "required-file",
        mandatory: true,
        success: false,
        message: `${this.relativePath} is missing.`,
      };
    }
  }
}
