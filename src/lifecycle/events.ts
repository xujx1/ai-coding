import { nanoid } from 'nanoid';
import type {
  LifecycleEvent,
  LifecycleEventType,
  LifecycleState,
} from './types.js';

export interface AppendLifecycleEventInput {
  type: LifecycleEventType;
  workflowRunId?: string;
  nodeRunId?: string;
  artifactId?: string;
  data?: Record<string, unknown>;
  now?: number;
}

export function appendLifecycleEvent(
  state: LifecycleState,
  input: AppendLifecycleEventInput,
): LifecycleEvent {
  const event: LifecycleEvent = {
    eventId: `event_${nanoid()}`,
    requirementId: state.requirementId,
    runId: state.runId,
    type: input.type,
    timestamp: input.now ?? Date.now(),
    workflowRunId: input.workflowRunId,
    nodeRunId: input.nodeRunId,
    artifactId: input.artifactId,
    data: input.data,
  };
  state.events = [...state.events, event];
  return event;
}

