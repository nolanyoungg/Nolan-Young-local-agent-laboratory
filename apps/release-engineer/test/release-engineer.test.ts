import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { MockModelClient } from "@laboratory/local-model-client";
import { commandSchema } from "@laboratory/process-tools";
import { modelConfigSchema } from "@laboratory/shared-types";
import { pathPolicySchema } from "@laboratory/workspace-security";
import { ReleaseEngineerWorkflow } from "../src/ReleaseEngineerWorkflow.js";
import { PackageValidator } from "../src/packaging/PackageValidator.js";
import { packageRulesSchema } from "../src/config.js";
const prompts = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../prompts",
);
const fixture = async (operation: "check" | "package") => {
  const root = await mkdtemp(path.join(os.tmpdir(), "release-app-"));
  const workspace = path.join(root, "workspace");
  await mkdir(path.join(workspace, "dist"), { recursive: true });
  await writeFile(
    path.join(workspace, "dist", "index.js"),
    "export const ok = true;\n",
  );
  await writeFile(
    path.join(workspace, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.2.3" }),
  );
  await writeFile(path.join(workspace, "README.md"), "# Fixture\n");
  return {
    root,
    configuration: {
      options: {
        operation,
        workspace,
        task: "Prepare release",
        repair: false,
        dryRun: false,
        model: "mock",
        ollamaUrl: "http://127.0.0.1:11434",
        maxSteps: 5,
        maxRepairPasses: 0,
        reportDirectory: path.join(root, "reports"),
        verbose: false,
      },
      model: modelConfigSchema.parse({ model: "mock" }),
      commands: {
        test: commandSchema.parse({
          executable: process.execPath,
          arguments: ["-e", "process.exit(0)"],
          workingDirectory: workspace,
        }),
      },
      mandatoryCommands: new Set(["test"]),
      requiredFiles: ["package.json", "README.md"],
      forbiddenFiles: [],
      packageRules: {
        requiredFiles: ["package.json", "README.md"],
        forbiddenPaths: [".git/**", "node_modules/**", ".env*"],
        includedPaths: ["dist/**", "package.json", "README.md"],
        excludedPaths: [],
        expectedTopLevelDirectory: false,
        maximumArchiveBytes: 1_000_000,
        verifyExtraction: true,
      },
      policy: pathPolicySchema.parse({ read: ["**"], write: ["src/**"] }),
    },
  };
};
describe("ReleaseEngineerWorkflow", () => {
  it("writes a deterministic validation report in check mode", async () => {
    const item = await fixture("check");
    const result = await new ReleaseEngineerWorkflow(
      new MockModelClient(),
      prompts,
    ).run(item.configuration);
    expect(result.success).toBe(true);
    expect(
      await readFile(
        path.join(result.reportDirectory, "validation-report.json"),
        "utf8",
      ),
    ).toContain('"success": true');
  });
  it("inspects, extracts, validates, and checksums a package", async () => {
    const item = await fixture("package");
    const result = await new ReleaseEngineerWorkflow(
      new MockModelClient(),
      prompts,
    ).run(item.configuration);
    expect(result.success).toBe(true);
    expect(result.archivePath).toMatch(/fixture-1\.2\.3\.zip$/);
    await expect(
      readFile(`${result.archivePath}.sha256`, "utf8"),
    ).resolves.toMatch(/^[a-f0-9]{64}/);
    expect(
      await readFile(
        path.join(result.reportDirectory, "package-validation.json"),
        "utf8",
      ),
    ).toContain('"extractedDirectoryValidated": true');
  });
  it("rejects archive traversal before extraction", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "release-unsafe-"));
    const archive = path.join(root, "unsafe.zip");
    const zip = new AdmZip();
    zip.addFile("aa/escape.txt", Buffer.from("unsafe"));
    zip.writeZip(archive);
    const archiveBytes = await readFile(archive);
    const safeName = Buffer.from("aa/escape.txt");
    const unsafeName = Buffer.from("../escape.txt");
    for (
      let index = archiveBytes.indexOf(safeName);
      index >= 0;
      index = archiveBytes.indexOf(safeName, index + unsafeName.length)
    )
      unsafeName.copy(archiveBytes, index);
    await writeFile(archive, archiveBytes);
    const validator = new PackageValidator({
      requiredFiles: [],
      forbiddenPaths: [],
      includedPaths: ["**"],
      excludedPaths: [],
      expectedTopLevelDirectory: false,
      maximumArchiveBytes: 1_000_000,
      verifyExtraction: true,
    });
    const validation = await validator.validate(archive);
    expect(validation.success).toBe(false);
    expect(validation.extractedDirectoryValidated).toBe(false);
    expect(validation.findings.join(" ")).toContain("traversal");
  });
  it("rejects traversal in release configuration paths", () => {
    expect(() =>
      packageRulesSchema.parse({ requiredFiles: ["../outside"] }),
    ).toThrow("remain relative");
  });
});
