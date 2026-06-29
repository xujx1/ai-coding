## Why

Multi-application requirements no longer map cleanly to a fixed `implementation-plan -> SPEC -> Java -> test` pipeline. Uploaded applications may be backend-only, frontend-only, fullstack, documentation-only, or mixed, so each session needs a controlled runtime plan that reflects the actual project shapes and MRD ownership while preserving OpenSpec task and artifact compatibility.

## What Changes

- Introduce a session-scoped Plan-and-Executor workflow model that creates per-application execution plans after upload analysis and requirement decomposition.
- Add project capability detection for backend, frontend, fullstack, documentation-only, testable, and contract-only tracks.
- Allow each application branch to contain nested tracks, such as backend implementation, frontend implementation, API contract checks, E2E verification, and documentation fallback.
- Replace fixed Java-centric branch chains with validated node plans generated from a bounded catalog of allowed stage types.
- Keep global workflow templates immutable; generated plans are persisted only in the current session/run workflow instance.
- Preserve OpenSpec integration by mapping every implementation/test/spec node to project-scoped OpenSpec change artifacts, task completion state, and archive metadata.
- Keep historical sessions readable by rendering their captured workflow instance or legacy fixed-node fallback.

## Capabilities

### New Capabilities

- `dynamic-workflow-planner`: Generates validated session-bound application branch plans from uploaded projects, technology stack analysis, and MRD ownership.
- `branch-plan-executor`: Executes bounded dynamic branch plans, including nested backend/frontend/contract/test/documentation tracks, while synchronizing runtime state and artifacts.
- `project-capability-detection`: Detects project shape and implementation capabilities, including backend-only, frontend-only, fullstack, documentation-only, and mixed applications.
- `openspec-plan-compatibility`: Preserves OpenSpec proposal/design/tasks/spec generation, task completion updates, and project-scoped artifact indexing for dynamic plans.

### Modified Capabilities

- None.

## Impact

- Affects session workflow instance generation, fanout planning, branch state models, executor scheduling, rerun/cancel behavior, artifact indexing, and archive aggregation.
- Affects frontend workflow visualization to render application branches with nested tracks instead of assuming one linear chain.
- Affects stage runner dispatch so `java-impl`, `frontend-impl`, `backend-test`, `frontend-test`, `e2e-verify`, `api-contract-check`, and documentation fallback nodes can coexist.
- Affects OpenSpec integration by requiring dynamic node plans to keep stable OpenSpec change ids, task sections, and completion state per project and track.
- Adds tests for planner validation, mixed fullstack applications, documentation-only fallback, OpenSpec compatibility, branch execution state, and UI rendering.
