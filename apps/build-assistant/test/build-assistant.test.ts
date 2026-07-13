import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MockModelClient } from "@laboratory/local-model-client";
import { commandSchema } from "@laboratory/process-tools";
import { modelConfigSchema } from "@laboratory/shared-types";
import { pathPolicySchema } from "@laboratory/workspace-security";
import { BuildAssistantWorkflow } from "../src/BuildAssistantWorkflow.js";
describe("BuildAssistantWorkflow", () => {
  it("preserves a failed workspace and writes a truthful non-success report", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "build-app-"));
    const workspace = path.join(root, "workspace");
    await mkdir(path.join(workspace, "src"), { recursive: true });
    await writeFile(path.join(workspace, "src", "index.ts"), "unchanged\n");
    const configuration = {
      options: {
        workspace,
        command: "build",
        task: "Diagnose failure",
        watch: false,
        dryRun: false,
        model: "mock",
        ollamaUrl: "http://127.0.0.1:11434",
        maxSteps: 5,
        maxRepairPasses: 0,
        reportDirectory: path.join(root, "reports"),
        verbose: false,
      },
      model: modelConfigSchema.parse({
        model: "mock",
        retryDelayMilliseconds: 0,
      }),
      policy: pathPolicySchema.parse({ read: ["**"], write: ["src/**"] }),
      commands: {
        build: commandSchema.parse({
          executable: process.execPath,
          arguments: ["-e", "process.exit(2)"],
          workingDirectory: workspace,
          mode: "one-shot",
        }),
      },
    };
    const reviewer = {
      approved: false,
      summary: "Build remains failed.",
      findings: [{ severity: "error", message: "Exit code is nonzero." }],
      unrelatedChanges: [],
    };
    const prompts = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../prompts",
    );
    const result = await new BuildAssistantWorkflow(
      new MockModelClient([
        JSON.stringify({ type: "finish", result: reviewer }),
      ]),
      prompts,
    ).run(configuration);
    expect(result.success).toBe(false);
    expect(
      await readFile(path.join(workspace, "src", "index.ts"), "utf8"),
    ).toBe("unchanged\n");
    expect(
      await readFile(
        path.join(result.reportDirectory, "final-report.md"),
        "utf8",
      ),
    ).toContain("Success: no");
    expect(
      await readFile(
        path.join(result.reportDirectory, "initial-build-status.json"),
        "utf8",
      ),
    ).toContain('"exitCode": 2');
  });
});
