import * as path from 'path';
import {
  OPS_AGENT_DEFINITIONS,
  createOpsToolContext,
  createOpsToolRegistry,
  runAppKnowledgeAgent,
  runCodeContextAgent,
  runGlobalImpactAgent,
  runLocalLogTraceAgent,
  runRepairPlanAgent,
  runSimilarAlertAgent,
  startRepairPlanAgent,
  streamRepairPlanAgent,
  buildRecommendedActions,
  buildRunbook,
} from '../../../agents/ops/index.js';
import { extractAlertTokens } from '../../../tools/ops/index.js';
import { listOpsWorkflowTemplates } from '../../definitions/ops/opsFaultAnalysisWorkflow.js';
import type {
  OpsAlertAnalysis,
  OpsAlertClassification,
  OpsApplication,
  OpsWorkflowTemplate,
} from '../../../agents/ops/types.js';
import type {
  OpsAlertStreamEvent,
  OpsFaultAnalysisWorkflowInput,
  OpsFaultAnalysisWorkflowResult,
} from './opsFaultAnalysisTypes.js';

export async function runOpsFaultAnalysisWorkflow(
  input: OpsFaultAnalysisWorkflowInput,
): Promise<OpsFaultAnalysisWorkflowResult> {
  const ctx = createOpsWorkflowContext(input);
  const logEvidence = ctx.isEnabled('local-log-trace')
    ? (await runLocalLogTraceAgent({ registry: ctx.opsToolRegistry, ctx: ctx.opsToolContext, ecomRoot: ctx.ecomRoot, appId: input.app.appId, classification: ctx.classification, alert: input.alert, tools: ctx.nodeTools('local-log-trace'), react: ctx.usesReAct('local-log-trace') })).data ?? []
    : [];
  const similarAlertEvidence = ctx.isEnabled('similar-alert')
    ? (await runSimilarAlertAgent({ registry: ctx.opsToolRegistry, ctx: ctx.opsToolContext, ecomRoot: ctx.ecomRoot, alert: input.alert, tools: ctx.nodeTools('similar-alert'), react: ctx.usesReAct('similar-alert') })).data ?? []
    : [];
  const codeEvidence = ctx.isEnabled('code-context')
    ? (await runCodeContextAgent({ registry: ctx.opsToolRegistry, ctx: ctx.opsToolContext, root: input.app.root, classification: ctx.classification, alert: input.alert, tools: ctx.nodeTools('code-context'), react: ctx.usesReAct('code-context') })).data ?? []
    : [];
  const knowledgeEvidence = (ctx.isEnabled('app-knowledge') || ctx.isEnabled('global-impact'))
    ? (await runAppKnowledgeAgent({ registry: ctx.opsToolRegistry, ctx: ctx.opsToolContext, ecomRoot: ctx.ecomRoot, appId: input.app.appId, classification: ctx.classification, alert: input.alert, tools: ctx.nodeTools('app-knowledge'), react: ctx.usesReAct('app-knowledge') })).data ?? []
    : [];
  let impact = { upstream: ctx.upstream, downstream: ctx.downstream, blastRadius: describeBlastRadius(ctx.upstream, ctx.downstream) };
  if (ctx.isEnabled('global-impact')) {
    const result = await runGlobalImpactAgent({
      registry: ctx.opsToolRegistry,
      ctx: ctx.opsToolContext,
      upstream: impact.upstream,
      downstream: impact.downstream,
      blastRadius: impact.blastRadius,
      tools: ctx.nodeTools('global-impact'),
      react: ctx.usesReAct('global-impact'),
    });
    impact = result.data ?? impact;
  }
  const toolResults = buildOpsToolResults({
    workflow: ctx.workflow,
    isEnabled: ctx.isEnabled,
    nodeTools: ctx.nodeTools,
    logEvidence,
    similarAlertEvidence,
    codeEvidence,
    knowledgeEvidence,
    impact,
  });
  const analysis: OpsAlertAnalysis = {
    app: input.app,
    alert: input.alert,
    category: ctx.classification.faultType,
    categoryLabel: ctx.classification.label,
    confidence: ctx.classification.confidence,
    matchedKeywords: ctx.classification.matchedKeywords,
    likelyCauses: [],
    impact,
    logEvidence,
    similarAlertEvidence,
    codeEvidence,
    knowledgeEvidence,
    recommendedActions: buildRecommendedActions(ctx.classification, input.app, logEvidence, codeEvidence, knowledgeEvidence),
    runbook: buildRunbook(ctx.classification, input.app),
    toolResults,
  };
  if (ctx.isEnabled('repair-plan')) {
    try {
      analysis.modelDiagnosis = await runRepairPlanAgent(analysis);
      const repairPlanResult = analysis.toolResults.find(item => item.nodeId === 'repair-plan');
      if (repairPlanResult) {
        repairPlanResult.output = formatRepairPlanOutput('llm.createMessage', analysis.modelDiagnosis);
      }
    } catch (error) {
      analysis.llmError = error instanceof Error ? error.message : String(error);
      const repairPlanResult = analysis.toolResults.find(item => item.nodeId === 'repair-plan');
      if (repairPlanResult) {
        repairPlanResult.status = 'failed';
        repairPlanResult.output = `llm.createMessage 调用失败：${analysis.llmError}`;
      }
    }
  }
  return { workflow: ctx.workflow, analysis };
}

