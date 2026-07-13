import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceGuard } from "@laboratory/workspace-security";
import { FilesystemTools } from "../src/index.js";
describe("FilesystemTools", () => {
  it("lists, reads, searches, writes atomically, and honors dry-run", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tools-"));
    await writeFile(path.join(root, "a.txt"), "hello\n");
    const tools = new FilesystemTools(
      await WorkspaceGuard.create(root, { read: ["**"], write: ["**"] }),
    );
    expect(
      (await tools.execute({ type: "list_files", path: "." })).output,
    ).toEqual(["a.txt"]);
    expect(
      (await tools.execute({ type: "search_text", path: ".", query: "hello" }))
        .output,
    ).toContain("a.txt:1");
    await tools.execute({
      type: "write_file",
      path: "a.txt",
      content: "changed",
      dryRun: true,
    });
    expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("hello\n");
    const result = await tools.execute({
      type: "write_file",
      path: "a.txt",
      content: "changed",
      dryRun: false,
    });
    expect(result.ok).toBe(true);
    expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("changed");
  });
  it("rejects binary data and rolls back failed patches", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tools-"));
    await writeFile(path.join(root, "binary"), Buffer.from([0, 1, 2]));
    await writeFile(path.join(root, "a.txt"), "original");
    const tools = new FilesystemTools(
      await WorkspaceGuard.create(root, { read: ["**"], write: ["**"] }),
    );
    expect(
      (await tools.execute({ type: "read_file", path: "binary" })).error?.code,
    ).toBe("BINARY_FILE");
    expect(
      (
        await tools.execute({
          type: "apply_patch",
          path: "a.txt",
          patch: "missing\n---REPLACE-WITH---\nnew",
          dryRun: false,
        })
      ).error?.code,
    ).toBe("HUNK_FAILED");
    expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("original");
  });
  it("applies an exact patch and reports output truncation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tools-"));
    await writeFile(path.join(root, "a.txt"), `before\n${"x".repeat(200)}`);
    const guard = await WorkspaceGuard.create(root, {
      read: ["**"],
      write: ["**"],
    });
    const tools = new FilesystemTools(guard);
    const patched = await tools.execute({
      type: "apply_patch",
      path: "a.txt",
      patch: "before\n---REPLACE-WITH---\nafter",
      dryRun: false,
    });
    expect(patched.ok).toBe(true);
    expect(await readFile(path.join(root, "a.txt"), "utf8")).toContain("after");
    const { ReadFileTool } = await import("../src/ReadFileTool.js");
    const truncated = await new ReadFileTool(guard, 1_000, 20).execute({
      type: "read_file",
      path: "a.txt",
    });
    expect(truncated.truncated).toBe(true);
    expect(truncated.returnedBytes).toBeLessThanOrEqual(20);
  });
});
