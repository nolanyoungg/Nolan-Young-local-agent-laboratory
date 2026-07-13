import { CommandAllowlist } from "./CommandAllowlist.js";
import {
  OneShotCommandRunner,
  type ProcessResult,
} from "./OneShotCommandRunner.js";
import { ProcessLogStore, type ProcessLogs } from "./ProcessLogStore.js";
import {
  ProcessStatusStore,
  type ProcessStatus,
} from "./ProcessStatusStore.js";
import { WatcherManager, type WatcherHandle } from "./WatcherManager.js";
import { ProcessToolError } from "./errors.js";
export class ProcessManager {
  readonly logs: ProcessLogStore;
  readonly statuses: ProcessStatusStore;
  private readonly oneShot: OneShotCommandRunner;
  private readonly watchers: WatcherManager;
  private signalsInstalled = false;
  constructor(
    private readonly allowlist: CommandAllowlist,
    maximumLogBytes = 100_000,
  ) {
    this.logs = new ProcessLogStore(maximumLogBytes);
    this.statuses = new ProcessStatusStore();
    this.oneShot = new OneShotCommandRunner(this.logs, this.statuses);
    this.watchers = new WatcherManager(this.logs, this.statuses);
  }
  async run(identifier: string): Promise<ProcessResult> {
    const command = this.allowlist.get(identifier);
    if (command.mode !== "one-shot")
      throw new ProcessToolError(
        "INVALID_COMMAND",
        `${identifier} is configured as a watcher`,
      );
    return this.oneShot.run(identifier, command);
  }
  async startWatcher(identifier: string): Promise<WatcherHandle> {
    const command = this.allowlist.get(identifier);
    if (command.mode !== "watcher")
      throw new ProcessToolError(
        "INVALID_COMMAND",
        `${identifier} is not configured as a watcher`,
      );
    this.installSignalHandlers();
    return this.watchers.start(identifier, command);
  }
  getLogs(id: string): ProcessLogs {
    const logs = this.logs.get(id);
    if (!logs)
      throw new ProcessToolError("UNKNOWN_PROCESS", `Unknown process: ${id}`);
    return logs;
  }
  getStatus(id: string): ProcessStatus {
    const status = this.statuses.get(id);
    if (!status)
      throw new ProcessToolError("UNKNOWN_PROCESS", `Unknown process: ${id}`);
    return status;
  }
  async stopAll(): Promise<void> {
    await this.watchers.stopAll();
  }
  private installSignalHandlers(): void {
    if (this.signalsInstalled) return;
    this.signalsInstalled = true;
    const stop = (): void => {
      void this.stopAll();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
}
