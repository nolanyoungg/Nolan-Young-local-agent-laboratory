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
import {
  AgentRunner,
  StructuredResponseParser,
  ToolRegistry,
} from "../src/index.js";
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
  it("supplies the exact permitted action schema to the model", async () => {
    const runner = await setup([
      (request) => {
        const system = request.messages.find(
          (message) => message.role === "system",
        )?.content;
        expect(system).toContain("STRUCTURED ACTION PROTOCOL");
        expect(system).toContain("file_path");
        expect(system).toContain('"const":"read_file"');
        expect(system).not.toContain('"const":"write_file"');
        expect(request.responseFormat).toBe("json");
        return JSON.stringify({ type: "finish", result: { ok: true } });
      },
    ]);
    await expect(
      runner.run(agent, "task", modelConfigSchema.parse({})),
    ).resolves.toEqual({ ok: true });
  });

  it("constrains the finish result with the agent output schema", async () => {
    const strictAgent: AgentDefinition = {
      ...agent,
      outputSchema: modelConfigSchema.pick({ model: true }),
    };
    const runner = await setup([
      (request) => {
        const system = request.messages.find(
          (message) => message.role === "system",
        )?.content;
        expect(system).toContain('"const":"finish"');
        expect(system).toContain('"required":["model"]');
        expect(request.responseFormat).toBe("json");
        return JSON.stringify({
          type: "finish",
          result: { model: "qwen2.5-coder:14b" },
        });
      },
    ]);
    await expect(
      runner.run(strictAgent, "task", modelConfigSchema.parse({})),
    ).resolves.toEqual({ model: "qwen2.5-coder:14b" });
  });

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

  it("returns schema-specific retry guidance and accepts a correction", async () => {
    const runner = await setup([
      JSON.stringify({ type: "read_file", file_path: "a" }),
      (request) => {
        const correction = request.messages.at(-1);
        expect(correction).toMatchObject({
          role: "tool",
          name: "validation_error",
        });
        expect(correction?.content).toContain("path");
        expect(correction?.content).toContain("exact property names");
        expect(correction?.content).toContain("read_file");
        return JSON.stringify({ type: "read_file", path: "a" });
      },
      JSON.stringify({ type: "finish", result: { ok: true } }),
    ]);
    await expect(
      runner.run(
        agent,
        "task",
        modelConfigSchema.parse({ retryDelayMilliseconds: 0 }),
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("documents mutation semantics and returns failed-tool recovery guidance", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "runtime-"));
    const registry = new ToolRegistry();
    let calls = 0;
    registry.register("apply_patch", {
      async execute(): Promise<ToolResult> {
        calls += 1;
        return calls === 1
          ? {
              ok: false,
              error: {
                code: "INVALID_PATCH",
                message: "Patch must contain one exact marker",
              },
            }
          : { ok: true, output: { path: "a", changed: true } };
      },
    });
    const mutator: AgentDefinition = {
      ...agent,
      permittedTools: ["apply_patch"],
    };
    const model = new MockModelClient([
      (request) => {
        const system = request.messages.find(
          (message) => message.role === "system",
        )?.content;
        expect(system).toContain("---REPLACE-WITH---");
        expect(system).toContain("not a unified diff");
        return JSON.stringify({
          type: "apply_patch",
          path: "a",
          patch: "bad",
        });
      },
      (request) => {
        const toolResult = request.messages.at(-1)?.content;
        expect(toolResult).toContain("did not take effect");
        expect(toolResult).toContain("INVALID_PATCH");
        return JSON.stringify({
          type: "apply_patch",
          path: "a",
          patch: "old\n---REPLACE-WITH---\nnew",
        });
      },
      JSON.stringify({ type: "finish", result: { ok: true } }),
    ]);
    await expect(
      new AgentRunner(
        model,
        registry,
        new TraceRecorder("run", path.join(root, "trace.jsonl")),
      ).run(mutator, "task", modelConfigSchema.parse({})),
    ).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
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
    const model = new MockModelClient([
      JSON.stringify({ type: "search_text", path: ".", query: "x" }),
    ]);
    const runner = new AgentRunner(
      model,
      new ToolRegistry(),
      new TraceRecorder("run", path.join(root, "trace.jsonl")),
    );
    await expect(
      runner.run(
        { ...agent, permittedTools: ["search_text"] },
        "task",
        modelConfigSchema.parse({ retryDelayMilliseconds: 0 }),
      ),
    ).rejects.toThrow("permits unregistered tool");
    expect(model.calls).toBe(0);
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

describe("StructuredResponseParser", () => {
  const parser = new StructuredResponseParser();

  it("accepts raw JSON and one isolated JSON fence", () => {
    expect(parser.parse('{"type":"read_file","path":"a"}')).toEqual({
      type: "read_file",
      path: "a",
    });
    expect(
      parser.parse('```json\n{"type":"read_file","path":"a"}\n```'),
    ).toEqual({ type: "read_file", path: "a" });
  });

  it("rejects commentary, multiple fences, aliases, and trailing objects", () => {
    expect(() =>
      parser.parse(
        'Here is the action:\n```json\n{"type":"read_file","path":"a"}\n```',
      ),
    ).toThrow("valid JSON");
    expect(() =>
      parser.parse(
        '```json\n{"type":"read_file","path":"a"}\n```\n```json\n{"type":"read_file","path":"b"}\n```',
      ),
    ).toThrow("valid JSON");
    expect(() => parser.parse('{"type":"read_file","file_path":"a"}')).toThrow(
      "action schema",
    );
    expect(() =>
      parser.parse('{"type":"read_file","path":"a","file_path":"ignored"}'),
    ).toThrow("action schema");
    expect(() =>
      parser.parse(
        '{"type":"read_file","path":"a"}{"type":"read_file","path":"b"}',
      ),
    ).toThrow("valid JSON");
  });
});
