import path from "node:path";
import type { CheckDefinition, CheckResult } from "./CheckDefinition.js";
export class PackageInspectionCheck implements CheckDefinition {
  readonly id = "package-inspection";
  readonly mandatory = true;
  constructor(
    private readonly entries: readonly string[],
    private readonly forbidden: readonly string[],
  ) {}
  async run(): Promise<CheckResult> {
    const unsafe = this.entries.filter(
      (entry) =>
        path.isAbsolute(entry) ||
        entry.replaceAll("\\", "/").split("/").includes(".."),
    );
    const forbiddenEntries = this.entries.filter((entry) =>
      this.forbidden.some(
        (value) => entry === value || entry.startsWith(`${value}/`),
      ),
    );
    const success = unsafe.length === 0 && forbiddenEntries.length === 0;
    return {
      id: this.id,
      type: "package-inspection",
      mandatory: true,
      success,
      message: success
        ? "Archive entry inspection passed."
        : "Archive contains unsafe or forbidden entries.",
      details: { unsafe, forbiddenEntries },
    };
  }
}
