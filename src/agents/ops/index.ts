export * from './types.js';
export * from './opsAgentTools.js';
export * from './opsGuidance.js';
export * from './opsDiagnosisPrompts.js';
export * from './similarAlertAgent.js';
export * from './localLogTraceAgent.js';
export * from './codeContextAgent.js';
export * from './appKnowledgeAgent.js';
export * from './globalImpactAgent.js';
export * from './repairPlanAgent.js';

import { SIMILAR_ALERT_AGENT } from './similarAlertAgent.js';
import { LOCAL_LOG_TRACE_AGENT } from './localLogTraceAgent.js';
import { CODE_CONTEXT_AGENT } from './codeContextAgent.js';
import { APP_KNOWLEDGE_AGENT } from './appKnowledgeAgent.js';
import { GLOBAL_IMPACT_AGENT } from './globalImpactAgent.js';
import { REPAIR_PLAN_AGENT } from './repairPlanAgent.js';
import type { OpsAgentDefinition } from './types.js';

export const OPS_AGENT_DEFINITIONS: OpsAgentDefinition[] = [
  SIMILAR_ALERT_AGENT,
  LOCAL_LOG_TRACE_AGENT,
  CODE_CONTEXT_AGENT,
  APP_KNOWLEDGE_AGENT,
  GLOBAL_IMPACT_AGENT,
  REPAIR_PLAN_AGENT,
];

export function getOpsAgentDefinition(id: string): OpsAgentDefinition | undefined {
  return OPS_AGENT_DEFINITIONS.find(agent => agent.id === id);
}
