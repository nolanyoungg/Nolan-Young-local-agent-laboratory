import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceGuard, WorkspaceLock } from "../src/index.js";
describe("WorkspaceGuard", () => {
  it("resolves normal paths and enforces policies", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guard-"));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "a.ts"), "ok");
    const guard = await WorkspaceGuard.create(root, {
      read: ["**"],
      write: ["src/**"],
    });
    expect(await guard.resolve("src/a.ts")).toBe(
      path.join(guard.root, "src", "a.ts"),
    );
    await expect(guard.resolve("README.md", "write")).rejects.toThrow(
      "write denied",
    );
  });
  it("rejects traversal, outside absolute paths, forbidden files, and symlink escapes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guard-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "outside-"));
    await writeFile(path.join(outside, "secret"), "x");
    const guard = await WorkspaceGuard.create(root, {
      read: ["**"],
      write: ["**"],
    });
    await expect(guard.resolve("../outside")).rejects.toThrow();
    await expect(guard.resolve(path.join(outside, "secret"))).rejects.toThrow();
    await expect(guard.resolve(".env")).rejects.toThrow();
    try {
      await symlink(outside, path.join(root, "escape"), "junction");
      await expect(guard.resolve("escape/secret")).rejects.toThrow("Symlink");
    } catch (error) {
      if (process.platform !== "win32") throw error;
    }
  });
  it("prevents concurrent mutation locks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lock-"));
    const first = new WorkspaceLock(root);
    const second = new WorkspaceLock(root);
    await first.acquire();
    await expect(second.acquire()).rejects.toThrow("already locked");
    await first.release();
    await second.acquire();
    await second.release();
  });
});
