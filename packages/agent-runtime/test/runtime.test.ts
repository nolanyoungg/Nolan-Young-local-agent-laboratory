import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MockModelClient,
  ModelClientError,
  type MockResponse,
} from "@laboratory/local-model-client";
import {
  modelConfigSchema,
  type AgentDefinition,
  type ToolResult,
} from "@laboratory/shared-types";
import { TraceRecorder } from "@laboratory/tracing";
import { AgentRunner, ToolRegistry } from "../src/index.js";
const agent: AgentDefinition = {
  id: "test",
  name: "Test",
  description: "test",
  systemInstructions: "json",
  permittedTools: ["read_file"],
  maximumSteps: 3,
};
const setup = async (responses: MockResponse[]) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runtime-"));
  const registry = new ToolRegistry();
  registry.register("read_file", {
    async execute(): Promise<ToolResult> {
      return { ok: true, output: "evidence" };
    },
  });
  return new AgentRunner(
    new MockModelClient(responses),
    registry,
    new TraceRecorder("run", path.join(root, "trace.jsonl")),
  );
};
describe("AgentRunner", () => {
  it("completes a successful tool loop", async () => {
    const runner = await setup([
      JSON.stringify({ type: "read_file", path: "a" }),
      JSON.stringify({ type: "finish", result: { ok: true } }),
    ]);
    await expect(
      runner.run(agent, "task", modelConfigSchema.parse({})),
    ).resolves.toEqual({ ok: true });
  });
  it("rejects malformed and disallowed output", async () => {
    await expect(
      (await setup(["nope"])).run(agent, "task", modelConfigSchema.parse({})),
    ).rejects.toThrow("valid JSON");
    await expect(
      (
        await setup([
          JSON.stringify({ type: "write_file", path: "a", content: "x" }),
        ])
      ).run(agent, "task", modelConfigSchema.parse({})),
    ).rejects.toThrow("cannot use");
  });
  it("detects repetition and maximum steps", async () => {
    const repeated = JSON.stringify({ type: "read_file", path: "a" });
    await expect(
      (await setup([repeated, repeated, repeated])).run(
        agent,
        "task",
        modelConfigSchema.parse({}),
      ),
    ).rejects.toThrow("Repeated");
    const varied = [0, 1, 2].map((index) =>
      JSON.stringify({ type: "read_file", path: String(index) }),
    );
    await expect(
      (await setup(varied)).run(agent, "task", modelConfigSchema.parse({})),
    ).rejects.toThrow("maximum step");
  });
  it("rejects a permitted but unregistered tool", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "runtime-"));
    const runner = new AgentRunner(
      new MockModelClient([
        JSON.stringify({ type: "search_text", path: ".", query: "x" }),
      ]),
      new ToolRegistry(),
      new TraceRecorder("run", path.join(root, "trace.jsonl")),
    );
    await expect(
      runner.run(
        { ...agent, permittedTools: ["search_text"] },
        "task",
        modelConfigSchema.parse({ retryDelayMilliseconds: 0 }),
      ),
    ).rejects.toThrow("unregistered tool");
  });
  it("propagates a bounded model timeout", async () => {
    const runner = await setup([
      new ModelClientError("TIMEOUT", "model timed out"),
    ]);
    await expect(
      runner.run(
        agent,
        "task",
        modelConfigSchema.parse({ retryDelayMilliseconds: 0 }),
      ),
    ).rejects.toThrow("model timed out");
  });
});
