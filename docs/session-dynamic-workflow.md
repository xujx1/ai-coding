# Session Dynamic Workflow

## Read Model

Each run stores a session-bound workflow instance in `execution-state.json` as `workflowInstance`.

The reusable workflow template remains immutable. A run captures the template snapshot at session creation, then stores run-specific topology in the session instance:

```text
upload-init
  -> mrd-render
  -> project-fanout
  -> app-join
  -> cross-app-code-review
  -> cross-app-integration-review
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

## Rollout

Dynamic workflow execution remains guarded by runtime selection:

```text
AI_CODING_WORKFLOW_RUNTIME=legacy|langgraph
```

`legacy` is still the default. Session workflow instance rendering and fanout decision read models are available in legacy runs, while full branch-local execution remains behind the LangGraph runtime migration.

## Branch Controls

Branch controls operate on session runtime state, not on the global workflow template.

```text
POST /api/sessions/:runId/branches/:branchId/rerun
POST /api/sessions/:runId/branches/:branchId/cancel
```

Rerun is permitted only for `failed`, `waiting_fix`, or `cancelled` branches. It resets branch-local node state from the requested `fromNodeId` and leaves other branches unchanged.

Cancel is permitted only for `pending`, `running`, `waiting_confirmation`, or `suspended` branches. It marks the selected branch cancelled and recomputes join state. Whole-run cancellation also cancels active branches.
