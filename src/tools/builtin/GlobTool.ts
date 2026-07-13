import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolResult } from '../base.js';
import { validatePath } from '../security/pathValidator.js';

function globToRegex(pattern: string): RegExp {
  let regexStr = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        regexStr += '.*';
        i += 2;
        if (pattern[i] === '/') i++;
      } else {
        regexStr += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      regexStr += '[^/]';
      i++;
    } else if (c === '.') {
      regexStr += '\\.';
      i++;
    } else {
      regexStr += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr);
}

function globSearch(baseDir: string, pattern: string, maxResults: number = 200): string[] {
  const regex = globToRegex(pattern);
  const results: string[] = [];
  const skip = ['node_modules', '.git', 'target', 'dist', 'build', '.idea', '.vscode'];

  function walk(dir: string) {
    if (results.length >= maxResults) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        if (regex.test(relPath) || regex.test(entry.name)) {
          results.push(relPath);
          if (results.length >= maxResults) return;
        }
      }
    }
  }

  walk(baseDir);
  return results.sort();
}

export const GlobTool: Tool = {
  definition: {
    name: 'glob',
    description: 'Find files matching a glob pattern (e.g., "**/*.java", "src/**/*.ts"). Searches in the project directory by default.',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern (supports ** for recursive, * for any chars, ? for single char)'),
      path: z.string().optional().describe('Directory to search in (defaults to project directory)'),
    }),
    isReadOnly: true,
  },

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { pattern, path: searchPath } = input as { pattern: string; path?: string };
    const baseDir = resolveSearchPath(searchPath, ctx);

    const pathCheck = validatePath(baseDir, 'read', {
      runDir: ctx.runDir,
      projectDir: ctx.projectDir,
      artifactsDir: ctx.artifactsDir,
    });
    if (!pathCheck.valid) {
      return { toolUseId: '', content: pathCheck.reason ?? 'Path validation failed', isError: true };
    }

    const matches = globSearch(pathCheck.resolvedPath, pattern);
    if (matches.length === 0) {
      return { toolUseId: '', content: `No files found matching: ${pattern}` };
    }

    const limited = matches.slice(0, 100);
    const content = `Found ${matches.length} files matching "${pattern}":\n${limited.map(f => '  ' + f).join('\n')}${matches.length > 100 ? `\n... (${matches.length - 100} more)` : ''}`;
    return { toolUseId: '', content };
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
    return path.join(ctx.runDir, normalized);
  }
  if (normalized === 'workspace' || normalized.startsWith('workspace/')) {
    return path.join(ctx.runDir, normalized);
  }
  return path.join(ctx.projectDir, searchPath);
}
