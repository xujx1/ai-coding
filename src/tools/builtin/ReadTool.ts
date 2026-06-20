import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolResult } from '../base.js';
import { validatePath } from '../security/pathValidator.js';

export const ReadTool: Tool = {
  definition: {
    name: 'read_file',
    description: 'Read a file from the filesystem. Use this to examine file contents before editing. Returns up to 2000 lines; use offset/limit for large files.',
    inputSchema: z.object({
      file_path: z.string().describe('Absolute path to the file to read'),
      offset: z.number().optional().describe('Line number to start reading from (1-based)'),
      limit: z.number().optional().describe('Maximum number of lines to read'),
    }),
    isReadOnly: true,
  },

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { file_path, offset, limit } = input as {
      file_path: string;
      offset?: number;
      limit?: number;
    };

    const resolved = resolveReadablePath(file_path, ctx);
    const pathCheck = validatePath(resolved, 'read', {
      runDir: ctx.runDir,
      projectDir: ctx.projectDir,
      artifactsDir: ctx.artifactsDir,
    });
    if (!pathCheck.valid) {
      return { toolUseId: '', content: pathCheck.reason ?? 'Path validation failed', isError: true };
    }

    if (!fs.existsSync(pathCheck.resolvedPath)) {
      const candidates = findReadableCandidates(path.basename(file_path), ctx);
      const hint = candidates.length
        ? `\n\nCandidate files with the same name:\n${candidates.map(candidate => `- ${candidate}`).join('\n')}\nUse read_file with one of these absolute paths if it matches the intended file.`
        : '';
      return { toolUseId: '', content: `File not found: ${file_path}${hint}`, isError: true };
    }

    const stat = fs.statSync(pathCheck.resolvedPath);
    if (stat.isDirectory()) {
      return { toolUseId: '', content: `${file_path} is a directory, not a file`, isError: true };
    }

    // Size limit: don't read files > 2MB directly
    if (stat.size > 2 * 1024 * 1024) {
      return {
        toolUseId: '',
        content: `File ${file_path} is ${(stat.size / 1024 / 1024).toFixed(1)}MB (too large to read directly). Use offset/limit to read portions.`,
        isError: true,
      };
    }

    const content = fs.readFileSync(pathCheck.resolvedPath, 'utf-8');
    const lines = content.split('\n');

    const safeOffset = Math.max(1, Math.floor(offset ?? 1));
    const safeLimit = limit !== undefined ? Math.max(0, Math.floor(limit)) : undefined;

    let displayLines = lines;
    let lineInfo = '';
    if (offset !== undefined || limit !== undefined) {
      const start = safeOffset - 1;
      const end = safeLimit !== undefined ? start + safeLimit : lines.length;
      displayLines = lines.slice(start, end);
      lineInfo = ` (lines ${start + 1}-${Math.min(end, lines.length)} of ${lines.length})`;
    }

    const header = `--- ${file_path}${lineInfo} ---\n`;
    const numbered = displayLines.map((line, i) => {
      const lineNum = (safeOffset + i).toString().padStart(4, ' ');
      return `${lineNum}\t${line}`;
    }).join('\n');

    return {
      toolUseId: '',
      content: header + numbered,
    };
  },
};

function findReadableCandidates(fileName: string, ctx: ToolContext): string[] {
  if (!fileName || fileName === '.' || fileName === path.sep) return [];
  const roots = Array.from(new Set([ctx.projectDir, ctx.artifactsDir, ctx.runDir].filter(Boolean)));
  const candidates: string[] = [];
  const ignored = new Set(['node_modules', 'target', '.git', '.idea', 'dist']);
  const walk = (dir: string, depth: number) => {
    if (depth > 7 || candidates.length >= 8) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (candidates.length >= 8) return;
      if (ignored.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, depth + 1);
      } else if (entry.isFile() && entry.name === fileName) {
        const pathCheck = validatePath(abs, 'read', {
          runDir: ctx.runDir,
          projectDir: ctx.projectDir,
          artifactsDir: ctx.artifactsDir,
        });
        if (pathCheck.valid) candidates.push(pathCheck.resolvedPath);
      }
    }
  };
  for (const root of roots) walk(root, 0);
  return Array.from(new Set(candidates));
}

function resolveReadablePath(filePath: string, ctx: ToolContext): string {
  if (path.isAbsolute(filePath)) return filePath;
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized === 'artifacts' || normalized.startsWith('artifacts/')) {
    return path.join(ctx.artifactsDir, normalized.replace(/^artifacts\/?/, ''));
  }
  if (normalized === 'input' || normalized.startsWith('input/')) {
    return path.join(ctx.runDir, 'workspace', normalized);
  }
  if (normalized === 'workspace' || normalized.startsWith('workspace/')) {
    return path.join(ctx.runDir, normalized);
  }
  return path.join(ctx.projectDir, filePath);
}
