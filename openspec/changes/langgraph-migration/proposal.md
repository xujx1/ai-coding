## Why

The current MRD-to-Code runtime is implemented as a custom `PipelineEngine`, which makes resume, confirmation interrupts, rollback routing, and future dynamic multi-application execution increasingly difficult to evolve safely. This change moves execution scheduling and recovery to LangGraph while preserving the existing product read model, event stream, artifact layout, and legacy runtime fallback.

## What Changes

- Add a workflow definition layer that represents the fixed MRD-to-Code pipeline as nodes and edges, with a locked React Flow view first and controlled customization later.
- Add a LangGraph runtime path behind a feature flag, including graph state, file checkpointing, event bridging, read-model synchronization, confirmation interrupt handling, and resume/cancel commands.
- Extract current pipeline node execution into reusable stage runners so LangGraph nodes can wrap existing business logic before deeper node refactoring.
- Preserve `execution-state.json`, `logs/events.ndjson`, `artifacts/`, `agents/`, and existing REST/WebSocket behavior as stable product contracts.
- Add support for dynamic multi-application workflows using fanout, branch execution, join, cross-application review, concurrency limits, and targeted branch rollback.
- Keep legacy runtime available during migration and keep historical runs readable without requiring LangGraph checkpoints.
- Add tests that compare legacy and LangGraph behavior for golden flows, confirmation recovery, rollback, branch concurrency, and frontend workflow state display.

## Capabilities

### New Capabilities
- `workflow-definition`: Defines editable workflow templates, locked built-in MRD-to-Code workflow visualization, validation, versioning, and run-bound workflow snapshots.
- `langgraph-runtime`: Provides LangGraph-backed execution, checkpointing, interrupt/resume, event bridging, read-model synchronization, stage runner wrapping, rollback routing, and legacy compatibility.
- `multi-application-workflow`: Provides dynamic application branch fanout, branch-level execution state, joins, cross-application review, concurrency limits, and targeted branch rollback.

### Modified Capabilities
- None.

## Impact

- Adds dependencies on `@langchain/langgraph` and `@langchain/core`.
- Adds new backend modules under `src/workflows/` and `src/langgraph/`.
- Refactors `src/pipeline/engine.ts` by extracting reusable node runners while retaining legacy runtime behavior.
- Extends `src/persistence/stateStore.ts`, `src/events/types.ts`, and the session APIs to support workflow runtime state without changing existing read contracts.
- Adds workflow editor/view APIs and React Flow UI surfaces while keeping the task workbench as the primary product screen.
- Adds LangGraph demo fixtures, dual-runtime golden tests, integration tests, and Playwright coverage for workflow visualization and branch drilldown.
