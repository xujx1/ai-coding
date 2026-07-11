import type { FailureCategory } from '../lifecycle/failureFix.js';

export const AI_OPS_SOURCE_FILES = [
  'src/integrations/ai-ops.ts',
];

export interface AiOpsClassification {
  category: FailureCategory;
  confidence: number;
  matchedRule: string;
}

export function classifyOperationalFailure(message: string): AiOpsClassification {
  const text = message.toLowerCase();
  const rules: Array<{ category: FailureCategory; confidence: number; label: string; match: () => boolean }> = [
    { category: 'ENVIRONMENT', confidence: 0.8, label: 'POD_OFFLINE/HEALTH_CHECK_FAIL', match: () => includesAny(text, ['pod', 'health check', 'readiness', 'liveness', '启动', '不可用']) },
    { category: 'ENVIRONMENT', confidence: 0.75, label: 'INFRA_NETWORK', match: () => includesAny(text, ['dns', 'network', 'connection refused', '丢包', '网络']) },
    { category: 'CI_INFRA', confidence: 0.75, label: 'CI_INFRA', match: () => includesAny(text, ['ci', 'runner', 'pipeline', '构建机', '执行器']) },
    { category: 'CONFIGURATION', confidence: 0.7, label: 'CONFIGURATION', match: () => includesAny(text, ['config', 'env', '环境变量', '配置']) },
    { category: 'TEST_DATA', confidence: 0.7, label: 'BUSINESS_DATA_INCONSISTENCY', match: () => includesAny(text, ['data', '数据', '状态机', '不一致', 'missing seed']) },
    { category: 'CODE_BUG', confidence: 0.7, label: 'CHANGE_INDUCED', match: () => includesAny(text, ['nullpointer', 'exception', 'assertion', 'bug', '变更', '发布']) },
  ];
  const matched = rules.find(rule => rule.match());
  return {
    category: matched?.category ?? 'UNKNOWN',
    confidence: matched?.confidence ?? 0.4,
    matchedRule: matched?.label ?? 'UNKNOWN',
  };
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}
