import type { OpsAgentDefinition, OpsAgentRunResult } from './types.js';
import type { OpsAlertAnalysis } from './types.js';
import { createLLMProvider } from '../../models/providers.js';
import { getModelForStage } from '../../models/registry.js';
import {
  buildOpsDiagnosisPrompt,
  buildOpsDiagnosisSystemPrompt,
} from './opsDiagnosisPrompts.js';

export const REPAIR_PLAN_AGENT: OpsAgentDefinition = {
  id: 'repair-plan',
  label: '修复计划 Agent',
  description: '汇总前序 Agent 证据，调用真实模型生成根因和修复计划。',
};

export function startRepairPlanAgent(): OpsAgentRunResult {
  return {
    nodeId: REPAIR_PLAN_AGENT.id,
    status: 'running',
    output: 'llm.createMessageStream => 正在生成诊断结论...',
  };
}

export interface OpsRepairPlanModelDiagnosis {
  modelId: string;
  providerId: string;
  summary: string;
  rootCause: string;
  evidence: string[];
  repairPlan: string[];
  rawText: string;
  durationMs: number;
  usage?: { inputTokens: number; outputTokens: number };
}

export type OpsRepairPlanStreamEvent =
  | { type: 'model_start'; nodeId: 'repair-plan'; label: string; modelId: string; providerId: string }
  | { type: 'model_delta'; nodeId: 'repair-plan'; text: string }
  | { type: 'model_end'; nodeId: 'repair-plan'; diagnosis: OpsRepairPlanModelDiagnosis };

export async function runRepairPlanAgent(analysis: OpsAlertAnalysis): Promise<OpsRepairPlanModelDiagnosis> {
  if (process.env.AI_CODING_MOCK_LLM === '1') {
    throw new Error('当前设置了 AI_CODING_MOCK_LLM=1，应用运维告警分析要求真实模型调用，请关闭 mock 后重试。');
  }
  const model = getModelForStage(REPAIR_PLAN_AGENT.id);
  if (!model) throw new Error('未找到可用模型配置');
  const provider = createLLMProvider(model.providerId);
  const startedAt = Date.now();
  const response = await provider.createMessage({
    model: model.id,
    temperature: 0.2,
    maxTokens: 1800,
    system: buildOpsDiagnosisSystemPrompt(),
    messages: [{
      role: 'user',
      content: buildOpsDiagnosisPrompt(analysis),
    }],
  });
  const rawText = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
  const parsed = parseOpsDiagnosisJson(rawText);
  return {
    modelId: model.id,
    providerId: model.providerId,
    summary: parsed.summary,
    rootCause: parsed.rootCause,
    evidence: parsed.evidence,
    repairPlan: parsed.repairPlan,
    rawText,
    durationMs: Date.now() - startedAt,
    usage: response.usage,
  };
}

export async function* streamRepairPlanAgent(analysis: OpsAlertAnalysis): AsyncGenerator<OpsRepairPlanStreamEvent> {
  if (process.env.AI_CODING_MOCK_LLM === '1') {
    throw new Error('当前设置了 AI_CODING_MOCK_LLM=1，应用运维告警分析要求真实模型调用，请关闭 mock 后重试。');
  }
  const model = getModelForStage(REPAIR_PLAN_AGENT.id);
  if (!model) throw new Error('未找到可用模型配置');
  const provider = createLLMProvider(model.providerId);
  const startedAt = Date.now();
  let rawText = '';
  const systemPrompt = buildOpsDiagnosisSystemPrompt();
  const userPrompt = buildOpsDiagnosisPrompt(analysis);
  yield { type: 'model_start', nodeId: 'repair-plan', label: REPAIR_PLAN_AGENT.label, modelId: model.id, providerId: model.providerId };
  const stream = provider.createMessageStream({
    model: model.id,
    temperature: 0.2,
    maxTokens: 1800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  for await (const event of stream) {
    if (event.type === 'text_delta') {
      rawText += event.text;
      yield { type: 'model_delta', nodeId: 'repair-plan', text: event.text };
    } else if (event.type === 'error') {
      throw new Error(event.message);
    }
  }
  const parsed = parseOpsDiagnosisJson(rawText.trim());
  const diagnosis: OpsRepairPlanModelDiagnosis = {
    modelId: model.id,
    providerId: model.providerId,
    summary: parsed.summary,
    rootCause: parsed.rootCause,
    evidence: parsed.evidence,
    repairPlan: parsed.repairPlan,
    rawText: rawText.trim(),
    durationMs: Date.now() - startedAt,
    usage: {
      inputTokens: estimateTokenCount(`${systemPrompt}\n${userPrompt}`),
      outputTokens: estimateTokenCount(rawText),
    },
  };
  yield { type: 'model_end', nodeId: 'repair-plan', diagnosis };
}

function parseOpsDiagnosisJson(rawText: string): Pick<OpsRepairPlanModelDiagnosis, 'summary' | 'rootCause' | 'evidence' | 'repairPlan'> {
  const fallback = {
    summary: rawText.split(/\r?\n/).find(Boolean)?.slice(0, 160) || '模型已返回诊断结果，但未提供结构化摘要。',
    rootCause: rawText,
    evidence: [] as string[],
    repairPlan: [] as string[],
  };
  for (const jsonText of extractJsonObjects(rawText).reverse()) {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      const summary = firstNonEmptyString(parsed.summary, parsed.title);
      const rootCause = firstNonEmptyString(parsed.rootCause, parsed.root_cause, parsed.cause);
      if (!summary && !rootCause) continue;
      return {
        summary: summary ?? fallback.summary,
        rootCause: rootCause ?? fallback.rootCause,
        evidence: toStringArray(parsed.evidence, parsed.evidences).slice(0, 8),
        repairPlan: toStringArray(parsed.repairPlan, parsed.repair_plan, parsed.actions, parsed.plan).slice(0, 8),
      };
    } catch {
      // Try the next candidate.
    }
  }
  return fallback;
}

function extractJsonObjects(text: string): string[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const results: string[] = fenced ? [fenced] : [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        results.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return Array.from(new Set(results));
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function toStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
  }
  return [];
}

function estimateTokenCount(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}
