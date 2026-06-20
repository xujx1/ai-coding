import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolResult } from '../base.js';

export const ReviewArtifactTool: Tool = {
  definition: {
    name: 'review_artifact',
    description: 'Review a generated artifact for existence, parseability, required headings, and suspicious placeholder text.',
    inputSchema: z.object({
      artifact_path: z.string().describe('Path relative to artifacts/ or absolute path inside artifacts'),
      required_headings: z.array(z.string()).optional().describe('Markdown headings that must appear'),
      json: z.boolean().optional().describe('Require valid JSON'),
      maxChars: z.number().optional(),
    }),
    isReadOnly: true,
  },

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { artifact_path, required_headings, json, maxChars } = input as {
      artifact_path: string;
      required_headings?: string[];
      json?: boolean;
      maxChars?: number;
    };
    const artifactPath = resolveArtifactPath(ctx.artifactsDir, artifact_path);
    if (!artifactPath) {
      return { toolUseId: '', content: `Artifact path denied: ${artifact_path}`, isError: true };
    }
    if (!fs.existsSync(artifactPath)) {
      return { toolUseId: '', content: `Artifact not found: ${artifact_path}`, isError: true };
    }

    const content = fs.readFileSync(artifactPath, 'utf-8');
    const findings: string[] = [];
    if (!content.trim()) findings.push('BLOCK: artifact is empty.');
    if ((json || artifactPath.endsWith('.json'))) {
      try {
        JSON.parse(content);
      } catch (err) {
        findings.push(`BLOCK: JSON is not parseable: ${(err as Error).message}`);
      }
    }
    for (const heading of required_headings ?? []) {
      if (!content.includes(heading)) findings.push(`WARN: missing required heading "${heading}".`);
    }
    if (/\{\{[^}]+\}\}|\{[^}\n]+\}/.test(content)) {
      findings.push('WARN: artifact may still contain unreplaced placeholders.');
    }
    if (/我会先|我将|先读取|当前任务是/.test(content.slice(0, 300))) {
      findings.push('WARN: artifact looks like process narration instead of final content.');
    }

    const stat = fs.statSync(artifactPath);
    const limit = Math.max(1000, Math.min(maxChars ?? 40000, 100000));
    const summary = [
      `Artifact: ${path.relative(ctx.runDir, artifactPath).replace(/\\/g, '/')}`,
      `Size: ${stat.size} bytes`,
      `Result: ${findings.some(f => f.startsWith('BLOCK')) ? 'BLOCK' : findings.length ? 'WARN' : 'PASS'}`,
      '',
      'Findings:',
      findings.length ? findings.map(f => `- ${f}`).join('\n') : '- PASS: no structural issues found.',
      '',
      'Preview:',
      '```',
      content.slice(0, limit),
      content.length > limit ? '\n... (truncated)' : '',
      '```',
    ].join('\n');
    return { toolUseId: '', content: summary };
  },
};

function resolveArtifactPath(artifactsDir: string, requestedPath: string): string | null {
  const stripped = requestedPath.replace(/^artifacts\//, '');
  const resolved = path.isAbsolute(stripped) ? path.resolve(stripped) : path.resolve(artifactsDir, stripped);
  const base = path.resolve(artifactsDir);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}
