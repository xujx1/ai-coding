import * as path from 'path';
import { AsyncSemaphore } from '../langgraph/concurrency.js';
import {
  createStageRunnerResult,
  StageRunner,
  StageRunnerContext,
} from '../pipelineNodeRunners.js';
import { detectProjectRoots } from '../../../agents/codegen/upload-init.js';
import { getConfig } from '../../../config/index.js';
import { runE2EVerification } from '../../../agents/testing/index.js';
import { E2ERuntimeConfig } from '../../../tools/testing/types.js';

export const runE2EVerificationStage: StageRunner = async (ctx) => {
  const projects = projectInputsForContext(ctx);
  const limit = Math.max(1, Math.min(
    projects.length || 1,
    getConfig().e2e.browserConcurrency || 1
  ));
  const semaphore = new AsyncSemaphore(limit);
  const results = await Promise.all(projects.map(project =>
    semaphore.run(() => runE2EVerification({
      runId: ctx.runId,
      appName: project.name,
      projectRoot: project.root,
      paths: ctx.paths,
      config: configForStage(),
    }))
  ));
  const outputArtifacts = [...new Set(results.flatMap(result => result.artifactPaths))];
  for (const artifactPath of outputArtifacts) {
    ctx.logEvent('artifact_written', {
      nodeId: ctx.nodeId,
      artifactPath,
      size: 0,
      description: 'E2E / integration verification artifact',
    }, undefined, ctx.nodeId);
  }
  return createStageRunnerResult({
    summaries: results.map(result => result.summary),
    artifacts: Object.fromEntries(outputArtifacts.map(artifact => [
      artifact.replace(/^artifacts\//, ''),
      '',
    ])),
  }, outputArtifacts);
};

function projectInputsForContext(ctx: StageRunnerContext): Array<{ name: string; root: string }> {
  const branches = ctx.executionState.workflowInstance?.branches ?? [];
  if (branches.length) {
    return branches.map(branch => ({
      name: branch.projectName,
      root: path.isAbsolute(branch.projectRoot)
        ? branch.projectRoot
        : path.join(ctx.paths.workspaceDir, branch.projectRoot),
    }));
  }
  return detectProjectRoots(ctx.paths.projectDir);
}

function configForStage(): E2ERuntimeConfig {
  const config = getConfig();
  return {
    enabled: config.e2e.enabled,
    browserConcurrency: config.e2e.browserConcurrency,
    startupTimeoutMs: config.e2e.startupTimeoutMs,
    readinessTimeoutMs: config.e2e.readinessTimeoutMs,
    artifactRetention: config.e2e.artifactRetention,
    startupConfidenceThreshold: 'medium',
  };
}
