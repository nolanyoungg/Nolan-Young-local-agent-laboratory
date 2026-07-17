import type { ModelConfig } from "@laboratory/shared-types";
import type { ModelHealth } from "./LocalModelClient.js";
export async function checkOllamaHealth(
  config: ModelConfig,
): Promise<ModelHealth> {
  try {
    const response = await fetch(new URL("/api/tags", config.baseUrl), {
      ...(process.env.OLLAMA_API_KEY
        ? { headers: { authorization: `Bearer ${process.env.OLLAMA_API_KEY}` } }
        : {}),
      signal: AbortSignal.timeout(Math.min(config.timeoutMilliseconds, 5_000)),
    });
    if (!response.ok)
      return {
        healthy: false,
        providerReachable: true,
        modelInstalled: false,
        message: `Ollama health endpoint returned HTTP ${response.status}.`,
      };
    const body: unknown = await response.json();
    const models =
      typeof body === "object" &&
      body !== null &&
      "models" in body &&
      Array.isArray(body.models)
        ? body.models
        : [];
    const installed = models.some(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "name" in item &&
        item.name === config.model,
    );
    return {
      healthy: installed,
      providerReachable: true,
      modelInstalled: installed,
      message: installed
        ? `Ollama is ready with ${config.model}.`
        : `Ollama is running, but ${config.model} is not installed. Run: ollama pull ${config.model}`,
    };
  } catch (error) {
    return {
      healthy: false,
      providerReachable: false,
      modelInstalled: false,
      message:
        `Ollama is unavailable at ${config.baseUrl}. Start Ollama locally and retry. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }
}
