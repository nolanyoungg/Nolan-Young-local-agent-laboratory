import { z } from "zod";

export const agentMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  name: z.string().min(1).optional(),
});
export type AgentMessage = z.infer<typeof agentMessageSchema>;

export const modelConfigSchema = z.object({
  provider: z.literal("ollama").default("ollama"),
  baseUrl: z
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "http:" &&
        url.username === "" &&
        url.password === "" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      );
    }, "Ollama URL must use a loopback host")
    .default("http://127.0.0.1:11434"),
  model: z.string().min(1).default("qwen2.5-coder:14b"),
  timeoutMilliseconds: z.number().int().positive().default(180_000),
  temperature: z.number().min(0).max(2).default(0.1),
  contextTokens: z.number().int().positive().default(32_768),
  retryCount: z.number().int().min(0).max(5).default(2),
  retryDelayMilliseconds: z.number().int().nonnegative().default(500),
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;

export const modelRequestSchema = z.object({
  messages: z.array(agentMessageSchema).min(1),
  config: modelConfigSchema,
});
export type ModelRequest = z.infer<typeof modelRequestSchema>;

export const modelResponseSchema = z.object({
  content: z.string().min(1),
  model: z.string().min(1),
  done: z.boolean(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
});
export type ModelResponse = z.infer<typeof modelResponseSchema>;
