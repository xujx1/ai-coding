import * as fs from 'fs';
import * as path from 'path';
import { getRunPaths } from '../../runtime/paths.js';
import { ProjectManifest } from './upload-init.js';
import { loadPromptFile, renderPromptTemplate } from './prompt-files.js';

export interface SourceMapEntry {
  sourceFile: string;
  sourcePath: string;
  fileSize: number;
  referencedSections: string[];
  evidence: string;
}

export function buildMrdRenderPrompt(
  paths: ReturnType<typeof getRunPaths>,
  manifest: ProjectManifest,
  feedback?: string,
): string {
  const previousFeedbackSection = feedback
    ? `## 用户反馈（上一轮被退回，请根据以下反馈修改需求拆解）\n\n${feedback}`
    : '';

  const requirementFileList = manifest.requirements
    .filter(req => req.name !== 'custom-prompt.md')
    .map(req => {
      const sizeKb = (req.size / 1024).toFixed(1);
      const fullPath = path.join(paths.runDir, req.path);
      return `- ${req.name} (${sizeKb}KB) - 路径: ${fullPath}`;
    })
    .filter(Boolean)
    .join('\n') || '- 未读取到需求文件';

  let customPromptSection = '';
  if (manifest.customPrompt) {
    const customPath = path.join(paths.runDir, manifest.customPrompt);
    try {
      const customContent = fs.readFileSync(customPath, 'utf-8').slice(0, 5000);
      customPromptSection = `## 用户自定义 Prompt\n\n${customContent}`;
    } catch {
      // Ignore optional custom prompt read failures.
    }
  }

  const projectList = manifest.projects.length === 0
    ? '- 未检测到上传项目'
    : manifest.projects.map(proj => {
      const buildTool = proj.buildTool ? ` (构建工具: ${proj.buildTool})` : '';
      return `- ${proj.name}${buildTool}`;
    }).join('\n');

  return renderPromptTemplate(loadPromptFile('mrd-render-user.md'), {
    previous_feedback_section: previousFeedbackSection,
    requirement_file_list: requirementFileList,
    requirement_excerpts: buildRequirementExcerpts(paths, manifest),
    custom_prompt_section: customPromptSection,
    project_list: projectList,
    run_dir: paths.runDir,
    input_dir: paths.inputDir,
    artifacts_dir: paths.artifactsDir,
  });
}

export function buildFinalRequirementDecompositionPrompt(
  draft: string,
  questions: string,
  answers: string
): string {
  return renderPromptTemplate(loadPromptFile('mrd-render-final-user.md'), {
    draft: draft.slice(0, 60000),
    questions: questions.slice(0, 20000),
    answers: answers.slice(0, 20000),
  });
}

export function buildMrdClarifyPrompt(
  paths: ReturnType<typeof getRunPaths>,
  manifest: ProjectManifest,
  mrdContent: string,
  feedback?: string,
): string {
  const customPromptPath = path.join(paths.inputDir, 'custom-prompt.md');
  const projectList = manifest.projects.length === 0
    ? '- 未检测到上传代码项目；请基于 MRD 中的业务系统识别实施边界，并把实际代码项目缺失列为澄清项。'
    : manifest.projects.map(project => `- ${project.name}: ${project.root}`).join('\n');
  const feedbackSection = feedback
    ? `## 用户反馈（上一轮被退回，请据此修订澄清结果）\n${feedback}`
    : '（无）';
  const customPromptSection = fs.existsSync(customPromptPath)
    ? fs.readFileSync(customPromptPath, 'utf-8').slice(0, 8000)
    : '（无）';

  return renderPromptTemplate(loadPromptFile('mrd-clarify-user.md'), {
    feedback_section: feedbackSection,
    project_list: projectList,
    custom_prompt_section: customPromptSection,
    mrd_content: mrdContent.slice(0, 50000),
  });
}

