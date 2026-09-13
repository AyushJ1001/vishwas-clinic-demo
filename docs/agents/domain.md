# Domain docs

This document tells engineering skills how to consume this repository's domain documentation.

## Before exploring, read these

- Read `CONTEXT.md` at the repository root when it exists.
- If `CONTEXT-MAP.md` exists, use it to find each relevant context-specific `CONTEXT.md`.
- Read architectural decisions under `docs/adr/` that affect the work.
- In a multi-context repository, also inspect `src/<context>/docs/adr/` for context-specific decisions.

If any of these files do not exist, proceed silently. Do not suggest creating them before they are needed. The domain-modeling workflows create them when the project resolves terms or decisions.

## File structure

This repository uses the single-context layout:

```text
/
|-- CONTEXT.md
|-- docs/adr/
|   |-- 0001-example-decision.md
|   `-- 0002-another-decision.md
`-- app/
```

If the repository later becomes a large multi-context system, add a root `CONTEXT-MAP.md` and place one `CONTEXT.md` inside each context.

## Use the glossary's vocabulary

When an issue, specification, test, or proposal names a domain concept, use the term defined in `CONTEXT.md`. Do not replace it with a synonym that the glossary rejects.

If the glossary does not define a required concept, first check whether the proposed term matches the project's existing language. Record a real vocabulary gap for the domain-modeling workflow.

## Flag ADR conflicts

If proposed work contradicts an existing architectural decision, state the conflict instead of silently overriding it. Name the affected ADR and explain why the decision may need to be reconsidered.
