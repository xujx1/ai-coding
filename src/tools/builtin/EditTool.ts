import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolContext, ToolResult } from '../base.js';

export const EditTool: Tool = {
  definition: {
    name: 'edit_file',
    description: 'Edit a file by replacing an exact old_string with new_string. The old_string must match exactly (whitespace-sensitive). Read the file first to get exact content. Only edits files in workspace/project or artifacts.',
    inputSchema: z.object({
      file_path: z.string().describe('Absolute path to the file to edit'),
      old_string: z.string().describe('The exact text to replace (must match whitespace exactly)'),
      new_string: z.string().describe('The replacement text'),
      replace_all: z.boolean().optional().describe('Replace all occurrences (default: false, replace first only)'),
    }),
    isReadOnly: false,
    isDestructive: true,
  },

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { file_path, old_string, new_string, replace_all } = input as {
      file_path: string;
      old_string: string;
      new_string: string;
      replace_all?: boolean;
    };

    const resolved = resolveEditablePath(file_path, ctx);

    const inProject = resolved.startsWith(ctx.projectDir + path.sep) || resolved === ctx.projectDir;
    const inArtifacts = resolved.startsWith(ctx.artifactsDir + path.sep) || resolved === ctx.artifactsDir;
    if (!inProject && !inArtifacts) {
      return { toolUseId: '', content: `Edit denied: ${file_path} is outside workspace/project or artifacts`, isError: true };
    }

    if (!fs.existsSync(resolved)) {
      return { toolUseId: '', content: `File not found: ${file_path}. Use write_file to create new files.`, isError: true };
    }

    const original = fs.readFileSync(resolved, 'utf-8');

    if (!original.includes(old_string)) {
      // Show context around where the edit was attempted
      const lines = original.split('\n');
      const contextLines = lines.slice(0, 5).join('\n');
      return {
        toolUseId: '',
        content: `old_string not found in ${file_path}. The file starts with:\n${contextLines}\n...\nPlease read the file first to get the exact content.`,
        isError: true,
      };
    }

    let updated: string;
    let replacementCount = 0;
    if (replace_all) {
      const parts = original.split(old_string);
      replacementCount = parts.length - 1;
      updated = parts.join(new_string);
    } else {
      updated = original.replace(old_string, new_string);
      replacementCount = 1;
    }

    fs.writeFileSync(resolved, updated, 'utf-8');

    // Count diff stats
    const oldLines = original.split('\n').length;
    const newLines = updated.split('\n').length;
    const added = Math.max(0, newLines - oldLines);
    const removed = Math.max(0, oldLines - newLines);

    return {
      toolUseId: '',
      content: `File edited: ${path.relative(ctx.runDir, resolved)} (${replacementCount} replacement(s), +${added} -${removed} lines)`,
    };
  },
};

function resolveEditablePath(filePath: string, ctx: ToolContext): string {
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
