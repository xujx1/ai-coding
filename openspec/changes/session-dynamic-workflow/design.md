## Context

`ai-coding` currently has two related but separate concepts:

- A reusable built-in workflow definition derived from `PIPELINE_NODES`.
- A session read model stored in `execution-state.json` and rendered by the frontend.

The current session read model still initializes `ExecutionState.nodes` from the fixed linear `PIPELINE_NODES` list. As a result, the top pipeline bar and workflow view can look static even when a run has uploaded multiple project folders and the MRD decomposition identifies project-scoped work. Existing LangGraph migration work introduced branch state, fanout helpers, branch workflows, joins, and cross-application review artifacts, but the default session read model does not yet expose the actual run graph as `upload-init -> mrd-render -> fanout -> branch instances -> join -> cross-app review -> archive`.

The important product contract remains unchanged: the UI and APIs read from `execution-state.json`, events come from `logs/events.ndjson`, and artifacts remain under `artifacts/`. The change is about making the session read model accurately describe the run instance rather than making the global workflow template dynamic.

## Goals / Non-Goals

**Goals:**

- Generate a session-bound workflow instance for each run that reflects the uploaded project set and MRD ownership/decomposition result.
- Render top-level session nodes as the actual run graph: initialization, requirement decomposition, project fanout, join, cross-application review, and archive.
- Store project-specific implementation work as branch instances with their own node states, artifact indexes, child agent ids, retry counters, and current node pointers.
- Execute project-scoped stages per affected branch and allow branch-level status, rerun, and cancellation semantics to be represented in the read model.
- Preserve historical runs by rendering their stored session workflow instance or falling back to compatible legacy fixed nodes.
- Keep global workflow definitions reusable and free of run-specific project branch instances.

**Non-Goals:**

- Do not make uploaded project branches part of the persisted global `WorkflowDefinition`.
- Do not expose LangGraph checkpoint internals as the frontend protocol.
- Do not remove support for legacy fixed-node historical runs.
- Do not add arbitrary custom structural editing in this change.
- Do not require every uploaded project to run if MRD ownership excludes it.

## Decisions

### Decision 1: Add a session workflow instance to the read model

Each run will persist a session workflow instance in `execution-state.json`, either as `workflowInstance` or under a clearly versioned metadata field. The instance contains top-level nodes, edges, branch descriptors, join descriptors, and a pointer to the reusable template snapshot.

Alternatives considered:

- Reuse `WorkflowDefinition` and append project branches to it. Rejected because run-specific branches would pollute the global template and break reproducibility after edits.
- Continue using only `ExecutionState.nodes`. Rejected because a flat list cannot represent branch instance topology, join state, or cross-app review links cleanly.

### Decision 2: Keep top-level nodes coarse and branch nodes nested

The top-level graph will show coarse orchestration nodes: `upload-init`, `mrd-render`, `project-fanout`, `app-join`, cross-app review nodes, and `archive`. Project-specific implementation chains live under branch state and are expanded in the workflow view or branch drilldown.

Alternatives considered:

- Render every branch node directly in the top bar. Rejected because many projects would make the top bar unusable.
- Keep project branch nodes only in a side panel. Rejected because the main workflow would still look static and disconnected from the actual session.

### Decision 3: Derive affected branches after MRD decomposition

`upload-init` detects uploaded project folders and writes `project-manifest.json`. `mrd-render` produces project ownership or requirement decomposition artifacts. Fanout uses both sources to select affected projects. If ownership extraction is incomplete, the runtime falls back to all uploaded projects and records the fallback reason.

Alternatives considered:

- Fan out purely from uploaded folders. Rejected because an MRD may touch only a subset of a multi-project upload.
- Require users to manually select affected projects before running. Rejected for the default flow, but manual correction can be added later when fanout cannot infer safely.

### Decision 4: Execute branch work through reusable stage runners

