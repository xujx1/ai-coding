import * as fs from 'fs';
import * as path from 'path';
import type { ProjectManifest } from '../agents/codegen/upload-init.js';
import type { RunPaths } from '../runtime/paths.js';
import type { PlannedTrackKind } from './sessionPlan.js';

export const REQUIREMENT_OWNERSHIP_ARTIFACT = 'requirement-ownership.json';
export const REQUIREMENT_OWNERSHIP_ARTIFACT_PATH = `artifacts/${REQUIREMENT_OWNERSHIP_ARTIFACT}`;

export interface RequirementOwnershipArtifact {
  schemaVersion: 1;
  generatedAt: string;
  sourceArtifacts: string[];
  featureInventory: RequirementFeature[];
  projectOwnership: RequirementProjectOwnership[];
  implementationSurfaces: RequirementImplementationSurface[];
  unresolvedQuestions: string[];
  confirmedDecisions: string[];
  confirmation: RequirementOwnershipConfirmation;
  migration: {
    source: 'structured-confirmation' | 'legacy-markdown';
    legacyFallbackUsed: boolean;
    warnings: string[];
  };
}

export interface RequirementFeature {
  featureId: string;
  title: string;
  summary: string;
  acceptance: string;
  evidence: string;
}

export interface RequirementProjectOwnership {
  featureId?: string;
  projectName: string;
  projectRoot?: string;
  responsibility: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
}

export interface RequirementImplementationSurface {
  featureId?: string;
  projectName: string;
  projectRoot?: string;
  frontend: boolean;
  backend: boolean;
  contract: boolean;
  e2e: boolean;
  documentation: boolean;
  source: 'structured-confirmation' | 'legacy-markdown' | 'capability-fallback';
  evidence: string;
}

export interface RequirementOwnershipConfirmation {
  status: 'pending' | 'confirmed' | 'auto-confirmed';
  feedback?: string;
  confirmedAt?: string;
}

export function buildRequirementOwnershipArtifact(args: {
  clarified: string;
  manifest?: ProjectManifest;
  confirmation?: RequirementOwnershipConfirmation;
  generatedAt?: string;
}): RequirementOwnershipArtifact {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const featureInventory = parseFeatureInventory(args.clarified);
  const projectOwnership = parseProjectOwnership(args.clarified, args.manifest, featureInventory);
  const implementationSurfaces = parseImplementationSurfaces(args.clarified, args.manifest, featureInventory);
  const unresolvedQuestions = parseSectionItems(args.clarified, 'Clarification Questions')
    .filter(item => !/^(无需澄清|无待澄清|暂无待澄清|没有待澄清)/.test(item));
  const confirmedDecisions = parseSectionItems(args.clarified, 'Clarified Decisions');
  const hasStructuredSurfaces = implementationSurfaces.some(surface => surface.source === 'structured-confirmation');

  return {
    schemaVersion: 1,
    generatedAt,
    sourceArtifacts: [
      'artifacts/mrd-clarified.md',
      'artifacts/mrd-clarify-questions.md',
      'artifacts/project-manifest.json',
    ],
    featureInventory,
    projectOwnership,
    implementationSurfaces,
    unresolvedQuestions,
    confirmedDecisions,
    confirmation: args.confirmation ?? { status: 'pending' },
    migration: {
      source: hasStructuredSurfaces ? 'structured-confirmation' : 'legacy-markdown',
      legacyFallbackUsed: !hasStructuredSurfaces,
      warnings: hasStructuredSurfaces ? [] : ['Implementation surfaces were derived from legacy Markdown or project capability evidence.'],
    },
  };
}

export function writeRequirementOwnershipArtifact(args: {
  paths: RunPaths;
  artifact: RequirementOwnershipArtifact;
}): { relativePath: string; content: string } {
  const content = serializeRequirementOwnershipArtifact(args.artifact);
  const artifactPath = path.join(args.paths.artifactsDir, REQUIREMENT_OWNERSHIP_ARTIFACT);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, content, 'utf-8');
  return {
    relativePath: REQUIREMENT_OWNERSHIP_ARTIFACT,
    content,
  };
}

export function readRequirementOwnershipArtifact(paths: RunPaths): RequirementOwnershipArtifact | null {
  const artifactPath = path.join(paths.artifactsDir, REQUIREMENT_OWNERSHIP_ARTIFACT);
  if (!fs.existsSync(artifactPath)) return null;
  try {
    return normalizeRequirementOwnershipArtifact(JSON.parse(fs.readFileSync(artifactPath, 'utf-8')));
  } catch {
    return null;
  }
}

