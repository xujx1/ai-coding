import * as fs from 'fs';
import * as path from 'path';
import { ProjectManifest } from '../agents/codegen/upload-init.js';
import { RunPaths } from '../runtime/paths.js';
import type { RequirementOwnershipArtifact } from './requirementOwnership.js';

export interface FanoutProjectCandidate {
  name: string;
  root: string;
}

export interface FanoutProjectDecision extends FanoutProjectCandidate {
  reason: string;
}

export interface FanoutUnresolvedProject {
  name: string;
  reason: string;
}

export interface FanoutDecision {
  schemaVersion: 1;
  candidates: FanoutProjectCandidate[];
  includedProjects: FanoutProjectDecision[];
  excludedProjects: FanoutProjectDecision[];
  unresolvedProjects: FanoutUnresolvedProject[];
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  fallbackReason?: string;
  generatedAt: string;
}

export const FANOUT_DECISION_ARTIFACT = 'fanout-decision.json';
export const FANOUT_DECISION_ARTIFACT_PATH = `artifacts/${FANOUT_DECISION_ARTIFACT}`;

export function deriveFanoutDecision(args: {
  manifest: ProjectManifest;
  clarifiedMrd?: string;
  requirementOwnership?: RequirementOwnershipArtifact;
  generatedAt?: string;
}): FanoutDecision {
  const candidates = args.manifest.projects.map(project => ({
    name: project.name,
    root: project.root,
  }));
  const ownershipSection = extractProjectOwnershipSection(args.clarifiedMrd ?? '');
  const structuredEvidence = args.requirementOwnership
    ? [
      JSON.stringify({
        projectOwnership: args.requirementOwnership.projectOwnership,
        implementationSurfaces: args.requirementOwnership.implementationSurfaces,
      }).slice(0, 4000),
    ]
    : [];
  const evidence = structuredEvidence.length
    ? structuredEvidence
    : ownershipSection
      ? [ownershipSection.slice(0, 4000)]
      : [];

  if (!candidates.length) {
    return {
      schemaVersion: 1,
      candidates,
      includedProjects: [],
      excludedProjects: [],
      unresolvedProjects: [],
      confidence: 'low',
      evidence,
      fallbackReason: 'No uploaded project candidates were detected.',
      generatedAt: args.generatedAt ?? new Date().toISOString(),
    };
  }

  const referencedNames = args.requirementOwnership
    ? findStructuredReferencedProjectNames(args.requirementOwnership, candidates)
    : findReferencedProjectNames(ownershipSection || args.clarifiedMrd || '', candidates);
  const unresolvedProjects = args.requirementOwnership
    ? findStructuredUnresolvedProjectNames(args.requirementOwnership, candidates)
    : findUnresolvedProjectNames(ownershipSection, candidates);

  if (!referencedNames.size) {
    return {
      schemaVersion: 1,
      candidates,
      includedProjects: candidates.map(project => ({
        ...project,
        reason: 'Included by fallback because MRD ownership could not be mapped confidently.',
      })),
      excludedProjects: [],
      unresolvedProjects,
      confidence: 'low',
      evidence,
      fallbackReason: args.requirementOwnership
        ? 'Structured requirement ownership did not confidently match uploaded project names.'
        : 'MRD ownership did not confidently match uploaded project names.',
      generatedAt: args.generatedAt ?? new Date().toISOString(),
    };
  }

  const includedProjects = candidates
    .filter(project => referencedNames.has(normalizeProjectName(project.name)))
    .map(project => ({
      ...project,
        reason: args.requirementOwnership
          ? 'Included because structured requirement ownership references this uploaded project.'
          : 'Included because MRD ownership references this uploaded project.',
    }));
  const excludedProjects = candidates
    .filter(project => !referencedNames.has(normalizeProjectName(project.name)))
    .map(project => ({
      ...project,
        reason: args.requirementOwnership
          ? 'Excluded because structured requirement ownership does not reference this uploaded project.'
          : 'Excluded because MRD ownership does not reference this uploaded project.',
    }));

  return {
    schemaVersion: 1,
    candidates,
    includedProjects,
    excludedProjects,
    unresolvedProjects,
    confidence: unresolvedProjects.length ? 'medium' : 'high',
    evidence,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
  };
}

