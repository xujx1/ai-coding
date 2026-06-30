# Session Dynamic Workflow

## Read Model

Each run stores a session-bound workflow instance in `execution-state.json` as `workflowInstance`.

The reusable workflow template remains immutable. A run captures the template snapshot at session creation, then stores run-specific topology in the session instance:

```text
upload-init
  -> mrd-clarify
  -> mrd-render
  -> project-fanout
  -> app-join
  -> cross-app-test
  -> archive
```

Project implementation work is represented as branch refs under `workflowInstance.branches`. The global `WorkflowDefinition` is not modified when branches are created.

Historical runs without `workflowInstance` continue to render through the legacy fixed-node fallback derived from `ExecutionState.nodes`.

## Fanout Decision

`mrd-render` writes `artifacts/fanout-decision.json` and indexes it under `artifactIndex["mrd-render"]`.

The decision contains:

- `candidates`: uploaded project candidates from `project-manifest.json`
- `includedProjects`: projects selected for branch execution
- `excludedProjects`: uploaded projects not selected by MRD ownership
- `unresolvedProjects`: MRD-referenced projects that were not uploaded
- `confidence`: `high`, `medium`, or `low`
- `evidence`: MRD ownership excerpt used for selection
- `fallbackReason`: present when selection falls back to all uploaded projects

Selection rules:

- If MRD ownership maps confidently to uploaded project names, only those projects are included.
- If ownership cannot be mapped, all uploaded projects are included and the fallback reason is recorded.
- If MRD references a missing project, the missing name is recorded and the fanout node is marked `waiting_confirmation` in the session instance.
- If no branch can be resolved, the fanout node is marked `failed`.

## Session Execution Plan

After fanout, new runs create a session-scoped `executionPlan` inside
`workflowInstance`. The plan is stored with:

- `schemaVersion` and `plannerVersion`
- `sourceArtifacts` used by the planner
- one `ApplicationBranchPlan` per included project
- capability evidence, omitted-track reasons, fallback reasons, and validation
  results

The plan is data only. It does not mutate the reusable workflow template.

Capability detection is derived from `project-manifest.json` and startup
capability evidence:

- Maven, Java source, Spring/backend startup evidence -> backend capability
- package metadata, Vite/Next/source roots, Playwright config -> frontend
  capability
- frontend plus backend API convention evidence -> contract capability
- no executable backend/frontend signal -> documentation-only fallback

Backend Java projects currently use the stable `java-impl` runner inside the
backend track so legacy branch execution and OpenSpec task completion remain
compatible. The planner catalog also accepts `backend-impl` for future
non-Java backend runners.

## Nested Tracks

Application branches can contain nested tracks:

```text
implementation-plan
  -> spec-generate
  -> backend: java-impl -> backend-test
  -> frontend: frontend-impl -> frontend-test
  -> e2e: e2e-verify
```

Backend-only apps omit frontend and E2E tracks. Frontend-only apps omit backend
tracks. Documentation-only apps get:

```text
documentation: documentation-impl -> documentation-test
```

Branch runtime state stores track state separately from app-level branch status.
A failed frontend track does not overwrite completed backend track artifacts.

## OpenSpec Compatibility

`spec-generate` writes a stable app-scoped OpenSpec change under:

```text
artifacts/<project>/openspec/changes/run-<runId>-<project>/
```

`tasks.md` keeps the legacy `Development` and `Test` sections and also includes
stable track sections:

- `Backend`
- `Frontend`
- `Contract`
- `E2E`
- `Documentation`

Task completion remains section-scoped. `java-impl` marks `Development`
checkboxes, `testcode-generate` marks `Test` checkboxes, and dynamic callers can
mark track sections such as `Backend` without changing unrelated sections. Phase
headings inside a section are treated as content, not as section boundaries.

Historical runs that lack dynamic plan metadata are backfilled with legacy
branch nodes instead of inventing a new planner snapshot. This keeps existing
`java-impl` and `testcode-generate` artifacts readable.

## UI and Artifacts

The workflow UI reads `workflowInstance` and `pipeline.projects[*]` read-model
snapshots. When tracks are present it renders nested app lanes; otherwise it
falls back to the legacy fixed branch chain.

Artifact filtering is scoped by selected app, track, and node. For example,
selecting `frontend/frontend-test` first checks the selected branch and track
artifact indexes, then filters global artifacts to the app scope. Planner source
artifacts, validation errors, capability flags, fallback reasons, and omitted
track kinds are surfaced in the fanout workflow details.

## Rollout

Dynamic workflow execution remains guarded by runtime selection:

```text
AI_CODING_WORKFLOW_RUNTIME=legacy|langgraph
```

`legacy` is still the default. Session workflow instance rendering, fanout decision read models, branch state, track state, cross-app-test, and artifact filtering are available in legacy runs. LangGraph remains the migration path for deeper graph-native execution.

## Branch Controls

Branch controls operate on session runtime state, not on the global workflow template.

```text
POST /api/sessions/:runId/branches/:branchId/rerun
POST /api/sessions/:runId/branches/:branchId/cancel
```

Rerun is permitted only for `failed`, `waiting_fix`, or `cancelled` branches. It resets branch-local node state from the requested `fromNodeId` and leaves other branches unchanged.

Cancel is permitted only for `pending`, `running`, `waiting_confirmation`, or `suspended` branches. It marks the selected branch cancelled and recomputes join state. Whole-run cancellation also cancels active branches.

## Rollback and Fallback Policy

Invalid planner output is rejected before execution and recorded in
`plannerValidation`. Unsupported or low-confidence executable capability should
route to documentation fallback instead of silently creating dead runnable nodes.

Current branch controls still operate at branch scope. Track-level rerun and
cancellation are represented in runtime state and tests, while full UI/API
controls for individual track rerun remain future executor work.