export async function* streamOpsFaultAnalysisWorkflow(
  input: OpsFaultAnalysisWorkflowInput,
): AsyncGenerator<OpsAlertStreamEvent> {
  const ctx = createOpsWorkflowContext(input);
  let logEvidence: OpsAlertAnalysis['logEvidence'] = [];
  let similarAlertEvidence: OpsAlertAnalysis['similarAlertEvidence'] = [];
  let codeEvidence: OpsAlertAnalysis['codeEvidence'] = [];
  let knowledgeEvidence: OpsAlertAnalysis['knowledgeEvidence'] = [];
  let impact = { upstream: ctx.upstream, downstream: ctx.downstream, blastRadius: describeBlastRadius(ctx.upstream, ctx.downstream) };
  const toolResults: OpsAlertAnalysis['toolResults'] = ctx.workflow.nodes.map(node => ({
    nodeId: node.id,
    label: OPS_AGENT_DEFINITIONS.find(agent => agent.id === node.id)?.label ?? node.label,
    tools: ctx.nodeTools(node.id),
    status: ctx.isEnabled(node.id) ? 'pending' : 'skipped',
    output: ctx.isEnabled(node.id) ? '等待上游 Agent 输出。' : '节点已停用，未执行工具。',
  }));
  const analysis: OpsAlertAnalysis = {
    app: input.app,
    alert: input.alert,
    category: ctx.classification.faultType,
    categoryLabel: ctx.classification.label,
    confidence: ctx.classification.confidence,
    matchedKeywords: ctx.classification.matchedKeywords,
    likelyCauses: [],
    impact,
    logEvidence,
    similarAlertEvidence,
    codeEvidence,
    knowledgeEvidence,
    recommendedActions: [],
    runbook: [],
    toolResults,
  };
  const setNode = (nodeId: string, status: OpsAlertAnalysis['toolResults'][number]['status'], output: string): OpsAlertStreamEvent => {
    const result = analysis.toolResults.find(item => item.nodeId === nodeId);
    if (result) {
      result.status = status;
      result.output = output;
    }
    return { type: 'node_update', nodeId, status, output, analysis };
  };

  yield { type: 'analysis_base', analysis };

  if (ctx.isEnabled('similar-alert')) {
    yield setNode('similar-alert', 'running', 'alert_vector_search => 正在读取告警历史向量并计算相似度...');
    const result = await runSimilarAlertAgent({ registry: ctx.opsToolRegistry, ctx: ctx.opsToolContext, ecomRoot: ctx.ecomRoot, alert: input.alert, tools: ctx.nodeTools('similar-alert'), react: ctx.usesReAct('similar-alert') });
    similarAlertEvidence = result.data ?? [];
    analysis.similarAlertEvidence = similarAlertEvidence;
    yield setNode(result.nodeId, result.status, result.output);
  }
  if (ctx.isEnabled('local-log-trace')) {
    yield setNode('local-log-trace', 'running', 'local_log_search => 正在检索 demo/ecom/logs 本地日志和 trace 片段...');
    const result = await runLocalLogTraceAgent({ registry: ctx.opsToolRegistry, ctx: ctx.opsToolContext, ecomRoot: ctx.ecomRoot, appId: input.app.appId, classification: ctx.classification, alert: input.alert, tools: ctx.nodeTools('local-log-trace'), react: ctx.usesReAct('local-log-trace') });
    logEvidence = result.data ?? [];
    analysis.logEvidence = logEvidence;
    yield setNode(result.nodeId, result.status, result.output);
  }
  if (ctx.isEnabled('code-context')) {
    yield setNode('code-context', 'running', 'code_context_search => 正在检索应用源码、配置和异常相关代码路径...');
    const result = await runCodeContextAgent({ registry: ctx.opsToolRegistry, ctx: ctx.opsToolContext, root: input.app.root, classification: ctx.classification, alert: input.alert, tools: ctx.nodeTools('code-context'), react: ctx.usesReAct('code-context') });
    codeEvidence = result.data ?? [];
    analysis.codeEvidence = codeEvidence;
    yield setNode(result.nodeId, result.status, result.output);
  }
  if (ctx.isEnabled('app-knowledge')) {
    yield setNode('app-knowledge', 'running', 'ops_knowledge_search => 正在检索应用知识库和应用级 GitNexus...');
    const result = await runAppKnowledgeAgent({ registry: ctx.opsToolRegistry, ctx: ctx.opsToolContext, ecomRoot: ctx.ecomRoot, appId: input.app.appId, classification: ctx.classification, alert: input.alert, tools: ctx.nodeTools('app-knowledge'), react: ctx.usesReAct('app-knowledge') });
    knowledgeEvidence = result.data ?? [];
    analysis.knowledgeEvidence = knowledgeEvidence;
    yield setNode(result.nodeId, result.status, result.output);
  }
  if (ctx.isEnabled('global-impact')) {
    yield setNode('global-impact', 'running', 'dependency_graph_search => 正在分析全局图谱和上下游影响面...');
    if (!knowledgeEvidence.length) {
      knowledgeEvidence = (await runAppKnowledgeAgent({ registry: ctx.opsToolRegistry, ctx: ctx.opsToolContext, ecomRoot: ctx.ecomRoot, appId: input.app.appId, classification: ctx.classification, alert: input.alert, tools: ctx.nodeTools('app-knowledge'), react: ctx.usesReAct('app-knowledge') })).data ?? [];
      analysis.knowledgeEvidence = knowledgeEvidence;
    }
    const result = await runGlobalImpactAgent({
      registry: ctx.opsToolRegistry,
      ctx: ctx.opsToolContext,
      upstream: impact.upstream,
      downstream: impact.downstream,
      blastRadius: impact.blastRadius,
      tools: ctx.nodeTools('global-impact'),
      react: ctx.usesReAct('global-impact'),
    });
    impact = result.data ?? impact;
    analysis.impact = impact;
    yield setNode(result.nodeId, result.status, result.output);
  }

  analysis.recommendedActions = buildRecommendedActions(ctx.classification, input.app, logEvidence, codeEvidence, knowledgeEvidence);
  analysis.runbook = buildRunbook(ctx.classification, input.app);

  const repairPlanResult = analysis.toolResults.find(item => item.nodeId === 'repair-plan');
  if (repairPlanResult && ctx.isEnabled('repair-plan')) {
    const result = startRepairPlanAgent();
    yield setNode(result.nodeId, result.status, result.output);
  }
  if (ctx.isEnabled('repair-plan')) {
    try {
      for await (const event of streamRepairPlanAgent(analysis)) {
        if (event.type === 'model_delta') {
          if (repairPlanResult) repairPlanResult.output += event.text;
          yield event;
        } else if (event.type === 'model_start') {
          yield event;
        } else {
          analysis.modelDiagnosis = event.diagnosis;
          if (repairPlanResult) {
            repairPlanResult.status = 'completed';
            repairPlanResult.output = formatRepairPlanOutput('llm.createMessageStream', event.diagnosis);
          }
          if (!event.diagnosis.rawText) {
            yield { type: 'model_delta', nodeId: 'repair-plan', text: event.diagnosis.rawText };
          }
          yield event;
        }
      }
    } catch (error) {
      analysis.llmError = error instanceof Error ? error.message : String(error);
      if (repairPlanResult) {
        repairPlanResult.status = 'failed';
        repairPlanResult.output = `llm.createMessageStream 调用失败：${analysis.llmError}`;
      }
      yield { type: 'error', message: analysis.llmError, analysis };
    }
  }
  yield { type: 'analysis_complete', analysis };
}

