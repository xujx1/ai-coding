import { nanoid } from 'nanoid';
import type {
  ApprovalDecision,
  ApprovalGateRef,
  ApprovalGateType,
  LifecycleState,
} from './types.js';
import { appendLifecycleEvent } from './events.js';

export const FIXED_APPROVAL_GATES: ApprovalGateType[] = [
  'requirement_clarification',
  'technical_design',
  'pre_test_environment_code_review',
];

export const CONDITIONAL_APPROVAL_GATES: ApprovalGateType[] = [
  'high_risk_command',
  'large_code_change',
  'shared_environment_deployment',
  'data_change',
  'unknown_failure',
  'low_confidence_diagnosis',
  'cross_boundary_fix',
];

export interface CreateApprovalGateInput {
  nodeRunId: string;
  gateType: ApprovalGateType;
  workflowRunId?: string;
  artifactIds?: string[];
  riskIds?: string[];
  now?: number;
}

export interface ResolveApprovalGateInput {
  approvalGateId: string;
  decision: ApprovalDecision;
  resolvedBy: string;
  decisionReason?: string;
  feedback?: string;
  now?: number;
}

export function createApprovalGate(
  state: LifecycleState,
  input: CreateApprovalGateInput,
): ApprovalGateRef {
  const gate: ApprovalGateRef = {
    approvalGateId: `approval_${nanoid()}`,
    requirementId: state.requirementId,
    runId: state.runId,
    workflowRunId: input.workflowRunId,
    nodeRunId: input.nodeRunId,
    gateType: input.gateType,
    status: 'waiting',
    artifactIds: input.artifactIds ?? [],
    riskIds: input.riskIds,
    createdAt: input.now ?? Date.now(),
  };
  state.status = 'waiting_approval';
  state.approvals = [...state.approvals, gate];
  state.nodeRuns = state.nodeRuns.map(node => node.nodeRunId === input.nodeRunId
    ? { ...node, status: 'waiting_approval' }
    : node
  );
  appendLifecycleEvent(state, {
    type: 'approval_waiting',
    workflowRunId: input.workflowRunId,
    nodeRunId: input.nodeRunId,
    data: {
      approvalGateId: gate.approvalGateId,
      gateType: gate.gateType,
      artifactIds: gate.artifactIds,
      riskIds: gate.riskIds,
    },
    now: input.now,
  });
  return gate;
}

export function createFixedApprovalGate(
  state: LifecycleState,
  input: Omit<CreateApprovalGateInput, 'gateType'> & { gateType: typeof FIXED_APPROVAL_GATES[number] },
): ApprovalGateRef {
  return createApprovalGate(state, input);
}

export function createConditionalApprovalGate(
  state: LifecycleState,
  input: Omit<CreateApprovalGateInput, 'gateType'> & { gateType: typeof CONDITIONAL_APPROVAL_GATES[number] },
): ApprovalGateRef {
  return createApprovalGate(state, input);
}

export function resolveApprovalGate(
  state: LifecycleState,
  input: ResolveApprovalGateInput,
): ApprovalGateRef {
  let resolved: ApprovalGateRef | undefined;
  state.approvals = state.approvals.map(gate => {
    if (gate.approvalGateId !== input.approvalGateId) return gate;
    resolved = {
      ...gate,
      status: 'resolved',
      decision: input.decision,
      resolvedBy: input.resolvedBy,
      decisionReason: input.decisionReason,
      feedback: input.feedback,
      decidedAt: input.now ?? Date.now(),
    };
    return resolved;
  });
  if (!resolved) {
    throw new Error(`Approval gate not found: ${input.approvalGateId}`);
  }
  if (!state.approvals.some(gate => gate.status === 'waiting')) {
    state.status = 'active';
  }
  appendLifecycleEvent(state, {
    type: 'approval_resolved',
    workflowRunId: resolved.workflowRunId,
    nodeRunId: resolved.nodeRunId,
    data: {
      approvalGateId: resolved.approvalGateId,
      decision: resolved.decision,
      resolvedBy: resolved.resolvedBy,
      decisionReason: resolved.decisionReason,
      feedback: resolved.feedback,
    },
    now: input.now,
  });
  return resolved;
}

