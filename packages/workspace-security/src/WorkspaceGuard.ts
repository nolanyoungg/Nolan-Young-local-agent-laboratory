import { realpath } from "node:fs/promises";
import path from "node:path";
import { IgnoreMatcher } from "./IgnoreMatcher.js";
import {
  defaultForbiddenPatterns,
  pathPolicySchema,
  type PathPolicy,
  type ResolvedPathPolicy,
} from "./PathPolicy.js";
import { ReadPolicy } from "./ReadPolicy.js";
import { SymlinkGuard } from "./SymlinkGuard.js";
import { WritePolicy } from "./WritePolicy.js";
import { WorkspaceSecurityError } from "./errors.js";
export type WorkspaceAccess = "read" | "write";
export interface ResolvedWorkspacePath {
  readonly absolutePath: string;
  readonly relativePath: string;
}
const isOutside = (relative: string): boolean =>
  relative === ".." ||
  relative.startsWith(`..${path.sep}`) ||
  path.isAbsolute(relative);
export class WorkspaceGuard {
  readonly root: string;
  readonly policy: ResolvedPathPolicy;
  private readonly readPolicy: ReadPolicy;
  private readonly writePolicy: WritePolicy;
  private readonly forbidden: IgnoreMatcher;
  private readonly ignored: IgnoreMatcher;
  private readonly symlinks: SymlinkGuard;
  private constructor(root: string, policy: ResolvedPathPolicy) {
    this.root = root;
    this.policy = policy;
    this.readPolicy = new ReadPolicy(policy.read);
    this.writePolicy = new WritePolicy(policy.write);
    this.forbidden = new IgnoreMatcher([
      ...defaultForbiddenPatterns,
      ...policy.forbidden,
    ]);
    this.ignored = new IgnoreMatcher(policy.ignore);
    this.symlinks = new SymlinkGuard(root);
  }
  static async create(
    root: string,
    policy: PathPolicy = {},
  ): Promise<WorkspaceGuard> {
    const canonicalRoot = await realpath(path.resolve(root));
    return new WorkspaceGuard(canonicalRoot, pathPolicySchema.parse(policy));
  }
  async resolve(
    requested: string,
    access: WorkspaceAccess = "read",
  ): Promise<string> {
    return (await this.resolveWithMetadata(requested, access)).absolutePath;
  }
  async resolveWithMetadata(
    requested: string,
    access: WorkspaceAccess = "read",
  ): Promise<ResolvedWorkspacePath> {
    this.validateRawPath(requested);
    const requestedAbsolute = path.isAbsolute(requested)
      ? path.resolve(requested)
      : path.resolve(this.root, requested);
    const relativeNative = path.relative(this.root, requestedAbsolute);
    if (isOutside(relativeNative))
      throw new WorkspaceSecurityError(
        path.isAbsolute(requested) ? "OUTSIDE_WORKSPACE" : "TRAVERSAL",
        `Path is outside workspace: ${requested}`,
      );
    const relativePath = (relativeNative || ".").replaceAll("\\", "/");
    if (relativePath.split("/").length > this.policy.maxDepth)
      throw new WorkspaceSecurityError(
        "INVALID_PATH",
        `Path exceeds maximum depth: ${requested}`,
      );
    if (
      this.forbidden.matches(relativePath) ||
      this.ignored.matches(relativePath)
    )
      throw new WorkspaceSecurityError(
        "FORBIDDEN_PATH",
        `Forbidden path: ${relativePath}`,
      );
    const allowed =
      access === "read"
        ? this.readPolicy.allows(relativePath)
        : this.writePolicy.allows(relativePath);
    if (!allowed)
      throw new WorkspaceSecurityError(
        "POLICY_DENIED",
        `${access} denied by workspace policy: ${relativePath}`,
      );
    const absolutePath = path.join(this.root, relativeNative);
    await this.symlinks.assertNoEscape(absolutePath);
    return { absolutePath, relativePath };
  }
  private validateRawPath(requested: string): void {
    if (
      !requested ||
      requested.includes("\0") ||
      requested.length > this.policy.maxPathLength ||
      /[\r\n]/.test(requested)
    )
      throw new WorkspaceSecurityError("INVALID_PATH", "Malformed path");
    const segments = requested.replaceAll("\\", "/").split("/");
    if (!path.isAbsolute(requested) && segments.includes(".."))
      throw new WorkspaceSecurityError(
        "TRAVERSAL",
        `Path traversal rejected: ${requested}`,
      );
  }
}
