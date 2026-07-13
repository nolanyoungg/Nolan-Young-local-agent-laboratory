import { z } from "zod";
export const defaultForbiddenPatterns = [
  ".git",
  ".git/**",
  ".env",
  ".env.*",
  "node_modules",
  "node_modules/**",
  "**/*.key",
  "**/*.pem",
  "**/*.p12",
  "**/*.pfx",
  "**/*.crt",
  "**/*.cer",
  "**/id_rsa*",
  "**/id_ed25519*",
  "**/.ssh/**",
  "**/*credentials*",
  "**/*credential*",
  "**/.npm/**",
  "**/.yarn/**",
  "**/.pnpm-store/**",
  "reports",
  "reports/**",
  "workspaces",
  "workspaces/**",
  ".agent-laboratory.lock",
] as const;
export const pathPolicySchema = z.object({
  read: z.array(z.string().min(1)).default(["**"]),
  write: z.array(z.string().min(1)).default([]),
  forbidden: z.array(z.string().min(1)).default([]),
  ignore: z.array(z.string().min(1)).default([]),
  maxPathLength: z.number().int().positive().max(32_768).default(4_096),
  maxDepth: z.number().int().positive().max(256).default(64),
});
export type PathPolicy = z.input<typeof pathPolicySchema>;
export type ResolvedPathPolicy = z.output<typeof pathPolicySchema>;
