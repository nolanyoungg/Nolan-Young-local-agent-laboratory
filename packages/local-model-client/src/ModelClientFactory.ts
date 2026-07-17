import type { LocalModelClient } from "./LocalModelClient.js";
import { OllamaModelClient } from "./OllamaModelClient.js";
import { ModelClientError } from "./errors.js";
export function createModelClient(
  provider: string = "ollama",
): LocalModelClient {
  if (provider === "ollama") return new OllamaModelClient();
  throw new ModelClientError(
    "UNKNOWN_PROVIDER",
    `Unsupported model provider: ${provider}. This library supports Ollama only.`,
  );
}
