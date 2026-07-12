import type { WorkflowConfig } from './types.js';

export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  runtime: 'legacy',
  editorEnabled: false,
  checkpointer: 'file',
  branchConcurrency: 4,
  llmConcurrency: 6,
  testConcurrency: 2,
  branchFailurePolicy: 'continue_and_collect',
};

export function loadWorkflowEnv(env: NodeJS.ProcessEnv = process.env): Partial<WorkflowConfig> {
  const config: Partial<WorkflowConfig> = {};

  const runtime = env.AI_CODING_WORKFLOW_RUNTIME;
  if (runtime === 'legacy' || runtime === 'langgraph') {
    config.runtime = runtime;
  }

  if (env.AI_CODING_WORKFLOW_EDITOR) {
    config.editorEnabled = env.AI_CODING_WORKFLOW_EDITOR === '1';
  }

  const checkpointer = env.AI_CODING_LANGGRAPH_CHECKPOINTER;
  if (checkpointer === 'memory' || checkpointer === 'file' || checkpointer === 'postgres') {
    config.checkpointer = checkpointer;
  }

  if (env.AI_CODING_BRANCH_CONCURRENCY) {
    config.branchConcurrency = parseInt(env.AI_CODING_BRANCH_CONCURRENCY, 10);
  }
  if (env.AI_CODING_LLM_CONCURRENCY) {
    config.llmConcurrency = parseInt(env.AI_CODING_LLM_CONCURRENCY, 10);
  }
  if (env.AI_CODING_TEST_CONCURRENCY) {
    config.testConcurrency = parseInt(env.AI_CODING_TEST_CONCURRENCY, 10);
  }

  const failurePolicy = env.AI_CODING_BRANCH_FAILURE_POLICY;
  if (failurePolicy === 'fail_fast' || failurePolicy === 'continue_and_collect' || failurePolicy === 'threshold') {
    config.branchFailurePolicy = failurePolicy;
  }

  return config;
}
