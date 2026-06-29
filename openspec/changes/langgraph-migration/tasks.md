## 1. Spike and Dependency Setup

- [x] 1.1 Add pinned `@langchain/langgraph` and `@langchain/core` dependencies.
- [x] 1.2 Build a three-node LangGraph spike that starts, checkpoints, interrupts, resumes, and completes with `thread_id = runId`.
- [x] 1.3 Prototype file checkpoint writes under a temporary run directory using temp-file-then-rename semantics.
- [x] 1.4 Prototype mapping LangGraph stream output into existing `PipelineEvent`-compatible WebSocket events.
- [x] 1.5 Document the selected LangGraph JS version and any API constraints discovered during the spike.

## 2. Workflow Definition Foundation

- [x] 2.1 Add `src/workflows/types.ts` with `WorkflowDefinition`, `WorkflowNode`, `WorkflowEdge`, node data, fanout, join, and global config types.
- [x] 2.2 Add built-in workflow generation from `PIPELINE_NODES`, including explicit confirmation nodes or confirmation metadata.
- [x] 2.3 Add workflow validation for required artifact chains, allowed node types, bounded loops, stage runner whitelist, and locked built-in workflow structure.
- [x] 2.4 Add workflow storage for built-in configuration and future custom workflow definitions.
- [x] 2.5 Add run-bound workflow snapshot metadata when a new run is created.
- [x] 2.6 Add workflow APIs for retrieving the default workflow and updating allowed built-in node configuration.

## 3. Locked Workflow UI

- [ ] 3.1 Add a React Flow workflow view that renders the built-in MRD-to-Code workflow.
- [x] 3.2 Implement locked mode so built-in nodes, required edges, and stage runners cannot be structurally edited.
- [x] 3.3 Add node configuration controls for model override, max turns, prompt config, tools, skills, and confirmation settings.
- [x] 3.4 Overlay run state from `execution-state.json` onto workflow nodes without writing runtime status into workflow definitions.
- [x] 3.5 Add frontend handling for historical runs without workflow snapshots by deriving the compatible built-in workflow view.

## 4. LangGraph Runtime Core

- [x] 4.1 Add `src/langgraph/state.ts` with JSON-serializable graph state, node state, retry state, confirmation state, branch state, join state, and reducers.
- [x] 4.2 Add `src/langgraph/checkpointer.ts` with memory checkpointer for tests and durable file checkpointer for runtime.
- [x] 4.3 Add `src/langgraph/readModelSync.ts` to map graph state into `ExecutionState`.
- [x] 4.4 Add `src/langgraph/eventBridge.ts` to write compatible events to `EventLog` and WebSocket listeners.
- [x] 4.5 Add `src/langgraph/compiler.ts` to compile `WorkflowDefinition` into a LangGraph app with normal, conditional, rollback, and approval edges.
- [x] 4.6 Add `src/langgraph/runtime.ts` with `start`, `resume`, `cancel`, and stream wrapper methods.
- [x] 4.7 Add runtime feature flags for `AI_CODING_WORKFLOW_RUNTIME` and `AI_CODING_LANGGRAPH_CHECKPOINTER`.

## 5. Stage Runner Extraction

- [x] 5.1 Define `StageRunnerContext`, `StageRunnerResult`, and runner registry types.
- [x] 5.2 Extract `upload-init` execution into a reusable runner while preserving legacy behavior.
- [x] 5.3 Extract `mrd-render` execution and artifact/context manifest writes into a reusable runner.
- [x] 5.4 Extract `implementation-plan` execution into a reusable runner.
- [x] 5.5 Extract `spec-generate` execution into a reusable runner.
- [x] 5.6 Extract `java-impl` execution, review artifacts, and child agent tracking into a reusable runner.
- [x] 5.7 Extract `testcode-generate` execution, Maven result handling, and failure classification into a reusable runner.
- [x] 5.8 Extract `archive` execution and delivery package generation into a reusable runner.
- [x] 5.9 Update legacy `PipelineEngine` to call extracted runners without changing external behavior.

## 6. LangGraph Node Wrappers and Control Flow

- [x] 6.1 Implement generic stage node wrapper that marks node start, calls a runner, records artifacts, handles failures, and syncs read model.
- [x] 6.2 Implement confirmation node with serializable interrupt payloads and approve/reject resume handling.
- [x] 6.3 Add idempotency keys for confirmation waiting events and other resume-sensitive event writes.
- [x] 6.4 Implement router nodes for Java review rollback, test failure rollback, coverage retry, and failure terminal routing.
- [x] 6.5 Implement downstream node reset behavior for rollback and retry paths.
- [x] 6.6 Implement cancellation handling that updates graph state, `execution-state.json`, and event log consistently.