function createOpsWorkflowContext(input: OpsFaultAnalysisWorkflowInput) {
  const ecomRoot = path.dirname(input.app.root);
  const opsToolRegistry = createOpsToolRegistry();
  const opsToolContext = createOpsToolContext({ workspaceRoot: input.workspaceRoot, appRoot: input.app.root });
  const classification = classifyOpsAlert(input.alert);
  const downstream = input.app.dependencies;
  const upstream = input.applications
    .filter(item => item.dependencies.includes(input.app.appId))
    .map(item => item.appId);
  const workflow = listOpsWorkflowTemplates()[0];
  const isEnabled = (nodeId: string): boolean => !input.workflowConfig?.enabledNodeIds
    || input.workflowConfig.enabledNodeIds.includes(nodeId);
  const nodeTools = (nodeId: string): string[] => {
    const templateNode = workflow.nodes.find(node => node.id === nodeId);
    return input.workflowConfig?.nodeTools?.[nodeId] ?? templateNode?.tools ?? [];
  };
  const usesReAct = (nodeId: string): boolean => process.env.AI_CODING_OPS_REACT === '1'
    || Boolean(input.workflowConfig?.reactNodeIds?.includes(nodeId));
  return {
    ecomRoot,
    opsToolRegistry,
    opsToolContext,
    classification,
    downstream,
    upstream,
    workflow,
    isEnabled,
    nodeTools,
    usesReAct,
  };
}

