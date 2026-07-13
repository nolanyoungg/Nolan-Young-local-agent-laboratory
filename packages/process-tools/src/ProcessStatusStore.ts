export type ManagedProcessState =
  "starting" | "running" | "completed" | "failed" | "stopped";
export interface ProcessStatus {
  readonly id: string;
  readonly commandIdentifier: string;
  readonly pid?: number;
  readonly state: ManagedProcessState;
  readonly startedAt: string;
  readonly stoppedAt?: string;
  readonly exitCode?: number | null;
  readonly signal?: NodeJS.Signals | null;
  readonly timedOut: boolean;
}
export class ProcessStatusStore {
  private readonly statuses = new Map<string, ProcessStatus>();
  set(status: ProcessStatus): void {
    this.statuses.set(status.id, status);
  }
  get(id: string): ProcessStatus | undefined {
    return this.statuses.get(id);
  }
  list(): readonly ProcessStatus[] {
    return [...this.statuses.values()];
  }
}
