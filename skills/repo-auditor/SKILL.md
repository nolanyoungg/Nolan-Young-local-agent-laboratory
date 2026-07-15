---
name: repo-auditor
description: Perform an evidence-based audit of a software repository's structure, entry points, logic, error handling, tests, automation, dependency configuration, documentation accuracy, and repository hygiene. Use for GitHub repository reviews, architecture audits, handoff checks, maintenance assessments, or investigations of stale README instructions and inconsistent code behavior.
---

# Repository auditor

## Workflow

1. Map top-level structure, manifests, entry points, packages, applications, tests, scripts, CI, and documentation.
2. Identify the public promises in README files, command help, configuration examples, and package scripts.
3. Trace core workflows from inputs through validation, side effects, errors, and outputs.
4. Compare tests with the behavior and risk they claim to cover.
5. Inspect hygiene indicators such as accidental generated files, stale configurations, duplicated implementations, dead entry points, and inconsistent naming.
6. Apply [references/audit-checklist.md](references/audit-checklist.md), adapting it to the repository's languages and framework.
7. Report only evidence-supported findings and clearly label unverified risks.

## Prioritization

Rank highest when an issue can corrupt data, produce false success, weaken security boundaries, break primary workflows, or materially mislead users. Rank documentation polish and optional cleanup lower unless it blocks correct use.

## Boundaries

- Do not infer a defect solely from a filename or unfamiliar pattern.
- Inspect callers, configuration, and tests before concluding behavior is unused or broken.
- Do not claim commands passed or failed without execution evidence.
- Do not turn preferences into findings; tie recommendations to correctness, operability, maintainability, or user expectations.
