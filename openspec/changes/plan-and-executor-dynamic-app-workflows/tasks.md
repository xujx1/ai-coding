## 1. Plan Models and Capability Detection

- [ ] 1.1 Add typed models for session execution plans, application branch plans, track plans, planned nodes, planner evidence, validation errors, and planner version metadata.
- [ ] 1.2 Extend session workflow instance state to persist generated plan snapshots separately from runtime node status.
- [ ] 1.3 Extend project capability snapshots to classify backend, frontend, fullstack, contract, testable, documentation-only, and mixed-module project shapes.
- [ ] 1.4 Add capability evidence for backend signals including Maven/Java/Spring files, backend entry points, controller/router files, and backend tests.
- [ ] 1.5 Add capability evidence for frontend signals including package metadata, Vite/Next config, frontend source roots, browser test config, and frontend tests.
- [ ] 1.6 Add confidence and fallback reason handling for ambiguous or documentation-only project capability detection.
- [ ] 1.7 Add unit tests for backend-only, frontend-only, fullstack, documentation-only, and mixed project capability snapshots.

## 2. Dynamic Workflow Planner

- [ ] 2.1 Implement a planner that combines fanout decisions, MRD ownership output, and capability snapshots into session-scoped application branch plans.
- [ ] 2.2 Generate backend implementation/test tracks only when backend capability and MRD impact require them.
- [ ] 2.3 Generate frontend implementation/test/E2E tracks only when frontend capability and MRD impact require them.
- [ ] 2.4 Generate API contract tracks when MRD ownership or capability evidence indicates cross-frontend/backend API impact.
- [ ] 2.5 Generate documentation fallback tracks for apps without executable source or build capability.
- [ ] 2.6 Record planner source artifacts, evidence, omitted-track reasons, fallback reasons, and generated plan version in the session workflow instance.
- [ ] 2.7 Add bounded plan validation for allowed node types, allowed track types, acyclic dependencies, required artifacts, and supported fallback paths.
- [ ] 2.8 Reject invalid planner output before execution and surface visible planning validation errors in session state.

## 3. Branch and Track Executor

- [ ] 3.1 Extend branch runtime state to track nested tracks and planned nodes independently from the top-level app branch status.
- [ ] 3.2 Implement executor dispatch from planned node type to stable runner catalog entries for backend, frontend, contract, E2E, documentation, and summary nodes.
- [ ] 3.3 Support runnable-node scheduling across nested tracks while preserving declared dependencies and app-level joins.
- [ ] 3.4 Apply branch, model, command, and browser concurrency limits when executing dynamic plans.
- [ ] 3.5 Ensure track failure only marks that track and dependent joins failed or waiting for fix, without overwriting completed sibling artifacts.
- [ ] 3.6 Implement branch, track, and node-scoped rerun from failed nodes while preserving unrelated completed track state.
- [ ] 3.7 Implement cancellation for active branches and active track nodes without cancelling unrelated application branches.
- [ ] 3.8 Synchronize planned node status, timings, child agent ids, failure counts, and output artifacts into session runtime state.

## 4. OpenSpec Plan Compatibility

- [ ] 4.1 Generate a stable app-scoped OpenSpec change id for each planned application branch.
- [ ] 4.2 Write app-level OpenSpec proposal, design, tasks, and specs under the project artifact scope during `spec-generate`.
- [ ] 4.3 Add track-aware task sections for backend, frontend, contract, E2E, documentation, and test work in app OpenSpec `tasks.md`.
- [ ] 4.4 Update OpenSpec task completion by track and section when planned implementation/test/contract/E2E nodes complete.
- [ ] 4.5 Preserve legacy single-chain OpenSpec artifact reading and task completion behavior for historical fixed-node runs.
- [ ] 4.6 Include OpenSpec change ids, task artifact paths, and task completion status in branch summaries and archive metadata.

## 5. Read Model, UI, and Artifact Indexing

- [ ] 5.1 Extend read-model synchronization to expose planned app branches, nested tracks, track nodes, joins, validation errors, and fallback evidence.
- [ ] 5.2 Render application fanout and nested tracks in the workflow UI without mutating global workflow templates.
- [ ] 5.3 Add app/track/node artifact filtering for planned dynamic branch artifacts.
- [ ] 5.4 Preserve historical run rendering for sessions with captured legacy fixed-node workflow instances.
- [ ] 5.5 Surface planner inputs, capability evidence, omitted-track reasons, and fallback reasons in session details.
- [ ] 5.6 Update cross-app code and integration review inputs to consume dynamic branch summaries and track outputs.
- [ ] 5.7 Update archive aggregation to link each app branch, track summary, OpenSpec mapping, and delivery artifact.

## 6. Tests and Documentation

- [ ] 6.1 Add planner unit tests for fullstack, backend-only, frontend-only, contract-only, documentation-only, and mixed-module application plans.
- [ ] 6.2 Add validation tests for unsupported node types, unsupported track types, dependency cycles, missing artifacts, and low-confidence fallback behavior.
- [ ] 6.3 Add executor tests for parallel backend/frontend tracks, track joins, sibling artifact preservation, rerun, and cancellation.
- [ ] 6.4 Add OpenSpec compatibility tests for track-aware task sections and section-scoped completion updates.
- [ ] 6.5 Add read-model and UI-facing tests for nested branch snapshots, artifact filtering, historical run compatibility, and planner evidence display.
- [ ] 6.6 Add full-flow tests for fullstack apps, backend-only apps, documentation-only fallback apps, and cross-app review/archive compatibility.
- [ ] 6.7 Update local documentation to describe dynamic plan generation, capability detection, nested tracks, executor behavior, OpenSpec compatibility, and rollback/fallback policy.