export function buildRequirementExcerpts(
  paths: ReturnType<typeof getRunPaths>,
  manifest: ProjectManifest
): string {
  const MAX_PER_FILE_CHARS = 60000;
  const MAX_TOTAL_CHARS = 140000;
  let remaining = MAX_TOTAL_CHARS;
  const excerpts: string[] = [];

  for (const req of manifest.requirements) {
    if (remaining <= 0) break;
    const fullPath = path.join(paths.runDir, req.path);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      excerpts.push(`### ${req.name}\n\n（文件内容不可读）\n`);
      continue;
    }

    const limit = Math.min(MAX_PER_FILE_CHARS, remaining);
    const excerpt = content.slice(0, limit);
    remaining -= excerpt.length;
    const truncated = content.length > excerpt.length;
    excerpts.push([
      `### ${req.name}`,
      `- path: ${req.path}`,
      `- size: ${req.size} bytes`,
      truncated ? `- note: 内容已截断，已提供前 ${excerpt.length} 字符用于 MRD 渲染。` : '- note: 内容未截断。',
      '',
      '```markdown',
      excerpt,
      '```',
    ].join('\n'));
  }

  return excerpts.join('\n\n') || '（未读取到需求文件内容）';
}

export function readExistingSourceMap(sourceMapPath: string): SourceMapEntry[] | null {
  if (!fs.existsSync(sourceMapPath) || fs.statSync(sourceMapPath).size === 0) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(sourceMapPath, 'utf-8'));
    return normalizeSourceMap(parsed);
  } catch {
    return null;
  }
}

export function extractMrdContent(output: string): string {
  const mrdMatch = output.match(/<!--\s*MRD_START\s*-->([\s\S]*?)<!--\s*MRD_END\s*-->/i);
  if (mrdMatch) return mrdMatch[1].trim();

  const smMarker = '<!-- SOURCE_MAP_JSON';
  const smIdx = output.indexOf(smMarker);
  if (smIdx > 0) {
    return output.slice(0, smIdx).trim();
  }

  const jsonBlockMatch = output.match(/```json\s*\n(\{[\s\S]*?\})\s*\n```\s*$/);
  if (jsonBlockMatch) {
    return output.slice(0, output.lastIndexOf('```json')).trim();
  }

  return output.trim();
}

export function extractSourceMap(
  output: string,
  paths: ReturnType<typeof getRunPaths>,
  manifest: ProjectManifest
): SourceMapEntry[] {
  const smMarker = '<!-- SOURCE_MAP_JSON';
  const smEnd = '-->';
  const smStartIdx = output.indexOf(smMarker);
  if (smStartIdx >= 0) {
    const jsonStart = output.indexOf('\n', smStartIdx);
    const jsonEnd = output.indexOf(smEnd, jsonStart);
    if (jsonStart >= 0 && jsonEnd >= 0) {
      try {
        const parsed = JSON.parse(output.slice(jsonStart + 1, jsonEnd).trim());
        if (Array.isArray(parsed)) return parsed;
        if (parsed.sources && Array.isArray(parsed.sources)) return parsed.sources;
      } catch {
        // fall through
      }
    }
  }

  const jsonBlockMatch = output.match(/```json\s*\n([\s\S]*?)\n```\s*$/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.sources && Array.isArray(parsed.sources)) return parsed.sources;
    } catch {
      // fall through
    }
  }

  const sources: SourceMapEntry[] = [];
  for (const req of manifest.requirements) {
    if (req.name === 'custom-prompt.md') continue;
    const fullPath = path.join(paths.runDir, req.path);
    let evidence = '';
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      evidence = content.slice(0, 200);
    } catch {
      evidence = '(文件内容不可读)';
    }
    sources.push({
      sourceFile: req.name,
      sourcePath: req.path,
      fileSize: req.size,
      referencedSections: ['背景', '目标', '范围'],
      evidence,
    });
  }
  return sources;
}

export function isStructuredMrdContent(content: string): boolean {
  const requiredHeadings = ['## 背景', '## 目标', '## 范围', '## 涉及项目', '## 验收标准'];
  return content.trim().startsWith('#') && requiredHeadings.every(heading => content.includes(heading));
}

