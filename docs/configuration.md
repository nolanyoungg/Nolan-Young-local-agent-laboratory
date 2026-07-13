# Configuration

Configuration precedence is consistent:

1. CLI values
2. Environment variables
3. Application/target configuration files
4. Safe defaults

CLI controls workspace, task, model, Ollama URL, step/repair limits, report directory, verbosity, mode, and dry-run where applicable. Model defaults come from `.env.example`; an actual `.env` is neither required nor loaded implicitly. Values are parsed through Zod and invalid numeric limits, URLs, operations, modes, policies, or commands fail before workflow execution.

Application files provide narrower domain policy:

- Code Editor: `config/edit-policy.json` and `config/permissions.json`.
- Build Assistant: target `.agent-commands.json` plus application permissions.
- Release Engineer: target `.release-checks.json`, target `.package-rules.json`, and application permissions.

Safe model defaults are Ollama, `http://127.0.0.1:11434`, `qwen2.5-coder:14b`, temperature `0.1`, context `32768`, timeout `180000ms`, two retries, 500ms retry delay, 20 agent steps, and three repair passes. Command executables and argument arrays only come from validated files owned by the application/target; model output cannot define them.

Environment variables are read field-by-field. Complete environment objects are never forwarded to commands or traces. A command receives only names on its validated environment allowlist plus explicit non-secret configured values.