## 7. Compatibility and Historical Runs

- [x] 7.1 Ensure existing REST session APIs delegate to legacy or LangGraph runtime based on feature flag.
- [x] 7.2 Ensure existing WebSocket clients can consume LangGraph-backed runs without protocol changes.
- [x] 7.3 Keep existing full-flow demo fixture readable under the legacy structure.
- [x] 7.4 Add a LangGraph demo fixture containing `execution-state.json`, `langgraph/checkpoints/latest.json`, `logs/events.ndjson`, and artifacts.
- [x] 7.5 Add best-effort checkpoint recovery from `execution-state.json` for explicitly migrated runs.

## 8. Multi-Application Branch Runtime

- [x] 8.1 Extend state types and read-model mapping for branch state, branch order, joins, and project drilldown.
- [x] 8.2 Add branch workflow definition types and a built-in application branch workflow.
- [x] 8.3 Implement fanout node that creates stable branch states from project/application manifest data.
- [x] 8.4 Implement branch runner for project-scoped spec, code implementation, code review, test-code generation, unit test, integration test, and branch summary stages.
- [x] 8.5 Implement branch, LLM, and command concurrency semaphores with configurable limits.
- [x] 8.6 Implement branch failure policies for `fail_fast`, `continue_and_collect`, and `threshold`.
- [x] 8.7 Implement join node that records waiting, completed, and failed branch ids.
- [x] 8.8 Synchronize branch node status and artifacts into `ExecutionState.projects`.

## 9. Cross-Application Review and Rollback

- [x] 9.1 Define branch summary artifact schema for changed files, API changes, database changes, config changes, dependency changes, test results, risks, and required cross-app checks.
- [x] 9.2 Generate `artifacts/<project>/branch-summary.json` at branch completion.
- [x] 9.3 Implement `cross-app-code-review` runner that reads branch summaries and writes structured findings.
- [x] 9.4 Implement `cross-app-integration-review` runner and artifacts.
- [x] 9.5 Implement affected-branch rollback state and routing.
- [x] 9.6 Implement main-workflow rollback when cross-app review identifies planning-level issues.
- [x] 9.7 Add archive aggregation for cross-application delivery metadata.

## 10. Multi-Application UI

- [x] 10.1 Render fanout nodes with aggregate branch progress.
- [x] 10.2 Add expandable branch drilldown with branch node status, events, artifacts, and errors.
- [x] 10.3 Display cross-application review findings with affected branch links.
- [ ] 10.4 Add controls to rerun failed branches when runtime state permits.
- [ ] 10.5 Add cancel handling for a single branch and whole-run cancellation if supported by runtime state.

## 11. Tests

- [x] 11.1 Add unit tests for workflow validation and built-in workflow generation.
- [x] 11.2 Add unit tests for LangGraph state reducers and read-model synchronization.
- [x] 11.3 Add unit tests for file checkpoint write/read and latest checkpoint recovery.
- [x] 11.4 Add unit tests for confirmation decision handling and idempotent confirmation events.
- [x] 11.5 Add unit tests for rollback routers and retry counter updates.
- [x] 11.6 Add unit tests for fanout branch creation, branch scheduler concurrency, join state, and affected-branch rollback.
- [x] 11.7 Add dual-runtime golden tests comparing legacy and LangGraph final status, node order, artifacts, events, context manifests, and agent state.
- [x] 11.8 Add integration tests for start, interrupt, approve, reject with feedback, process restart resume, failure rollback, and archive completion.
- [x] 11.9 Add integration tests for multi-application fanout, branch failure, branch-only rollback, join, cross-app review, and concurrency limits.
- [ ] 11.10 Add Playwright tests for workflow canvas loading, locked mode, node config save, confirmation resume, historical run display, fanout drilldown, and cross-app finding navigation.

## 12. Rollout and Documentation

- [x] 12.1 Add operator documentation for runtime flags, checkpointer modes, concurrency settings, and rollback behavior.
- [x] 12.2 Add developer documentation for workflow definitions, stage runner contracts, graph state, and event bridge boundaries.
- [x] 12.3 Run CI with both legacy and LangGraph runtime test suites.
- [x] 12.4 Keep `legacy` as the default runtime until golden, integration, and frontend tests pass.
- [ ] 12.5 Switch default runtime to LangGraph after parity is verified and document the fallback path.
