import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MockModelClient } from "@laboratory/local-model-client";
import { modelConfigSchema } from "@laboratory/shared-types";
import {
  pathPolicySchema,
  WorkspaceLock,
} from "@laboratory/workspace-security";
import { CodeEditorWorkflow } from "../src/CodeEditorWorkflow.js";
const prompts = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../prompts",
);
const plan = {
  summary: "Plan validation",
  affectedFiles: ["src/index.ts"],
  risks: [],
  steps: ["Update source"],
  validation: ["Run tests"],
};
const review = {
  approved: true,
  summary: "Changes match the plan.",
  findings: [],
  omissions: [],
  unrelatedChanges: [],
};
const fixture = async (): Promise<{ workspace: string; reports: string }> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "code-editor-app-"));
  const workspace = path.join(root, "workspace");
  await mkdir(path.join(workspace, "src"), { recursive: true });
  await writeFile(
    path.join(workspace, "src", "index.ts"),
    "export const value = 1;\n",
  );
  return { workspace, reports: path.join(root, "reports") };
};
const configuration = (
  workspace: string,
  reports: string,
  mode: "plan-only" | "dry-run" | "apply",
) => ({
  options: {
    workspace,
    task: "Change value",
    mode,
    model: "mock",
    ollamaUrl: "http://127.0.0.1:11434",
    maxSteps: 10,
    reportDirectory: reports,
    verbose: false,
  },
  model: modelConfigSchema.parse({ model: "mock", retryDelayMilliseconds: 0 }),
  policy: pathPolicySchema.parse({ read: ["**"], write: ["src/**"] }),
});
describe("CodeEditorWorkflow", () => {
  it("runs plan-only and creates the required reports", async () => {
    const item = await fixture();
    const result = await new CodeEditorWorkflow(
      new MockModelClient([JSON.stringify({ type: "finish", result: plan })]),
      prompts,
    ).run(configuration(item.workspace, item.reports, "plan-only"));
    expect(result.success).toBe(true);
    expect(
      await readFile(
        path.join(result.reportDirectory, "change-plan.json"),
        "utf8",
      ),
    ).toContain("Plan validation");
    for (const name of [
      "trace.jsonl",
      "run-metadata.json",
      "proposed-changes.diff",
      "changed-files.json",
      "review-report.json",
      "final-report.md",
      "final-result.json",
    ])
      await expect(
        readFile(path.join(result.reportDirectory, name), "utf8"),
      ).resolves.toBeTypeOf("string");
  });
  it("forces editor writes into dry-run and records proposed hashes", async () => {
    const item = await fixture();
    const responses = [
      JSON.stringify({ type: "finish", result: plan }),
      JSON.stringify({
        type: "apply_patch",
        path: "src/index.ts",
        patch:
          "export const value = 1;\n\n---REPLACE-WITH---\nexport const value = 2;\n",
        dryRun: false,
      }),
      JSON.stringify({
        type: "finish",
        result: {
          summary: "Changed value",
          changedFiles: ["src/index.ts"],
          validationNotes: [],
          remainingRisks: [],
        },
      }),
      JSON.stringify({ type: "finish", result: review }),
    ];
    const result = await new CodeEditorWorkflow(
      new MockModelClient(responses),
      prompts,
    ).run(configuration(item.workspace, item.reports, "dry-run"));
    expect(
      await readFile(path.join(item.workspace, "src", "index.ts"), "utf8"),
    ).toBe("export const value = 1;\n");
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0]?.dryRun).toBe(true);
  });
  it("acquires the workspace lock before creating a run directory", async () => {
    const item = await fixture();
    const lock = new WorkspaceLock(item.workspace);
    await lock.acquire();
    try {
      await expect(
        new CodeEditorWorkflow(new MockModelClient(), prompts).run(
          configuration(item.workspace, item.reports, "plan-only"),
        ),
      ).rejects.toThrow("already locked");
      await expect(readFile(item.reports, "utf8")).rejects.toThrow();
    } finally {
      await lock.release();
    }
  });
  it("preserves the run-start hash across multiple applied edits", async () => {
    const item = await fixture();
    const initial = "export const value = 1;\n";
    const second = "export const value = 2;\n";
    const final = "export const value = 3;\n";
    const responses = [
      JSON.stringify({ type: "finish", result: plan }),
      JSON.stringify({
        type: "write_file",
        path: "src/index.ts",
        content: second,
        dryRun: false,
      }),
      JSON.stringify({
        type: "write_file",
        path: "src/index.ts",
        content: final,
        dryRun: false,
      }),
      JSON.stringify({
        type: "finish",
        result: {
          summary: "Two edits",
          changedFiles: ["src/index.ts"],
          validationNotes: [],
          remainingRisks: [],
        },
      }),
      JSON.stringify({ type: "finish", result: review }),
    ];
    const result = await new CodeEditorWorkflow(
      new MockModelClient(responses),
      prompts,
    ).run(configuration(item.workspace, item.reports, "apply"));
    expect(result.changedFiles[0]?.originalSha256).toBe(
      createHash("sha256").update(initial).digest("hex"),
    );
    expect(result.changedFiles[0]?.finalSha256).toBe(
      createHash("sha256").update(final).digest("hex"),
    );
  });
});
