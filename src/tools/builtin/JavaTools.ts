/**
 * Java/JDK and Maven tools.
 * All commands execute with cwd = workspace/project. System PATH is preferred;
 * JAVA_HOME/MAVEN_HOME are appended only when configured paths exist.
 * References: spec requirements for jdk_java, jdk_javac, maven_compile, maven_test,
 * maven_dependency_tree, maven_effective_pom.
 */
import { z } from 'zod';
import { exec, ExecOptions } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Tool, ToolContext, ToolResult } from '../base.js';
import { createJavaProcessEnv, resolveJavaToolCommand } from './javaRuntime.js';

const flexibleBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean' || value === undefined) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

function runCommand(
  cmd: string,
  args: string[],
  ctx: ToolContext,
  timeout: number = 300000,
  extraArgs?: Record<string, string>
): Promise<ToolResult> {
  const cwd = ctx.projectDir;
  const env = createJavaProcessEnv();
  const fullCmd = `${cmd} ${args.join(' ')}`;

  return new Promise((resolve) => {
    exec(fullCmd, { cwd, env, timeout, maxBuffer: 20 * 1024 * 1024, shell: '/bin/bash' }, (error, stdout, stderr) => {
      const parts: string[] = [];
      parts.push(`$ ${fullCmd}`);
      parts.push(`(cwd: ${path.relative(ctx.runDir, cwd)})`);
      if (stdout) parts.push(stdout);
      if (stderr) parts.push(`[stderr]\n${stderr}`);
      if (error) {
        parts.push(`\n[exit code: ${error.code ?? 'unknown'}]`);
        if (error.killed) parts.push(`[timed out after ${timeout}ms]`);
        resolve({ toolUseId: '', content: parts.join('\n'), isError: true });
      } else {
        resolve({ toolUseId: '', content: parts.join('\n') });
      }
    });
  });
}

// ── jdk_java ────────────────────────────────────────────────────────────────

export const JdkJavaTool: Tool = {
  definition: {
    name: 'jdk_java',
    description: 'Run a Java class using the project JDK. cwd must be workspace/project.',
    inputSchema: z.object({
      classpath: z.string().optional().describe('Classpath (default: target/classes:target/dependency/*)'),
      mainClass: z.string().describe('Fully qualified main class name'),
      args: z.array(z.string()).optional().describe('Program arguments'),
      timeout: z.number().optional().describe('Timeout in ms (default 30000)'),
    }),
    isReadOnly: false,
    requiresConfirmation: true,
  },
  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { classpath, mainClass, args, timeout } = input as any;
    const cp = classpath ?? 'target/classes:target/dependency/*';
    const argStr = (args ?? []).join(' ');
    return runCommand(resolveJavaToolCommand('java'), ['-cp', cp, mainClass, argStr], ctx, timeout ?? 30000);
  },
};

// ── jdk_javac ──────────────────────────────────────────────────────────────

export const JdkJavacTool: Tool = {
  definition: {
    name: 'jdk_javac',
    description: 'Compile Java source files using the project JDK. cwd must be workspace/project.',
    inputSchema: z.object({
      sourceFiles: z.array(z.string()).describe('Java source files to compile (relative to project dir)'),
      classpath: z.string().optional().describe('Compilation classpath'),
      outputDir: z.string().optional().describe('Output directory (default: target/classes)'),
    }),
    isReadOnly: false,
    requiresConfirmation: true,
  },
  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { sourceFiles, classpath, outputDir } = input as any;
    const outDir = outputDir ?? 'target/classes';
    fs.mkdirSync(path.join(ctx.projectDir, outDir), { recursive: true });
    const args = ['-d', outDir, '-encoding', 'UTF-8'];
    if (classpath) args.push('-cp', classpath);
    args.push(...sourceFiles);
    return runCommand(resolveJavaToolCommand('javac'), args, ctx, 60000);
  },
};

// ── maven_compile ──────────────────────────────────────────────────────────

export const MavenCompileTool: Tool = {
  definition: {
    name: 'maven_compile',
    description: 'Run mvn compile in the project directory. Compiles main Java sources.',
    inputSchema: z.object({
      args: z.string().optional().describe('Additional Maven arguments'),
      skipTests: flexibleBoolean.optional().default(true).describe('Skip tests during compilation (boolean, default true)'),
    }),
    isReadOnly: false,
    requiresConfirmation: true,
  },
  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { args: extraArgs, skipTests } = input as any;
    const args = ['compile', '-B', '-q'];
    if (skipTests) args.push('-DskipTests=true');
    if (extraArgs) args.push(extraArgs);
    return runCommand(resolveJavaToolCommand('mvn'), args, ctx, 180000);
  },
};

