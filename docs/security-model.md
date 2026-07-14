# Security model

The model is untrusted input, not a security boundary. Every response is parsed as one strict discriminated Zod action. Before model invocation, the runtime rejects any agent definition that permits an unregistered tool and injects the exact active action and final-result schemas. Ollama is asked for a JSON object, but provider formatting is not trusted: wrong property names, unknown properties, disallowed actions, commentary, multiple objects, and schema-invalid final results are rejected locally. Malformed responses receive bounded schema-specific correction retries; repeated calls and excessive steps terminate.

`WorkspaceGuard` resolves one canonical root and every request relative to it. It rejects explicit traversal, outside absolute paths, null bytes, malformed/deep/oversized paths, ignored or forbidden globs, and symlinks whose canonical target escapes. Read and write policies are independent. Sensitive defaults cover Git data, environment files, dependencies, private keys, certificates, credentials, SSH material, package-manager caches, platform reports, workspaces, and the lock file. Writes are atomic and return pre/post SHA-256. There is no delete tool.

Mutation contracts are explicit. `create_file` cannot overwrite, `write_file` requires complete replacement content, and `apply_patch` is one exact old/new replacement separated by `---REPLACE-WITH---`; it is not a unified diff. A failed tool result states that no mutation occurred and requires correction or an honest final result.

Mutating workflows acquire `.agent-laboratory.lock` with exclusive creation and release it in `finally`. File tools cannot access that protected file.

Processes are application-owned definitions: identifier, executable, argument array, working directory, timeout, mode, and environment allowlist. `shell: false` is mandatory. Shell metacharacters are rejected at configuration boundaries. Stdout/stderr are captured separately with bounded tails; timeouts terminate children; watchers detect startup failure and are stopped during signal/finally cleanup. The model may request evidence for a known process but cannot provide a command.

Trace files are local, ordered JSONL. Secret-like keys and values, authorization material, and private-key blocks are redacted. Environment maps and secret file content are not logged.

Release archives are built from include/exclude rules, inspected for absolute/traversal/forbidden entries before extraction, extracted into an operating-system temporary directory, validated, removed, and checksummed.

This is defense in depth, not a sandbox for hostile project scripts. Approved project commands execute with the current user's authority. Review configuration and prefer disposable or version-controlled workspaces.
