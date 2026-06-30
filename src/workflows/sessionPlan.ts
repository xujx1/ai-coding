import type { ProjectManifest } from '../pipeline/node-agents/upload-init.js';
import type { FanoutDecision } from './fanoutDecision.js';

export const SESSION_PLAN_SCHEMA_VERSION = 1;
export const SESSION_PLAN_PLANNER_VERSION = 'plan-and-executor-v1';

export type PlannedTrackKind =
  | 'backend'
  | 'frontend'
  | 'contract'
  | 'e2e'
  | 'documentation';

export type PlannedNodeType =
  | 'implementation-plan'
  | 'spec-generate'
  | 'backend-impl'
  | 'java-impl'
  | 'frontend-impl'
  | 'backend-test'
  | 'frontend-test'
  | 'api-contract-check'
  | 'e2e-verify'
  | 'documentation-impl'
  | 'documentation-test'
  | 'app-track-join'
  | 'app-branch-summary';

export interface SessionExecutionPlan {
  schemaVersion: 1;
  plannerVersion: string;
  runId: string;
  generatedAt: string;
  sourceArtifacts: string[];
  branches: ApplicationBranchPlan[];
  validation: PlanValidationResult;
}

export interface ApplicationBranchPlan {
  branchId: string;
  projectName: string;
  projectRoot: string;
  capability: ProjectCapabilityShape;
  evidence: PlannerEvidence[];
  omittedTracks: OmittedTrackReason[];
  tracks: AppTrackPlan[];
  nodes: PlannedNode[];
}

export interface ProjectCapabilityShape {
  backend: boolean;
  frontend: boolean;
  contract: boolean;
  testable: boolean;
  documentationOnly: boolean;
  mixedModule: boolean;
  confidence: 'high' | 'medium' | 'low';
  fallbackReasons: string[];
}

