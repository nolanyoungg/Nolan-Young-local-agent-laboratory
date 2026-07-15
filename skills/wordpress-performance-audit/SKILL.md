---
name: wordpress-performance-audit
description: Audit WordPress themes and plugins for source-level performance problems affecting PHP execution, database work, hooks, caching, asset delivery, images, fonts, and frontend rendering. Use for WordPress speed reviews, slow-theme investigations, pre-launch performance audits, or code reviews where runtime profiling may be unavailable.
---

# WordPress performance audit

## Workflow

1. Inventory theme type, entry points, templates, blocks, assets, build files, and WordPress hooks.
2. Search for query construction, metadata access, remote requests, filesystem work, shortcode or block rendering, AJAX/REST callbacks, and enqueue calls.
3. Inspect relevant call sites before forming a finding.
4. Review the categories in [references/checklist.md](references/checklist.md).
5. Separate source-proven bottlenecks from profiling candidates.
6. Rank findings by likely impact, breadth, and execution frequency.

## Evidence rules

- Cite paths and concrete code behavior.
- Explain whether work occurs per request, per loop item, only in admin, or only during a build.
- Never fabricate measurements or assume a cache/plugin/hosting feature exists.
- Treat minification alone as low priority unless the transferred or parsed code is materially unnecessary.
- Recommend conditional loading, caching, batching, pagination, responsive media, or build changes only when they fit the observed code.
