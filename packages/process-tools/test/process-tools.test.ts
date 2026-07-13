import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CommandAllowlist, ProcessManager } from "../src/index.js";
const workspace = async (): Promise<string> =>
  mkdtemp(path.join(os.tmpdir(), "process-tools-"));
describe("process tools", () => {
  it("executes approved commands and captures separate logs", async () => {
    const manager = new ProcessManager(
      new CommandAllowlist({
        fixture: {
          executable: process.execPath,
          arguments: ["-e", "console.log('out'),console.error('err')"],
          workingDirectory: await workspace(),
          mode: "one-shot",
        },
      }),
    );
    const result = await manager.run("fixture");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("out");
    expect(result.stderr).toContain("err");
    expect(result.pid).toBeTypeOf("number");
  });
  it("rejects unknown identifiers and injected arguments", async () => {
    const root = await workspace();
    const manager = new ProcessManager(
      new CommandAllowlist({
        fixture: {
          executable: process.execPath,
          arguments: ["-e", "process.exit(0)"],
          workingDirectory: root,
        },
      }),
    );
    await expect(manager.run("raw-shell-command")).rejects.toThrow(
      "unregistered",
    );
    expect(
      () =>
        new CommandAllowlist({
          bad: {
            executable: process.execPath,
            arguments: ["ok;whoami"],
            workingDirectory: root,
          },
        }),
    ).toThrow();
  });
  it("terminates timed out commands", async () => {
    const manager = new ProcessManager(
      new CommandAllowlist({
        slow: {
          executable: process.execPath,
          arguments: ["-e", "setInterval(()=>{},1000)"],
          workingDirectory: await workspace(),
          timeoutMilliseconds: 50,
        },
      }),
    );
    const result = await manager.run("slow");
    expect(result.timedOut).toBe(true);
    expect(result.exitCode === 0).toBe(false);
  });
  it("detects watcher early exit and stops running watchers", async () => {
    const root = await workspace();
    const early = new ProcessManager(
      new CommandAllowlist({
        dev: {
          executable: process.execPath,
          arguments: ["-e", "process.exit(2)"],
          workingDirectory: root,
          mode: "watcher",
          startupTimeoutMilliseconds: 50,
        },
      }),
    );
    const failed = await early.startWatcher("dev");
    await expect(failed.waitForInitialStatus()).rejects.toThrow("startup");
    const runningManager = new ProcessManager(
      new CommandAllowlist({
        dev: {
          executable: process.execPath,
          arguments: ["-e", "console.log('ready'),setInterval(()=>{},1000)"],
          workingDirectory: root,
          mode: "watcher",
          startupTimeoutMilliseconds: 50,
        },
      }),
    );
    const running = await runningManager.startWatcher("dev");
    const startedWaiting = Date.now();
    await expect(running.waitForInitialStatus()).resolves.toMatchObject({
      state: "running",
    });
    expect(Date.now() - startedWaiting).toBeLessThan(3_000);
    await running.stop();
    expect(["stopped", "failed"]).toContain(running.status().state);
  });
});
