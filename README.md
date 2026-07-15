# Nolan Young Local Agent Laboratory

A personal library of reusable AI agents and skills that run against local workspaces with models already installed in [Ollama](https://ollama.com).

The user-facing idea is intentionally small:

```text
agents/   role, scope, tools, and default skills
skills/   reusable review methods and domain knowledge
scripts/  one generic Ollama runner and library validator
reports/  evidence produced by agent runs
```

The TypeScript packages underneath provide the guarded file tools, structured agent loop, Ollama client, and traces. You do not need to understand or modify that engine to add an agent or skill.

## Included agents

### WordPress Speed Review Agent

Location: [`agents/wordpress-speed-review-agent/AGENT.md`](agents/wordpress-speed-review-agent/AGENT.md)

Performs a source-level WordPress theme performance review covering PHP work, queries, hooks, caching opportunities, scripts/styles, images, fonts, and build artifacts. It reports what the source proves and identifies runtime measurements that still need tools such as Query Monitor or Lighthouse.

Default skills:

- `wordpress-performance-audit`
- `evidence-based-review`

### GitHub Repository Review Agent

Location: [`agents/github-repo-review/AGENT.md`](agents/github-repo-review/AGENT.md)

Audits a repository's structure, core logic, error handling, configuration, scripts, tests, documentation accuracy, and hygiene. It compares README claims to the implementation and prioritizes evidence-backed findings.

Default skills:

- `repo-auditor`
- `evidence-based-review`

Both agents are read-only. They can list, read, inspect metadata, and search files inside the selected workspace. They cannot modify or delete files, use Git, run shell commands, install dependencies, or access paths outside the workspace.

## Included skills

| Skill                                                                        | Purpose                                                                |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`wordpress-performance-audit`](skills/wordpress-performance-audit/SKILL.md) | WordPress-specific performance workflow and checklist                  |
| [`repo-auditor`](skills/repo-auditor/SKILL.md)                               | General repository architecture, logic, test, docs, and hygiene audit  |
| [`evidence-based-review`](skills/evidence-based-review/SKILL.md)             | Shared method for defensible, prioritized findings without speculation |

Skills follow the standard `SKILL.md` layout and include `agents/openai.yaml`, so they are also suitable for installation or reuse in Codex-compatible skill collections. The local runner loads the selected agent's default skills automatically, including bundled Markdown references.

## Requirements

- Node.js 22 or newer
- npm
- Ollama running locally
- At least one model installed in Ollama

Install dependencies and check Ollama:

```bash
npm ci
npm run check:ollama
```

List installed Ollama models with `ollama list`. If you do not pass `--model`, the runner selects the largest installed model. Pass `--model` when you want a specific one.

## Run an agent

List the available agents and skills:

```bash
npm run agent:list
```

Review a WordPress theme:

```bash
npm run agent -- \
  --agent wordpress-speed-review-agent \
  --workspace C:/path/to/wp-content/themes/my-theme \
  --task "Review this entire theme for code and assets that may slow the site down."
```

Review a repository:

```bash
npm run agent -- \
  --agent github-repo-review \
  --workspace C:/path/to/repository \
  --task "Audit this repository thoroughly. Prioritize real defects, weak tests, and README drift."
```

Choose a model or add another skill:

```bash
npm run agent -- \
  --agent github-repo-review \
  --workspace C:/path/to/repository \
  --task "Perform a complete maintenance audit." \
  --model qwen2.5-coder:14b \
  --skill wordpress-performance-audit \
  --max-steps 160
```

Windows PowerShell users can place the command on one line or use PowerShell's backtick continuation instead of `\`.

Each run writes:

```text
reports/agent-runs/<timestamp>-<agent>-<run-id>/
  report.md
  result.json
  run-metadata.json
  trace.jsonl
```

The trace records model requests and tool activity without storing full file contents in trace metadata. The report contains findings, evidence, limitations, and recommended next steps.

## How agents and skills work together

An agent is the role and completion contract. A skill is reusable methodology loaded into that role.

```text
AGENT.md
  + default SKILL.md files and references
  + task supplied on the command line
  + read-only workspace tools
  + selected local Ollama model
  = structured audit report
```

The model works iteratively: it requests one allowed file action, receives the bounded result, decides what to inspect next, and finally returns a strict result containing its scope, findings, limitations, and next steps. Agents have large but finite step budgets so they can handle tedious reviews without looping forever.

## Add an agent

Create `agents/<agent-slug>/AGENT.md`:

```markdown
---
name: My Review Agent
description: Explains what this agent reviews
tools:
  - list_files
  - read_file
  - read_file_metadata
  - search_text
skills:
  - repo-auditor
  - evidence-based-review
maxSteps: 100
minEvidenceFiles: 10
requiredEvidence:
  - functions.php
  - templates/**
---

# Role

Describe the role, review priorities, evidence rules, and completion criteria.
```

The current generic runner accepts only the four read-only tools. That is deliberate: these agents review other projects and should not silently change them.

`minEvidenceFiles` is an enforceable completion gate. `requiredEvidence` optionally adds exact files or directory categories (`/**`). A model cannot successfully finish until it has directly read the required coverage and reports exact inspected paths. Every finding must also point to a successfully inspected file. If it tries to stop early, the runtime returns validation feedback and the same agent continues working within its step budget.

## Add a skill

Create `skills/<skill-slug>/SKILL.md` with exactly `name` and `description` in its YAML frontmatter. Put detailed optional material in `references/`. Keep the main skill concise and procedural.

After adding or editing library content, run:

```bash
npm run validate:library
npm test
```

## Validation

Run the complete repository gate:

```bash
npm run validate
```

That validates all agent/skill links, formatting, lint, TypeScript, unit/integration tests, and the build. Tests use deterministic mock model responses; they do not require Ollama.

## Safety boundary

- Ollama URLs must use a loopback address such as `127.0.0.1` or `localhost`.
- Workspace paths are canonicalized and cannot escape through traversal or symlinks.
- Sensitive paths, `.git`, environment files, dependencies, keys, credentials, reports, and lock files are blocked by default.
- Review agents receive no mutation tools and no process execution tool.
- Model output is parsed as one strict action; prose pretending to be a tool call is rejected.

The older `code-editor`, `build-assistant`, and `release-engineer` applications remain as experimental examples of the underlying engine. The supported personal-library entry point is `npm run agent`.
