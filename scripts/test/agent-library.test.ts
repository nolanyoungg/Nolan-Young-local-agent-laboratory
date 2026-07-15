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
    "patterns/hero.php",
    "styles/contrast.json",
    "assets/fonts/test.woff2",
    "assets/images/test.webp",
    "style.css",
  ];
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const call = this.call++;
    const content =
      call === 0
        ? JSON.stringify({ type: "list_files", path: "." })
        : call === 1
          ? JSON.stringify({
              type: "finish",
              result: {
                summary: "Finished too early.",
                scopeReviewed: [],
                findings: [],
                limitations: [],
                recommendedNextSteps: [],
              },
            })
          : call <= 5
            ? JSON.stringify({
                type: "search_text",
                path: ".",
                query: `missing-${call}`,
                caseSensitive: true,
              })
            : call <= 12
              ? JSON.stringify({
                  type: "read_file",
                  path: this.evidencePaths[call - 6],
                })
              : call === 13
                ? JSON.stringify({
                    type: "read_file",
                    path: this.evidencePaths[7],
                  })
                : call <= 15
                  ? JSON.stringify({
                      type: "read_file_metadata",
                      path: this.evidencePaths[call - 7],
                    })
                  : call === 16
                    ? JSON.stringify({
                        type: "read_file",
                        path: this.evidencePaths[9],
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
      "wordpress-speed-review-agent",
    ]);
    expect(entries.skills).toEqual([
      "evidence-based-review",
      "repo-auditor",
      "wordpress-performance-audit",
    ]);
    for (const agentId of entries.agents) {
      const agent = await loadAgent(repositoryRoot, agentId);
      expect(agent.tools).toEqual([
        "list_files",
        "read_file",
        "read_file_metadata",
        "search_text",
      ]);
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
    const reports = await mkdtemp(
      path.join(os.tmpdir(), "agent-library-reports-"),
    );
    const evidencePaths = [
      "functions.php",
      "theme.json",
      "package.json",
      "templates/index.html",
      "parts/header.html",
      "patterns/hero.php",
      "styles/contrast.json",
      "assets/fonts/test.woff2",
      "assets/images/test.webp",
      "style.css",
    ];
    for (const evidencePath of evidencePaths) {
      const target = path.join(workspace, evidencePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `Fixture ${evidencePath}\n`, "utf8");
    }
    for (const agentId of [
      "github-repo-review",
      "wordpress-speed-review-agent",
    ]) {
      const run = await runLibraryAgent(
        {
          repositoryRoot,
          agentId,
          workspace,
          task: "Audit this fixture repository.",
          reportDirectory: reports,
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
      await expect(
        readFile(path.join(run.reportDirectory, "trace.jsonl"), "utf8"),
      ).resolves.toContain(
        '"tool":"finish","reason":"Final result did not satisfy its schema"',
      );
      await expect(
        readFile(path.join(run.reportDirectory, "trace.jsonl"), "utf8"),
      ).resolves.toContain('"code":"EVIDENCE_COVERAGE_REQUIRED"');
      await expect(
        readFile(path.join(run.reportDirectory, "trace.jsonl"), "utf8"),
      ).resolves.toContain('"code":"BINARY_METADATA_REQUIRED"');
    }
  });
});
