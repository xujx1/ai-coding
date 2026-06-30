import type { LLMProvider } from '../models/providers.js';
import type { PlanValidationIssue, SessionExecutionPlan } from './sessionPlan.js';
import { validateSessionExecutionPlan } from './sessionPlan.js';
import { sessionExecutionPlanSchema } from './planSchemas.js';
import { validateStructuredPlanDocument } from './planValidation.js';

const EMIT_SESSION_PLAN_TOOL = 'emit_session_execution_plan';

export interface StructuredPlannerRequest {
  provider: LLMProvider;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface StructuredPlannerResult {
  ok: boolean;
  mode: 'tool' | 'json';
  plan?: SessionExecutionPlan;
  issues: PlanValidationIssue[];
  rawText?: string;
}

/* 调用，根据我们agent的 schema去动态的生成plan */
export async function requestStructuredSessionPlan(
  request: StructuredPlannerRequest
): Promise<StructuredPlannerResult> {
  const response = await request.provider.createMessage({
    model: request.modelId,
    system: [
      request.systemPrompt,
      '',
      'Return a SessionExecutionPlan by calling the provided tool. Do not emit explanatory prose.',
    ].join('\n'),
    messages: [{ role: 'user', content: request.userPrompt }],
    tools: [{
      name: EMIT_SESSION_PLAN_TOOL,
      description: 'Emit one validated structured SessionExecutionPlan document.',
      input_schema: sessionExecutionPlanSchema as Record<string, unknown>,
    }],
    toolChoice: 'required',
    maxTokens: request.maxTokens,
    temperature: request.temperature ?? 0,
  });

  const toolPlan = response.content.find(block =>
    block.type === 'tool_use' && block.name === EMIT_SESSION_PLAN_TOOL
  );
  if (toolPlan?.type === 'tool_use') {
    return validatePlannerCandidate(toolPlan.input, 'tool');
  }

  const rawText = response.content
    .filter(block => block.type === 'text')
    .map(block => block.type === 'text' ? block.text : '')
    .join('\n')
    .trim();
  if (!rawText) {
    return {
      ok: false,
      mode: 'json',
      issues: [plannerIssue('planner-empty-response', 'Planner response did not contain a tool call or JSON text.')],
    };
  }

  try {
    return validatePlannerCandidate(JSON.parse(rawText), 'json', rawText);
  } catch {
    return {
      ok: false,
      mode: 'json',
      rawText,
      issues: [plannerIssue('planner-non-json-response', 'Planner response must be strict JSON when tool calling is unavailable.')],
    };
  }
}

function validatePlannerCandidate(
  candidate: unknown,
  mode: StructuredPlannerResult['mode'],
  rawText?: string
): StructuredPlannerResult {
  const structuredIssues = validateStructuredPlanDocument(candidate);
  if (structuredIssues.length) {
    return {
      ok: false,
      mode,
      rawText,
      issues: structuredIssues,
    };
  }
  const plan = candidate as SessionExecutionPlan;
  const validation = validateSessionExecutionPlan(plan);
  if (!validation.valid) {
    return {
      ok: false,
      mode,
      rawText,
      issues: validation.issues,
    };
  }
  return {
    ok: true,
    mode,
    rawText,
    plan: {
      ...plan,
      validation,
    },
    issues: [],
  };
}

function plannerIssue(code: string, message: string): PlanValidationIssue {
  return {
    code,
    message,
    severity: 'error',
  };
}