export function isClarifiedMrdContent(content: string): boolean {
  const text = content.trim();
  if (!text.startsWith('# MRD Clarification')) return false;
  const requiredHeadings = [
    '## Feature Inventory',
    '## Project Ownership',
    '## Implementation Boundaries',
    '## Clarification Questions',
    '## Clarified Decisions',
  ];
  const looksLikePlan = /我先|我将|将读取|先核对|action plan/i.test(text.slice(0, 300));
  return !looksLikePlan && requiredHeadings.every(heading => text.includes(heading));
}

export function buildFallbackClarifiedMrd(mrdContent: string, agentOutput: string): string {
  const failedOutput = agentOutput.trim()
    ? `\n\n> 模型原始输出未形成完整澄清版 MRD，已基于 artifacts/mrd.md 生成兜底澄清结果。原始输出摘要：${agentOutput.trim().slice(0, 200)}`
    : '';
  const features = inferFeatureInventoryFromMrd(mrdContent);
  const featureLines = features.map((feature, index) =>
    `${index + 1}. **${feature.name}**\n   - 业务域：${feature.domain}\n   - 来源摘要：${feature.evidence}\n   - 验收摘要：${feature.acceptance}`
  ).join('\n');
  const ownershipLines = features.map((feature, index) =>
    `${index + 1}. ${feature.name} -> 未上传代码项目；暂按业务系统/应用 \`${feature.system}\` 归属。`
  ).join('\n');

  return renderTemplate(loadTemplate('mrd-clarified-fallback.md'), {
    feature_lines: featureLines || '- 未能从 MRD 中稳定抽取功能点，需要用户补充功能范围。',
    ownership_lines: ownershipLines || '- 未上传代码项目，无法映射到实际项目文件夹。',
    failed_output: failedOutput,
  });
}

export function buildImplementationBoundaries(
  clarified: string,
  manifest: ProjectManifest
): string {
  const projectLines = manifest.projects.length > 0
    ? manifest.projects.map(project => `- ${project.name}: ${project.root}`).join('\n')
    : '- 未上传代码项目；需在实施方案前补充实际代码仓/服务名映射。';

  const boundaryExcerpt = extractSection(clarified, '## Implementation Boundaries') || [
    '- 未能从澄清 MRD 中稳定提取实施边界。',
    '- 功能归属、跨项目接口、字段口径和验收边界需由用户继续确认。',
  ].join('\n');

  return renderTemplate(loadTemplate('implementation-boundaries-fallback.md'), {
    project_lines: projectLines,
    boundary_excerpt: boundaryExcerpt.trim(),
  });
}

export function buildClarifyQuestionsArtifact(
  clarified: string,
  manifest?: ProjectManifest,
  existingQuestions?: string
): string {
  const rawQuestions = stripClarifyQuestionHeader(existingQuestions || extractSection(clarified, '## Clarification Questions') || '无需澄清。');
  const questions = limitClarificationQuestions(
    rawQuestions,
    3
  );
  const boundaryConfirmation = buildRequirementBoundaryConfirmation(clarified, manifest);
  return renderTemplate(loadTemplate('mrd-clarify-questions.md'), {
    boundary_confirmation: boundaryConfirmation,
    questions: questions.trim(),
  });
}

