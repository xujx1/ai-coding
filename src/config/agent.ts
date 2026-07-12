import type { AgentConfig } from './types.js';

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxTurns: 80,
  compactThresholdRatio: 0.8,
  compactReserveRatio: 0.3,
  autoFixRounds: 3,
};