function classifyOpsAlert(alert: string): OpsAlertClassification {
  const tokens = extractAlertTokens(alert);
  return {
    faultType: 'workflow_pending',
    label: '待 workflow 研判',
    confidence: 0,
    matchedKeywords: tokens,
    codeHints: tokens,
  };
}

function buildOpsToolResults(args: {
  workflow: OpsWorkflowTemplate;
  isEnabled: (nodeId: string) => boolean;
  nodeTools: (nodeId: string) => string[];
  logEvidence: OpsAlertAnalysis['logEvidence'];
  similarAlertEvidence: OpsAlertAnalysis['similarAlertEvidence'];
  codeEvidence: OpsAlertAnalysis['codeEvidence'];
  knowledgeEvidence: OpsAlertAnalysis['knowledgeEvidence'];
  impact: OpsAlertAnalysis['impact'];
}): OpsAlertAnalysis['toolResults'] {
  return args.workflow.nodes.map(node => {
    if (!args.isEnabled(node.id)) {
      return { nodeId: node.id, label: node.label, tools: args.nodeTools(node.id), status: 'skipped', output: '节点已停用，未执行工具。' };
    }
    const tools = args.nodeTools(node.id);
    const outputByNode: Record<string, string> = {
      'local-log-trace': `local_log_search => 命中 ${args.logEvidence.length} 条本地日志证据。`,
      'similar-alert': `alert_vector_search => 命中 ${args.similarAlertEvidence.length} 条告警历史相似记录。`,
      'code-context': `code_context_search => 命中 ${args.codeEvidence.length} 个源码/配置文件。`,
      'app-knowledge': `ops_knowledge_search => 命中 ${args.knowledgeEvidence.filter(item => item.source === 'knowledge-base').length} 条应用知识库证据。`,
      'global-impact': `dependency_graph_search => ${args.impact.blastRadius}`,
      'repair-plan': 'read_file/use_skill => 已汇总日志、代码、知识库和影响面，生成处置建议。',
    };
    return {
      nodeId: node.id,
      label: node.label,
      tools,
      status: 'completed',
      output: outputByNode[node.id] ?? '节点执行完成。',
    };
  });
}

function describeBlastRadius(upstream: string[], downstream: string[]): string {
  if (!upstream.length && !downstream.length) return '当前应用暂无显式上下游依赖，影响面先按单应用处理。';
  return [
    upstream.length ? `可能影响上游调用方：${upstream.join('、')}` : '',
    downstream.length ? `可能受下游依赖影响：${downstream.join('、')}` : '',
  ].filter(Boolean).join('；');
}

function formatRepairPlanOutput(prefix: string, diagnosis: NonNullable<OpsAlertAnalysis['modelDiagnosis']>): string {
  return [
    `${prefix} => ${diagnosis.modelId}`,
    `耗时 ${diagnosis.durationMs}ms`,
    diagnosis.summary,
    '',
    '## 根因判断',
    diagnosis.rootCause,
    '',
    '## 修复计划',
    ...diagnosis.repairPlan.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n');
}
