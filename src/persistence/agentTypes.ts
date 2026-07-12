export type AgentStatus =
  | 'created'
  | 'waking'
  | 'running'
  | 'waiting_tool'
  | 'waiting_confirmation'
  | 'compacting'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting_fix'
  | 'interrupted';

export interface ModelSwitchEntry {
  fromModel: string;
  toModel: string;
  timestamp: number;
  reason: string;
}

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  risk?: 'low' | 'medium' | 'high';
}

export interface PlanState {
  title: string;
  steps: PlanStep[];
  risks: string[];
  confirmed?: boolean;
  feedback?: string;
  createdAt: number;
  confirmedAt?: number;
}

export interface AgentState {
  agentRunId: string;
  runId: string;
  nodeId: string;
  projectName?: string;
  projectRoot?: string;
  taskDescription?: string;
  status: AgentStatus;
  systemPrompt?: string;
  currentModelId: string;
  currentProviderId: string;
  intelligenceLevel: number;
  modelSwitchHistory: ModelSwitchEntry[];
  turnCount: number;
  tokenUsage: { input: number; output: number };
  compactCount: number;
  toolCallCount: number;
  inputArtifacts?: string[];
  outputArtifacts?: string[];
  transcriptPath?: string;
  planPath?: string;
  lastEventOffset?: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  plan?: PlanState;
}
