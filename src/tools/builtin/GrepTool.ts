import { z } from 'zod';
import { execSync } from 'child_process';
import * as path from 'path';
import { Tool, ToolContext, ToolResult } from '../base.js';
import { validatePath } from '../security/pathValidator.js';

export const GrepTool: Tool = {
  definition: {
    name: 'grep',
    description: 'Search for a regex pattern in files using ripgrep-like search. Returns matching lines with file paths and line numbers.',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Directory or file to search in (defaults to project directory)'),
      include: z.string().optional().describe('File glob to include (e.g., "*.java")'),
      max_results: z.number().optional().describe('Maximum number of results (default 100)'),
    }),
    isReadOnly: true,
  },

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { pattern, path: searchPath, include, max_results } = input as {
      pattern: string;
      path?: string;
      include?: string;
      max_results?: number;
    };

    const baseDir = resolveSearchPath(searchPath, ctx);
    const pathCheck = validatePath(baseDir, 'read', {
      runDir: ctx.runDir,
      projectDir: ctx.projectDir,
      artifactsDir: ctx.artifactsDir,
    });
    if (!pathCheck.valid) {
      return { toolUseId: '', content: pathCheck.reason ?? 'Path validation failed', isError: true };
    }

    // Use built-in Node.js grep implementation (portable, no external dep needed)
    const maxResults = max_results ?? 100;
    const results: string[] = [];
    const skip = ['node_modules', '.git', 'target', 'dist', 'build'];
    const includeRegex = include ? globToRegex(include) : null;

    function walk(dir: string) {
      if (results.length >= maxResults) return;
      let entries: string[];
      try {
        entries = require('fs').readdirSync(dir);
      } catch {
        return;
      }
      const fs = require('fs');
      for (const entry of entries) {
        if (skip.includes(entry)) continue;
        const fullPath = path.join(dir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (stat.isFile()) {
            if (includeRegex && !includeRegex.test(entry)) continue;
            if (stat.size > 500000) continue; // skip large files
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              const regex = new RegExp(pattern, 'gm');
              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                  const relPath = path.relative(baseDir, fullPath);
                  results.push(`${relPath}:${i + 1}:${lines[i].trim()}`);
                  if (results.length >= maxResults) return;
                }
                regex.lastIndex = 0;
              }
            } catch {
              // skip binary/unreadable files
            }
          }
        } catch {
          // skip
        }
      }
    }

    walk(pathCheck.resolvedPath);

    if (results.length === 0) {
      return { toolUseId: '', content: `No matches found for pattern: ${pattern}` };
    }

    return {
      toolUseId: '',
      content: `Found ${results.length} matches for "${pattern}":\n${results.slice(0, maxResults).join('\n')}`,
    };
  },
};

function resolveSearchPath(searchPath: string | undefined, ctx: ToolContext): string {
  if (!searchPath) return ctx.projectDir;
  if (path.isAbsolute(searchPath)) return searchPath;
  const normalized = searchPath.replace(/\\/g, '/');
  if (normalized === 'artifacts' || normalized.startsWith('artifacts/')) {
    return path.join(ctx.artifactsDir, normalized.replace(/^artifacts\/?/, ''));
  }
  if (normalized === 'input' || normalized.startsWith('input/')) {
    return path.join(ctx.runDir, 'workspace', normalized);
  }
  if (normalized === 'workspace' || normalized.startsWith('workspace/')) {
    return path.join(ctx.runDir, normalized);
  }
  return path.join(ctx.projectDir, searchPath);
}

function globToRegex(pattern: string): RegExp {
  let regexStr = '^';
  for (const c of pattern) {
    if (c === '*') regexStr += '.*';
    else if (c === '?') regexStr += '.';
    else if (c === '.') regexStr += '\\.';
    else regexStr += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  regexStr += '$';
  return new RegExp(regexStr);
}
