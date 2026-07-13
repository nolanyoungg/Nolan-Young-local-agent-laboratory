import {
  modelResponseSchema,
  type ModelRequest,
  type ModelResponse,
} from "@laboratory/shared-types";
import type { LocalModelClient, ModelHealth } from "./LocalModelClient.js";
import { checkOllamaHealth } from "./OllamaHealthCheck.js";
import { ModelClientError } from "./errors.js";
const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
export class OllamaModelClient implements LocalModelClient {
  async complete(request: ModelRequest): Promise<ModelResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= request.config.retryCount; attempt += 1) {
      try {
        return await this.completeOnce(request);
      } catch (error) {
        lastError = error;
        if (
          !(error instanceof ModelClientError) ||
          !error.retryable ||
          attempt === request.config.retryCount
        )
          throw error;
        await delay(request.config.retryDelayMilliseconds * (attempt + 1));
      }
    }
    throw lastError;
  }
  async healthCheck(config: ModelRequest["config"]): Promise<ModelHealth> {
    return checkOllamaHealth(config);
  }
  private async completeOnce(request: ModelRequest): Promise<ModelResponse> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      request.config.timeoutMilliseconds,
    );
    try {
      const response = await fetch(
        new URL("/api/chat", request.config.baseUrl),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: request.config.model,
            messages: request.messages.map(({ role, content }) => ({
              role,
              content,
            })),
            stream: false,
            options: {
              temperature: request.config.temperature,
              num_ctx: request.config.contextTokens,
            },
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        if (response.status === 404)
          throw new ModelClientError(
            "MODEL_NOT_INSTALLED",
            `Ollama does not have model ${request.config.model}. Run: ollama pull ${request.config.model}`,
          );
        throw new ModelClientError(
          "CONNECTION_FAILURE",
          `Ollama returned HTTP ${response.status}.`,
          response.status >= 500,
        );
      }
      const raw: unknown = await response.json();
      if (
        typeof raw !== "object" ||
        raw === null ||
        !("message" in raw) ||
        typeof raw.message !== "object" ||
        raw.message === null ||
        !("content" in raw.message) ||
        typeof raw.message.content !== "string"
      )
        throw new ModelClientError(
          "MALFORMED_OUTPUT",
          "Ollama returned a malformed chat response.",
        );
      const content = raw.message.content.trim();
      if (!content)
        throw new ModelClientError(
          "EMPTY_RESPONSE",
          "Ollama returned an empty model response.",
          true,
        );
      return modelResponseSchema.parse({
        content,
        model:
          "model" in raw && typeof raw.model === "string"
            ? raw.model
            : request.config.model,
        done: "done" in raw && typeof raw.done === "boolean" ? raw.done : true,
        promptTokens:
          "prompt_eval_count" in raw ? raw.prompt_eval_count : undefined,
        completionTokens: "eval_count" in raw ? raw.eval_count : undefined,
      });
    } catch (error) {
      if (error instanceof ModelClientError) throw error;
      if (error instanceof DOMException && error.name === "AbortError")
        throw new ModelClientError(
          "TIMEOUT",
          `Ollama request exceeded ${request.config.timeoutMilliseconds}ms.`,
          true,
          error,
        );
      throw new ModelClientError(
        "OLLAMA_UNAVAILABLE",
        `Could not connect to local Ollama at ${request.config.baseUrl}.`,
        true,
        error,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
