# LangGraph Spike Notes

## Selected Versions

- `@langchain/langgraph`: `1.4.7`
- `@langchain/core`: `1.2.1`

Both dependencies are pinned exactly in `package.json` and `package-lock.json`.

## Verified APIs

The spike in `src/langgraph/spike.ts` verifies these LangGraph JS APIs:

- `Annotation.Root` for JSON-serializable graph state.
- `StateGraph` with `START` and `END` edges.
- `MemorySaver` for local checkpoint-backed interrupt testing.
- `interrupt()` for pausing a node with a serializable confirmation payload.
- `Command({ resume })` for resuming the interrupted node.
- `graph.getState(config)` for inspecting the paused node and interrupt payload.
- `graph.stream(..., { streamMode: 'updates' })` for mapping graph updates into `PipelineEvent`-compatible events.

## Runtime Constraints Found

- `thread_id` is supplied through `configurable.thread_id`; the migration should continue using `runId` as the thread id.
- `interrupt()` returns its resume value only after the graph is invoked again with `Command({ resume })`.
- Stream chunks in `updates` mode include node-name keys for ordinary node updates and `__interrupt__` for interrupt payloads.
- Confirmation payloads must remain JSON-serializable because they are stored in checkpoint/task state.
- File checkpoint writes should use temp-file-then-rename semantics; the spike writes both a concrete checkpoint file and `langgraph/latest.json`.

## Validation

Covered by `src/__tests__/langgraph.spike.test.ts`:

- Start, interrupt, inspect paused state, resume, and complete.
- Write/read durable spike checkpoint JSON with a latest pointer.
- Map update and interrupt stream chunks to `PipelineEvent`-compatible events.
