import { modelConfigSchema } from "@laboratory/shared-types";
import { OllamaModelClient } from "@laboratory/local-model-client";
import { discoverOllamaModels } from "./agent-library.js";

const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const requestedModel = process.env.OLLAMA_MODEL;
const installed = await discoverOllamaModels(baseUrl);
const model = requestedModel ?? installed[0]?.name;
if (!model) throw new Error("Ollama is running but has no installed models");
const config = modelConfigSchema.parse({
  baseUrl,
  model,
});
const result = await new OllamaModelClient().healthCheck(config);
console.log(result.message);
process.exitCode = result.healthy ? 0 : 1;
