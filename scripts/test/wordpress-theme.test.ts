import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseThemeHeader, verifyWordPressTheme } from "../wordpress-theme.js";

describe("WordPress static structure verification", () => {
  it("parses a usable Theme Name header", () => {
    expect(parseThemeHeader("/*\nTheme Name: Example\n*/")).toBe("Example");
    expect(parseThemeHeader("/* Theme Name:  */")).toBeUndefined();
  });
  it("verifies named classic, block, missing-style, and invalid-header fixtures", async () => {
    const fixture = (name: string): string =>
      path.resolve(import.meta.dirname, "fixtures", "wordpress-themes", name);
    await expect(
      verifyWordPressTheme(fixture("valid-classic")),
    ).resolves.toMatchObject({
      themeType: "classic",
      verdict: "valid-static-structure",
    });
    await expect(
      verifyWordPressTheme(fixture("valid-block")),
    ).resolves.toMatchObject({
      themeType: "block",
      verdict: "valid-static-structure",
    });
    await expect(
      verifyWordPressTheme(fixture("missing-style")),
    ).resolves.toMatchObject({
      verdict: "invalid-static-structure",
    });
    await expect(
      verifyWordPressTheme(fixture("invalid-header")),
    ).resolves.toMatchObject({
      verdict: "invalid-static-structure",
    });
    await expect(
      verifyWordPressTheme(fixture("invalid-theme-json")),
    ).resolves.toMatchObject({
      verdict: "invalid-static-structure",
    });
    await expect(
      verifyWordPressTheme(fixture("missing-classic-entry")),
    ).resolves.toMatchObject({
      verdict: "invalid-static-structure",
      themeType: "unknown",
    });
    await expect(
      verifyWordPressTheme(fixture("not-a-theme")),
    ).resolves.toMatchObject({
      verdict: "invalid-static-structure",
      themeType: "unknown",
    });
  });
  it("classifies classic, block, hybrid, and invalid structures", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wp-theme-"));
    await writeFile(path.join(root, "style.css"), "/*\nTheme Name: Test\n*/");
    await writeFile(path.join(root, "index.php"), "<?php");
    await expect(verifyWordPressTheme(root)).resolves.toMatchObject({
      themeType: "classic",
      verdict: "valid-static-structure",
    });
    await mkdir(path.join(root, "templates"));
    await writeFile(
      path.join(root, "templates", "index.html"),
      "<!-- wp:group /-->",
    );
    await expect(verifyWordPressTheme(root)).resolves.toMatchObject({
      themeType: "hybrid",
      verdict: "valid-static-structure",
    });
    await writeFile(path.join(root, "theme.json"), "{");
    await expect(verifyWordPressTheme(root)).resolves.toMatchObject({
      verdict: "invalid-static-structure",
    });
  });
});
