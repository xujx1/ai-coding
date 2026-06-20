import * as fs from 'fs';
import * as path from 'path';
import { getRunPaths } from '../../runtime/paths.js';
import type { PlanState } from '../../persistence/stateStore.js';

export interface ProjectStageSummary {
  project: string;
  artifactPaths: string[];
  summary: string;
}

export function buildProjectStageConfirmationContent(title: string, summaries: ProjectStageSummary[]): string {
  const projectLines = summaries.length
    ? summaries.map(summary => renderTemplate(loadTemplate('project-stage-section.md'), {
      project: summary.project,
      summary: summary.summary,
      artifact_lines: summary.artifactPaths.map(artifactPath => `- ${artifactPath}`).join('\n'),
    })).join('\n\n')
    : '未检测到项目文件夹。';
  return renderTemplate(loadTemplate('project-stage-confirmation.md'), {
    title,
    project_sections: projectLines,
  });
}

export function buildImplementationPlanConfirmationContent(
  prd: string,
  projects: Array<{ project: string; artifact: string; summary: string; riskLevel: string }>,
  paths: ReturnType<typeof getRunPaths>,
): string {
  const boundariesPath = path.join(paths.artifactsDir, 'implementation-boundaries.md');
  const boundaries = fs.existsSync(boundariesPath)
    ? summarizeMarkdownSections(fs.readFileSync(boundariesPath, 'utf-8'), 500)
    : '未生成独立 implementation-boundaries.md；本节点已从 mrd-clarified.md 中读取功能归属和实施边界。';
  const projectLines = projects.length
    ? projects.map(project => [
      `### ${project.project}`,
      `- 产物：${project.artifact}`,
      `- 风险：${project.riskLevel}`,
      `- 摘要：${project.summary}`,
    ].join('\n')).join('\n\n')
    : '未检测到项目文件夹，未生成项目级技术方案。';

  return renderTemplate(loadTemplate('implementation-plan-confirmation.md'), {
    prd_summary: summarizeMarkdownSections(prd, 900),
    boundaries_summary: boundaries,
    project_lines: projectLines,
    artifact_lines: [
      '- artifacts/prd.md',
      '- artifacts/implementation-plan-manifest.json',
      ...projects.map(project => `- ${project.artifact}`),
    ].join('\n'),
  });
}

export function buildSpecConfirmationContent(projects: Array<{
  project: string;
  devSpec: string;
  testSpec: string;
  devSummary: string;
  testSummary: string;
}>): string {
  const projectLines = projects.length
    ? projects.map(project => [
      `### ${project.project}`,
      `- 开发任务清单：${project.devSpec}`,
      `- 开发摘要：${project.devSummary}`,
      `- 测试任务清单：${project.testSpec}`,
      `- 测试摘要：${project.testSummary}`,
    ].join('\n')).join('\n\n')
    : '未检测到项目文件夹，未生成 Spec 文件。';

  return renderTemplate(loadTemplate('spec-confirmation.md'), {
    project_lines: projectLines,
    artifact_lines: [
      '- artifacts/spec-manifest.json',
      ...projects.flatMap(project => [`- ${project.devSpec}`, `- ${project.testSpec}`]),
    ].join('\n'),
  });
}

export function buildPlanTaskConfirmationContent(
  plan: PlanState | undefined,
  fallbackTitle: string,
  projectName?: string,
  checked = false,
): string {
  const title = plan?.title?.trim() || fallbackTitle;
  const steps = plan?.steps?.length
    ? plan.steps
    : [{ id: 'step-1', title: fallbackTitle, description: '执行当前节点任务。', status: 'pending' as const }];
  const mark = checked ? '[x]' : '[ ]';
  const phaseLines = steps.map((step, index) => {
    const heading = `## Phase ${index + 1}: ${step.title || step.id || '执行任务'}`;
    const subtasks = splitPlanSubtasks(step.description || step.title || '完成当前阶段任务');
    const taskLines = subtasks.map(task => `- ${mark} ${task}`).join('\n');
    const risk = step.risk ? `- 风险等级：${step.risk}` : '';
    return [heading, taskLines, risk].filter(Boolean).join('\n');
  }).join('\n\n');
  const riskLines = plan?.risks?.length
    ? plan.risks.map(risk => `- ${risk}`).join('\n')
    : '- 暂无额外风险。';

  return renderTemplate(loadTemplate('plan-task-confirmation.md'), {
    title,
    project_line: projectName ? `> 项目：${projectName}` : '',
    phase_lines: phaseLines,
    risk_lines: riskLines,
  });
}

function summarizeMarkdownSections(content: string, maxLength = 700): string {
  const lines = content
    .replace(/```[\s\S]*?```/g, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const selected: string[] = [];
  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      selected.push(line);
    } else if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      selected.push(line);
    }
    if (selected.join('\n').length >= maxLength) break;
  }
  const result = selected.join('\n').trim() || summarizeMarkdown(content, maxLength);
  return result.length > maxLength ? `${result.slice(0, maxLength)}...` : result;
}

function splitPlanSubtasks(text: string): string[] {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/: /g, '：')
    .trim();
  if (!normalized) return ['完成当前阶段任务'];
  const parts = normalized
    .split(/(?:；|;|。|\.\s+|\bthen\b|\band\b|\bwhile\b)/i)
    .map(item => item.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean);
  if (parts.length <= 1) return [normalized];
  return parts.slice(0, 6);
}

function summarizeMarkdown(content: string, maxLength = 320): string {
  const text = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '暂无摘要。';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function loadTemplate(fileName: string): string {
  const templatePath = path.join(process.cwd(), 'prompts', 'template', fileName);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Output template not found: prompts/template/${fileName}`);
  }
  return fs.readFileSync(templatePath, 'utf-8');
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => variables[key] ?? '');
}
