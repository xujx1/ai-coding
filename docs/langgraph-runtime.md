# LangGraph Runtime Migration

## Runtime Flags

The legacy runtime remains the default.

```text
AI_CODING_WORKFLOW_RUNTIME=legacy|langgraph
AI_CODING_WORKFLOW_EDITOR=0|1
AI_CODING_LANGGRAPH_CHECKPOINTER=file|memory|postgres
AI_CODING_BRANCH_CONCURRENCY=4
AI_CODING_LLM_CONCURRENCY=6
AI_CODING_TEST_CONCURRENCY=2
AI_CODING_BRANCH_FAILURE_POLICY=continue_and_collect
```

Current behavior:

- `legacy` keeps using `PipelineEngine`.
- `langgraph` routes session start/confirm/cancel HTTP controls through `LangGraphRuntime`.
- The first LangGraph slice uses `MemorySaver` for active graph execution and writes a file checkpoint envelope after state transitions.
- Production durable graph resume from file checkpoint is not complete yet; file checkpoints are currently used as recovery metadata and read-model support.

## Checkpoint Layout

LangGraph checkpoint envelopes are written under each run directory:

```text
runs/<runId>/
  langgraph/
    latest.json
    metadata.json
    checkpoints/
      checkpoint-<timestamp>.json
```

Writes use temp-file-then-rename semantics.

## Workflow Definitions

Workflow definitions live under the runtime directory:

```text
runtime-projects/
  workflows/
    default-mrd-to-code.json
```

If no stored definition exists, the system derives the built-in MRD-to-Code workflow from `PIPELINE_NODES`.

Key boundaries:

- `WorkflowDefinition` is a reusable template.
- `PipelineGraphState` is runtime state.
- `execution-state.json` remains the product read model.
- Dynamic branch instances are runtime/read-model data and must not be written back into workflow templates.

## Stage Runner Contract

`src/workflows/runtime/pipelineNodeRunners.ts` defines the runner boundary used by extraction work:

- `StageRunnerContext` carries run id, workflow id, node id, paths, execution state, node state, event log, state store, emit callback, and artifact writer callback.
- `StageRunnerResult` returns output, output artifacts, optional context manifest, and child agent ids.
- `upload-init` is the first extracted runner and still preserves legacy artifact events through the engine callback.

## Event Bridge

`src/langgraph/eventBridge.ts` centralizes product-visible LangGraph output:

- emits `PipelineEvent` entries through `EventLog`
- synchronizes graph state to `execution-state.json`
- supports idempotent event emission for resume-sensitive events

`src/server/ws.ts` maps `EventLog` entries back into the existing WebSocket message shapes used by the vanilla frontend.

## Branch Runtime Primitives

Current branch support includes:

- branch state and join state in `PipelineGraphState`
- branch-to-project read-model mapping in `syncExecutionStateFromGraph`
- built-in application branch workflow definition
- fanout helper that creates stable branch ids and join state
- branch, LLM, and test semaphores
- join failure policies: `fail_fast`, `continue_and_collect`, `threshold`

Actual project-scoped branch execution remains pending.
