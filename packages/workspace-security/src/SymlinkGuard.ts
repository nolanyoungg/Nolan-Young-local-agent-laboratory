import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { WorkspaceSecurityError } from "./errors.js";
const isWithin = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};
export class SymlinkGuard {
  constructor(private readonly canonicalRoot: string) {}
  async assertNoEscape(target: string): Promise<void> {
    let cursor = target;
    for (;;) {
      try {
        const stat = await lstat(cursor);
        if (stat.isSymbolicLink()) {
          const canonical = await realpath(cursor);
          if (!isWithin(this.canonicalRoot, canonical))
            throw new WorkspaceSecurityError(
              "SYMLINK_ESCAPE",
              `Symlink escapes workspace: ${cursor}`,
            );
        }
      } catch (error) {
        if (error instanceof WorkspaceSecurityError) throw error;
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ENOENT"
        )
          throw new WorkspaceSecurityError(
            "INVALID_PATH",
            `Unable to inspect path: ${cursor}`,
            error,
          );
      }
      if (cursor === this.canonicalRoot) return;
      const parent = path.dirname(cursor);
      if (parent === cursor || !isWithin(this.canonicalRoot, parent))
        throw new WorkspaceSecurityError(
          "OUTSIDE_WORKSPACE",
          "Path ancestor escaped canonical root",
        );
      cursor = parent;
    }
  }
}
