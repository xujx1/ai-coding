import { z } from 'zod';
import { exec, ExecOptions } from 'child_process';
import * as path from 'path';
import { Tool, ToolContext, ToolResult } from '../base.js';
import { analyzeBashCommand } from '../security/bashSafety.js';
import { createJavaProcessEnv } from './javaRuntime.js';

export const BashTool: Tool = {
  definition: {
    name: 'bash',
    description: 'Execute a shell command. Commands run in the workspace/project directory. Output is truncated for display; full output is saved to logs. Cannot run dangerous commands.',
    inputSchema: z.object({
      command: z.string().describe('Shell command to execute'),
      cwd: z.string().optional().describe('Working directory (defaults to project directory)'),
      timeout: z.number().optional().describe('Timeout in milliseconds (default 120000)'),
    }),
    isReadOnly: false,
    isDestructive: true,
    requiresConfirmation: true,
  },

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { command, cwd, timeout } = input as {
      command: string;
      cwd?: string;
      timeout?: number;
    };

    const workingDir = cwd ? path.resolve(cwd) : ctx.cwd;

    // cwd must be inside project directory
    if (!workingDir.startsWith(ctx.projectDir)) {
      return {
        toolUseId: '',
        content: `Bash cwd must be inside workspace/project. Got: ${workingDir}`,
        isError: true,
      };
    }

    const execTimeout = timeout ?? 120000;
    const analysis = analyzeBashCommand(command);

    // System PATH is preferred; configured Java/Maven bins are appended only if present.
    const env = createJavaProcessEnv();

    const execOptions: ExecOptions = {
      cwd: workingDir,
      env,
      timeout: execTimeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      shell: '/bin/bash',
    };

    return new Promise((resolve) => {
      exec(command, execOptions, (error, stdout, stderr) => {
        const output: string[] = [];
        output.push(`[bash analysis] readOnly=${analysis.isReadOnly}, search=${analysis.isSearch}, read=${analysis.isRead}, list=${analysis.isList}${analysis.reason ? `, reason=${analysis.reason}` : ''}`);
        if (stdout) output.push(stdout.toString());
        if (stderr) output.push(`[stderr]\n${stderr.toString()}`);

        if (error) {
          output.push(`\n[exit code: ${error.code ?? 'unknown'}]`);
          if (error.killed) {
            output.push(`[command timed out after ${execTimeout}ms]`);
          }
          resolve({
            toolUseId: '',
            content: output.join('\n'),
            isError: true,
          });
        } else {
          const result = output.join('\n') || '[command completed with no output]';
          resolve({
            toolUseId: '',
            content: result,
          });
        }
      });
    });
  },
};
