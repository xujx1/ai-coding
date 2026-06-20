import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolResult } from '../base.js';

export const DiscoverSkillsTool: Tool = {
  definition: {
    name: 'discover_skills',
    description: 'Discover available local skills, prompts, output templates, and node documents relevant to the current task.',
    inputSchema: z.object({
      query: z.string().optional().describe('Optional case-insensitive filter'),
      includeTemplates: z.boolean().optional().describe('Include prompts/template files'),
    }),
    isReadOnly: true,
  },

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { query, includeTemplates } = input as { query?: string; includeTemplates?: boolean };
    const root = process.cwd();
    const candidates = [
      ...collectFiles(path.join(root, 'prompts'), ['.md']),
      ...(includeTemplates === false ? [] : collectFiles(path.join(root, 'prompts', 'template'), ['.md', '.java'])),
      ...collectFiles(path.join(root, 'docs'), ['.md']),
    ];
    const needle = query?.trim().toLowerCase();
    const filtered = needle
      ? candidates.filter(item => item.relativePath.toLowerCase().includes(needle) || item.summary.toLowerCase().includes(needle))
      : candidates;
    const lines = filtered.slice(0, 120).map(item => `- ${item.relativePath}: ${item.summary}`);
    return {
      toolUseId: '',
      content: lines.length ? lines.join('\n') : 'No matching skills or templates found.',
    };
  },
};

function collectFiles(dir: string, exts: string[]): Array<{ relativePath: string; summary: string }> {
  const results: Array<{ relativePath: string; summary: string }> = [];
  const walk = (current: string, depth: number) => {
    if (depth > 4 || !fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile() || !exts.some(ext => entry.name.endsWith(ext))) continue;
      const content = safeRead(fullPath, 500);
      const firstHeading = content.match(/^#\s+(.+)$/m)?.[1];
      results.push({
        relativePath: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
        summary: firstHeading || content.split(/\r?\n/).find(Boolean)?.slice(0, 120) || 'template',
      });
    }
  };
  walk(dir, 0);
  return results;
}

function safeRead(filePath: string, maxChars: number): string {
  try {
    return fs.readFileSync(filePath, 'utf-8').slice(0, maxChars);
  } catch {
    return '';
  }
}