function findStructuredReferencedProjectNames(
  ownership: RequirementOwnershipArtifact,
  candidates: FanoutProjectCandidate[]
): Set<string> {
  const referenced = new Set<string>();
  const structuredNames = [
    ...ownership.projectOwnership.map(item => item.projectName),
    ...ownership.implementationSurfaces
      .filter(surface => surface.frontend || surface.backend || surface.contract || surface.e2e || surface.documentation)
      .map(surface => surface.projectName),
  ];
  for (const candidate of candidates) {
    const normalizedName = normalizeProjectName(candidate.name);
    const normalizedRootName = normalizeProjectName(path.basename(candidate.root));
    if (structuredNames.some(name => {
      const normalized = normalizeProjectName(name);
      return normalized === normalizedName || normalized === normalizedRootName;
    })) {
      referenced.add(normalizedName);
    }
  }
  return referenced;
}

function findStructuredUnresolvedProjectNames(
  ownership: RequirementOwnershipArtifact,
  candidates: FanoutProjectCandidate[]
): FanoutUnresolvedProject[] {
  const candidateNames = new Set(candidates.flatMap(project => [
    normalizeProjectName(project.name),
    normalizeProjectName(path.basename(project.root)),
  ]));
  const names = new Set([
    ...ownership.projectOwnership.map(item => item.projectName),
    ...ownership.implementationSurfaces.map(item => item.projectName),
  ].map(normalizeProjectName).filter(Boolean));
  return [...names]
    .filter(name => name !== 'unresolved' && !candidateNames.has(name))
    .map(name => ({
      name,
      reason: 'Structured requirement ownership references this project but it was not uploaded.',
    }));
}

export function writeFanoutDecisionArtifact(args: {
  paths: RunPaths;
  decision: FanoutDecision;
}): { relativePath: string; content: string } {
  const content = serializeFanoutDecision(args.decision);
  const artifactPath = path.join(args.paths.artifactsDir, FANOUT_DECISION_ARTIFACT);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, content, 'utf-8');
  return {
    relativePath: FANOUT_DECISION_ARTIFACT,
    content,
  };
}

export function serializeFanoutDecision(decision: FanoutDecision): string {
  return JSON.stringify(decision, null, 2);
}

function extractProjectOwnershipSection(content: string): string {
  const match = content.match(/(^|\n)##\s+Project Ownership\b([\s\S]*?)(?=\n##\s+|\s*$)/i);
  return match?.[0]?.trim() ?? '';
}

function findReferencedProjectNames(content: string, candidates: FanoutProjectCandidate[]): Set<string> {
  const normalizedContent = normalizeProjectName(content);
  const referenced = new Set<string>();
  for (const candidate of candidates) {
    const normalizedName = normalizeProjectName(candidate.name);
    const normalizedRootName = normalizeProjectName(path.basename(candidate.root));
    if (normalizedName && containsToken(normalizedContent, normalizedName)) {
      referenced.add(normalizedName);
      continue;
    }
    if (normalizedRootName && containsToken(normalizedContent, normalizedRootName)) {
      referenced.add(normalizedName);
    }
  }
  return referenced;
}

function findUnresolvedProjectNames(
  ownershipSection: string,
  candidates: FanoutProjectCandidate[]
): FanoutUnresolvedProject[] {
  if (!ownershipSection) return [];
  const candidateNames = new Set(candidates.map(project => normalizeProjectName(project.name)));
  const explicitNames = new Map<string, string>();
  const patterns = [
    /`([^`]+)`/g,
    /\bproject\s*[:：]\s*([a-zA-Z0-9._-]+)/gi,
    /\bapp\s*[:：]\s*([a-zA-Z0-9._-]+)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(ownershipSection))) {
      const rawName = match[1].trim();
      const normalizedName = normalizeProjectName(rawName);
      if (normalizedName && !explicitNames.has(normalizedName)) {
        explicitNames.set(normalizedName, rawName);
      }
    }
  }
  return [...explicitNames.entries()]
    .filter(([normalizedName]) => normalizedName && !candidateNames.has(normalizedName))
    .map(([, rawName]) => ({
      name: rawName,
      reason: 'MRD ownership references this project but it was not uploaded.',
    }));
}

function normalizeProjectName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsToken(content: string, token: string): boolean {
  if (!content || !token) return false;
  return ` ${content} `.includes(` ${token} `);
}
