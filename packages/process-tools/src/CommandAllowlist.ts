import { z } from "zod";
import { ProcessToolError } from "./errors.js";
const argumentSchema = z
  .string()
  .max(8_192)
  .refine(
    (value) => !/[;&|`\r\n]/.test(value),
    "Shell metacharacters are rejected",
  );
export const commandSchema = z.object({
  executable: z
    .string()
    .min(1)
    .max(1_024)
    .refine(
      (value) => !/[;&|`\r\n]/.test(value),
      "Executable contains shell metacharacters",
    ),
  arguments: z.array(argumentSchema).max(256).default([]),
  workingDirectory: z.string().min(1),
  timeoutMilliseconds: z
    .number()
    .int()
    .positive()
    .max(3_600_000)
    .default(120_000),
  startupTimeoutMilliseconds: z
    .number()
    .int()
    .positive()
    .max(300_000)
    .default(30_000),
  environment: z
    .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string())
    .default({}),
  environmentAllowlist: z
    .array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/))
    .default(["PATH", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP"]),
  mode: z.enum(["one-shot", "watcher"]).default("one-shot"),
  readyPattern: z.string().min(1).max(1_024).optional(),
  failurePattern: z.string().min(1).max(1_024).optional(),
});
export type CommandDefinition = z.infer<typeof commandSchema>;
export class CommandAllowlist {
  private readonly commands: ReadonlyMap<string, CommandDefinition>;
  constructor(commands: Record<string, unknown>) {
    this.commands = new Map(
      Object.entries(commands).map(([identifier, command]) => [
        identifier,
        commandSchema.parse(command),
      ]),
    );
  }
  get(identifier: string): CommandDefinition {
    const command = this.commands.get(identifier);
    if (!command)
      throw new ProcessToolError(
        "UNKNOWN_COMMAND",
        `Rejected unregistered command identifier: ${identifier}`,
      );
    return command;
  }
  identifiers(): readonly string[] {
    return [...this.commands.keys()].sort();
  }
}
