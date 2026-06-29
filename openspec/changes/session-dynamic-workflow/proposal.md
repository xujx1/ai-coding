## Why

The workbench now exposes multi-application branch state, but the primary session view still presents a fixed linear `PIPELINE_NODES` bar. This makes dynamic multi-project runs look like a single static pipeline even when the uploaded project set and MRD ownership should produce project-scoped parallel implementation branches.

## What Changes

- Create a session-bound workflow instance read model for each run instead of treating the global built-in workflow definition as the UI execution graph.
- Derive dynamic project branches from uploaded project folders plus MRD requirement ownership/decomposition output.
- Represent the main run as `upload-init -> mrd-render -> project-fanout -> branch execution -> join -> cross-app review -> archive`.
- Move project-scoped implementation stages (`implementation-plan`, `spec-generate`, `java-impl`, `testcode-generate`, test execution, branch summary) into branch instances.
- Update frontend pipeline/workflow views to render the current session workflow instance, branch nodes, join state, and cross-app review state rather than a fixed top-level stage list.
- Keep workflow templates reusable and immutable; run-specific branches remain in runtime/session state and historical runs continue to display their captured instance.
- Preserve existing artifact, event, WebSocket, and `execution-state.json` compatibility while extending the read model for dynamic workflow instances.

## Capabilities

### New Capabilities

- `session-workflow-instance`: Session-bound dynamic workflow read model, snapshots, APIs, and UI rendering for the actual run graph.
- `requirement-scoped-fanout`: Runtime branch derivation from uploaded project manifests and MRD requirement ownership, including affected-project filtering and branch lifecycle.

### Modified Capabilities

- None.

## Impact

- Affects `ExecutionState`, LangGraph read-model synchronization, session creation/loading, and historical run display.
- Affects runtime orchestration for project-scoped stages, branch join, cross-application review, rollback, rerun, and cancellation.
- Affects `web/app.js`, `web/app.css`, and workflow-related APIs so the top bar and workflow view read current session graph state.
- Requires tests for session instance generation, MRD-to-project fanout filtering, branch concurrency, branch-only rerun/cancel, frontend rendering, and historical compatibility.
