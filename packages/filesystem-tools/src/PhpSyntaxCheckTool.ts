import { lstat } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  phpSyntaxCheckActionSchema,
  type ToolResult,
} from "@laboratory/shared-types";
import type { WorkspaceGuard } from "@laboratory/workspace-security";

export class PhpSyntaxCheckTool {
  constructor(
    private readonly guard: WorkspaceGuard,
    private readonly phpExecutable = "php",
  ) {}

  async execute(input: unknown): Promise<ToolResult> {
    const action = phpSyntaxCheckActionSchema.parse(input);
    const target = await this.guard.resolve(action.path, "read");
    if (!(await lstat(target)).isFile())
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Target is not a regular PHP file",
        },
      };
    return new Promise((resolve) => {
      const child = spawn(this.phpExecutable, ["-l", target], {
        shell: false,
        windowsHide: true,
      });
      const timer = setTimeout(() => child.kill(), 15_000);
      let output = "";
      child.stdout.on("data", (data: Buffer) => {
        output += data.toString("utf8");
      });
      child.stderr.on("data", (data: Buffer) => {
        output += data.toString("utf8");
      });
      child.once("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          error: {
            code:
              error.code === "ENOENT" ? "PHP_UNAVAILABLE" : "PHP_CHECK_FAILED",
            message:
              error.code === "ENOENT"
                ? "PHP executable is unavailable; no syntax check was run."
                : "PHP syntax check could not run.",
          },
        });
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        const bounded = output.slice(0, 8_192);
        resolve(
          code === 0
            ? { ok: true, output: bounded || "PHP syntax check passed." }
            : {
                ok: false,
                error: {
                  code: "PHP_SYNTAX_ERROR",
                  message: bounded || "PHP reported a syntax error.",
                },
              },
        );
      });
    });
  }
}
