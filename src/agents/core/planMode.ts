/**
 * Plan Mode - generates implementation plans before code writing.
 * Plans are saved to agents/{agentRunId}.plan.json and require user confirmation.
 */
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import type { PlanState, PlanStep } from '../../persistence/agentTypes.js';
import { getStateStore } from '../../persistence/stateStore.js';
import { getEventLog } from '../../events/EventLog.js';
import { LLMProvider, LLMMessage } from '../../models/providers.js';

export interface PlanGenerationContext {
  runId: string;
  agentRunId: string;
  nodeId: string;
  goal: string;
  contextFiles?: string[];  // paths to context files to read
  provider: LLMProvider;
  modelId: string;
  cwd: string;
}

const PLAN_SYSTEM_PROMPT = `You are a software implementation planner. Given a development goal and context, create a step-by-step implementation plan.

Your plan must include:
1. A clear title summarizing the task
2. 3-10 concrete steps, each with a short title and description
3. Risk assessment for each step (low/medium/high)
4. Overall risks for the implementation

Respond in JSON format ONLY, like this:
{
  "title": "...",
  "steps": [
    {"id": "step-1", "title": "...", "description": "...", "risk": "low|medium|high"}
  ],
  "risks": ["risk1", "risk2"]
}

Do NOT include any other text outside the JSON.`;

/**
 * Generate an implementation plan using LLM.
 */
export async function generatePlan(ctx: PlanGenerationContext): Promise<PlanState> {
  const eventLog = getEventLog(ctx.runId);
  const store = getStateStore(ctx.runId);

  // Build user message with context
  let userMsg = `## Goal\n${ctx.goal}\n\n`;

  // Include context files if provided
  if (ctx.contextFiles && ctx.contextFiles.length > 0) {
    userMsg += `## Context Files\n`;
    for (const filePath of ctx.contextFiles.slice(0, 5)) {
      try {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ctx.cwd, filePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8').slice(0, 3000);
          userMsg += `\n### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n`;
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  userMsg += `\nPlease create an implementation plan.`;

  const messages: LLMMessage[] = [
    { role: 'system', content: PLAN_SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ];

  const response = await ctx.provider.createMessage({
    model: ctx.modelId,
    messages,
    maxTokens: 2048,
    temperature: 0.3,
  });

  // Parse JSON from response
  const textContent = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('');

  let planData: { title: string; steps: any[]; risks: string[] };
  try {
    // Try to extract JSON from markdown code blocks or raw
    const jsonMatch = textContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
      textContent.match(/(\{[\s\S]*\})/);
    planData = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(textContent);
  } catch {
    // Fallback plan if parsing fails
    planData = {
      title: ctx.goal.slice(0, 80),
      steps: [
        { id: 'step-1', title: 'Explore existing codebase', description: 'Read existing project structure and understand patterns', risk: 'low' },
        { id: 'step-2', title: 'Implement required changes', description: 'Make code changes following existing patterns', risk: 'medium' },
        { id: 'step-3', title: 'Compile and fix errors', description: 'Run maven_compile and fix any compilation errors', risk: 'low' },
      ],
      risks: ['Code may not compile on first attempt'],
    };
  }

  const steps: PlanStep[] = (planData.steps ?? []).map((s: any, i: number) => ({
    id: s.id ?? `step-${i + 1}`,
    title: s.title ?? `Step ${i + 1}`,
    description: s.description ?? '',
    status: 'pending',
    risk: s.risk ?? 'low',
  }));

  const plan: PlanState = {
    title: planData.title ?? 'Implementation Plan',
    steps,
    risks: planData.risks ?? [],
    createdAt: Date.now(),
  };

  // Save plan
  store.savePlan(ctx.agentRunId, plan);

  eventLog.logEvent('plan_created', {
    plan,
    agentRunId: ctx.agentRunId,
  }, ctx.agentRunId, ctx.nodeId);

  return plan;
}

/**
 * Confirm a plan (user approves for execution).
 */
export function confirmPlan(runId: string, agentRunId: string): PlanState | null {
  const store = getStateStore(runId);
  const plan = store.loadPlan(agentRunId);
  if (!plan) return null;

  plan.confirmed = true;
  plan.confirmedAt = Date.now();
  store.savePlan(agentRunId, plan);

  const eventLog = getEventLog(runId);
  eventLog.logEvent('plan_confirmed', { agentRunId }, agentRunId);

  return plan;
}

/**
 * Reject a plan with feedback (requires regeneration).
 */
export function rejectPlan(runId: string, agentRunId: string, feedback: string): PlanState | null {
  const store = getStateStore(runId);
  const plan = store.loadPlan(agentRunId);
  if (!plan) return null;

  plan.confirmed = false;
  plan.feedback = feedback;
  store.savePlan(agentRunId, plan);

  const eventLog = getEventLog(runId);
  eventLog.logEvent('plan_rejected', { agentRunId, feedback }, agentRunId);

  return plan;
}

/**
 * Update step status during execution.
 */
export function updatePlanStep(
  runId: string,
  agentRunId: string,
  stepId: string,
  status: PlanStep['status']
): void {
  const store = getStateStore(runId);
  const plan = store.loadPlan(agentRunId);
  if (!plan) return;

  const step = plan.steps.find(s => s.id === stepId);
  if (step) {
    step.status = status;
    store.savePlan(agentRunId, plan);
  }
}
