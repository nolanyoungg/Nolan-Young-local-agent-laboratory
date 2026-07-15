import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { CommandDefinition } from "./CommandAllowlist.js";
import { buildEnvironment, resolveExecutable } from "./OneShotCommandRunner.js";
import { ProcessLogStore, type ProcessLogs } from "./ProcessLogStore.js";
import {
  ProcessStatusStore,
  type ProcessStatus,
} from "./ProcessStatusStore.js";
import { terminateProcess } from "./ProcessTermination.js";
import { ProcessToolError } from "./errors.js";
export interface WatcherHandle {
  readonly id: string;
  readonly pid?: number;
  logs(): ProcessLogs;
  status(): ProcessStatus;
  waitForInitialStatus(): Promise<ProcessStatus>;
  stop(): Promise<void>;
}
export class WatcherManager {
  private readonly children = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly intentionalStops = new Set<string>();
  constructor(
    private readonly logs: ProcessLogStore,
    private readonly statuses: ProcessStatusStore,
  ) {}
  start(commandIdentifier: string, command: CommandDefinition): WatcherHandle {
    const resolved = resolveExecutable(command);
    const startedAt = new Date().toISOString();
    const child = spawn(resolved.executable, resolved.arguments, {
      cwd: command.workingDirectory,
      env: buildEnvironment(command),
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const id = `${commandIdentifier}-${child.pid ?? "pending"}-${Date.now()}`;
    this.children.set(id, child);
    this.logs.initialize(id);
    const initial: ProcessStatus = {
      id,
      commandIdentifier,
      ...(child.pid === undefined ? {} : { pid: child.pid }),
      state: "starting",
      startedAt,
      timedOut: false,
    };
    this.statuses.set(initial);
    child.stdout.on("data", (chunk: Buffer) => {
      this.logs.append(id, "stdout", chunk);
      if (this.statuses.get(id)?.state === "starting")
        this.statuses.set({ ...initial, state: "running" });
    });
    child.stderr.on("data", (chunk: Buffer) =>
      this.logs.append(id, "stderr", chunk),
    );
    child.once("exit", (exitCode, signal) => {
      const current = this.statuses.get(id) ?? initial;
      this.statuses.set({
        ...current,
        state:
          this.intentionalStops.has(id) || exitCode === 0
            ? "stopped"
            : "failed",
        stoppedAt: new Date().toISOString(),
        exitCode,
        signal,
      });
      this.intentionalStops.delete(id);
      this.children.delete(id);
    });
    const getStatus = (): ProcessStatus => {
      const value = this.statuses.get(id);
      if (!value)
        throw new ProcessToolError("UNKNOWN_PROCESS", `Unknown watcher: ${id}`);
      return value;
    };
    return {
      id,
      ...(child.pid === undefined ? {} : { pid: child.pid }),
      logs: () =>
        this.logs.get(id) ?? {
          stdout: "",
          stderr: "",
          stdoutTruncated: false,
          stderrTruncated: false,
        },
      status: getStatus,
      waitForInitialStatus: async () => {
        const deadline =
          Date.now() + Math.max(command.startupTimeoutMilliseconds, 500);
        let status = getStatus();
        while (status.state === "starting" && Date.now() < deadline) {
          await new Promise<void>((resolve) => setTimeout(resolve, 25));
          status = getStatus();
        }
        if (status.state === "failed" || status.state === "stopped")
          throw new ProcessToolError(
            "WATCHER_EARLY_EXIT",
            `Watcher ${commandIdentifier} exited during startup`,
          );
        if (status.state === "starting") {
          const running = { ...status, state: "running" as const };
          this.statuses.set(running);
          return running;
        }
        return status;
      },
      stop: async () => {
        this.intentionalStops.add(id);
        await terminateProcess(child);
        this.children.delete(id);
        const status = getStatus();
        if (!status.stoppedAt)
          this.statuses.set({
            ...status,
            state: "stopped",
            stoppedAt: new Date().toISOString(),
            signal: child.signalCode,
            exitCode: child.exitCode,
          });
      },
    };
  }
  async stopAll(): Promise<void> {
    for (const id of this.children.keys()) this.intentionalStops.add(id);
    await Promise.all(
      [...this.children.values()].map((child) => terminateProcess(child)),
    );
    this.children.clear();
  }
}
