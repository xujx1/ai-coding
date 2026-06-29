## Context

`ai-coding` is a fixed MRD-to-Code workbench. The current runtime is a custom `PipelineEngine` that executes `PIPELINE_NODES`, writes `execution-state.json`, streams `PipelineEvent` entries to `logs/events.ndjson` and WebSocket clients, and coordinates artifacts, confirmations, retries, rollback, child agents, and context manifests.

The migration target is not a generic workflow product and not a rewrite of all node business logic. The target is to move scheduling, checkpointing, interrupt/resume, and future dynamic branching to LangGraph while keeping the existing product contracts stable:

- `execution-state.json` remains the UI/API read model.
- `logs/events.ndjson` remains the UI trace and audit source.
- `artifacts/`, `workspace/`, `agents/`, and context manifest files remain run-directory contracts.
- Existing sessions and demo fixtures remain readable.
- The current node prompt and `AgentEngine` behavior are reused first, then refactored after runtime stability.

## Goals / Non-Goals

**Goals:**

- Represent the built-in MRD-to-Code pipeline as a workflow definition that can be rendered in React Flow and later forked into custom workflows.
- Add a LangGraph runtime path that can start, stream, interrupt, resume, cancel, retry, and complete runs using `thread_id = runId`.
- Preserve current REST API, WebSocket event semantics, run-directory layout, and historical run compatibility.
- Extract reusable stage runners from `PipelineEngine` so both legacy and LangGraph paths can execute the same business nodes during migration.
- Add dynamic multi-application execution with fanout, branch state, join, cross-application review, concurrency limits, and targeted branch rollback.
- Keep rollout reversible through feature flags and dual-runtime golden tests.

**Non-Goals:**

- Do not expose LangGraph checkpoints directly to the frontend as the read protocol.
- Do not rewrite all node prompts, Java/Maven logic, tool permissions, or `AgentEngine` loops in the first implementation phase.
- Do not treat React Flow nodes and edges as a direct serialization of LangGraph internal state.
- Do not enable unrestricted workflow structure editing before validation, snapshotting, and stage runner whitelists exist.
- Do not migrate historical runs to LangGraph checkpoints by default.

## Decisions

### Decision 1: Keep `execution-state.json` as the product read model

LangGraph state and checkpoint files will be the runtime recovery source, but every graph state transition that affects product state will synchronize to `execution-state.json` through `readModelSync.ts`.

Alternatives considered:

- Use LangGraph checkpoint as the frontend protocol. Rejected because existing APIs, WebSocket recovery, demos, and archives depend on `ExecutionState`.
- Keep only `execution-state.json` and skip LangGraph checkpointing. Rejected because it does not provide durable interrupt/resume and time-travel semantics.

### Decision 2: Split workflow definition, runtime state, and run instance state

`WorkflowDefinition` stores the template graph. `PipelineGraphState` stores runtime state. `ExecutionState` remains the product read model. Dynamic branch instances are stored in runtime/read-model state, not written back into workflow definitions.

Alternatives considered:

- Expand actual application branches into the workflow definition for each run. Rejected because run-specific state would pollute reusable templates.
- Keep the fixed `PIPELINE_NODES` array as the only definition. Rejected because React Flow visualization, versioning, validation, and future workflow fork support need a richer graph model.

### Decision 3: Use a locked built-in workflow before custom editing

The first workflow UI renders the built-in MRD-to-Code workflow in locked mode. It allows safe configuration changes such as model overrides, `maxTurns`, prompt configuration, tools/skills, and confirmation gate toggles. Structural editing is introduced later with validation and snapshots.

Alternatives considered:

- Ship full custom workflow editing immediately. Rejected because deleting required stage nodes or edges could break downstream artifact dependencies.
- Build only backend runtime first. Rejected because workflow visualization is useful for validating state mapping and later custom workflow support.

### Decision 4: Extract stage runners before replacing `PipelineEngine`

Current node execution is moved behind `StageRunner` functions. The legacy runtime and LangGraph runtime both call those runners during migration.

Alternatives considered:

- Reimplement all nodes directly as LangGraph nodes. Rejected because this would combine runtime migration with business logic migration and increase regression risk.
- Keep calling private `PipelineEngine` internals from LangGraph nodes. Rejected because it preserves the current coupling and makes rollback/resume behavior unclear.

### Decision 5: Put confirmation interrupts in dedicated confirmation nodes

Stage nodes write business artifacts and complete. A following confirmation node builds a serializable interrupt payload, synchronizes waiting state, and calls LangGraph `interrupt()`. Approve/reject decisions resume through `Command({ resume })`.

Alternatives considered:

- Call `interrupt()` inside stage nodes. Rejected because LangGraph may re-enter the node on resume, making pre-interrupt file/event writes vulnerable to duplication.
- Keep confirmation outside LangGraph. Rejected because resume semantics would be split across two runtime systems.

### Decision 6: Centralize rollback and retry decisions in router nodes

Router nodes read graph state, artifact indexes, review findings, and retry counters to select the next edge. They do not perform business side effects. Downstream reset and retry state updates are handled consistently before route selection.

Alternatives considered:

- Let each stage runner decide and invoke the next node. Rejected because it recreates custom engine control flow inside business code.
- Encode all rollback behavior as static edges only. Rejected because rollback depends on runtime findings, failure classification, and retry thresholds.

