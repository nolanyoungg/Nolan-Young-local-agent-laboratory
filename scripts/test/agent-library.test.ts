import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  LocalModelClient,
  ModelHealth,
} from "@laboratory/local-model-client";
import type { ModelRequest, ModelResponse } from "@laboratory/shared-types";
import {
  listLibraryEntries,
  loadAgent,
  loadSkill,
  runLibraryAgent,
} from "../agent-library.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

class ReviewModel implements LocalModelClient {
  private call = 0;
  private readonly evidencePaths = [
    "functions.php",
    "theme.json",
    "package.json",
    "templates/index.html",
    "parts/header.html",
  ];
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const call = this.call++;
    const content =
      call === 0
        ? JSON.stringify({ type: "list_files", path: "." })
        : call <= 5
          ? JSON.stringify({
              type: "read_file",
              path: this.evidencePaths[call - 1],
            })
          : JSON.stringify({
              type: "finish",
              result: {
                summary: "Reviewed the supplied fixture.",
                scopeReviewed: this.evidencePaths,
                findings: [],
                limitations: ["Static source review only."],
                recommendedNextSteps: [],
              },
            });
    return { content, model: request.config.model, done: true };
  }
  async healthCheck(): Promise<ModelHealth> {
    return {
      healthy: true,
      providerReachable: true,
      modelInstalled: true,
      message: "ready",
    };
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("agent library", () => {
  it("loads every agent and its referenced skills", async () => {
    const entries = await listLibraryEntries(repositoryRoot);
    expect(entries.agents).toEqual([
      "github-repo-review",
      "social-media-bot-agent",
      "wordpress-blog-writer-agent",
      "wordpress-theme-verification-agent",
    ]);
    expect(entries.skills).toEqual([
      "email-delivery",
      "evidence-based-review",
      "facebook-page-publishing",
      "repo-auditor",
      "spreadsheet-content-queue",
      "wordpress-blog-writing",
      "wordpress-theme-verification",
    ]);
    for (const agentId of entries.agents) {
      const agent = await loadAgent(repositoryRoot, agentId);
      expect(agent.tools.length).toBeGreaterThan(0);
      expect(
        agent.tools.every(
          (tool) =>
            !["write_file", "create_file", "apply_patch"].includes(tool),
        ),
      ).toBe(true);
      for (const skillId of agent.skillIds)
        await expect(loadSkill(repositoryRoot, skillId)).resolves.toMatchObject(
          { id: skillId },
        );
    }
  });

  it("runs both profiles through their tools and writes review evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              models: [{ name: "fixture-model:latest", size: 100 }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const workspace = await mkdtemp(
      path.join(os.tmpdir(), "agent-library-workspace-"),
    );
    const evidencePaths = [
      "functions.php",
      "theme.json",
      "package.json",
      "templates/index.html",
      "parts/header.html",
    ];
    for (const evidencePath of evidencePaths) {
      const target = path.join(workspace, evidencePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `Fixture ${evidencePath}\n`, "utf8");
    }
    for (const agentId of [
      "github-repo-review",
      "wordpress-theme-verification-agent",
    ]) {
      const run = await runLibraryAgent(
        {
          repositoryRoot,
          agentId,
          workspace,
          task: "Audit this fixture repository.",
        },
        new ReviewModel(),
      );
      expect(run.model).toBe("fixture-model:latest");
      expect(run.result.summary).toContain("fixture");
      expect(run.result.scopeReviewed).toEqual(evidencePaths);
      await expect(
        readFile(path.join(run.reportDirectory, "report.md"), "utf8"),
      ).resolves.toContain(`${run.agent.name} report`);
      await expect(
        readFile(path.join(run.reportDirectory, "trace.jsonl"), "utf8"),
      ).resolves.toContain('"tool":"list_files"');
    }
  });
});
