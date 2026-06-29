import * as fs from 'fs';
import * as path from 'path';
import { RunPaths } from '../../runtime/paths.js';

export interface ProjectOpenSpecChange {
  projectName: string;
  changeId: string;
  changeRoot: string;
  proposalPath: string;
  designPath: string;
  tasksPath: string;
  specPath: string;
}

export function writeProjectOpenSpecChange(args: {
  paths: RunPaths;
  runId: string;
  projectName: string;
  projectRoot: string;
  developmentTasks: string;
  testTasks: string;
  prdSummary?: string;
  techDesignSummary?: string;
}): ProjectOpenSpecChange {
  const change = getProjectOpenSpecChange(args.paths, args.runId, args.projectName);
  const relativeChangeRoot = change.changeRoot;
  const absoluteChangeRoot = path.join(args.paths.artifactsDir, relativeChangeRoot);
  const absoluteSpecDir = path.dirname(path.join(args.paths.artifactsDir, change.specPath));
  fs.mkdirSync(absoluteChangeRoot, { recursive: true });
  fs.mkdirSync(absoluteSpecDir, { recursive: true });

  writeArtifact(args.paths, change.proposalPath, buildProposal(args));
  writeArtifact(args.paths, change.designPath, buildDesign(args));
  writeArtifact(args.paths, change.tasksPath, buildTasks(args.developmentTasks, args.testTasks));
  writeArtifact(args.paths, change.specPath, buildSpecDelta(args));

  return change;
}

export function getProjectOpenSpecChange(
  paths: RunPaths,
  runId: string,
  projectName: string
): ProjectOpenSpecChange {
  const projectSegment = safePathSegment(projectName);
  const changeId = `run-${safePathSegment(runId)}-${projectSegment}`;
  const changeRoot = path.join(projectSegment, 'openspec', 'changes', changeId).replace(/\\/g, '/');
  return {
    projectName,
    changeId,
    changeRoot,
    proposalPath: `${changeRoot}/proposal.md`,
    designPath: `${changeRoot}/design.md`,
    tasksPath: `${changeRoot}/tasks.md`,
    specPath: `${changeRoot}/specs/${projectSegment}/spec.md`,
  };
}

export function readProjectOpenSpecContext(
  paths: RunPaths,
  runId: string,
  projectName: string,
  maxChars = 24000
): string {
  const change = getProjectOpenSpecChange(paths, runId, projectName);
  const parts = [
    ['proposal.md', change.proposalPath],
    ['design.md', change.designPath],
    ['tasks.md', change.tasksPath],
    ['spec.md', change.specPath],
  ].map(([title, relativePath]) => {
    const content = readArtifact(paths, relativePath);
    return content ? `## OpenSpec ${title}\n- path: artifacts/${relativePath}\n\n${content}` : '';
  }).filter(Boolean);
  return parts.join('\n\n').slice(0, maxChars);
}

export function markProjectOpenSpecTasksCompleted(args: {
  paths: RunPaths;
  runId: string;
  projectName: string;
  section: 'development' | 'test' | 'all';
}): { tasksPath: string; updated: boolean } | null {
  const change = getProjectOpenSpecChange(args.paths, args.runId, args.projectName);
  const absoluteTasksPath = path.join(args.paths.artifactsDir, change.tasksPath);
  if (!fs.existsSync(absoluteTasksPath)) return null;

  const current = fs.readFileSync(absoluteTasksPath, 'utf-8');
  const next = markTasksInSection(current, args.section);
  if (next === current) {
    return { tasksPath: change.tasksPath, updated: false };
  }
  fs.writeFileSync(absoluteTasksPath, next, 'utf-8');
  return { tasksPath: change.tasksPath, updated: true };
}

export function mergeOpenSpecArtifactsIntoManifestProjects<T extends { project: string }>(
  paths: RunPaths,
  runId: string,
  projects: T[]
): Array<T & { openSpecChange: ProjectOpenSpecChange }> {
  return projects.map(project => ({
    ...project,
    openSpecChange: getProjectOpenSpecChange(paths, runId, project.project),
  }));
}

