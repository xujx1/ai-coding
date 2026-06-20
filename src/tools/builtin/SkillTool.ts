import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolResult } from '../base.js';

export const SkillTool: Tool = {
  definition: {
    name: 'skill',
    description: 'Read a local skill, prompt, output template, or node document by relative path.',
    inputSchema: z.object({
      path: z.string().describe('Relative path under prompts/, prompts/template/, or docs/'),
      maxChars: z.number().optional().describe('Maximum characters to return'),
    }),
    isReadOnly: true,
  },

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { path: requestedPath, maxChars } = input as { path: string; maxChars?: number };
    const resolved = resolveAllowedSkillPath(requestedPath);
    if (!resolved) {
      return { toolUseId: '', content: `Skill path denied or not found: ${requestedPath}`, isError: true };
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    const limit = Math.max(1000, Math.min(maxChars ?? 20000, 80000));
    return {
      toolUseId: '',
      content: content.slice(0, limit) + (content.length > limit ? '\n... (truncated)' : ''),
    };
  },
};

function resolveAllowedSkillPath(requestedPath: string): string | null {
  const root = process.cwd();
  const normalized = requestedPath.replace(/^\/+/, '');
  if (normalized.includes('..')) return null;
  const allowedRoots = ['prompts', 'docs'];
  if (!allowedRoots.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`))) return null;
  const resolved = path.resolve(root, normalized);
  const allowed = allowedRoots.some(prefix => {
    const base = path.resolve(root, prefix);
    return resolved === base || resolved.startsWith(base + path.sep);
  });
  if (!allowed || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}
