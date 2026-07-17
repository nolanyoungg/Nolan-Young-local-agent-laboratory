import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceGuard } from "@laboratory/workspace-security";
import { FilesystemTools } from "../src/index.js";
import { PhpSyntaxCheckTool } from "../src/PhpSyntaxCheckTool.js";

describe("read-only filesystem tools", () => {
  it("lists, reads, searches, and rejects binary content", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tools-"));
    await writeFile(path.join(root, "a.txt"), "hello\n");
    await writeFile(path.join(root, "binary"), Buffer.from([0, 1, 2]));
    const tools = new FilesystemTools(
      await WorkspaceGuard.create(root, { read: ["**"], write: [] }),
    );
    expect(
      (await tools.execute({ type: "list_files", path: "." })).output,
    ).toEqual(["a.txt", "binary"]);
    expect(
      (await tools.execute({ type: "search_text", path: ".", query: "hello" }))
        .output,
    ).toContain("a.txt:1");
    expect(
      (await tools.execute({ type: "read_file", path: "binary" })).error?.code,
    ).toBe("BINARY_FILE");
  });

  it("blocks traversal and PHP checks on non-PHP paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tools-"));
    await writeFile(path.join(root, "a.txt"), "hello");
    const tools = new FilesystemTools(
      await WorkspaceGuard.create(root, { read: ["**"], write: [] }),
    );
    await expect(
      tools.execute({ type: "read_file", path: "../secret" }),
    ).rejects.toThrow("traversal");
    await expect(
      tools.execute({ type: "php_syntax_check", path: "a.txt" }),
    ).rejects.toThrow(".php");
  });

  it("uses only php -l and safely reports an unavailable PHP executable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tools-"));
    await writeFile(path.join(root, "a.php"), "<?php\nreturn true;\n");
    const guard = await WorkspaceGuard.create(root, {
      read: ["**"],
      write: [],
    });
    const result = await new PhpSyntaxCheckTool(
      guard,
      "php-not-installed-for-test",
    ).execute({
      type: "php_syntax_check",
      path: "a.php",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "PHP_UNAVAILABLE" },
    });
  });
});
