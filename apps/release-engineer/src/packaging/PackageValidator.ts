import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { IgnoreMatcher } from "@laboratory/workspace-security";
import type { PackageRules } from "../config.js";
export interface PackageValidation {
  readonly success: boolean;
  readonly entries: readonly string[];
  readonly extractedDirectoryValidated: boolean;
  readonly findings: readonly string[];
}
export class PackageValidator {
  constructor(private readonly rules: PackageRules) {}
  async validate(archivePath: string): Promise<PackageValidation> {
    const zip = new AdmZip(archivePath);
    const entries = zip
      .getEntries()
      .map((entry) => entry.entryName)
      .sort();
    const forbidden = new IgnoreMatcher(this.rules.forbiddenPaths);
    const findings: string[] = [];
    for (const entry of entries) {
      const normalized = entry.replaceAll("\\", "/");
      if (path.isAbsolute(normalized) || normalized.split("/").includes(".."))
        findings.push(`Unsafe traversal entry: ${entry}`);
      if (forbidden.matches(normalized))
        findings.push(`Forbidden archive entry: ${entry}`);
    }
    const topLevels = new Set(
      entries.map((entry) => entry.split("/")[0]).filter(Boolean),
    );
    if (this.rules.expectedTopLevelDirectory && topLevels.size !== 1)
      findings.push("Archive must contain exactly one top-level directory.");
    if (findings.length > 0)
      return {
        success: false,
        entries,
        extractedDirectoryValidated: false,
        findings,
      };
    const extracted = await mkdtemp(path.join(os.tmpdir(), "agent-release-"));
    try {
      zip.extractAllTo(extracted, true, false);
      for (const required of this.rules.requiredFiles) {
        const candidate = this.rules.expectedTopLevelDirectory
          ? path.join(extracted, [...topLevels][0] ?? "", required)
          : path.join(extracted, required);
        try {
          await readFile(candidate);
        } catch {
          findings.push(`Required extracted file is missing: ${required}`);
        }
      }
      return {
        success: findings.length === 0,
        entries,
        extractedDirectoryValidated: true,
        findings,
      };
    } finally {
      await rm(extracted, { recursive: true, force: true });
    }
  }
}