function stripClarifyQuestionHeader(content: string): string {
  let text = content.replace(/^#\s+MRD Clarify Questions\s*/i, '').trim();
  const otherQuestionsMarker = '## 其他待澄清问题';
  if (text.includes(otherQuestionsMarker)) {
    text = text.slice(text.indexOf(otherQuestionsMarker) + otherQuestionsMarker.length);
  }
  const boundaryMarker = '## 需求-应用实现边界确认';
  if (text.startsWith(boundaryMarker)) return '无需澄清。';
  return text.trim();
}

export function hasClarificationQuestions(questions: string): boolean {
  const body = questions
    .replace(/^#\s+MRD Clarify Questions\s*/i, '')
    .trim();
  if (!body) return false;
  if (/^(无需澄清|无待澄清|暂无待澄清|没有待澄清)/.test(body)) return false;
  const stripped = body
    .replace(/无需澄清[。.]?/g, '')
    .replace(/无待澄清[。.]?/g, '')
    .trim();
  return /[?？]/.test(stripped) || /(^|\n)\s*(?:[-*]|\d+[.)、])\s+\S+/.test(stripped);
}

export function buildRequirementBoundaryConfirmation(
  clarified: string,
  manifest?: ProjectManifest
): string {
  const projectLines = manifest?.projects?.length
    ? manifest.projects.map(project => `- ${project.name}: ${project.root}`).join('\n')
    : '- 未检测到上传项目；需要确认业务系统和实际代码项目映射。';
  const featureInventory = extractSection(clarified, '## Feature Inventory') || '未能稳定提取功能清单。';
  const projectOwnership = extractSection(clarified, '## Project Ownership') || '未能稳定提取项目归属。';
  const implementationBoundaries = extractSection(clarified, '## Implementation Boundaries') || '未能稳定提取实施边界。';

  return [
    '## 需求-应用实现边界确认',
    '',
    '请确认下面的需求清单、应用归属和实现边界是否正确。若某个需求项应由其他应用实现，或某个应用只透传/不改代码，请在反馈中直接改正。',
    '',
    '### 上传应用候选',
    '',
    projectLines,
    '',
    '### 功能清单',
    '',
    featureInventory.trim(),
    '',
    '### 应用归属',
    '',
    projectOwnership.trim(),
    '',
    '### 实施边界',
    '',
    implementationBoundaries.trim(),
    '',
    '### 必须确认的问题',
    '',
    '1. 上述每个需求项分别由哪个应用实现？请确认 crowd、abtest、cc 或其他应用的归属。',
    '2. 哪些应用需要改代码，哪些应用只负责字段透传、日志记录或不改动？',
    '3. 是否存在 MRD 提到但未上传的应用/仓库？如果存在，请指出应用名和阻断原因。',
  ].join('\n');
}

export function appendClarificationAnswers(draft: string, answers: string, modelOutput?: string): string {
  const base = isClarifiedMrdContent(draft)
    ? draft.trim()
    : buildFallbackClarifiedMrd(draft, modelOutput || '');
  const answerText = answers.trim() || '用户确认按推荐默认决策继续。';
  const invalidOutputNote = modelOutput?.trim()
    ? `\n- 第二轮模型输出未满足结构要求，已保留第一轮拆解并合并用户回答。模型输出摘要：${modelOutput.trim().slice(0, 240)}`
    : '';
  const answerBlock = renderTemplate(loadTemplate('mrd-clarified-answer-block.md'), {
    answer_lines: answerText.split('\n').map(line => `  ${line}`).join('\n'),
    invalid_output_note: invalidOutputNote,
  }).trimEnd();

  if (base.includes('## Clarified Decisions')) {
    return base.replace(
      /(## Clarified Decisions\s*\n)([\s\S]*)$/,
      (_match, heading: string, existing: string) => `${heading}${existing.trim()}\n${existing.trim() ? '\n' : ''}${answerBlock}\n`
    );
  }

  return `${base}\n\n## Clarified Decisions\n${answerBlock}\n`;
}

export function buildFallbackMrd(
  paths: ReturnType<typeof getRunPaths>,
  manifest: ProjectManifest,
  agentOutput: string
): string {
  const sourceSummaries = manifest.requirements.map((req) => {
    const fullPath = path.join(paths.runDir, req.path);
    let summary = '';
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      summary = content.slice(0, 1200).trim();
    } catch {
      summary = '文件内容不可读。';
    }
    return `### ${req.name}\n\n${summary}${req.size > 1200 ? '\n\n（已截断，仅用于 MRD 兜底摘要。）' : ''}`;
  }).join('\n\n');

  const projectLines = manifest.projects.length > 0
    ? manifest.projects.map(project => `- ${project.name}${project.buildTool ? `（${project.buildTool}）` : ''}：${project.root}`).join('\n')
    : '- 未检测到上传项目；后续 MRD 澄清或实施方案阶段需要用户补充目标应用或项目代码。';

  const clarificationItems = [
    '- 需要确认本次需求最终落地到哪些项目或应用。',
    '- 需要确认业务流程、接口边界、字段口径和验收指标。',
  ];
  if (agentOutput.trim()) {
    clarificationItems.push(`- 模型原始输出未形成完整 MRD，已使用上传需求文件生成兜底 MRD。原始输出摘要：${agentOutput.trim().slice(0, 200)}`);
  }

  return renderTemplate(loadTemplate('mrd-render-fallback.md'), {
    requirement_count: String(manifest.requirements.length),
    project_lines: projectLines,
    clarification_items: clarificationItems.join('\n'),
    source_summaries: sourceSummaries || '未读取到需求文件内容。',
  });
}

function normalizeSourceMap(parsed: unknown): SourceMapEntry[] | null {
  const entries = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { sources?: unknown }).sources)
      ? (parsed as { sources: unknown[] }).sources
      : null;
  if (!entries) return null;

  return entries.map((entry) => {
    const value = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    return {
      sourceFile: String(value.sourceFile ?? value.fileName ?? ''),
      sourcePath: String(value.sourcePath ?? value.filePath ?? ''),
      fileSize: Number(value.fileSize ?? value.size ?? 0),
      referencedSections: Array.isArray(value.referencedSections)
        ? value.referencedSections.map(String)
        : Array.isArray(value.sections)
          ? value.sections.map(String)
          : [],
      evidence: String(value.evidence ?? ''),
    };
  }).filter(entry => entry.sourceFile && entry.sourcePath);
}