### Decision 7: Start with file checkpointing, then leave room for DB checkpointing

The first durable checkpointer writes under `runs/<runId>/langgraph/checkpoints/` with atomic temp-file rename and `latest.json`. Memory checkpointer is allowed only for local spike tests. SQLite/Postgres checkpointing remains a later option for multi-process deployment.

Alternatives considered:

- Use memory checkpointing for the first shipped version. Rejected because process restart resume is a migration goal.
- Move directly to Postgres. Rejected because the current product is file-run-directory based and does not need multi-instance infrastructure yet.

### Decision 8: Model multi-application execution as fanout plus branch workflows

The main workflow contains fanout, join, and aggregate review nodes. At runtime, fanout creates stable branch state from `ProjectManifest` projects. Branch execution uses concurrency limits and writes branch summaries. Cross-application review reads summaries and returns affected branch rollback instructions.

Alternatives considered:

- Draw one static node chain per application in the workflow definition. Rejected because application count is only known at run time.
- Let cross-application review directly edit code. Rejected because aggregate review should produce findings and rollback directives, while affected branches perform fixes in their own execution context.

### Decision 9: Gate rollout with feature flags and dual-runtime tests

Runtime selection uses `AI_CODING_WORKFLOW_RUNTIME=legacy|langgraph`. Workflow editor and checkpointer selection also use flags. CI runs golden tests for both legacy and LangGraph before switching defaults.

Alternatives considered:

- Replace the legacy runtime in one cutover. Rejected because historical runs, demo fixtures, and rollback safety require coexistence.
- Keep LangGraph only as an experiment with no dual-runtime tests. Rejected because behavior compatibility is the core migration risk.

## Risks / Trade-offs

- [Risk] LangGraph checkpoint and `execution-state.json` diverge. -> Mitigation: graph patches synchronize read model immediately, tests cover restart/resume, and a consistency check compares checkpoint state against read model.
- [Risk] Confirmation resume repeats side effects. -> Mitigation: confirmation is a separate node, event writes use idempotency keys, and business artifacts are written before entering the confirmation node.
- [Risk] Extracting stage runners destabilizes legacy runtime. -> Mitigation: keep legacy behavior as the reference, run golden tests against both runtimes, and extract one runner category at a time.
- [Risk] Workflow editing can produce invalid artifact chains. -> Mitigation: built-in workflow starts locked, custom workflows require validation, stage runner additions use a whitelist, and run snapshots are immutable after launch.
- [Risk] Multi-application branch concurrency overloads LLM providers or local Maven runs. -> Mitigation: enforce branch, LLM, and test semaphores with conservative defaults and configurable limits.
- [Risk] Cross-application rollback can discard too much completed work. -> Mitigation: review output includes `affectedBranches`, branch-level rollback is default, and main-workflow rollback is reserved for planning errors.
- [Risk] LangGraph JavaScript APIs evolve. -> Mitigation: isolate LangGraph calls in `src/langgraph/runtime.ts` and `src/langgraph/compiler.ts`, pin dependency versions, and add smoke tests around runtime primitives.

## Migration Plan

1. Run a spike that installs LangGraph dependencies, compiles a three-node graph, verifies file checkpointing, verifies approve/reject interrupts, and bridges stream events to WebSocket-compatible events.
2. Add `src/workflows/` types, built-in MRD-to-Code workflow generation from `PIPELINE_NODES`, validation, storage, and a locked React Flow workflow view.
3. Add `src/langgraph/` state, compiler, runtime, file checkpointer, read-model sync, event bridge, stage wrapper, confirmation node, and command model behind feature flags.
4. Extract existing pipeline node business logic into stage runners and keep legacy runtime behavior intact.
5. Add router nodes for Java review, test failure, coverage failure, retry, and rollback behavior.
6. Add branch workflow definitions, fanout state creation, branch scheduler with concurrency limits, join state, branch-to-`ExecutionState` sync, and frontend drilldown.
7. Add branch summaries, cross-application review runners, cross-app integration review, affected-branch rollback, and archive aggregation.
8. Add custom workflow fork/edit APIs, validator, node configuration panels, and run-bound workflow snapshots.
9. Switch default runtime to LangGraph only after dual-runtime golden tests, frontend tests, demo fixtures, and restart/resume tests pass.

Rollback strategy:

- Leave `AI_CODING_WORKFLOW_RUNTIME=legacy` as the default until LangGraph reaches parity.
- Allow new runs to switch back to legacy if LangGraph regressions appear.
- Keep already-started LangGraph runs on LangGraph to avoid cross-runtime resume ambiguity.
- If checkpoint recovery fails, attempt best-effort recovery from `execution-state.json` and mark the run state accordingly.

## Open Questions

- Which LangGraph JS version should be pinned for the first implementation milestone?
- Should file checkpoint metadata include checksums for `execution-state.json` consistency checks?
- What is the first supported custom workflow editing scope: node config only, or limited structural edits with stage runner whitelist?
- Should branch workspaces share Maven caches through a read-only cache plus per-branch write cache, or use fully isolated local repositories?
- What retry thresholds should trigger manual confirmation for repeated cross-application rollback?
