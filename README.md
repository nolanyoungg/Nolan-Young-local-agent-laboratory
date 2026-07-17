# Local Ollama Agent Library

A small, local, Ollama-only toolbox:

```text
agents/   role definitions
skills/   reusable methods and domain knowledge
scripts/  generic runner and validation commands
packages/ guarded read-only runtime implementation
reports/  local agent output
```

## Included roles

- `github-repo-review` performs a read-only, evidence-based repository review.
- `wordpress-theme-verification-agent` verifies static WordPress theme structure only. Its verdict is `valid-static-structure`, `invalid-static-structure`, or `inconclusive`.

The theme verifier does not activate WordPress, execute runtime PHP, render pages, use a browser, assess visual output, test plugins, or measure performance.

## Setup

Node 22+ and Ollama are required. Copy `.env.example` to `.env` if desired, then use the installed local model required for live tests:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:14b
OLLAMA_REQUEST_TIMEOUT_MS=120000
OLLAMA_MAX_TOOL_ROUNDS=12
```

`OLLAMA_BASE_URL` may point to a deliberately configured HTTP(S) Ollama host. `OLLAMA_API_KEY` is read only from the environment and redacted from traces; the local API normally needs no authentication. The implementation uses Ollama's documented `/api/tags` model discovery and non-streaming `/api/chat` request format. See the official [API introduction](https://docs.ollama.com/api/introduction), [chat endpoint](https://docs.ollama.com/api/chat), and [authentication guidance](https://docs.ollama.com/api/authentication).

```bash
npm ci
npm run check:ollama
npm run agent:list
```

## Run an agent

```bash
npm run agent -- github-repo-review --target "C:\\path\\to\\repository"
npm run agent -- wordpress-theme-verification-agent --target "C:\\path\\to\\wordpress-theme"
```

Add `--task "..."`, `--model NAME`, or `--max-steps N` when needed. The runner loads the agent's declared skills, requires the configured model to be available, and writes reports only to `reports/agent-runs/<timestamp>-<agent>-<id>/`.

Each completed run creates `report.md`, `result.json`, safe `run-metadata.json`, and redacted `trace.jsonl`. Theme runs also write deterministic `theme-verification.json` and `static-report.md` before model work, so static evidence remains available if a model/tool run fails.

## Safety

The runtime permits only bounded listing, text reads, safe metadata reads, literal text search, and a controlled non-mutating `php -l` syntax check for an approved PHP file. It blocks traversal, symlink escape, secret-like files, mutation, shell commands, Git mutation, and general network tools. Findings require direct inspected-file evidence; unverified runtime behavior is explicitly limited.

## Verification

```bash
npm run validate:library
npm run format:check
npm run lint
npm run typecheck
npm test
```

CI runs only these deterministic static checks. Optional live tests must first confirm `http://127.0.0.1:11434` is reachable and `qwen2.5-coder:14b` is installed; no fallback model is selected.
