import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { IgnoreMatcher } from "@laboratory/workspace-security";
import type { PackageRules } from "../config.js";
export interface PackageManifest {
  readonly archivePath: string;
  readonly entries: readonly string[];
  readonly sizeBytes: number;
}
export class PackageBuilder {
  constructor(
    private readonly workspace: string,
    private readonly rules: PackageRules,
  ) {}
  async build(
    outputDirectory: string,
    projectName: string,
    version: string,
  ): Promise<PackageManifest> {
    await mkdir(outputDirectory, { recursive: true });
    const archivePath = path.join(
      outputDirectory,
      `${projectName}-${version}.zip`,
    );
    const zip = new AdmZip();
    const excluded = new IgnoreMatcher([
      ...this.rules.excludedPaths,
      ...this.rules.forbiddenPaths,
    ]);
    const included = new IgnoreMatcher(this.rules.includedPaths);
    const prefix = this.rules.expectedTopLevelDirectory
      ? `${projectName}-${version}/`
      : "";
    const walk = async (directory: string): Promise<void> => {
      for (const entry of (
        await readdir(directory, { withFileTypes: true })
      ).sort((left, right) => left.name.localeCompare(right.name))) {
        const absolute = path.join(directory, entry.name);
        const relative = path
          .relative(this.workspace, absolute)
          .replaceAll("\\", "/");
        if (
          excluded.matches(relative) ||
          (entry.isDirectory() && excluded.matches(`${relative}/__entry__`))
        )
          continue;
        if (entry.isDirectory()) await walk(absolute);
        else if (entry.isFile() && included.matches(relative))
          zip.addLocalFile(
            absolute,
            path.posix.dirname(`${prefix}${relative}`),
            path.posix.basename(relative),
          );
      }
    };
    await walk(this.workspace);
    zip.writeZip(archivePath);
    const sizeBytes = (await stat(archivePath)).size;
    if (sizeBytes > this.rules.maximumArchiveBytes)
      throw new Error(
        `Archive exceeds maximum size of ${this.rules.maximumArchiveBytes} bytes`,
      );
    const entries = new AdmZip(archivePath)
      .getEntries()
      .map((entry) => entry.entryName)
      .sort();
    return { archivePath, entries, sizeBytes };
  }
}
