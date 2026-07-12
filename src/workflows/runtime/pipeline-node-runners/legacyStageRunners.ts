import {
  createStageRunnerResult,
  StageRunner,
  StageRunnerContext,
  StageRunnerRegistry,
} from '../pipelineNodeRunners.js';

type LegacyDelegateName =
  | 'mrdRender'
  | 'implementationPlan'
  | 'specGenerate'
  | 'javaImpl'
  | 'testcodeGenerate'
  | 'archive';

export function createLegacyStageRunnerRegistry(): StageRunnerRegistry {
  return {
    'mrd-render': createLegacyDelegateRunner('mrdRender'),
    'implementation-plan': createLegacyDelegateRunner('implementationPlan'),
    'spec-generate': createLegacyDelegateRunner('specGenerate'),
    'java-impl': createLegacyDelegateRunner('javaImpl'),
    'testcode-generate': createLegacyDelegateRunner('testcodeGenerate'),
    archive: createLegacyDelegateRunner('archive'),
  };
}

function createLegacyDelegateRunner(delegateName: LegacyDelegateName): StageRunner {
  return async (ctx) => {
    const delegate = ctx.legacyDelegates?.[delegateName];
    if (!delegate) {
      throw new Error(`Legacy stage delegate '${delegateName}' is not available.`);
    }
    const output = await delegate(ctx);
    return createStageRunnerResult(output, collectRunnerArtifacts(ctx, output));
  };
}

function collectRunnerArtifacts(ctx: StageRunnerContext, output: unknown): string[] {
  if (ctx.nodeState.outputArtifacts?.length) {
    return ctx.nodeState.outputArtifacts;
  }
  if (isArtifactMapOutput(output)) {
    return Object.keys(output.artifacts).map((artifact) =>
      artifact.startsWith('artifacts/') ? artifact : `artifacts/${artifact}`
    );
  }
  return [];
}

function isArtifactMapOutput(output: unknown): output is { artifacts: Record<string, unknown> } {
  return Boolean(
    output &&
    typeof output === 'object' &&
    'artifacts' in output &&
    output.artifacts &&
    typeof output.artifacts === 'object'
  );
}