// ── maven_test ─────────────────────────────────────────────────────────────

export const MavenTestTool: Tool = {
  definition: {
    name: 'maven_test',
    description: 'Run mvn test in the project directory. Executes unit tests and reports results. Output is saved to artifacts/unit_test_report.md.',
    inputSchema: z.object({
      testClass: z.string().optional().describe('Specific test class to run (e.g., com.example.MyTest)'),
      args: z.string().optional().describe('Additional Maven arguments'),
    }),
    isReadOnly: false,
    requiresConfirmation: true,
  },
  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { testClass, args: extraArgs } = input as any;
    const args = ['test', '-B'];
    if (testClass) args.push(`-Dtest=${testClass}`);
    if (extraArgs) args.push(extraArgs);

    const result = await runCommand(resolveJavaToolCommand('mvn'), args, ctx, 300000);

    // Save test report to artifacts
    try {
      const reportDir = path.join(ctx.projectDir, 'target', 'surefire-reports');
      let report = '# Unit Test Report\n\n';
      report += `**Timestamp:** ${new Date().toISOString()}\n\n`;
      if (fs.existsSync(reportDir)) {
        const reportFiles = fs.readdirSync(reportDir).filter(f => f.endsWith('.txt'));
        for (const rf of reportFiles.slice(0, 20)) {
          const content = fs.readFileSync(path.join(reportDir, rf), 'utf-8');
          report += `## ${rf}\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\`\n\n`;
        }
      }
      report += '## Output Summary\n\n```\n' + result.content.slice(0, 5000) + '\n```\n';
      fs.writeFileSync(path.join(ctx.artifactsDir, 'unit_test_report.md'), report, 'utf-8');
    } catch {
      // ignore report save errors
    }

    return result;
  },
};

// ── maven_dependency_tree ──────────────────────────────────────────────────

export const MavenDependencyTreeTool: Tool = {
  definition: {
    name: 'maven_dependency_tree',
    description: 'Run mvn dependency:tree to show project dependencies.',
    inputSchema: z.object({
      args: z.string().optional().describe('Additional Maven arguments'),
    }),
    isReadOnly: true,
  },
  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { args: extraArgs } = input as any;
    const args = ['dependency:tree', '-B'];
    if (extraArgs) args.push(extraArgs);
    return runCommand(resolveJavaToolCommand('mvn'), args, ctx, 120000);
  },
};

// ── maven_effective_pom ────────────────────────────────────────────────────

export const MavenEffectivePomTool: Tool = {
  definition: {
    name: 'maven_effective_pom',
    description: 'Run mvn help:effective-pom to show the fully resolved POM after inheritance and interpolation.',
    inputSchema: z.object({
      outputFile: z.string().optional().describe('Output file path (relative to project, default: target/effective-pom.xml)'),
    }),
    isReadOnly: true,
  },
  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { outputFile } = input as any;
    const outFile = outputFile ?? 'target/effective-pom.xml';
    const args = ['help:effective-pom', `-Doutput=${outFile}`, '-B'];
    const result = await runCommand(resolveJavaToolCommand('mvn'), args, ctx, 120000);
    if (!result.isError) {
      const pomPath = path.join(ctx.projectDir, outFile);
      if (fs.existsSync(pomPath)) {
        const pom = fs.readFileSync(pomPath, 'utf-8');
        return {
          toolUseId: '',
          content: result.content + `\n\nEffective POM saved to ${outFile} (${pom.length} chars)\n` + pom.slice(0, 3000) + (pom.length > 3000 ? '\n...(truncated)' : ''),
        };
      }
    }
    return result;
  },
};

// ── Register all Java/Maven tools ──────────────────────────────────────────

export function registerJavaTools(registry: import('../base').ToolRegistry): void {
  registry.register(JdkJavaTool);
  registry.register(JdkJavacTool);
  registry.register(MavenCompileTool);
  registry.register(MavenTestTool);
  registry.register(MavenDependencyTreeTool);
  registry.register(MavenEffectivePomTool);
}