function limitClarificationQuestions(content: string, maxQuestions: number): string {
  const text = content.trim();
  if (!text || /^(无需澄清|无待澄清|暂无待澄清|没有待澄清)/.test(text)) return text || '无需澄清。';
  const lines = text.split(/\r?\n/);
  const items: string[] = [];
  let current = '';
  for (const line of lines) {
    if (/^\s*(?:[-*]|\d+[.)、])\s+/.test(line)) {
      if (current.trim()) items.push(current.trim());
      current = line;
    } else if (current && line.trim()) {
      current += `\n${line}`;
    }
  }
  if (current.trim()) items.push(current.trim());
  if (!items.length) return text;
  const blockerItems = items
    .filter(item => /[?？]|确认|待定|不明确|未明确|阻断|边界|口径|归属|验收/.test(item))
    .slice(0, maxQuestions);
  return (blockerItems.length ? blockerItems : items.slice(0, maxQuestions)).join('\n');
}

export function extractSection(content: string, heading: string): string | null {
  const start = content.indexOf(heading);
  if (start < 0) return null;
  const rest = content.slice(start + heading.length);
  const next = rest.search(/\n##\s+/);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function inferFeatureInventoryFromMrd(mrdContent: string): Array<{
  name: string;
  domain: string;
  system: string;
  evidence: string;
  acceptance: string;
}> {
  const lines = mrdContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const candidates: string[] = [];

  for (const line of lines) {
    const heading = line.match(/^#{2,4}\s+(.{4,80})$/);
    const listItem = line.match(/^(?:[-*]|\d+[.)、])\s+(.{4,100})$/);
    const value = (heading?.[1] || listItem?.[1] || '').replace(/[`*_#]/g, '').trim();
    if (!value) continue;
    if (/^(背景|目标|范围|约束|验收|待澄清|目录|版本|作者|状态)$/i.test(value)) continue;
    if (!/(功能|能力|流程|模块|服务|接口|页面|任务|规则|管理|查询|同步|审批|配置|生成|校验|通知|报表|导入|导出)/.test(value)) continue;
    candidates.push(value.slice(0, 80));
    if (candidates.length >= 8) break;
  }

  return Array.from(new Set(candidates)).map((name) => ({
    name,
    domain: '待确认业务域',
    system: '待确认项目/系统',
    evidence: `MRD 中出现候选功能描述：“${name}”。`,
    acceptance: '需要用户或后续澄清确认验收口径。',
  }));
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
