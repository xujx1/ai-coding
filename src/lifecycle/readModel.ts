import {
  ApprovalGateRef,
  ArtifactRef,
  LifecycleState,
} from './types.js';
import { loadLifecycleState } from './store.js';

export interface LifecyclePendingConfirmationReadModel {
  type: 'confirmation_required';
  nodeId: string;
  title: string;
  content: string;
  artifactPath?: string;
  confirmationKind: string;
  approvalGateId: string;
  approvalGateType: ApprovalGateRef['gateType'];
  artifactRefs: ArtifactRef[];
  status: ApprovalGateRef['status'];
  structuredPayload: {
    source: 'lifecycle';
    approvalGate: ApprovalGateRef;
    artifactRefs: ArtifactRef[];
  };
}

export interface LifecycleReadModel {
  schemaVersion: LifecycleState['schemaVersion'];
  requirementId: string;
  runId: string;
  phase: LifecycleState['phase'];
  status: LifecycleState['status'];
  pendingConfirmation?: LifecyclePendingConfirmationReadModel;
}

export function buildLifecycleReadModel(runId: string): LifecycleReadModel | null {
  const state = loadLifecycleState(runId);
  return state ? buildLifecycleReadModelFromState(state) : null;
}

/** Allows repository-backed callers to build the identical public read model. */
export function buildLifecycleReadModelFromState(state: LifecycleState): LifecycleReadModel {
  return {
    schemaVersion: state.schemaVersion,
    requirementId: state.requirementId,
    runId: state.runId,
    phase: state.phase,
    status: state.status,
    pendingConfirmation: buildPendingConfirmationReadModel(state),
  };
}

export function buildPendingConfirmationReadModel(
  state: LifecycleState,
): LifecyclePendingConfirmationReadModel | undefined {
  const gate = [...state.approvals].reverse().find(item => item.status === 'waiting');
  if (!gate) return undefined;
  const node = state.nodeRuns.find(item => item.nodeRunId === gate.nodeRunId);
  const artifactRefs = gate.artifactIds
    .map(id => state.artifacts.find(artifact => artifact.artifactId === id))
    .filter((artifact): artifact is ArtifactRef => Boolean(artifact));
  const primaryArtifact = artifactRefs.find(artifact => artifact.path || artifact.uri);
  return {
    type: 'confirmation_required',
    nodeId: node?.nodeId ?? gate.nodeRunId,
    title: titleForGate(gate),
    content: contentForGate(gate, artifactRefs),
    artifactPath: primaryArtifact?.path,
    confirmationKind: confirmationKindForGate(gate),
    approvalGateId: gate.approvalGateId,
    approvalGateType: gate.gateType,
    artifactRefs,
    status: gate.status,
    structuredPayload: {
      source: 'lifecycle',
      approvalGate: gate,
      artifactRefs,
    },
  };
}

function titleForGate(gate: ApprovalGateRef): string {
  switch (gate.gateType) {
    case 'requirement_clarification':
      return '需求归属确认';
    case 'technical_design':
      return '技术方案确认';
    case 'pre_test_environment_code_review':
      return '测试环境发布前代码审核';
    case 'shared_environment_deployment':
      return '共享测试环境部署确认';
    case 'data_change':
      return '数据变更确认';
    case 'low_confidence_diagnosis':
      return '低置信度诊断确认';
    case 'unknown_failure':
      return '未知失败处理确认';
    default:
      return '人工确认';
  }
}

function confirmationKindForGate(gate: ApprovalGateRef): string {
  switch (gate.gateType) {
    case 'requirement_clarification':
      return 'mrd-clarify';
    case 'technical_design':
      return 'implementation-plan';
    case 'pre_test_environment_code_review':
      return 'plan';
    default:
      return `lifecycle-${gate.gateType}`;
  }
}

function contentForGate(gate: ApprovalGateRef, artifactRefs: ArtifactRef[]): string {
  const artifactLines = artifactRefs.length
    ? artifactRefs.map(artifact => `- ${artifact.type}: ${artifact.path ?? artifact.uri ?? artifact.artifactId}`).join('\n')
    : '- No artifact refs are attached.';
  const riskLines = gate.riskIds?.length
    ? gate.riskIds.map(risk => `- ${risk}`).join('\n')
    : '- No explicit risk refs are attached.';
  return [
    '## Pending lifecycle approval',
    '',
    `Gate: ${gate.gateType}`,
    `NodeRun: ${gate.nodeRunId}`,
    '',
    '## Related artifacts',
    artifactLines,
    '',
    '## Risks',
    riskLines,
  ].join('\n');
}
