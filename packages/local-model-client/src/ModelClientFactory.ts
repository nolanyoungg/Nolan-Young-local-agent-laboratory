import type { LocalModelClient } from "./LocalModelClient.js";
import { MockModelClient } from "./MockModelClient.js";
import { OllamaModelClient } from "./OllamaModelClient.js";
import { ModelClientError } from "./errors.js";
export function createModelClient(
  provider: string = "ollama",
): LocalModelClient {
  if (provider === "ollama") return new OllamaModelClient();
  if (provider === "mock") return new MockModelClient();
  throw new ModelClientError(
    "UNKNOWN_PROVIDER",
    `Unsupported local model provider: ${provider}`,
  );
}
