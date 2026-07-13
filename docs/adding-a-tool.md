# Adding a tool

Add a discriminated Zod action, deterministic executor, explicit output limits, permission registration, trace events, typed errors, and abuse tests. Filesystem tools must call `WorkspaceGuard`; process tools must select an application-owned command identifier. Never add arbitrary shell strings, recursive deletion, implicit permission expansion, or secret logging.