export function serializeRequirementOwnershipArtifact(artifact: RequirementOwnershipArtifact): string {
  return JSON.stringify(artifact, null, 2);
}

export function summarizeProjectSurfaceDecision(
  ownership: RequirementOwnershipArtifact | undefined,
  projectName: string
): Partial<Record<PlannedTrackKind, boolean>> | undefined {
  if (!ownership) return undefined;
  const surfaces = ownership.implementationSurfaces.filter(surface =>
    normalizeName(surface.projectName) === normalizeName(projectName)
  );
  if (!surfaces.length) return undefined;
  return {
    frontend: surfaces.some(surface => surface.frontend),
    backend: surfaces.some(surface => surface.backend),
    contract: surfaces.some(surface => surface.contract),
    e2e: surfaces.some(surface => surface.e2e),
    documentation: surfaces.every(surface => surface.documentation),
  };
}

function normalizeRequirementOwnershipArtifact(value: unknown): RequirementOwnershipArtifact | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as RequirementOwnershipArtifact;
  if (parsed.schemaVersion !== 1) return null;
  if (!Array.isArray(parsed.implementationSurfaces)) return null;
  return parsed;
}

function parseFeatureInventory(clarified: string): RequirementFeature[] {
  const items = parseSectionItems(clarified, 'Feature Inventory');
  return (items.length ? items : ['未能稳定提取功能清单。']).map((item, index) => ({
    featureId: `feature-${index + 1}`,
    title: stripMarkdown(item).split(/\s+-\s+|[:：]/)[0].slice(0, 80) || `Feature ${index + 1}`,
    summary: stripMarkdown(item).slice(0, 500),
    acceptance: extractInlineValue(item, ['验收', 'acceptance']) || '',
    evidence: item.slice(0, 1000),
  }));
}

function parseProjectOwnership(
  clarified: string,
  manifest: ProjectManifest | undefined,
  features: RequirementFeature[]
): RequirementProjectOwnership[] {
  const section = extractSection(clarified, 'Project Ownership');
  const items = parseSectionItems(clarified, 'Project Ownership');
  const projects = manifest?.projects ?? [];
  const ownership: RequirementProjectOwnership[] = [];
  for (const project of projects) {
    const matchedItems = items.filter(item => referencesName(item, project.name) || referencesName(item, path.basename(project.root)));
    for (const item of matchedItems) {
      ownership.push({
        featureId: matchFeatureId(item, features),
        projectName: project.name,
        projectRoot: project.root,
        responsibility: stripMarkdown(item).slice(0, 500),
        confidence: 'high',
        evidence: item,
      });
    }
  }
  if (!ownership.length && section.trim()) {
    ownership.push({
      projectName: 'unresolved',
      responsibility: stripMarkdown(section).slice(0, 500),
      confidence: 'low',
      evidence: section.slice(0, 1000),
    });
  }
  return ownership;
}

function parseImplementationSurfaces(
  clarified: string,
  manifest: ProjectManifest | undefined,
  features: RequirementFeature[]
): RequirementImplementationSurface[] {
  const tableRows = parseMarkdownTable(extractSection(clarified, 'Implementation Surfaces'));
  const projects = manifest?.projects ?? [];
  const surfaces: RequirementImplementationSurface[] = [];
  for (const row of tableRows) {
    const projectCell = tableValue(row, ['项目', '应用', 'project', 'app']);
    const matchedProjects = projects.filter(project =>
      referencesProjectCell(projectCell, project.name) || referencesProjectCell(projectCell, path.basename(project.root))
    );
    const targets = matchedProjects.length
      ? matchedProjects
      : projectCell
        ? [{ name: stripMarkdown(projectCell), root: undefined }]
        : [];
    for (const project of targets) {
      surfaces.push({
        featureId: matchFeatureId(tableValue(row, ['功能项', '需求项', 'feature', 'requirement']), features),
        projectName: project.name,
        projectRoot: project.root,
        frontend: parseBooleanCell(tableValue(row, ['frontend', '前端', '页面', '交互'])),
        backend: parseBooleanCell(tableValue(row, ['backend', '后端', '服务', '接口'])),
        contract: parseBooleanCell(tableValue(row, ['contract', '契约', 'api'])),
        e2e: parseBooleanCell(tableValue(row, ['e2e', '端到端'])),
        documentation: parseBooleanCell(tableValue(row, ['documentation', '文档'])),
        source: 'structured-confirmation',
        evidence: tableValue(row, ['判断依据', '依据', 'evidence']) || JSON.stringify(row),
      });
    }
  }
  if (surfaces.length) return surfaces;

  return projects.map(project => {
    const context = collectProjectContext(project.name, clarified);
    const frontend = Boolean(project.capabilities?.frontend);
    const backend = Boolean(project.capabilities?.backend || project.buildTool === 'maven');
    const contract = Boolean(project.capabilities?.apiBaseUrlConventions?.length || (frontend && backend));
    return {
      projectName: project.name,
      projectRoot: project.root,
      frontend,
      backend,
      contract,
      e2e: frontend,
      documentation: !frontend && !backend && !contract,
      source: context ? 'legacy-markdown' : 'capability-fallback',
      evidence: context || 'No structured implementation surface table was available; project capability evidence was used.',
    };
  });
}