export interface PlannerEvidence {
  source: string;
  summary: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface OmittedTrackReason {
  trackKind: PlannedTrackKind;
  reason: string;
}

export interface AppTrackPlan {
  trackId: string;
  kind: PlannedTrackKind;
  label: string;
  required: boolean;
  dependsOn: string[];
  nodes: PlannedNode[];
  fallbackReason?: string;
}

export interface PlannedNode {
  id: string;
  type: PlannedNodeType;
  label: string;
  runner: string;
  trackId?: string;
  dependsOn: string[];
  requiredArtifacts: string[];
  artifactHints: string[];
}

export interface PlanValidationResult {
  valid: boolean;
  issues: PlanValidationIssue[];
  validatedAt: string;
}

export interface PlanValidationIssue {
  code: string;
  message: string;
  branchId?: string;
  trackId?: string;
  nodeId?: string;
  severity: 'error' | 'warning';
}

const ALLOWED_NODE_TYPES: ReadonlySet<PlannedNodeType> = new Set([
  'implementation-plan',
  'spec-generate',
  'backend-impl',
  'java-impl',
  'frontend-impl',
  'backend-test',
  'frontend-test',
  'api-contract-check',
  'e2e-verify',
  'documentation-impl',
  'documentation-test',
  'app-track-join',
  'app-branch-summary',
]);

const ALLOWED_TRACK_KINDS: ReadonlySet<PlannedTrackKind> = new Set([
  'backend',
  'frontend',
  'contract',
  'e2e',
  'documentation',
]);

export function createSessionExecutionPlan(args: {
  runId: string;
  decision: FanoutDecision;
  manifest?: ProjectManifest;
  clarifiedMrd?: string;
  sourceArtifacts?: string[];
  generatedAt?: string;
}): SessionExecutionPlan {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const impactText = [args.clarifiedMrd ?? '', ...(args.decision.evidence ?? [])].join('\n');
  const branches = args.decision.includedProjects.map(project => {
    const manifestProject = args.manifest?.projects.find(candidate => candidate.name === project.name);
    return createApplicationBranchPlan({
      branchId: createStablePlanBranchId(args.runId, project.name),
      projectName: project.name,
      projectRoot: project.root,
      capability: deriveProjectCapabilityShape(manifestProject, impactText),
      fanoutReason: project.reason,
    });
  });
  const plan: SessionExecutionPlan = {
    schemaVersion: SESSION_PLAN_SCHEMA_VERSION,
    plannerVersion: SESSION_PLAN_PLANNER_VERSION,
    runId: args.runId,
    generatedAt,
    sourceArtifacts: args.sourceArtifacts ?? [
      'artifacts/project-manifest.json',
      'artifacts/mrd-clarified.md',
      'artifacts/fanout-decision.json',
    ],
    branches,
    validation: {
      valid: true,
      issues: [],
      validatedAt: generatedAt,
    },
  };
  return {
    ...plan,
    validation: validateSessionExecutionPlan(plan, generatedAt),
  };
}

export function createApplicationBranchPlan(args: {
  branchId: string;
  projectName: string;
  projectRoot: string;
  capability: ProjectCapabilityShape;
  fanoutReason?: string;
}): ApplicationBranchPlan {
  const baseNodes: PlannedNode[] = [
    plannedNode('implementation-plan', 'implementation-plan', 'Implementation Plan'),
    plannedNode('spec-generate', 'spec-generate', 'Spec Generate', ['implementation-plan']),
  ];
  const tracks = createTracks(args.projectName, args.capability);
  const trackJoin = plannedNode('app-track-join', 'app-track-join', 'Track Join', [
    'spec-generate',
    ...tracks.flatMap(track => track.nodes.map(node => node.id)),
  ]);
  const summary = plannedNode('app-branch-summary', 'app-branch-summary', 'Branch Summary', ['app-track-join']);
  return {
    branchId: args.branchId,
    projectName: args.projectName,
    projectRoot: args.projectRoot,
    capability: args.capability,
    evidence: [
      {
        source: 'fanout-decision',
        summary: args.fanoutReason ?? 'Included by fanout decision.',
        confidence: args.capability.confidence,
      },
    ],
    omittedTracks: omittedTracks(args.capability),
    tracks,
    nodes: [...baseNodes, ...tracks.flatMap(track => track.nodes), trackJoin, summary],
  };
}

export function deriveProjectCapabilityShape(
  project?: ProjectManifest['projects'][number],
  impactText = ''
): ProjectCapabilityShape {
  const startup = project?.capabilities;
  const projectImpact = collectProjectImpactContext(project?.name || '', impactText);
  const surfaceDecision = parseProjectSurfaceDecision(project?.name || '', impactText);
  const frontendImpact = surfaceDecision.frontend ?? hasFrontendImpact(projectImpact);
  const backendImpact = surfaceDecision.backend ?? hasBackendImpact(projectImpact);
  const contractImpact = surfaceDecision.contract ?? hasContractImpact(projectImpact);
  const e2eImpact = surfaceDecision.e2e ?? false;
  const backend = Boolean(
    backendImpact ||
    startup?.backend ||
    project?.buildTool === 'maven' ||
    project?.sourceRoots?.some(root => root.includes('java'))
  );
  const frontend = Boolean(
    frontendImpact ||
    startup?.frontend ||
    startup?.playwrightConfig ||
    project?.sourceRoots?.some(root =>
      ['src/main/resources/static', 'src/main/resources/templates', 'public', 'app', 'pages'].includes(root)
    )
  );
  const contract = Boolean(
    contractImpact ||
    e2eImpact ||
    backend && frontend ||
    startup?.apiBaseUrlConventions?.length
  );
  const testable = Boolean(project?.testRoots?.length || backend || frontend);
  const documentationOnly = !backend && !frontend && !contract;
  const mixedModule = backend && frontend;
  const confidence = startup?.confidence === 'high'
    ? 'high'
    : startup?.confidence === 'medium'
      ? 'medium'
      : documentationOnly
        ? 'low'
        : 'medium';
  return {
    backend,
    frontend,
    contract,
    testable,
    documentationOnly,
    mixedModule,
    confidence,
    fallbackReasons: startup?.fallbackReasons ?? (documentationOnly
      ? ['No executable backend/frontend capability was detected.']
      : []),
  };
}

function parseProjectSurfaceDecision(projectName: string, content: string): {
  frontend?: boolean;
  backend?: boolean;
  contract?: boolean;
  e2e?: boolean;
} {
  if (!projectName || !content) return {};
  const section = extractMarkdownSection(content, 'Implementation Surfaces');
  if (!section) return {};
  const table = parseMarkdownTable(section);
  if (!table.length) return {};
  const result: ReturnType<typeof parseProjectSurfaceDecision> = {};
  for (const row of table) {
    const projectCell = findTableValue(row, ['项目', 'project', '应用']);
    if (!projectCell || !projectCellReferences(projectCell, projectName)) continue;
    result.frontend = mergeSurfaceValue(result.frontend, findTableValue(row, ['frontend', '前端']));
    result.backend = mergeSurfaceValue(result.backend, findTableValue(row, ['backend', '后端']));
    result.contract = mergeSurfaceValue(result.contract, findTableValue(row, ['contract', '契约', 'api']));
    result.e2e = mergeSurfaceValue(result.e2e, findTableValue(row, ['e2e', '端到端']));
  }
  return result;
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

function findTableValue(row: Record<string, string>, keys: string[]): string {
  const entry = Object.entries(row).find(([key]) => keys.some(candidate => key.includes(candidate.toLowerCase())));
  return entry?.[1] ?? '';
}

function mergeSurfaceValue(current: boolean | undefined, value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (/^(yes|true|是|需要|y)\b/.test(normalized)) return true;
  if (/^(no|false|否|不需要|n)\b/.test(normalized)) return current ?? false;
  return current;
}

function extractMarkdownSection(content: string, title: string): string {
  const re = new RegExp(`(^|\\n)##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b([\\s\\S]*?)(?=\\n##\\s+|\\s*$)`, 'i');
  return re.exec(content)?.[2]?.trim() ?? '';
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').trim();
}

function projectCellReferences(cell: string, projectName: string): boolean {
  const normalizedProject = normalizeForMatch(projectName);
  return cell
    .split(/[,\n，、/|]+/)
    .map(value => normalizeForMatch(value.replace(/`/g, '')))
    .some(value => value === normalizedProject);
}

function collectProjectImpactContext(projectName: string, content: string): string {
  if (!projectName || !content) return '';
  const escaped = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^a-zA-Z0-9_-])${escaped}([^a-zA-Z0-9_-]|$)`);
  return content
    .split(/\r?\n/)
    .filter(line => re.test(line))
    .join('\n');
}

function hasFrontendImpact(text: string): boolean {
  return /(前端|页面|UI|交互|管理端|设置端|运营|预览入口|展示|表单|按钮|列表|详情|弹窗|浏览器|Web|H5|console|admin)/i.test(text);
}

function hasBackendImpact(text: string): boolean {
  return /(后端|接口|API|服务|Controller|Service|Mapper|数据库|SQL|DTO|RPC|任务|规则|计算|保存|查询|校验|命中|运行侧)/i.test(text);
}

function hasContractImpact(text: string): boolean {
  return /(接口|字段|payload|DTO|契约|协议|联调|兼容|透传|请求|响应|前后端|双侧)/i.test(text);
}

export function validateSessionExecutionPlan(
  plan: SessionExecutionPlan,
  validatedAt = new Date().toISOString()
): PlanValidationResult {
  const issues: PlanValidationIssue[] = [];
  for (const branch of plan.branches) {
    const nodeIds = new Set(branch.nodes.map(node => node.id));
    if (!branch.tracks.length) {
      issues.push(error('missing-track', 'Branch has no executable or fallback tracks.', branch.branchId));
    }
    for (const track of branch.tracks) {
      if (!ALLOWED_TRACK_KINDS.has(track.kind)) {
        issues.push(error('unsupported-track-kind', `Unsupported track kind '${track.kind}'.`, branch.branchId, track.trackId));
      }
      if (!track.nodes.length) {
        issues.push(error('empty-track', `Track '${track.trackId}' has no planned nodes.`, branch.branchId, track.trackId));
      }
    }
    for (const node of branch.nodes) {
      if (!ALLOWED_NODE_TYPES.has(node.type)) {
        issues.push(error('unsupported-node-type', `Unsupported planned node type '${node.type}'.`, branch.branchId, node.trackId, node.id));
      }
      if (nodeRequiresArtifacts(node.type) && (!Array.isArray(node.requiredArtifacts) || !node.requiredArtifacts.length)) {
        issues.push(error('missing-required-artifacts', `Node '${node.id}' does not declare required artifacts.`, branch.branchId, node.trackId, node.id));
      }
      for (const dependency of node.dependsOn) {
        if (!nodeIds.has(dependency)) {
          issues.push(error('missing-dependency', `Node '${node.id}' depends on missing node '${dependency}'.`, branch.branchId, node.trackId, node.id));
        }
      }
    }
    if (hasDependencyCycle(branch.nodes)) {
      issues.push(error('dependency-cycle', 'Branch plan contains a node dependency cycle.', branch.branchId));
    }
  }
  return {
    valid: issues.every(issue => issue.severity !== 'error'),
    issues,
    validatedAt,
  };
}

function nodeRequiresArtifacts(nodeType: PlannedNodeType): boolean {
  return !['app-track-join', 'app-branch-summary'].includes(nodeType);
}

export function createStablePlanBranchId(runId: string, projectName: string): string {
  const safeProjectName = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
  return `${runId}-${safeProjectName}`;
}

function createTracks(projectName: string, capability: ProjectCapabilityShape): AppTrackPlan[] {
  if (capability.documentationOnly) {
    return [{
      trackId: 'documentation',
      kind: 'documentation',
      label: 'Documentation fallback',
      required: true,
      dependsOn: ['spec-generate'],
      fallbackReason: capability.fallbackReasons.join('\n') || 'No executable capability was detected.',
      nodes: [
        plannedNode('documentation-impl', 'documentation-impl', 'Documentation Implementation', ['spec-generate'], 'documentation', projectName),
        plannedNode('documentation-test', 'documentation-test', 'Documentation Test', ['documentation-impl'], 'documentation', projectName),
      ],
    }];
  }

  const tracks: AppTrackPlan[] = [];
  if (capability.backend) {
    tracks.push({
      trackId: 'backend',
      kind: 'backend',
      label: 'Backend',
      required: true,
      dependsOn: ['spec-generate'],
      nodes: [
        plannedNode('java-impl', 'java-impl', 'Backend Implementation', ['spec-generate'], 'backend', projectName),
        plannedNode('backend-test', 'backend-test', 'Backend Test', ['java-impl'], 'backend', projectName),
      ],
    });
  }
  if (capability.frontend) {
    tracks.push({
      trackId: 'frontend',
      kind: 'frontend',
      label: 'Frontend',
      required: true,
      dependsOn: ['spec-generate'],
      nodes: [
        plannedNode('frontend-impl', 'frontend-impl', 'Frontend Implementation', ['spec-generate'], 'frontend', projectName),
        plannedNode('frontend-test', 'frontend-test', 'Frontend Test', ['frontend-impl'], 'frontend', projectName),
      ],
    });
    tracks.push({
      trackId: 'e2e',
      kind: 'e2e',
      label: 'E2E Verification',
      required: false,
      dependsOn: ['frontend-test'],
      nodes: [
        plannedNode('e2e-verify', 'e2e-verify', 'E2E Verify', ['frontend-test'], 'e2e', projectName),
      ],
    });
  }
  if (capability.contract) {
    tracks.push({
      trackId: 'contract',
      kind: 'contract',
      label: 'API Contract',
      required: capability.backend && capability.frontend,
      dependsOn: ['spec-generate'],
      nodes: [
        plannedNode('api-contract-check', 'api-contract-check', 'API Contract Check', ['spec-generate'], 'contract', projectName),
      ],
    });
  }
  return tracks;
}

function omittedTracks(capability: ProjectCapabilityShape): OmittedTrackReason[] {
  const omitted: OmittedTrackReason[] = [];
  if (!capability.backend) omitted.push({ trackKind: 'backend', reason: 'Backend capability was not detected.' });
  if (!capability.frontend) omitted.push({ trackKind: 'frontend', reason: 'Frontend capability was not detected.' });
  if (!capability.contract) omitted.push({ trackKind: 'contract', reason: 'API/contract impact was not detected.' });
  if (!capability.frontend) omitted.push({ trackKind: 'e2e', reason: 'E2E requires a frontend-capable app.' });
  return omitted;
}

function plannedNode(
  id: PlannedNodeType,
  runner: string,
  label: string,
  dependsOn: string[] = [],
  trackId?: string,
  projectName = '{project}'
): PlannedNode {
  return {
    id,
    type: id,
    label,
    runner,
    trackId,
    dependsOn,
    requiredArtifacts: requiredArtifactsForNode(id, projectName),
    artifactHints: artifactHintsForNode(id, projectName),
  };
}

function requiredArtifactsForNode(nodeType: PlannedNodeType, projectName: string): string[] {
  const project = projectName || '{project}';
  return {
    'implementation-plan': ['artifacts/mrd-clarified.md', 'artifacts/project-manifest.json'],
    'spec-generate': ['artifacts/mrd-clarified.md', `artifacts/${project}/tech-design.md`],
    'backend-impl': [`artifacts/${project}/openspec/changes/*/tasks.md`],
    'java-impl': [`artifacts/${project}/openspec/changes/*/tasks.md`],
    'frontend-impl': [`artifacts/${project}/openspec/changes/*/tasks.md`],
    'backend-test': [`artifacts/${project}/changed-files.json`],
    'frontend-test': [`artifacts/${project}/frontend-implementation-summary.json`],
    'api-contract-check': [`artifacts/${project}/openspec/changes/*/tasks.md`],
    'e2e-verify': [`artifacts/${project}/e2e/startup-manifest.json`],
    'documentation-impl': [`artifacts/${project}/openspec/changes/*/tasks.md`],
    'documentation-test': [`artifacts/${project}/documentation-implementation.md`],
    'app-track-join': [],
    'app-branch-summary': [],
  }[nodeType] ?? [];
}

function artifactHintsForNode(nodeType: PlannedNodeType, projectName: string): string[] {
  const project = projectName || '{project}';
  return {
    'implementation-plan': [`artifacts/${project}/tech-design.md`],
    'spec-generate': [`artifacts/${project}/openspec/changes/*/tasks.md`],
    'backend-impl': [`artifacts/${project}/changed-files.json`],
    'java-impl': [`artifacts/${project}/changed-files.json`],
    'frontend-impl': [`artifacts/${project}/frontend-implementation-summary.json`],
    'backend-test': [`artifacts/${project}/test-report.md`],
    'frontend-test': [`artifacts/${project}/frontend-test-report.md`],
    'api-contract-check': [`artifacts/${project}/e2e/api-contract-results.json`],
    'e2e-verify': [`artifacts/${project}/e2e/e2e-summary.json`],
    'documentation-impl': [`artifacts/${project}/documentation-implementation.md`],
    'documentation-test': [`artifacts/${project}/documentation-test-report.md`],
    'app-track-join': [],
    'app-branch-summary': [`artifacts/${project}/branch-summary.json`],
  }[nodeType] ?? [];
}

function hasDependencyCycle(nodes: PlannedNode[]): boolean {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    const node = byId.get(nodeId);
    for (const dependency of node?.dependsOn ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return nodes.some(node => visit(node.id));
}

function error(
  code: string,
  message: string,
  branchId?: string,
  trackId?: string,
  nodeId?: string
): PlanValidationIssue {
  return {
    code,
    message,
    branchId,
    trackId,
    nodeId,
    severity: 'error',
  };
}
