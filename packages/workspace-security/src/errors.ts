export type WorkspaceSecurityErrorCode =
  | "INVALID_PATH"
  | "TRAVERSAL"
  | "OUTSIDE_WORKSPACE"
  | "SYMLINK_ESCAPE"
  | "FORBIDDEN_PATH"
  | "POLICY_DENIED"
  | "WORKSPACE_LOCKED"
  | "LOCK_NOT_OWNED";
export class WorkspaceSecurityError extends Error {
  constructor(
    readonly code: WorkspaceSecurityErrorCode,
    message: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "WorkspaceSecurityError";
  }
}
