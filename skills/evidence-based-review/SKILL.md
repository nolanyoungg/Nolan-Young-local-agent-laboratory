---
name: evidence-based-review
description: Produce concise, prioritized technical review findings grounded in inspected source evidence, with explicit impact, recommendations, scope, and limitations. Use alongside code, repository, security, performance, architecture, or documentation reviews where avoiding speculation and generic advice is important.
---

# Evidence-based review

## Method

1. Establish scope and inventory before investigating details.
2. Follow evidence from definition to use, including configuration and tests where relevant.
3. Try to disprove each suspected issue before reporting it.
4. Record the exact observed behavior and its location.
5. Separate confirmed findings, informational observations, and limitations.

## Finding quality

Each finding must include:

- A severity proportional to realistic impact and likelihood
- A precise title describing the problem rather than the fix
- Concrete evidence from inspected files or tool results
- The likely user or system impact
- A practical recommendation that preserves surrounding behavior

Avoid generic best-practice lists, unsupported performance claims, duplicate findings, and recommendations whose cost exceeds the demonstrated problem. If evidence is insufficient, state the limitation or propose a verification step instead of presenting the concern as fact.
