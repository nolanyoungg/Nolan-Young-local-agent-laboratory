# Nolan Young Local Agent Laboratory

A local-first TypeScript platform for developing narrowly scoped AI-assisted engineering workflows. It is an npm-workspaces monorepo so security, model, process, file, trace, and agent-loop infrastructure can be reused without merging application responsibilities.

The repository contains exactly three applications:

- `code-editor`: plan, dry-run/apply, and independently review bounded source changes.
- `build-assistant`: own an approved build/watcher, diagnose failures, perform bounded repairs, rerun, and review.
- `release-engineer`: run deterministic checks, optionally repair, package, inspect/extract, checksum, and report a local release candidate.

Applications own workflows and policy. Agents are focused role configurations. Tools are deterministic TypeScript capabilities. The model is a local reasoning component. The model is never the authority: Zod parses actions, per-agent registration controls tools, canonical workspace policies control paths, application allowlists control processes, and deterministic exit codes/checks determine success.

## Requirements

- Node.js 22 LTS (also recorded in `package.json` and `.nvmrc`)
- npm
- [Ollama](https://ollama.com) for live model workflows

Install the expected local model:

```bash
ollama pull qwen2.5-coder:14b
```

Install and validate the repository:

```bash
npm ci
npm run check:ollama
npm run validate
```

No OpenAI account, hosted model, paid API, or API key is required. The real runtime defaults to Ollama at `http://127.0.0.1:11434`; it never silently falls back to an external provider. Tests and CI select the deterministic mock and do not require Ollama.

## Run the applications

```bash
npm run code-editor -- --workspace ./examples/sample-node-project --task "Add robust numeric input validation" --mode plan-only
npm run code-editor -- --workspace ./examples/sample-node-project --task "Add robust numeric input validation" --mode dry-run
npm run code-editor -- --workspace ./examples/sample-node-project --task "Add robust numeric input validation" --mode apply
```

```bash
npm run build-assistant -- --workspace ./examples/broken-typescript-project --command build --task "Resolve all TypeScript compilation failures"
npm run build-assistant -- --workspace ./examples/broken-typescript-project --command dev --watch --task "Repair compiler failures while the watcher runs"
```

```bash
npm run release-engineer -- check --workspace ./examples/sample-release-project
npm run release-engineer -- prepare --workspace ./examples/sample-release-project --repair
npm run release-engineer -- package --workspace ./examples/sample-release-project
npm run release-engineer -- release --workspace ./examples/sample-release-project --repair
```

Every CLI also supports `--help`, `--version`, `--model`, `--ollama-url`, `--max-steps`, `--report-directory`, and `--verbose`. Mutating workflows support dry-run and bounded repair controls where applicable. Relative workspaces resolve from the invoking user's current directory, not an npm workspace package directory.

## Reports and traces

Every run creates `reports/runs/<timestamp>-<application>-<run-id>/` containing `trace.jsonl`, `run-metadata.json`, `final-report.md`, `final-result.json`, and application-specific evidence. Trace events are ordered and locally written. Secret-like keys, authorization values, tokens, passwords, and private-key blocks are redacted; complete environment objects and secret file contents are not recorded.

## Security model and external workspaces

The model receives no general filesystem or shell access. All file actions pass through a canonical workspace guard that rejects traversal, outside absolute paths, null bytes, sensitive default paths, ignored paths, and symlink escapes. Reads and writes use separate glob policies. Writes are atomic and hashed. No recursive deletion tool exists.

Processes are selected by application-owned identifiers and represented as executable plus argument array. `shell: false` is enforced. Output is bounded, watcher children are stopped in `finally`, and failure is determined from process state and exit codes.

An explicitly supplied external absolute workspace is supported. Before using one:

1. Keep it version controlled or backed up.
2. Review its `.agent-commands.json`, `.release-checks.json`, and `.package-rules.json`.
3. Start with plan-only or dry-run.
4. Never target a home directory, credential store, SSH directory, or the agent platform repository when a separate project is intended.

Approved project commands run with the current user's operating-system authority. This platform is defense in depth, not a hostile-code sandbox.

## Local-model limitations

Smaller local models may produce malformed structured output, choose the wrong tool, miss cross-file dependencies, repeat actions, overwrite too much code, or fail to resolve complex builds. The platform mitigates these risks with Zod schemas, bounded retries, step and repetition limits, explicit tool registration, context budgets, workspace isolation, atomic writes, dry-run modes, deterministic checks, independent reviewer agents, repair-pass limits, locks, and local traces. These controls reduce risk; they do not make model output infallible.

## Troubleshooting

- Ollama unavailable: start Ollama and run `npm run check:ollama`.
- Model missing: run `ollama pull qwen2.5-coder:14b`.
- Malformed responses: narrow the task or increase the bounded retry setting.
- Context exhaustion: reduce scope or inspect fewer files.
- Workspace locked: wait for the active mutating workflow or investigate a stale `.agent-laboratory.lock` only after confirming no workflow is running.
- Command rejected: add a reviewed identifier to the target application's configuration; raw CLI/model command strings are intentionally unsupported.

See [architecture](docs/architecture.md), [security model](docs/security-model.md), [configuration](docs/configuration.md), and the [workflow guides](docs/workflows/).
