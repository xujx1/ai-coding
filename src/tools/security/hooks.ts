/**
 * Hook system - PreToolUse and PostToolUse hooks.
 * Minimal implementation that supports:
 * - Input validation hooks
 * - Output truncation
 * - Logging
 */

export type PreToolUseHook = (ctx: {
  toolName: string;
  input: unknown;
  runId: string;
}) => Promise<{ allow: boolean; modifiedInput?: unknown; additionalContext?: string; reason?: string }>;

export type PostToolUseHook = (ctx: {
  toolName: string;
  input: unknown;
  output: string;
  isError: boolean;
  runId: string;
}) => Promise<{ modifiedOutput?: string; additionalContext?: string }>;

const preHooks: PreToolUseHook[] = [];
const postHooks: PostToolUseHook[] = [];

export function registerPreToolUseHook(hook: PreToolUseHook): void {
  preHooks.push(hook);
}

export function registerPostToolUseHook(hook: PostToolUseHook): void {
  postHooks.push(hook);
}

export async function runPreToolUseHooks(ctx: {
  toolName: string;
  input: unknown;
  runId: string;
}): Promise<{ allow: boolean; input: unknown; additionalContext: string[] }> {
  let currentInput = ctx.input;
  const additionalContext: string[] = [];
  let allow = true;

  for (const hook of preHooks) {
    try {
      const result = await hook({ ...ctx, input: currentInput });
      if (!result.allow) {
        allow = false;
        if (result.reason) additionalContext.push(`Hook denied: ${result.reason}`);
        break;
      }
      if (result.modifiedInput !== undefined) {
        currentInput = result.modifiedInput;
      }
      if (result.additionalContext) {
        additionalContext.push(result.additionalContext);
      }
    } catch (err) {
      additionalContext.push(`PreToolUse hook error: ${(err as Error).message}`);
    }
  }

  return { allow, input: currentInput, additionalContext };
}

export async function runPostToolUseHooks(ctx: {
  toolName: string;
  input: unknown;
  output: string;
  isError: boolean;
  runId: string;
}): Promise<{ output: string; additionalContext: string[] }> {
  let currentOutput = ctx.output;
  const additionalContext: string[] = [];

  for (const hook of postHooks) {
    try {
      const result = await hook({ ...ctx, output: currentOutput });
      if (result.modifiedOutput !== undefined) {
        currentOutput = result.modifiedOutput;
      }
      if (result.additionalContext) {
        additionalContext.push(result.additionalContext);
      }
    } catch (err) {
      additionalContext.push(`PostToolUse hook error: ${(err as Error).message}`);
    }
  }

  return { output: currentOutput, additionalContext };
}
