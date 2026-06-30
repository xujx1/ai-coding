import type {
  ApplicationBranchPlan,
  PlannedNode,
  PlanValidationResult,
  SessionExecutionPlan,
} from './sessionPlan.js';
import type { ReplanRequest } from './planSchemas.js';
import { validateSessionExecutionPlan } from './sessionPlan.js';

export interface ReplanFuseConfig {
  maxSessionReplans: number;
  maxBranchReplans: number;
}

export function createReplanRequest(args: {
  plan: SessionExecutionPlan;
  branchId?: string;
  failedNodeIds: string[];
  invalidatedArtifactPaths?: string[];
  reason: ReplanRequest['reason'];
  createdAt?: string;
}): ReplanRequest {
  const branches = args.branchId
    ? args.plan.branches.filter(branch => branch.branchId === args.branchId)
    : args.plan.branches;
  const failed = new Set(args.failedNodeIds);
  const downstream = collectDownstreamNodeIds(branches, failed);
  const remainingNodeIds = branches
    .flatMap(branch => branch.nodes)
    .filter(node => failed.has(node.id) || downstream.has(node.id))
    .map(node => node.id);
  const lockedNodeIds = branches
    .flatMap(branch => branch.nodes)
    .filter(node => !remainingNodeIds.includes(node.id))
    .map(node => node.id);

  return {
    requestId: `replan-${args.plan.revisions.length + 1}`,
    runId: args.plan.runId,
    branchId: args.branchId,
    failedNodeIds: args.failedNodeIds,
    remainingNodeIds,
    lockedNodeIds,
    invalidatedArtifactPaths: args.invalidatedArtifactPaths ?? [],
    reason: args.reason,
    createdAt: args.createdAt ?? new Date().toISOString(),
  };
}

export function applyReplanRevision(args: {
  plan: SessionExecutionPlan;
  request: ReplanRequest;
  replacementBranches: ApplicationBranchPlan[];
  createdAt?: string;
  fuse?: Partial<ReplanFuseConfig>;
}): { ok: true; plan: SessionExecutionPlan } | { ok: false; validation: PlanValidationResult } {
  const fuse = evaluateReplanFuse(args.plan, {
    maxSessionReplans: args.fuse?.maxSessionReplans ?? 3,
    maxBranchReplans: args.fuse?.maxBranchReplans ?? 2,
  }, args.request.branchId);
  if (!fuse.allowed) {
    return {
      ok: false,
      validation: {
        valid: false,
        validatedAt: args.createdAt ?? new Date().toISOString(),
        issues: [{
          code: 'replan-fuse-exhausted',
          message: fuse.reason,
          branchId: args.request.branchId,
          severity: 'error',
        }],
      },
    };
  }

  const locked = new Set(args.request.lockedNodeIds);
  const replacementByBranch = new Map(args.replacementBranches.map(branch => [branch.branchId, branch]));
  const branches = args.plan.branches.map(branch => {
    const replacement = replacementByBranch.get(branch.branchId);
    if (!replacement) return branch;
    return mergeBranchReplan(branch, replacement, locked);
  });
  const draft: SessionExecutionPlan = {
    ...args.plan,
    branches,
  };
  const validation = validateSessionExecutionPlan(draft, args.createdAt);
  if (!validation.valid) return { ok: false, validation };

  const revisionId = `rev-${args.plan.revisions.length + 1}`;
  const nextPlan: SessionExecutionPlan = {
    ...draft,
    currentRevisionId: revisionId,
    validation,
    revisions: [
      ...args.plan.revisions,
      {
        revisionId,
        parentRevisionId: args.plan.currentRevisionId,
        reason: 'replan',
        createdAt: args.createdAt ?? new Date().toISOString(),
        changedNodeIds: args.request.remainingNodeIds,
        lockedNodeIds: args.request.lockedNodeIds,
        validation,
      },
    ],
  };
  return { ok: true, plan: nextPlan };
}

export function evaluateReplanFuse(
  plan: SessionExecutionPlan,
  config: ReplanFuseConfig,
  branchId?: string
): { allowed: true } | { allowed: false; reason: string } {
  const replanRevisions = plan.revisions.filter(revision => revision.reason === 'replan');
  if (replanRevisions.length >= config.maxSessionReplans) {
    return { allowed: false, reason: `Session replan fuse exhausted after ${replanRevisions.length} attempts.` };
  }
  if (branchId) {
    const branchReplans = replanRevisions.filter(revision =>
      revision.changedNodeIds.some(nodeId =>
        plan.branches.find(branch => branch.branchId === branchId)?.nodes.some(node => node.id === nodeId)
      )
    );
    if (branchReplans.length >= config.maxBranchReplans) {
      return { allowed: false, reason: `Branch ${branchId} replan fuse exhausted after ${branchReplans.length} attempts.` };
    }
  }
  return { allowed: true };
}

function mergeBranchReplan(
  current: ApplicationBranchPlan,
  replacement: ApplicationBranchPlan,
  lockedNodeIds: Set<string>
): ApplicationBranchPlan {
  const currentLockedNodes = current.nodes.filter(node => lockedNodeIds.has(node.id));
  const replacementUnlockedNodes = replacement.nodes.filter(node => !lockedNodeIds.has(node.id));
  const nodes = stableNodeMerge(currentLockedNodes, replacementUnlockedNodes);
  return {
    ...replacement,
    evidence: replacement.evidence.length ? replacement.evidence : current.evidence,
    omittedTracks: replacement.omittedTracks,
    tracks: replacement.tracks.map(track => ({
      ...track,
      nodes: track.nodes.map(node => nodes.find(candidate => candidate.id === node.id) ?? node),
    })),
    nodes,
  };
}

function stableNodeMerge(lockedNodes: PlannedNode[], replacementNodes: PlannedNode[]): PlannedNode[] {
  const byId = new Map<string, PlannedNode>();
  for (const node of lockedNodes) byId.set(node.id, node);
  for (const node of replacementNodes) byId.set(node.id, node);
  return [...byId.values()];
}

function collectDownstreamNodeIds(branches: ApplicationBranchPlan[], failed: Set<string>): Set<string> {
  const downstream = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of branches.flatMap(branch => branch.nodes)) {
      if (downstream.has(node.id) || failed.has(node.id)) continue;
      if (node.dependsOn.some(dependency => failed.has(dependency) || downstream.has(dependency))) {
        downstream.add(node.id);
        changed = true;
      }
    }
  }
  return downstream;
}