function parseSectionItems(content: string, title: string): string[] {
  const section = extractSection(content, title);
  if (!section.trim()) return [];
  const lines = section.split(/\r?\n/);
  const items: string[] = [];
  let current = '';
  for (const line of lines) {
    if (/^\s*(?:[-*]|\d+[.)、])\s+/.test(line)) {
      if (current.trim()) items.push(current.trim());
      current = line.replace(/^\s*(?:[-*]|\d+[.)、])\s+/, '').trim();
    } else if (current && line.trim()) {
      current += `\n${line.trim()}`;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items.length ? items : [section.trim()];
}

function extractSection(content: string, title: string): string {
  const re = new RegExp(`(^|\\n)##\\s+${escapeRegExp(title)}\\b([\\s\\S]*?)(?=\\n##\\s+|\\s*$)`, 'i');
  return re.exec(content)?.[2]?.trim() ?? '';
}

function parseMarkdownTable(section: string): Array<Record<string, string>> {
  const lines = section.split(/\r?\n/).map(line => line.trim()).filter(line => /^\|.*\|$/.test(line));
  if (lines.length < 2) return [];
  const headers = splitTableRow(lines[0]).map(header => header.toLowerCase());
  return lines.slice(2).map(line => {
    const cells = splitTableRow(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function tableValue(row: Record<string, string>, keys: string[]): string {
  const entry = Object.entries(row).find(([key]) => keys.some(candidate => key.includes(candidate.toLowerCase())));
  return entry?.[1] ?? '';
}

function parseBooleanCell(value: string): boolean {
  const normalized = stripMarkdown(value).trim().toLowerCase();
  if (!normalized) return false;
  if (/^(no|false|否|不需要|无|n)\b/.test(normalized)) return false;
  return /^(yes|true|是|需要|有|y)\b|前端|后端|接口|契约|e2e|端到端|文档/i.test(normalized);
}

function matchFeatureId(text: string | undefined, features: RequirementFeature[]): string | undefined {
  const normalized = normalizeName(text ?? '');
  if (!normalized) return undefined;
  return features.find(feature =>
    normalizeName(feature.title) && normalized.includes(normalizeName(feature.title))
  )?.featureId;
}

function collectProjectContext(projectName: string, content: string): string {
  const escaped = escapeRegExp(projectName);
  const projectLine = new RegExp(`^.*${escaped}.*$`, 'gim');
  return Array.from(content.matchAll(projectLine)).map(match => match[0].trim()).slice(0, 12).join('\n');
}

function referencesName(content: string, name: string): boolean {
  const normalizedContent = ` ${normalizeName(content)} `;
  const normalizedName = normalizeName(name);
  return Boolean(normalizedName && normalizedContent.includes(` ${normalizedName} `));
}

function referencesProjectCell(content: string, name: string): boolean {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return false;
  return content
    .split(/[,\n，、/|;；]+/)
    .map(value => normalizeName(value.replace(/`/g, '')))
    .some(value => value === normalizedName);
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').trim();
}

function stripMarkdown(value: string): string {
  return value.replace(/[`*_>#|]/g, '').replace(/\s+/g, ' ').trim();
}

function extractInlineValue(content: string, keys: string[]): string {
  for (const key of keys) {
    const match = new RegExp(`${escapeRegExp(key)}\\s*[:：]\\s*([^\\n]+)`, 'i').exec(content);
    if (match) return stripMarkdown(match[1]);
  }
  return '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
