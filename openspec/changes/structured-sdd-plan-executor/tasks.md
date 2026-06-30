## 1. Schema and Registry Foundation

- [x] 1.1 Add versioned TypeScript models and JSON Schemas for `SessionExecutionPlan`, app branches, tracks, planned nodes, artifacts, dependencies, validation issues, and plan revisions.
- [x] 1.2 Add a node type registry that defines each executable node's input schema, output schema, required artifacts, produced artifacts, resource requirements, confirmation policy, and replan policy.
- [x] 1.3 Register node contracts for requirement ownership confirmation, implementation planning, spec generation, backend implementation, frontend implementation, backend tests, frontend tests, API contract check, E2E verification, documentation fallback, app summary, cross-app review, and archive.
- [x] 1.4 Add schema validation helpers that return stable validation issue codes and user-facing messages without executing invalid plans.
- [x] 1.5 Add migration metadata for legacy plans and artifacts that predate structured planner schemas.

## 2. Structured Requirement and Planner Output

- [x] 2.1 Update requirement decomposition to persist machine-readable feature inventory, project ownership, implementation surfaces, unresolved questions, and confirmed decisions.
- [x] 2.2 Update confirmation UI/API payloads so the user reviews human-readable pages while the backend stores structured ownership and surface data.
- [x] 2.3 Update planner prompts/provider adapters to request structured output through function calling, JSON mode, or provider-specific structured-output support.
- [x] 2.4 Add strict planner response parsing that rejects non-JSON, schema-invalid, unsupported-node, missing-dependency, and missing-artifact plans before execution.
- [x] 2.5 Replace primary frontend/backend/contract/E2E track selection with structured planner surfaces and keep capability/keyword fallback only for legacy compatibility warnings.

## 3. OpenSpec SDD Artifact Mapping

- [x] 3.1 Remove `prd.md` as a required new-run artifact from implementation planning, spec generation, node context manifests, and tests.
- [x] 3.2 Generate app OpenSpec `proposal.md` from MRD plus confirmed requirement ownership and acceptance boundaries.
- [x] 3.3 Generate app OpenSpec `design.md` from project technical design artifacts and node contract metadata.
- [x] 3.4 Generate app OpenSpec `spec.md` from confirmed MRD behavior, technical design, API/contract decisions, and E2E requirements.
- [x] 3.5 Generate app OpenSpec `tasks.md` from generated development and test task files with track-aware Development, Frontend, Backend, Contract, E2E, Documentation, and Test sections.
- [x] 3.6 Preserve legacy `prd.md` reading only as optional compatibility context for historical runs.

## 4. DAG Executor, Resource Limits, and Replan

- [x] 4.1 Update dynamic plan execution to schedule nodes from explicit DAG dependencies rather than fixed stage order.
- [x] 4.2 Enforce branch, model, command, browser, and tool concurrency semaphores across dynamic plan execution.
- [x] 4.3 Add `ReplanRequest` and `PlanRevision` persistence for failed, invalidated, or user-adjusted remaining work.
- [x] 4.4 Implement bounded replan that can replace only pending, failed, or invalidated nodes while locking completed sibling tracks and accepted artifacts.
- [x] 4.5 Add fuse limits for branch-level and session-level replan attempts with terminal failure summaries after exhaustion.
- [x] 4.6 Ensure rerun/cancel commands target plan revision nodes and preserve unrelated branch/track artifacts.

## 5. Read Model and UI

- [x] 5.1 Expose planner schema version, plan revision id, node contract summary, validation issues, replan state, and resource wait reasons in session state.
- [x] 5.2 Update workflow UI to hide dynamic lanes before validated plan creation and show requirement ownership confirmation or validation failures instead.
- [x] 5.3 Update branch detail UI to show node input/output schemas, artifact contracts, resource requirements, and plan revision provenance.
- [x] 5.4 Update confirmation recovery after page refresh to restore structured confirmation payloads and latest artifact content.
- [x] 5.5 Label legacy `prd.md` as optional compatibility context when present, not as the primary SDD artifact.

## 6. Tests and Verification

- [x] 6.1 Add schema validation tests for valid plans, missing fields, unknown node types, dependency cycles, missing artifact contracts, and unsupported replan mutations.
- [x] 6.2 Add planner adapter tests for structured-output providers, JSON fallback validation, and invalid non-JSON responses.
- [x] 6.3 Add SDD artifact mapping tests that verify MRD -> `proposal.md`, technical design -> `design.md`/`spec.md`, generated task files -> `tasks.md`, and no new-run dependency on `prd.md`.
- [x] 6.4 Add DAG executor tests for dependency scheduling, branch/model/command/browser/tool concurrency limits, blocked nodes, and sibling artifact preservation.
- [x] 6.5 Add replan tests for failed frontend track, contract failure, E2E failure, user-adjusted ownership, fuse exhaustion, and plan revision audit history.
- [x] 6.6 Add UI/read-model tests for validation errors, structured confirmation refresh recovery, plan revision display, and hidden dynamic lanes before plan validation.
- [x] 6.7 Add gated real-flow tests using `example/activity-hit-preview-mrd.md`, `example/marketing`, and `example/marketing-admin` to verify frontend/backend/contract/E2E track generation and SDD OpenSpec artifacts.
