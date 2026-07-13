import { mkdir, open, rm, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { WorkspaceSecurityError } from "./errors.js";
export class WorkspaceLock {
  private handle: FileHandle | undefined;
  private readonly lockPath: string;
  constructor(root: string) {
    this.lockPath = path.join(root, ".agent-laboratory.lock");
  }
  get acquired(): boolean {
    return this.handle !== undefined;
  }
  async acquire(): Promise<void> {
    if (this.handle) return;
    await mkdir(path.dirname(this.lockPath), { recursive: true });
    try {
      this.handle = await open(this.lockPath, "wx", 0o600);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "EEXIST"
      )
        throw new WorkspaceSecurityError(
          "INVALID_PATH",
          "Unable to create workspace lock",
          error,
        );
      throw new WorkspaceSecurityError(
        "WORKSPACE_LOCKED",
        "Workspace is already locked by another mutating workflow",
        error,
      );
    }
    try {
      await this.handle.writeFile(
        JSON.stringify({
          pid: process.pid,
          acquiredAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      await this.release();
      throw new WorkspaceSecurityError(
        "INVALID_PATH",
        "Unable to initialize workspace lock",
        error,
      );
    }
  }
  async release(): Promise<void> {
    if (!this.handle) return;
    const handle = this.handle;
    this.handle = undefined;
    try {
      await handle.close();
    } finally {
      await rm(this.lockPath, { force: true });
    }
  }
}
