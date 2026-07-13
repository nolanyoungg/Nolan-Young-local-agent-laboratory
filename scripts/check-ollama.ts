import { modelConfigSchema } from "@laboratory/shared-types";
import { OllamaModelClient } from "@laboratory/local-model-client";
const config = modelConfigSchema.parse({
  baseUrl: process.env.OLLAMA_BASE_URL,
  model: process.env.OLLAMA_MODEL,
});
const result = await new OllamaModelClient().healthCheck(config);
console.log(result.message);
process.exitCode = result.healthy ? 0 : 1;