The branch workflow will call the same stage runner contracts used by the legacy and LangGraph migration paths, scoped with `projectName`, `projectRoot`, `branchId`, and branch artifact prefixes. Implementation plan, spec generation, Java implementation, test-code generation, test execution, and branch summary become branch-local node executions.

Alternatives considered:

- Keep legacy stage methods looping over all projects internally. Rejected because branch-level retry, cancellation, concurrency limits, and UI drilldown require branch-local node state.
- Clone project folders per branch by default. Rejected for the first implementation because uploaded projects are already isolated by folder; shared-cache strategy can be revisited for Maven performance.

### Decision 5: Branch controls operate on branch runtime state

Branch rerun and cancellation APIs update the branch state and schedule only the affected branch when runtime state permits. Whole-run cancellation remains available and marks active branches consistently.

Alternatives considered:

- Route branch rerun to the existing whole-pipeline `fromNodeId` API. Rejected because it reruns unrelated projects and does not preserve completed unaffected branches.

### Decision 6: Frontend renders the current session graph first

The top pipeline bar and workflow view will prefer session workflow instance data from `execution-state.json`. Only sessions without instance metadata fall back to legacy `nodes` or the built-in workflow API.

Alternatives considered:

- Always render the default workflow API. Rejected because it is global template data, not the run instance.
- Make the frontend infer branch topology from artifact paths only. Rejected because runtime state must be the source of truth.

## Risks / Trade-offs

- [Risk] MRD ownership extraction may miss an affected project. -> Mitigation: fall back to all uploaded projects when confidence is low and surface the fanout decision artifact in the UI.
- [Risk] Branch state and `ExecutionState.nodes` may diverge. -> Mitigation: centralize read-model synchronization and add consistency tests for fanout, branch updates, join, rollback, and archive.
- [Risk] Top bar can become crowded for many branches. -> Mitigation: keep top-level nodes coarse and put branch detail inside expandable workflow canvas/drilldown.
- [Risk] Branch-only rerun can overwrite artifacts unexpectedly. -> Mitigation: use deterministic branch artifact paths, preserve context manifests, and record rerun attempt metadata.
- [Risk] Historical fixed-node runs lack workflow instance data. -> Mitigation: fallback renderer keeps fixed nodes readable and marks the run as legacy layout.

## Migration Plan

1. Add typed session workflow instance structures and version metadata to `ExecutionState`.
2. Update session creation to capture the template snapshot but initialize a pending session instance instead of treating fixed `PIPELINE_NODES` as the only graph.
3. Update `upload-init` and `mrd-render` to produce fanout input artifacts: uploaded project manifest, project ownership, affected project list, and fallback reasons.
4. Add runtime fanout integration that creates branch instances from affected projects and writes top-level fanout/join nodes into the session instance.
5. Move project-scoped implementation stages into branch execution, with branch-local artifacts, context manifests, child agents, retry counters, and status updates.
6. Add branch rerun/cancel APIs and whole-run cancellation synchronization for active branches.
7. Update frontend pipeline bar and workflow view to read the session workflow instance first, including fanout, join, branch lanes, and historical fallback.
8. Add golden, integration, and frontend tests covering single-project, multi-project, subset fanout, branch failure, branch-only rollback, rerun/cancel, and historical fixed-node display.

Rollback strategy:

- Keep legacy fixed-node rendering as a fallback for old sessions and for any run without a session workflow instance.
- Keep the runtime feature flag so new runs can temporarily use the legacy linear pipeline if dynamic branch execution regresses.
- Do not mutate global workflow definitions during migration; reverting only requires disabling dynamic runtime selection and preserving historical read compatibility.

## Open Questions

- What confidence threshold should decide whether MRD ownership fanout uses a subset or falls back to all uploaded projects?
- Should the first UI show branch lanes in the top workflow canvas only, or also compact branch chips in the top pipeline bar?
- Should branch execution share Maven local repositories, use per-branch repositories, or use a read-only shared cache plus branch-local writes?
- Should users be allowed to manually override affected project selection before fanout starts?
