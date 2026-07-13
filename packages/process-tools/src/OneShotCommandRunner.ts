import { spawn } from "node:child_process";
import type { CommandDefinition } from "./CommandAllowlist.js";
import { ProcessLogStore } from "./ProcessLogStore.js";
import {
  ProcessStatusStore,
  type ProcessStatus,
} from "./ProcessStatusStore.js";
import { terminateProcess } from "./ProcessTermination.js";
import { ProcessToolError } from "./errors.js";
export interface ProcessResult extends ProcessStatus {
  readonly stoppedAt: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}
export const resolveExecutable = (
  command: CommandDefinition,
): { executable: string; arguments: string[] } => {
  const npmCli = process.env.npm_execpath;
  const useNodeNpm = command.executable === "npm" && npmCli !== undefined;
  return {
    executable: useNodeNpm ? process.execPath : command.executable,
    arguments: useNodeNpm
      ? [npmCli, ...command.arguments]
      : [...command.arguments],
  };
};
export const buildEnvironment = (
  command: CommandDefinition,
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of command.environmentAllowlist) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return { ...environment, ...command.environment };
};
export class OneShotCommandRunner {
  constructor(
    private readonly logs: ProcessLogStore,
    private readonly statuses: ProcessStatusStore,
  ) {}
  async run(
    commandIdentifier: string,
    command: CommandDefinition,
  ): Promise<ProcessResult> {
    const resolved = resolveExecutable(command);
    const startedAt = new Date().toISOString();
    let timedOut = false;
    const child = spawn(resolved.executable, resolved.arguments, {
      cwd: command.workingDirectory,
      env: buildEnvironment(command),
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const id = `${commandIdentifier}-${child.pid ?? "pending"}-${Date.now()}`;
    this.logs.initialize(id);
    const initial: ProcessStatus = {
      id,
      commandIdentifier,
      ...(child.pid === undefined ? {} : { pid: child.pid }),
      state: "running",
      startedAt,
      timedOut,
    };
    this.statuses.set(initial);
    child.stdout.on("data", (chunk: Buffer) =>
      this.logs.append(id, "stdout", chunk),
    );
    child.stderr.on("data", (chunk: Buffer) =>
      this.logs.append(id, "stderr", chunk),
    );
    const timer = setTimeout(() => {
      timedOut = true;
      void terminateProcess(child);
    }, command.timeoutMilliseconds);
    try {
      const outcome = await new Promise<{
        exitCode: number | null;
        signal: NodeJS.Signals | null;
      }>((resolve, reject) => {
        child.once("error", (error) =>
          reject(
            new ProcessToolError(
              "SPAWN_FAILED",
              `Failed to start command ${commandIdentifier}`,
              error,
            ),
          ),
        );
        child.once("exit", (exitCode, signal) => resolve({ exitCode, signal }));
      });
      const stoppedAt = new Date().toISOString();
      const logs = this.logs.get(id) ?? {
        stdout: "",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      };
      const state =
        outcome.exitCode === 0 && !timedOut ? "completed" : "failed";
      const status: ProcessStatus = {
        ...initial,
        state,
        stoppedAt,
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        timedOut,
      };
      this.statuses.set(status);
      return {
        ...status,
        stoppedAt,
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        ...logs,
      };
    } finally {
      clearTimeout(timer);
      await terminateProcess(child);
    }
  }
}
