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
    expect(() => createModelClient("openai")).toThrow(
      "Unsupported local model provider",
    );
  });

  it("rejects non-loopback Ollama endpoints", () => {
    expect(() =>
      modelConfigSchema.parse({ baseUrl: "https://models.example.com" }),
    ).toThrow("loopback");
    expect(() =>
      modelConfigSchema.parse({ baseUrl: "http://token@localhost:11434" }),
    ).toThrow("loopback");
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
