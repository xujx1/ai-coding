import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolResult } from '../base.js';

export const WriteTool: Tool = {
  definition: {
    name: 'write_file',
    description: 'Write content to a file, creating parent directories if needed. Overwrites existing files. Only writes to workspace/project or artifacts.',
    inputSchema: z.object({
      file_path: z.string().describe('Absolute path to the file to write'),
      content: z.string().describe('Content to write to the file'),
    }),
    isReadOnly: false,
    isDestructive: true,
  },

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { file_path, content } = input as { file_path: string; content: string };

    const resolved = resolveWritablePath(file_path, ctx);

    // Security check: must be in projectDir or artifactsDir
    const inProject = resolved.startsWith(ctx.projectDir + path.sep) || resolved === ctx.projectDir;
    const inArtifacts = resolved.startsWith(ctx.artifactsDir + path.sep) || resolved === ctx.artifactsDir;
    if (!inProject && !inArtifacts) {
      return {
        toolUseId: '',
        content: `Write denied: ${file_path} is outside workspace/project or artifacts`,
        isError: true,
      };
    }

    // Prevent overwriting binary files (simple check by extension)
    const binaryExts = ['.jar', '.class', '.war', '.png', '.jpg', '.gif', '.ico', '.pdf', '.zip'];
    if (binaryExts.some(ext => resolved.endsWith(ext))) {
      return { toolUseId: '', content: `Cannot write binary file: ${file_path}`, isError: true };
    }

    // Create parent directories
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(resolved, content, 'utf-8');
    const lines = content.split('\n').length;

    return {
      toolUseId: '',
      content: `File written: ${path.relative(ctx.runDir, resolved)} (${lines} lines, ${content.length} bytes)`,
    };
  },
};

function resolveWritablePath(filePath: string, ctx: ToolContext): string {
  if (path.isAbsolute(filePath)) return filePath;
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized === 'artifacts' || normalized.startsWith('artifacts/')) {
    return path.join(ctx.artifactsDir, normalized.replace(/^artifacts\/?/, ''));
  }
  if (normalized === 'workspace' || normalized.startsWith('workspace/')) {
    return path.join(ctx.runDir, normalized);
  }
  return path.join(ctx.projectDir, filePath);
}
