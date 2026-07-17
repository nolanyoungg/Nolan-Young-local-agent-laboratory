import { afterEach, describe, expect, it, vi } from "vitest";
import { modelConfigSchema } from "@laboratory/shared-types";
import {
  MockModelClient,
  OllamaModelClient,
  checkOllamaHealth,
  createModelClient,
} from "../src/index.js";

const config = modelConfigSchema.parse({
  timeoutMilliseconds: 50,
  retryCount: 0,
});
const request = {
  messages: [{ role: "user" as const, content: "test" }],
  config,
};

afterEach(() => vi.unstubAllGlobals());

describe("local model clients", () => {
  it("provides deterministic mock responses", async () => {
    const mock = new MockModelClient(["first", "second"]);
    await expect(mock.complete(request)).resolves.toMatchObject({
      content: "first",
    });
    await expect(mock.complete(request)).resolves.toMatchObject({
      content: "second",
    });
    expect(mock.calls).toBe(2);
  });

  it("rejects unsupported providers without hosted fallback", () => {
    expect(() => createModelClient("openai")).toThrow("Ollama only");
    expect(() => createModelClient("mock")).toThrow("Ollama only");
  });

  it("allows deliberately configured remote Ollama endpoints but rejects embedded credentials", () => {
    expect(
      modelConfigSchema.parse({ baseUrl: "https://models.example.com" })
        .baseUrl,
    ).toBe("https://models.example.com");
    expect(() =>
      modelConfigSchema.parse({ baseUrl: "http://token@localhost:11434" }),
    ).toThrow("embedded credentials");
  });

  it("maps empty and malformed Ollama responses to actionable errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: { content: "" } }), {
          status: 200,
        }),
      ),
    );
    await expect(
      new OllamaModelClient().complete(request),
    ).rejects.toMatchObject({ code: "EMPTY_RESPONSE" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ nope: true }), { status: 200 }),
        ),
    );
    await expect(
      new OllamaModelClient().complete(request),
    ).rejects.toMatchObject({ code: "MALFORMED_OUTPUT" });
  });

  it("forwards an explicit structured-output schema to Ollama", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: config.model,
          done: true,
          message: { content: '{"type":"finish","result":{}}' },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const format = {
      type: "object",
      properties: { type: { type: "string", const: "finish" } },
      required: ["type"],
      additionalProperties: false,
    };
    await new OllamaModelClient().complete({
      ...request,
      responseFormat: format,
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init).toBeDefined();
    expect(JSON.parse(String(init?.body))).toMatchObject({ format });
  });

  it("maps rejected structured-output requests without retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{"error":"bad grammar"}', { status: 400 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new OllamaModelClient().complete({
        ...request,
        responseFormat: { oneOf: [] },
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a missing model through health checking", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ models: [] }), { status: 200 }),
        ),
    );
    await expect(checkOllamaHealth(config)).resolves.toMatchObject({
      healthy: false,
      providerReachable: true,
      modelInstalled: false,
    });
  });

  it("surfaces request timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: URL, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    await expect(
      new OllamaModelClient().complete(request),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