function buildProposal(args: {
  projectName: string;
  projectRoot: string;
  developmentTasks: string;
  testTasks: string;
  prdSummary?: string;
  techDesignSummary?: string;
}): string {
  return [
    `# ${args.projectName} OpenSpec Change`,
    '',
    '## Why',
    args.prdSummary || '根据当前 MRD、PRD 和项目技术方案生成项目级实现变更。',
    '',
    '## What Changes',
    '- 生产代码按开发任务清单实现。',
    '- 测试代码按测试任务清单补充。',
    '- Java 实现和测试生成阶段会同步更新本 change 的 tasks.md 完成状态。',
    '',
    '## Impact',
    `- Project: ${args.projectName}`,
    `- Root: ${args.projectRoot}`,
    `- Development task count: ${countCheckboxTasks(args.developmentTasks)}`,
    `- Test task count: ${countCheckboxTasks(args.testTasks)}`,
  ].join('\n');
}

function buildDesign(args: {
  projectName: string;
  techDesignSummary?: string;
}): string {
  return [
    `# ${args.projectName} Design Notes`,
    '',
    '## Context',
    args.techDesignSummary || '详细设计来源于 artifacts/<project>/tech-design.md。',
    '',
    '## Execution Model',
    '- `spec-generate` creates this OpenSpec change from project-scoped task artifacts.',
    '- `java-impl` consumes development tasks and marks development checkboxes complete after code changes.',
    '- `testcode-generate` consumes test tasks and marks test checkboxes complete after test generation and Maven execution.',
  ].join('\n');
}

function buildTasks(developmentTasks: string, testTasks: string): string {
  return [
    '# Tasks',
    '',
    '## Development',
    normalizeTaskList(developmentTasks),
    '',
    '## Test',
    normalizeTaskList(testTasks),
    '',
  ].join('\n');
}

function buildSpecDelta(args: {
  projectName: string;
  developmentTasks: string;
  testTasks: string;
}): string {
  return [
    '## ADDED Requirements',
    '',
    `### Requirement: ${args.projectName} implementation tasks`,
    'The project SHALL implement the project-scoped development tasks generated for this run.',
    '',
    '#### Scenario: Development task list exists',
    '- **WHEN** the Java implementation stage starts',
    '- **THEN** it reads the generated OpenSpec development tasks',
    '- **AND** it updates production code according to those tasks',
    '',
    `### Requirement: ${args.projectName} test tasks`,
    'The project SHALL implement the project-scoped test tasks generated for this run.',
    '',
    '#### Scenario: Test task list exists',
    '- **WHEN** the test-code generation stage starts',
    '- **THEN** it reads the generated OpenSpec test tasks',
    '- **AND** it updates test code and executes configured verification',
    '',
    '<!-- Source task counts: ' +
      `development=${countCheckboxTasks(args.developmentTasks)}, test=${countCheckboxTasks(args.testTasks)} -->`,
  ].join('\n');
}

function normalizeTaskList(content: string): string {
  const taskLines = content
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => /^[-*]\s+\[[ xX]\]\s+/.test(line) || /^##\s+/.test(line));
  if (!taskLines.some(line => /^[-*]\s+\[[ xX]\]\s+/.test(line))) {
    return '- [ ] Review source task artifact and apply required changes.';
  }
  return taskLines.join('\n');
}

function markTasksInSection(content: string, section: 'development' | 'test' | 'all'): string {
  if (section === 'all') return markMarkdownTasksCompleted(content);
  const lines = content.split(/\r?\n/);
  let inTarget = false;
  return lines.map(line => {
    if (/^##\s+Development\s*$/.test(line)) {
      inTarget = section === 'development';
      return line;
    }
    if (/^##\s+Test\s*$/.test(line)) {
      inTarget = section === 'test';
      return line;
    }
    return inTarget ? markMarkdownTasksCompleted(line) : line;
  }).join('\n');
}

function markMarkdownTasksCompleted(content: string): string {
  return content
    .replace(/^(\s*[-*]\s*)\[\s\](\s+)/gm, '$1[x]$2')
    .replace(/^(\s*)\d+\.\s+(.+)$/gm, '$1- [x] $2');
}

function countCheckboxTasks(content: string): number {
  return content.split(/\r?\n/).filter(line => /^[-*]\s+\[[ xX]\]\s+/.test(line.trim())).length;
}

function writeArtifact(paths: RunPaths, relativePath: string, content: string): void {
  const absolutePath = path.join(paths.artifactsDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf-8');
}

function readArtifact(paths: RunPaths, relativePath: string): string | null {
  const absolutePath = path.join(paths.artifactsDir, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  return fs.readFileSync(absolutePath, 'utf-8');
}

function safePathSegment(value: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || 'project';
}
