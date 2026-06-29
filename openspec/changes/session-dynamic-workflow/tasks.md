## 1. Read Model and Types

- [x] 1.1 Add typed session workflow instance structures for top-level nodes, edges, branch refs, join refs, version, template snapshot metadata, and legacy fallback marker.
- [x] 1.2 Extend `ExecutionState` to persist the session workflow instance without removing existing `nodes`, `projects`, `artifactIndex`, or `contextManifests`.
- [x] 1.3 Add helpers to create an initial session workflow instance for new runs.
- [x] 1.4 Add helpers to derive legacy fixed-node view data for historical runs without workflow instance metadata.
- [x] 1.5 Update state store serialization tests to cover workflow instance round-trip compatibility.

## 2. Session Creation and Snapshot Binding

- [x] 2.1 Update `SessionManager.createRun()` to store the built-in template snapshot as metadata and initialize a pending session workflow instance.
- [x] 2.2 Update fallback `PipelineEngine` state initialization to create the same session workflow instance when recovering a run without saved state.
- [x] 2.3 Update session list/detail APIs to return workflow instance metadata consistently.
- [x] 2.4 Add tests proving global workflow definitions are not mutated when a run creates branch instances.

## 3. Fanout Input and MRD Ownership

- [x] 3.1 Add a structured fanout decision artifact schema for candidates, included projects, excluded projects, unresolved projects, evidence, confidence, and fallback reason.
- [x] 3.2 Update upload initialization to expose uploaded project candidates as fanout input.
- [x] 3.3 Parse or derive affected project ownership from requirement decomposition artifacts.
- [x] 3.4 Implement affected-project selection with fallback to all uploaded projects when confidence is low.
- [x] 3.5 Record missing MRD-referenced projects as unresolved and fail or wait for correction according to policy.
- [x] 3.6 Write and index `artifacts/fanout-decision.json`.

## 4. Dynamic Runtime Orchestration

- [x] 4.1 Add top-level runtime nodes for project fanout, join, cross-app code review, cross-app integration review, and archive aggregation in the session workflow instance.
- [x] 4.2 Integrate fanout execution so affected projects create stable branch instances at runtime.
- [ ] 4.3 Move implementation-plan execution into branch-local node execution scoped by project.
- [ ] 4.4 Move spec-generate execution into branch-local node execution scoped by project.
- [ ] 4.5 Move java-impl execution and review artifacts into branch-local node execution scoped by project.
- [ ] 4.6 Move testcode-generate, Maven test execution, and failure classification into branch-local node execution scoped by project.
- [x] 4.7 Generate branch summary artifacts from branch-local state and artifact indexes.
- [x] 4.8 Synchronize branch node changes into `ExecutionState.projects` and the session workflow instance after every branch transition.

## 5. Join, Review, Rollback, and Controls

- [x] 5.1 Implement join state updates for waiting, completed, failed, and cancelled branches.
- [x] 5.2 Route successful joins to cross-application review nodes.
- [x] 5.3 Route branch-scoped review/test failures back to only affected branch nodes.
- [x] 5.4 Route planning-level findings back to the main planning node and invalidate downstream branch state.
- [x] 5.5 Add branch rerun API that schedules only the selected branch from the requested branch node.
- [x] 5.6 Add branch cancellation API and whole-run cancellation synchronization for active branches.
- [x] 5.7 Emit compatible event log and WebSocket events for fanout, branch transitions, join, branch rerun, branch cancellation, and cross-app rollback.

## 6. Frontend Session Graph UI

- [x] 6.1 Update `renderPipelineBar()` to render the current session workflow instance top-level nodes before falling back to legacy `state.pipeline.nodes`.
- [x] 6.2 Update workflow view loading to prefer session workflow instance and template snapshot metadata before calling the default workflow API.
- [x] 6.3 Render fanout, join, cross-app review, and archive nodes in the workflow view.
- [x] 6.4 Render expandable branch lanes with branch-local implementation-plan, spec, Java, test, and summary node states.
- [x] 6.5 Display included, excluded, unresolved projects, confidence, and fallback reason from the fanout decision artifact.
- [x] 6.6 Add branch rerun and branch cancel controls only when branch runtime state permits them.
- [x] 6.7 Preserve historical fixed-node rendering for runs without workflow instance data.

## 7. Tests

- [x] 7.1 Add unit tests for session workflow instance creation and legacy fallback derivation.
- [x] 7.2 Add unit tests for MRD ownership fanout selection, subset selection, fallback-to-all behavior, and unresolved project handling.
- [x] 7.3 Add unit tests for fanout decision artifact writing and artifact index updates.
- [x] 7.4 Add integration tests for single-project dynamic fanout.
- [x] 7.5 Add integration tests for multi-project dynamic fanout with at least one excluded uploaded project.
- [x] 7.6 Add integration tests for branch concurrency, branch failure, branch-only rollback, join, cross-app review, archive aggregation, branch rerun, and branch cancellation.
- [ ] 7.7 Add frontend tests for top pipeline bar session graph rendering, workflow branch lanes, fanout decision display, branch controls, and historical fallback.
- [x] 7.8 Run full legacy fallback tests and LangGraph dynamic workflow tests.

## 8. Documentation and Rollout

- [x] 8.1 Document the session workflow instance read model and historical fallback behavior.
- [x] 8.2 Document fanout decision artifact fields and MRD ownership fallback rules.
- [x] 8.3 Document branch rerun/cancel API behavior and runtime constraints.
- [x] 8.4 Keep dynamic workflow execution behind the runtime feature flag until tests pass.
- [x] 8.5 Update demo fixtures to include a dynamic multi-project session workflow instance.
