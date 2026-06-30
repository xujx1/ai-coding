## Why

The current dynamic workflow work still relies on partially textual MRD decomposition and compatibility fallbacks to infer execution tracks. That is not strong enough for a standard OpenSpec SDD workflow where the MRD is the proposal, technical design/spec artifacts drive execution, and every dynamic execute node must have a validated contract before it runs.

## What Changes

- Introduce a schema-first planner contract: planners must emit typed JSON that conforms to node, track, dependency, artifact, confirmation, and replan schemas instead of relying on regex over prose.
- Standardize the workflow as OpenSpec SDD: MRD/requirement confirmation becomes the app-level `proposal.md` source; generated technical artifacts become `design.md` and `spec.md`; generated development and test task files become the app OpenSpec `tasks.md`.
- Define node-type JSON Schemas for planning, requirement ownership confirmation, backend implementation, frontend implementation, contract verification, E2E verification, documentation fallback, app summary, cross-app review, and archive.
- Add DAG execution semantics with `depends_on`, bounded parallel scheduling, per-resource concurrency limits, node-scoped inputs/outputs, and artifact contracts.
- Add dynamic replan semantics so failed or changed branches regenerate only remaining executable nodes, with a bounded retry/fuse policy and human confirmation gates for risky changes.
- Replace heuristic frontend/backend track inference as the primary mechanism with structured planner output; keep code capability detection and limited keyword fallback only as validation or legacy compatibility.
- Preserve compatibility with the active dynamic workflow, LangGraph migration, dynamic E2E, and session workflow changes while moving the next implementation layer toward schema-validated SDD execution.

## Capabilities

### New Capabilities

- `structured-planner-contract`: Defines JSON Schema contracts for planner output, node definitions, track selection, requirement ownership, artifact contracts, validation errors, and replan requests.
- `sdd-openspec-workflow`: Defines the standard SDD artifact mapping where MRD maps to `proposal.md`, generated technical design/spec map to `design.md` and `spec.md`, and generated development/test task files map to `tasks.md`.
- `dag-replan-executor`: Defines DAG-based dynamic execute node scheduling, dependency validation, resource concurrency limits, replan of remaining nodes, and failure fuse behavior.

### Modified Capabilities

- None. This change builds on the active dynamic workflow, LangGraph migration, dynamic E2E, and session workflow changes, but the main specs for those changes have not yet been archived into `openspec/specs/`.

## Impact

- Affects planner prompts/providers, structured output parsing, plan validation, dynamic branch execution, LangGraph runner integration, OpenSpec artifact generation, task completion updates, UI confirmation views, and read-model APIs.
- Adds versioned JSON Schemas and tests for valid/invalid planner output, SDD artifact mapping, replan behavior, concurrency limits, and real example flows.
- Requires migration handling for existing sessions and active changes that still reference `prd.md` or legacy fixed stage names, especially `plan-and-executor-dynamic-app-workflows`, `session-dynamic-workflow`, `langgraph-migration`, and `add-dynamic-e2e-verification`.
