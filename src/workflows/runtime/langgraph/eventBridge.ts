import { getEventLog } from '../../../events/EventLog.js';
import { EventType, PipelineEvent } from '../../../events/types.js';
import { getStateStore } from '../../../persistence/stateStore.js';
import { WorkflowDefinition } from '../../types.js';
import { syncExecutionStateFromGraph } from './readModelSync.js';
import {
  PipelineGraphState,
  addNodeIdempotencyKey,
  hasNodeIdempotencyKey,
} from './state.js';

export interface LangGraphEventBridge {
  emitPipelineEvent(
    type: EventType,
    payload?: Record<string, unknown>,
    nodeId?: string,
    agentRunId?: string
  ): PipelineEvent;
  emitPipelineEventOnce(
    state: PipelineGraphState,
    idempotencyKey: string,
    type: EventType,
    payload?: Record<string, unknown>,
    nodeId?: string,
    agentRunId?: string
  ): { event?: PipelineEvent; state: PipelineGraphState };
  syncReadModel(state: PipelineGraphState, reason: string): void;
}

export function createLangGraphEventBridge(
  runId: string,
  workflow?: WorkflowDefinition,
  options: { productTransitionsAreDurable?: boolean } = {},
): LangGraphEventBridge {
  if (options.productTransitionsAreDurable) return createDetachedBridge(runId);
  const eventLog = getEventLog(runId);
  const store = getStateStore(runId);

  return {
    emitPipelineEvent(type, payload, nodeId, agentRunId) {
      return eventLog.logEvent(type, payload, agentRunId, nodeId);
    },
    emitPipelineEventOnce(state, idempotencyKey, type, payload, nodeId, agentRunId) {
      const targetNodeId = nodeId ?? state.currentNodeId;
      if (!targetNodeId) {
        return {
          event: eventLog.logEvent(type, payload, agentRunId, nodeId),
          state,
        };
      }
      if (hasNodeIdempotencyKey(state, targetNodeId, idempotencyKey)) {
        return { state };
      }
      const event = eventLog.logEvent(type, payload, agentRunId, nodeId);
      return {
        event,
        state: addNodeIdempotencyKey(state, targetNodeId, idempotencyKey),
      };
    },
    syncReadModel(state, reason) {
      const existing = store.loadExecutionState();
      const executionState = syncExecutionStateFromGraph(state, {
        reason,
        existing,
        workflow,
      });
      store.saveExecutionState(executionState);
    },
  };
}

/** The shared fenced committer owns persistence; this bridge only preserves the runtime API shape. */
function createDetachedBridge(runId: string): LangGraphEventBridge {
  const event = (type: EventType, payload?: Record<string, unknown>, nodeId?: string, agentRunId?: string): PipelineEvent => ({
    id: `detached:${runId}:${nodeId ?? 'run'}:${type}:${Date.now()}`,
    type,
    runId,
    timestamp: Date.now(),
    agentRunId,
    nodeId,
    data: payload,
  });
  return {
    emitPipelineEvent: event,
    emitPipelineEventOnce(state, idempotencyKey, type, payload, nodeId, agentRunId) {
      const targetNodeId = nodeId ?? state.currentNodeId;
      if (!targetNodeId || hasNodeIdempotencyKey(state, targetNodeId, idempotencyKey)) return { state };
      return {
        event: event(type, payload, nodeId, agentRunId),
        state: addNodeIdempotencyKey(state, targetNodeId, idempotencyKey),
      };
    },
    syncReadModel() {},
  };
}
