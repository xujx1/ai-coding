/**
 * Pipeline Engine - orchestrates the fixed MRD-to-Code pipeline.
 * Manages stage transitions, confirmation gates, agent creation, model routing.
 *
 * The Pipeline Engine is responsible for:
 * 1. Stage orchestration (sequential execution through pipeline nodes)
 * 2. Agent creation and lifecycle per stage
 * 3. Model selection/routing per stage with dynamic switching
 * 4. Confirmation gate management (wait for user approval between stages)
 * 5. Event broadcasting to connected WebSocket clients
 * 6. State persistence after every stage transition
 * 7. Checkpoint/resume support
 *
 * The pipeline itself does NOT generate content - that is delegated to agents.
 */
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { EventEmitter } from 'events';
import { PIPELINE_NODES, PipelineNode, normalizeStageId } from './definition.js';
import {
  ExecutionState, NodeState, NodeStatus, ProjectState, ContextManifest, PlanState, getStateStore,
} from '../persistence/stateStore.js';
import { getEventLog } from '../events/EventLog.js';
import { getModelForStage, RegisteredModel, getModel, getCustomStageOverrides } from '../models/registry.js';
import { createLLMProvider, LLMProvider } from '../models/providers.js';
import { AgentEngine, AgentEvent } from '../agent/AgentEngine.js';
import { ToolRegistry, Tool, ToolContext, ToolResult } from '../tools/base.js';
import { executeToolChain } from '../tools/toolExecution.js';
import { ReadTool } from '../tools/builtin/ReadTool.js';
import { WriteTool } from '../tools/builtin/WriteTool.js';
import { EditTool } from '../tools/builtin/EditTool.js';
import { GlobTool } from '../tools/builtin/GlobTool.js';
import { GrepTool } from '../tools/builtin/GrepTool.js';
import { BashTool } from '../tools/builtin/BashTool.js';
import { registerJavaTools } from '../tools/builtin/JavaTools.js';
import { getRunPaths, ensureRunDirectories } from '../runtime/paths.js';
import { getPermissionManager } from '../tools/security/permissions.js';
import { getConfig } from '../config/index.js';
import { BUILTIN_MRD_TO_CODE_WORKFLOW_ID } from '../workflows/builtinDefinitions.js';
import { captureWorkflowSnapshot } from '../workflows/storage.js';
import {
  applyFanoutDecisionToSessionWorkflowInstance,
  createInitialSessionWorkflowInstance,
  resetSessionBranchFromNode,
  syncSessionWorkflowJoinFromBranches,
} from '../workflows/sessionInstance.js';
import type {
  SessionWorkflowRuntimeStatus,
} from '../workflows/sessionInstance.js';
import {
  deriveFanoutDecision,
  FANOUT_DECISION_ARTIFACT,
  FANOUT_DECISION_ARTIFACT_PATH,
  serializeFanoutDecision,
} from '../workflows/fanoutDecision.js';
import { buildMavenTestArtifactEntries } from './node-agents/maven-test-runner.js';
import {
  ProjectManifest,
  detectProjectRoots,
  ensureProjectManifest,
  generateProjectManifest,
  listProjectFiles,
} from './node-agents/upload-init.js';
import {
  buildCodeChangeArtifacts,
  buildTestCodeArtifacts,
  diffProjectSnapshots,
  JAVA_MAIN_CHANGE_PATTERN,
  JAVA_TEST_CHANGE_PATTERN,
  mockChangedJavaFile,
  mockChangedTestFile,
  ProjectChangedFile,
  snapshotProjectFiles,
} from './node-agents/code-change-artifacts.js';
import {
  appendClarificationAnswers,
  buildClarifyQuestionsArtifact,
  buildFallbackClarifiedMrd,
  buildFallbackMrd,
  buildFinalRequirementDecompositionPrompt,
  buildImplementationBoundaries,
  buildMrdClarifyPrompt,
  buildMrdRenderPrompt,
  extractMrdContent,
  extractSourceMap,
  hasClarificationQuestions,
  isClarifiedMrdContent,
  isStructuredMrdContent,
  readExistingSourceMap,
} from './node-agents/requirement-decompose.js';
import {
  buildImplementationPlanConfirmationContent,
  buildPlanTaskConfirmationContent,
  buildProjectStageConfirmationContent,
  buildSpecConfirmationContent,
} from './node-agents/confirmation-content.js';
import {
  buildArchiveExecutionMetrics,
  buildImplementationPlanPrompt,
  buildProjectStagePromptVariables,
  buildSpecGeneratePrompt,
  buildStagePrompt,
} from './node-agents/prompt-context.js';
import { buildReviewFindings } from './node-agents/java-review.js';
import {
  loadOutputTemplate,
  loadPromptFile,
  loadPromptTemplate,
  renderPromptTemplate,
} from './node-agents/prompt-files.js';
import {
  inferRiskLevel,
  isUsableSpecArtifact,
  isUsableTechDesign,
  normalizeMarkdownArtifact,
  summarizeMarkdown,
} from './node-agents/artifact-format.js';
import {
  createProjectToolRegistry,
  getProjectTaskDescription,
  registerKnowledgeTools,
} from './node-agents/project-agent-tools.js';
import {
  markProjectOpenSpecTasksCompleted,
  writeProjectOpenSpecChange,
} from './node-agents/openspec-integration.js';
import { createProjectsZip } from './node-agents/archive.js';
import {
  createEmptyBranchSummary,
  writeBranchSummaryArtifact,
} from '../langgraph/branchSummary.js';
import { AsyncSemaphore } from '../langgraph/concurrency.js';
import {
  LegacyStageRunnerDelegates,
  StageRunnerContext,
  StageRunnerRegistry,
} from './nodeRunners.js';
import { createLegacyStageRunnerRegistry } from './node-runners/legacyStageRunners.js';
import { runUploadInitStage } from './node-runners/uploadInitRunner.js';

export type PipelineEvent =
  | { type: 'stage_start'; nodeId: string; nodeName: string; index: number }
  | { type: 'stage_progress'; nodeId: string; event: AgentEvent | { type: string; [k: string]: unknown } }
  | { type: 'stage_end'; nodeId: string; success: boolean; output?: unknown }
  | { type: 'confirmation_required'; nodeId: string; title: string; content: string; artifactPath?: string; confirmationKind?: string; [k: string]: unknown }
  | { type: 'confirmation_resolved'; nodeId: string; approved: boolean; feedback?: string }
  | { type: 'pipeline_complete'; runId: string }
  | { type: 'pipeline_failed'; runId: string; error: string }
  | { type: 'pipeline_cancelled'; runId: string }
  | { type: 'log'; message: string; level?: 'info' | 'warn' | 'error' };

export interface StartOptions {
  fromNodeId?: string;    // Resume from a specific node
  skipConfirmations?: boolean;
}

export class PipelineEngine extends EventEmitter {
  private state: ExecutionState;
  private toolRegistry: ToolRegistry;
  private currentAgent: AgentEngine | null = null;
  private waitingForConfirmation: { nodeId: string; resolve: (approved: boolean, feedback?: string) => void } | null = null;
  private running = false;
  private aborted = false;
  private skipConfirmations = false;
  private readonly stageRunnerRegistry: StageRunnerRegistry = {
    'upload-init': runUploadInitStage,
    ...createLegacyStageRunnerRegistry(),
  };

  constructor(private runId: string) {
    super();
    const store = getStateStore(runId);
    let state = store.loadExecutionState();
    if (!state) {
      // Initialize new state
      const paths = ensureRunDirectories(runId);
      const workflowSnapshot = captureWorkflowSnapshot(BUILTIN_MRD_TO_CODE_WORKFLOW_ID);
      state = {
        runId,
        name: `Run ${runId.slice(0, 6)}`,
        status: 'idle',
        currentNodeIndex: -1,
        nodes: PIPELINE_NODES.map(n => ({
          id: n.id, name: n.name, status: 'pending' as NodeStatus, failureCount: 0,
        })),
        permissionMode: 'default',
        modelOverrides: getCustomStageOverrides(),
        startedAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          workflowSnapshot,
        },
        workflowInstance: createInitialSessionWorkflowInstance({
          runId,
          templateSnapshot: workflowSnapshot,
        }),
      };
      store.saveExecutionState(state);
    }
    if (!state.modelOverrides || Object.keys(state.modelOverrides).length === 0) {
      const customStageOverrides = getCustomStageOverrides();
      if (Object.keys(customStageOverrides).length > 0) {
        state.modelOverrides = customStageOverrides;
        store.saveExecutionState(state);
      }
    }
    if (reconcilePipelineNodes(state)) {
      store.saveExecutionState(state);
    }
    if (recoverInterruptedState(state)) {
      store.saveExecutionState(state);
    }
    this.state = state;
    this.toolRegistry = createToolRegistry();
  }

  getState(): ExecutionState {
    return this.state;
  }

  getCurrentAgent(): AgentEngine | null {
    return this.currentAgent;
  }

  /**
   * Start or resume the pipeline.
   */
  async start(opts: StartOptions = {}): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.aborted = false;
    this.skipConfirmations = opts.skipConfirmations === true;

    const eventLog = getEventLog(this.runId);
    const store = getStateStore(this.runId);

    this.state.status = 'running';
    this.state.error = undefined;
    this.state.completedAt = undefined;

    // 统一计算起点：普通启动从第一个节点开始；指定 fromNodeId 时清理该节点之后的状态；进程恢复时重跑中断节点。
    let startIndex = 0;
    if (opts.fromNodeId) {
      const fromNodeId = normalizeStageId(opts.fromNodeId);
      startIndex = PIPELINE_NODES.findIndex(n => n.id === fromNodeId);
      if (startIndex < 0) startIndex = 0;
      this.resetNodesForRerun(startIndex);
      eventLog.logEvent('pipeline_resumed', { fromNode: startIndex, fromNodeId, rerun: true });
    } else if (this.state.currentNodeIndex >= 0) {
      // Resume from next node after last completed
      startIndex = Math.max(0, this.state.currentNodeIndex);
      // If we were in the middle of a node, restart that node
      const currentNode = this.state.nodes[this.state.currentNodeIndex];
      if (currentNode && (currentNode.status === 'running' || currentNode.status === 'waiting_confirmation')) {
        startIndex = this.state.currentNodeIndex;
      }
    }

    eventLog.logEvent('pipeline_started', { fromNode: startIndex });

    for (let i = startIndex; i < PIPELINE_NODES.length; i++) {
      if (this.aborted) break;

      const node = PIPELINE_NODES[i];
      this.state.currentNodeIndex = i;
      this.state.currentNodeId = node.id;

      const nodeState = this.state.nodes[i];
      // Skip completed nodes (unless resuming into them specifically)
      if (nodeState.status === 'completed' && !opts.fromNodeId) {
        continue;
      }

      nodeState.status = 'running';
      nodeState.startedAt = Date.now();
      nodeState.error = undefined;
      nodeState.failureCount = nodeState.failureCount ?? 0;
      nodeState.childAgentIds = nodeState.childAgentIds ?? [];
      this.markProjectsForNode(node.id, 'running');
      store.saveExecutionState(this.state);

      eventLog.logEvent('pipeline_node_start', { nodeId: node.id, nodeName: node.name }, undefined, node.id);
      this.emit('event', { type: 'stage_start', nodeId: node.id, nodeName: node.name, index: i } as PipelineEvent);

      try {
        const output = await this.executeNode(node, nodeState);

        // 节点执行成功后先持久化产物索引和轻量上下文，再进入确认门或回退判断。
        nodeState.status = 'completed';
        nodeState.completedAt = Date.now();
        nodeState.output = output;
        nodeState.outputArtifacts = collectOutputArtifacts(node, output, nodeState);
        this.updateArtifactIndex(node.id, nodeState.outputArtifacts);
        this.markProjectsForNode(node.id, 'completed');
        this.saveContextManifest(node.id, nodeState, output);
        store.saveExecutionState(this.state);

        eventLog.logEvent('pipeline_node_end', { nodeId: node.id, success: true }, undefined, node.id);
        this.emit('event', { type: 'stage_end', nodeId: node.id, success: true, output } as PipelineEvent);

        const rollback = this.detectRollbackAfterNode(node.id);
        if (rollback) {
          // review/test 这类“后置节点发现问题”的场景，不新开分支，直接把指针回退到需要修复的节点。
          this.applyRollback(rollback);
          const targetIndex = PIPELINE_NODES.findIndex(n => n.id === rollback.targetNodeId);
          i = Math.max(-1, targetIndex - 1);
          store.saveExecutionState(this.state);
          continue;
        }

        if (this.state.rollback?.active && this.state.rollback.sourceNodeId === node.id) {
          this.state.rollback.active = false;
          this.state.projects?.forEach(project => {
            if (this.state.rollback?.affectedProjects.includes(project.name)) {
              project.status = 'completed';
            }
          });
          store.saveExecutionState(this.state);
        }

        // Save artifact if specified. Multi-artifact stages may write files inside executeNode.
        if (node.artifactOutput && typeof output === 'string') {
          const artifactPath = path.join(getRunPaths(this.runId).artifactsDir, node.artifactOutput);
          fs.writeFileSync(artifactPath, output, 'utf-8');
        }

        // 确认门只负责暂停状态机并收集用户决策；业务产物已在 executeNode 内写入。
        if (node.hasConfirmationGate && !opts.skipConfirmations) {
          nodeState.status = 'waiting_confirmation';
          this.state.status = 'waiting_confirmation';
          store.saveExecutionState(this.state);

          const firstOutputArtifact = isSpecOutput(output)
            ? Object.keys(output.artifacts)[0]
            : node.artifactOutputs?.[0] || node.artifactOutput;
          const artifactPath = firstOutputArtifact && !firstOutputArtifact.includes('{project}')
            ? path.join('artifacts', firstOutputArtifact)
            : undefined;
          const confirmationContent = formatConfirmationContent(output);
          const confirmationData = buildConfirmationData(node, confirmationContent);

          eventLog.logEvent('confirmation_waiting', {
            nodeId: node.id,
            title: confirmationData.title,
            content: confirmationContent.slice(0, 5000),
            artifactPath,
            ...confirmationData.extra,
          }, undefined, node.id);

          this.emit('event', {
            type: 'confirmation_required',
            nodeId: node.id,
            title: confirmationData.title,
            content: confirmationContent,
            artifactPath,
            ...confirmationData.extra,
          } as PipelineEvent);

          // 等待期间进程可以重启；resolveConfirmation 会把用户决策写回 state，再从当前节点恢复。
          const { approved, feedback } = await this.waitForConfirmation(node.id);
          eventLog.logEvent('confirmation_resolved', { nodeId: node.id, approved, feedback }, undefined, node.id);
          this.emit('event', { type: 'confirmation_resolved', nodeId: node.id, approved, feedback } as PipelineEvent);

          if (!approved) {
            if (feedback) {
              // 用户拒绝但给了反馈：不推进下游，把反馈留在 nodeState，下一轮重新生成当前节点产物。
              nodeState.confirmation = { waiting: false, approved: false, feedback };
              nodeState.status = 'pending';
              i--; // re-run this stage
              this.state.status = 'running';
              store.saveExecutionState(this.state);
              continue;
            } else {
              // Cancelled
              this.state.status = 'cancelled';
              this.state.completedAt = Date.now();
              store.saveExecutionState(this.state);
              eventLog.logEvent('pipeline_cancelled', { reason: 'user_rejected' });
              this.emit('event', { type: 'pipeline_cancelled', runId: this.runId } as PipelineEvent);
              this.running = false;
              return;
            }
          }

          // Approved - clear feedback if any
          nodeState.confirmation = { waiting: false, approved: true };
          nodeState.status = 'completed';
          this.state.status = 'running';
          this.saveContextManifest(node.id, nodeState, output);
          store.saveExecutionState(this.state);
        }
      } catch (err) {
        nodeState.status = 'failed';
        nodeState.error = (err as Error).message;
        nodeState.failureCount = (nodeState.failureCount ?? 0) + 1;
        this.markProjectsForNode(node.id, 'failed');
        store.saveExecutionState(this.state);

        eventLog.logEvent('pipeline_node_end', { nodeId: node.id, success: false, error: (err as Error).message }, undefined, node.id);
        this.emit('event', { type: 'stage_end', nodeId: node.id, success: false, output: (err as Error).message } as PipelineEvent);

        const maxNodeRetries = 3;
        if ((nodeState.failureCount ?? 0) <= maxNodeRetries) {
          const retryAttempt = nodeState.failureCount ?? 0;
          nodeState.status = 'pending';
          this.state.status = 'running';
          this.state.error = undefined;
          this.markProjectsForNode(node.id, 'running');
          store.saveExecutionState(this.state);
          eventLog.logEvent('node_retry_scheduled', {
            nodeId: node.id,
            retryAttempt,
            maxRetries: maxNodeRetries,
            error: (err as Error).message,
          }, undefined, node.id);
          this.emit('event', {
            type: 'stage_progress',
            nodeId: node.id,
            event: { type: 'node_retry_scheduled', retryAttempt, maxRetries: maxNodeRetries, error: (err as Error).message },
          } as PipelineEvent);
          i--; // retry this stage
          continue;
        }

        this.state.status = 'failed';
        this.state.error = (err as Error).message;
        this.state.completedAt = Date.now();
        store.saveExecutionState(this.state);
        eventLog.logEvent('pipeline_failed', { nodeId: node.id, error: (err as Error).message });
        this.emit('event', { type: 'pipeline_failed', runId: this.runId, error: (err as Error).message } as PipelineEvent);
        this.running = false;
        return;
      }
    }

    // Pipeline complete
    if (!this.aborted) {
      this.state.status = 'completed';
      this.state.error = undefined;
      this.state.completedAt = Date.now();
      store.saveExecutionState(this.state);
      eventLog.logEvent('pipeline_completed', { runId: this.runId });
      this.emit('event', { type: 'pipeline_complete', runId: this.runId } as PipelineEvent);
    }

    this.running = false;
  }

  /**
   * Approve or reject a confirmation gate.
   */
  resolveConfirmation(nodeId: string, approved: boolean, feedback?: string): void {
    if (this.waitingForConfirmation && this.waitingForConfirmation.nodeId === nodeId) {
      const resolve = this.waitingForConfirmation.resolve;
      this.waitingForConfirmation = null;
      resolve(approved, feedback);
      return;
    }

    const normalizedNodeId = normalizeStageId(nodeId);
    const nodeState = this.state.nodes.find(node => node.id === normalizedNodeId);
    if (!nodeState || nodeState.status !== 'waiting_confirmation') {
      return;
    }

    const store = getStateStore(this.runId);
    const eventLog = getEventLog(this.runId);
    eventLog.logEvent('confirmation_resolved', { nodeId: normalizedNodeId, approved, feedback }, undefined, normalizedNodeId);
    this.emit('event', { type: 'confirmation_resolved', nodeId: normalizedNodeId, approved, feedback } as PipelineEvent);

    if (!approved && !feedback) {
      nodeState.confirmation = { waiting: false, approved: false };
      nodeState.status = 'failed';
      nodeState.error = '用户拒绝确认';
      this.state.status = 'cancelled';
      this.state.completedAt = Date.now();
      store.saveExecutionState(this.state);
      eventLog.logEvent('pipeline_cancelled', { reason: 'user_rejected' });
      this.emit('event', { type: 'pipeline_cancelled', runId: this.runId } as PipelineEvent);
      return;
    }

    nodeState.confirmation = approved
      ? { waiting: false, approved: true, feedback, resumeApproved: true }
      : { waiting: false, approved: false, feedback };
    nodeState.status = 'pending';
    this.state.status = 'running';
    this.state.currentNodeId = normalizedNodeId;
    this.state.currentNodeIndex = PIPELINE_NODES.findIndex(node => node.id === normalizedNodeId);
    store.saveExecutionState(this.state);
    this.resumeFromNode(normalizedNodeId);
  }

  /**
   * Abort/cancel the pipeline.
   */
  abort(): void {
    this.aborted = true;
    if (this.currentAgent) {
      this.currentAgent.abort();
    }
    if (this.waitingForConfirmation) {
      this.waitingForConfirmation.resolve(false);
      this.waitingForConfirmation = null;
    }
    const store = getStateStore(this.runId);
    this.state.status = 'cancelled';
    this.state.completedAt = Date.now();
    const currentNode = this.state.nodes[this.state.currentNodeIndex];
    if (currentNode && (currentNode.status === 'running' || currentNode.status === 'waiting_confirmation' || currentNode.status === 'suspended')) {
      currentNode.status = 'interrupted';
      currentNode.completedAt = Date.now();
      currentNode.error = '用户中断流程';
    }
    this.state.projects?.forEach(project => {
      if (project.status === 'running' || project.status === 'suspended') {
        project.status = 'interrupted';
      }
    });
    this.state.workflowInstance?.branches?.forEach(branch => {
      if (['running', 'waiting_confirmation', 'suspended'].includes(branch.status)) {
        branch.status = 'cancelled';
        const currentNode = branch.nodes?.find(node => node.id === branch.currentNodeId);
        if (currentNode) currentNode.status = 'cancelled';
      }
    });
    if (this.state.workflowInstance) {
      syncSessionWorkflowJoinFromBranches(this.state.workflowInstance);
      this.state.workflowInstance.updatedAt = new Date().toISOString();
    }
    store.saveExecutionState(this.state);
    this.running = false;
    this.emit('event', { type: 'pipeline_cancelled', runId: this.runId } as PipelineEvent);
  }

  suspend(): void {
    const store = getStateStore(this.runId);
    this.state.status = 'suspended';
    this.state.nodes.forEach(node => {
      if (node.status === 'running') node.status = 'suspended';
    });
    store.saveExecutionState(this.state);
    this.running = false;
  }

  private recordChildAgent(nodeId: string, agentRunId: string): void {
    const nodeState = this.state.nodes.find(node => node.id === nodeId);
    if (!nodeState) return;
    nodeState.childAgentIds = nodeState.childAgentIds ?? [];
    if (!nodeState.childAgentIds.includes(agentRunId)) {
      nodeState.childAgentIds.push(agentRunId);
    }
    this.state.currentAgentRunId = agentRunId;
    getStateStore(this.runId).saveExecutionState(this.state);
  }

  private markProjectsForNode(nodeId: string, status: ProjectState['status']): void {
    if (!isProjectScopedNode(nodeId)) return;
    const activeProjects = this.getActiveProjectNamesForNode(nodeId);
    this.state.projects?.forEach(project => {
      if (activeProjects && !activeProjects.has(project.name)) return;
      project.currentNodeId = nodeId;
      project.status = status;
    });
    this.syncSessionBranchesForNode(nodeId, status, activeProjects);
  }

  private syncSessionBranchesForNode(
    nodeId: string,
    status: ProjectState['status'],
    activeProjects: Set<string> | null
  ): void {
    const instance = this.state.workflowInstance;
    if (!instance?.branches?.length) return;
    const branchNodeId = branchNodeIdForStage(nodeId);
    if (!branchNodeId) return;
    const nodeState = this.state.nodes.find(node => node.id === nodeId);
    for (const branch of instance.branches) {
      if (activeProjects && !activeProjects.has(branch.projectName)) continue;
      const branchNode = branch.nodes?.find(item => item.id === branchNodeId);
      if (!branchNode) continue;
      const previousBranchStatus = branch.status;
      const previousCurrentNodeId = branch.currentNodeId;
      const branchStatus = toSessionBranchStatus(status);
      branchNode.status = branchStatus;
      branchNode.failureCount = nodeState?.failureCount;
      branchNode.error = nodeState?.error;
      branchNode.childAgentIds = nodeState?.childAgentIds;

      const artifacts = artifactsForProject(this.state.artifactIndex?.[nodeId] ?? [], branch.projectName);
      if (artifacts.length) {
        branchNode.outputArtifacts = artifacts;
        branch.artifactIndex = branch.artifactIndex ?? {};
        branch.artifactIndex[branchNodeId] = artifacts;
      }
      branch.childAgentIds = Array.from(new Set([
        ...(branch.childAgentIds ?? []),
        ...(nodeState?.childAgentIds ?? []),
      ]));
      branch.currentNodeId = status === 'completed'
        ? nextBranchNodeId(branchNodeId) ?? branchNodeId
        : branchNodeId;
      branch.status = branchStatusForStage(branchNodeId, status);
      if (previousBranchStatus !== branch.status || previousCurrentNodeId !== branch.currentNodeId) {
        getEventLog(this.runId).logEvent('branch_transition', {
          branchId: branch.branchId,
          projectName: branch.projectName,
          nodeId: branchNodeId,
          status: branch.status,
          previousStatus: previousBranchStatus,
          currentNodeId: branch.currentNodeId,
          previousCurrentNodeId,
        }, undefined, branchNodeId);
      }
    }
    const previousJoin = JSON.stringify(instance.joins[0] ?? null);
    syncSessionWorkflowJoinFromBranches(instance);
    if (previousJoin !== JSON.stringify(instance.joins[0] ?? null)) {
      getEventLog(this.runId).logEvent('join_state_updated', {
        join: instance.joins[0],
      }, undefined, 'app-join');
    }
    instance.updatedAt = new Date().toISOString();
  }

  private filterProjectsForNode<T extends { name: string }>(nodeId: string, projects: T[]): T[] {
    const activeProjects = this.getActiveProjectNamesForNode(nodeId);
    return activeProjects ? projects.filter(project => activeProjects.has(project.name)) : projects;
  }

  private async runProjectStageTasks<T>(
    node: PipelineNode,
    projects: Array<{ name: string; root: string }>,
    runOne: (project: { name: string; root: string }) => Promise<T>,
    options: { concurrency?: number } = {}
  ): Promise<T[]> {
    if (!projects.length) return [];
    const limit = Math.max(1, Math.min(projects.length, options.concurrency ?? getConfig().workflow.branchConcurrency));
    const semaphore = new AsyncSemaphore(limit);
    const settled = await Promise.all(projects.map(project =>
      semaphore.run(async () => {
        this.markProjectForNode(node.id, project.name, 'running');
        try {
          const value = await runOne(project);
          this.markProjectForNode(node.id, project.name, 'completed');
          return { status: 'fulfilled' as const, project, value };
        } catch (err) {
          this.markProjectForNode(node.id, project.name, 'failed', (err as Error).message);
          return { status: 'rejected' as const, project, reason: err };
        }
      })
    ));

    const failures = settled.filter((item): item is Extract<typeof item, { status: 'rejected' }> => item.status === 'rejected');
    if (failures.length) {
      throw new Error(failures
        .map(item => `${item.project.name}: ${(item.reason as Error).message || String(item.reason)}`)
        .join('\n'));
    }

    return settled.map(item => {
      if (item.status === 'fulfilled') return item.value;
      throw item.reason;
    });
  }

  private markProjectForNode(
    nodeId: string,
    projectName: string,
    status: ProjectState['status'],
    error?: string
  ): void {
    this.state.projects?.forEach(project => {
      if (project.name !== projectName) return;
      project.currentNodeId = nodeId;
      project.status = status;
    });
    this.syncSessionBranchForProject(nodeId, status, projectName, error);
    getStateStore(this.runId).saveExecutionState(this.state);
  }

  private syncSessionBranchForProject(
    nodeId: string,
    status: ProjectState['status'],
    projectName: string,
    error?: string
  ): void {
    const instance = this.state.workflowInstance;
    if (!instance?.branches?.length) return;
    const branchNodeId = branchNodeIdForStage(nodeId);
    if (!branchNodeId) return;
    const branch = instance.branches.find(item => item.projectName === projectName);
    const branchNode = branch?.nodes?.find(item => item.id === branchNodeId);
    if (!branch || !branchNode) return;

    const previousBranchStatus = branch.status;
    const previousCurrentNodeId = branch.currentNodeId;
    const branchStatus = toSessionBranchStatus(status);
    branchNode.status = branchStatus;
    branchNode.error = error;
    if (status === 'failed') branchNode.failureCount = (branchNode.failureCount ?? 0) + 1;

    const artifacts = artifactsForProject(this.state.artifactIndex?.[nodeId] ?? [], projectName);
    if (artifacts.length) {
      branchNode.outputArtifacts = artifacts;
      branch.artifactIndex = branch.artifactIndex ?? {};
      branch.artifactIndex[branchNodeId] = artifacts;
    }

    branch.currentNodeId = status === 'completed'
      ? nextBranchNodeId(branchNodeId) ?? branchNodeId
      : branchNodeId;
    branch.status = branchStatusForStage(branchNodeId, status);
    if (previousBranchStatus !== branch.status || previousCurrentNodeId !== branch.currentNodeId) {
      getEventLog(this.runId).logEvent('branch_transition', {
        branchId: branch.branchId,
        projectName: branch.projectName,
        nodeId: branchNodeId,
        status: branch.status,
        previousStatus: previousBranchStatus,
        currentNodeId: branch.currentNodeId,
        previousCurrentNodeId,
      }, undefined, branchNodeId);
    }

    const previousJoin = JSON.stringify(instance.joins[0] ?? null);
    syncSessionWorkflowJoinFromBranches(instance);
    if (previousJoin !== JSON.stringify(instance.joins[0] ?? null)) {
      getEventLog(this.runId).logEvent('join_state_updated', {
        join: instance.joins[0],
      }, undefined, 'app-join');
    }
    instance.updatedAt = new Date().toISOString();
  }

  private getActiveProjectNamesForNode(nodeId: string): Set<string> | null {
    const rollback = this.state.rollback;
    if (!rollback?.active) return null;
    // 回退期间只重跑受影响项目，避免一个项目失败时把所有项目的产物和轨迹都覆盖掉。
    const nodeIndex = getNodeIndexById(nodeId);
    const targetIndex = getNodeIndexById(rollback.targetNodeId);
    const sourceIndex = getNodeIndexById(rollback.sourceNodeId);
    if (nodeIndex < targetIndex || nodeIndex > sourceIndex) return null;
    return new Set(rollback.affectedProjects);
  }

  private updateArtifactIndex(nodeId: string, outputArtifacts: string[]): void {
    this.state.artifactIndex = this.state.artifactIndex ?? {};
    this.state.artifactIndex[nodeId] = outputArtifacts;
  }

  private appendArtifactIndex(nodeId: string, artifactPath: string): void {
    this.state.artifactIndex = this.state.artifactIndex ?? {};
    const normalized = artifactPath.replace(/\\/g, '/');
    const existing = this.state.artifactIndex[nodeId] ?? [];
    if (!existing.includes(normalized)) {
      this.state.artifactIndex[nodeId] = [...existing, normalized];
    }
  }

  private saveContextManifest(nodeId: string, nodeState: NodeState, output: unknown): void {
    const paths = getRunPaths(this.runId);
    const outputArtifacts = nodeState.outputArtifacts ?? [];
    // 这里保存的是跨节点传递用的“瘦上下文”：产物路径、摘要、确认结果和下一节点输入，不把 transcript 当业务输入。
    const manifest: ContextManifest = {
      nodeId,
      outputArtifacts: outputArtifacts.map(artifactPath => artifactSummary(paths, artifactPath)),
      importantDecisions: extractImportantDecisions(output),
      riskNotes: extractRiskNotes(output),
      confirmation: nodeState.confirmation?.approved !== undefined
        ? { approved: Boolean(nodeState.confirmation.approved), feedback: nodeState.confirmation.feedback }
        : undefined,
      nextNodeInputs: inferNextNodeInputs(nodeId, this.state.artifactIndex ?? {}),
    };
    this.state.contextManifests = this.state.contextManifests ?? {};
    this.state.contextManifests[nodeId] = manifest;
    fs.mkdirSync(paths.checkpointsDir, { recursive: true });
    fs.writeFileSync(
      path.join(paths.checkpointsDir, `${nodeId}-context-manifest.json`),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );
    getEventLog(this.runId).logEvent('context_compacted', {
      nodeId,
      outputArtifacts: manifest.outputArtifacts.map(item => item.path),
      nextNodeInputs: manifest.nextNodeInputs,
    }, undefined, nodeId);
  }

  private detectRollbackAfterNode(nodeId: string): ExecutionState['rollback'] | null {
    const paths = getRunPaths(this.runId);
    if (nodeId === 'java-impl') {
      // Java 实现节点内部已合并 review；review-findings.json 出现 BLOCK 时，回退到 java-impl 自动修复。
      const blocked = readReviewBlockProjects(paths.artifactsDir);
      if (!blocked.length) return null;
      const allowed = blocked.filter(projectName => incrementProjectRetry(this.state, projectName, 'reviewBlockCount') <= getConfig().agent.autoFixRounds);
      if (!allowed.length) {
        this.markProjectsWaitingFix(blocked, nodeId);
        return null;
      }
      return {
        active: true,
        sourceNodeId: 'java-impl',
        targetNodeId: 'java-impl',
        affectedProjects: allowed,
        reason: '代码评审存在 BLOCK 问题，回退到 Java 实现修复。',
        category: 'review_block',
        startedAt: Date.now(),
        attempt: Math.max(...allowed.map(name => getProjectRetry(this.state, name, 'reviewBlockCount'))),
      };
    }

    if (nodeId === 'testcode-generate') {
      // 测试代码节点内部已合并 Maven 执行；失败分类决定回退到实现节点还是测试节点。
      const failures = readTestFailureProjects(paths.artifactsDir);
      const retryable = failures.filter(item => item.category !== 'success' && item.category !== 'runner_asset_failure');
      if (!retryable.length) {
        const runnerFailures = failures.filter(item => item.category === 'runner_asset_failure').map(item => item.project);
        if (runnerFailures.length) this.markProjectsWaitingFix(runnerFailures, nodeId);
        return null;
      }
      const allowed = retryable.filter(item => incrementProjectRetry(this.state, item.project, retryFieldForFailure(item.category)) <= getConfig().agent.autoFixRounds);
      if (!allowed.length) {
        this.markProjectsWaitingFix(retryable.map(item => item.project), nodeId);
        return null;
      }
      const targetNodeId = targetNodeForFailure(allowed[0].category, allowed[0].reason);
      return {
        active: true,
        sourceNodeId: 'testcode-generate',
        targetNodeId,
        affectedProjects: allowed.map(item => item.project),
        reason: `单元测试失败分类为 ${allowed[0].category}，回退到 ${targetNodeId}。`,
        category: allowed[0].category,
        startedAt: Date.now(),
        attempt: Math.max(...allowed.map(item => getProjectRetry(this.state, item.project, retryFieldForFailure(item.category)))),
      };
    }
    return null;
  }

  private applyRollback(rollback: NonNullable<ExecutionState['rollback']>): void {
    const eventLog = getEventLog(this.runId);
    eventLog.logEvent('node_rollback_requested', { ...rollback }, undefined, rollback.sourceNodeId);
    this.emit('event', { type: 'stage_progress', nodeId: rollback.sourceNodeId, event: { type: 'node_rollback_requested', ...rollback } } as PipelineEvent);

    this.state.rollback = rollback;
    this.state.projects?.forEach(project => {
      if (rollback.affectedProjects.includes(project.name)) {
        project.status = 'waiting_fix';
        project.currentNodeId = rollback.targetNodeId;
      }
    });
    this.markBranchesWaitingFix(rollback.affectedProjects, rollback.targetNodeId);
    const targetIndex = getNodeIndexById(rollback.targetNodeId);
    const sourceIndex = getNodeIndexById(rollback.sourceNodeId);
    // 把回退区间内的节点重置为 pending，保留区间外已完成节点和旧事件，用于页面展示多轮轨迹。
    for (let i = targetIndex; i <= sourceIndex; i++) {
      if (this.state.nodes[i]) {
        this.state.nodes[i].status = 'pending';
        this.state.nodes[i].error = undefined;
      }
    }
    eventLog.logEvent('node_rollback_started', { ...rollback }, undefined, rollback.targetNodeId);
  }

  private markProjectsWaitingFix(projectNames: string[], nodeId: string): void {
    this.state.projects?.forEach(project => {
      if (projectNames.includes(project.name)) {
        project.status = 'waiting_fix';
        project.currentNodeId = nodeId;
      }
    });
    this.markBranchesWaitingFix(projectNames, nodeId);
  }

  private markBranchesWaitingFix(projectNames: string[], nodeId: string): void {
    const instance = this.state.workflowInstance;
    if (!instance?.branches?.length) return;
    const targetBranchNodeId = branchNodeIdForStage(nodeId) ?? nodeId;
    for (const branch of instance.branches) {
      if (!projectNames.includes(branch.projectName)) continue;
      const previousBranchStatus = branch.status;
      const previousCurrentNodeId = branch.currentNodeId;
      branch.status = 'waiting_fix';
      branch.currentNodeId = targetBranchNodeId;
      const targetNode = branch.nodes?.find(node => node.id === targetBranchNodeId);
      if (targetNode) targetNode.status = 'waiting_fix';
      for (const node of branch.nodes ?? []) {
        if (isBranchNodeAfter(node.id, targetBranchNodeId)) {
          node.status = 'pending';
          node.error = undefined;
        }
      }
      getEventLog(this.runId).logEvent('branch_transition', {
        branchId: branch.branchId,
        projectName: branch.projectName,
        nodeId: targetBranchNodeId,
        status: branch.status,
        previousStatus: previousBranchStatus,
        currentNodeId: branch.currentNodeId,
        previousCurrentNodeId,
      }, undefined, targetBranchNodeId);
    }
    const previousJoin = JSON.stringify(instance.joins[0] ?? null);
    syncSessionWorkflowJoinFromBranches(instance);
    if (previousJoin !== JSON.stringify(instance.joins[0] ?? null)) {
      getEventLog(this.runId).logEvent('join_state_updated', {
        join: instance.joins[0],
      }, undefined, 'app-join');
    }
    instance.updatedAt = new Date().toISOString();
  }

  // ── Private: stage execution ──────────────────────────────────────────

  private async executeNode(node: PipelineNode, nodeState: NodeState): Promise<unknown> {
    const paths = getRunPaths(this.runId);
    const runner = this.stageRunnerRegistry[node.id];

    if (runner) {
      const result = await runner(this.createStageRunnerContext(node, paths, nodeState));
      return result.output;
    }

    if (node.id === 'mrd-clarify') {
      return this.executeMrdClarifyStage(node, paths, nodeState);
    }

    // For stages that don't use ReAct loop, use a single-turn agent
    // For ReAct loop stages (java-impl, testcode-generate, maven-test-runner), use full AgentEngine
    if (node.usesReActLoop) {
      return this.executeReActStage(node, paths, nodeState);
    } else {
      return this.executeSimpleAgent(node, paths);
    }
  }

  private createStageRunnerContext(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    nodeState: NodeState
  ): StageRunnerContext {
    return {
      runId: this.runId,
      workflowId: 'legacy-pipeline',
      nodeId: node.id,
      stageId: node.id,
      node,
      paths,
      executionState: this.state,
      nodeState,
      eventLog: getEventLog(this.runId),
      store: getStateStore(this.runId),
      emit: (event) => this.emit('event', event),
      writeArtifact: (relativePath, content, description) =>
        this.writeArtifact(paths, node.id, relativePath, content, description),
      logEvent: (type, data, agentRunId, eventNodeId) =>
        getEventLog(this.runId).logEvent(type, data, agentRunId, eventNodeId),
      legacyDelegates: this.createLegacyStageRunnerDelegates(),
    };
  }

  private createLegacyStageRunnerDelegates(): LegacyStageRunnerDelegates {
    return {
      mrdRender: (ctx) => this.executeMrdRenderStage(ctx.node, ctx.paths, ctx.nodeState),
      implementationPlan: (ctx) => this.executeImplementationPlanStage(ctx.node, ctx.paths),
      specGenerate: (ctx) => this.executeSpecStage(ctx.node, ctx.paths),
      javaImpl: (ctx) => this.executeJavaImplStage(ctx.node, ctx.paths, ctx.nodeState),
      testcodeGenerate: (ctx) => this.executeTestCodeGenerateStage(ctx.node, ctx.paths, ctx.nodeState),
      archive: (ctx) => this.executeArchiveStage(ctx.node, ctx.paths),
    };
  }

  private async executeInit(
    paths: ReturnType<typeof getRunPaths>,
    node: PipelineNode,
    nodeState: NodeState
  ): Promise<string> {
    const result = await runUploadInitStage({
      runId: this.runId,
      workflowId: 'legacy-pipeline',
      nodeId: node.id,
      stageId: node.id,
      node,
      paths,
      executionState: this.state,
      nodeState,
      eventLog: getEventLog(this.runId),
      store: getStateStore(this.runId),
      emit: (event) => this.emit('event', event),
      writeArtifact: (relativePath, content, description) =>
        this.writeArtifact(paths, node.id, relativePath, content, description),
      logEvent: (type, data, agentRunId, eventNodeId) =>
        getEventLog(this.runId).logEvent(type, data, agentRunId, eventNodeId),
    });

    return String(result.output ?? '');
  }

  private async executeMrdRenderStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    nodeState: NodeState
  ): Promise<string> {
    const eventLog = getEventLog(this.runId);

    // Ensure project-manifest.json exists (compatibility fallback)
    const manifest = ensureProjectManifest(paths);
    const recovered = this.tryRecoverMrdRenderFromArtifacts(node, paths, nodeState, manifest);
    if (recovered) return recovered;

    // Select model
    const model = getModelForStage(node.id, 0, this.state.modelOverrides);
    const provider = createLLMProvider(model.providerId);
    event_model_selected(this.runId, model, node.id);

    // Build system prompt and user prompt
    const systemPrompt = loadPromptTemplate(node.id);
    const userPrompt = buildMrdRenderPrompt(paths, manifest, nodeState.confirmation?.feedback);

    const agentId = nanoid(8);
    nodeState.agentRunId = agentId;
    const agentTools = createRequirementToolRegistry();

    const agent = new AgentEngine({
      runId: this.runId,
      agentRunId: agentId,
      nodeId: node.id,
      provider,
      model,
      registry: agentTools,
      systemPrompt,
      maxTurns: node.maxTurns,
      cwd: paths.runDir,
      projectDir: paths.projectDir,
      artifactsDir: paths.artifactsDir,
      runDir: paths.runDir,
      taskDescription: '需求拆解',
      requireToolUse: shouldRequireToolUse(),
    });

    this.currentAgent = agent;

    let output = '';
    for await (const event of agent.run(userPrompt)) {
      this.emitStageProgress(node.id, event);
      if (event.type === 'text') output += event.text;
      if (event.type === 'completed') output = event.finalText || output;
      if (event.type === 'error') throw new Error(event.message);
    }

    this.currentAgent = null;
    output = output.trim();

    fs.mkdirSync(paths.artifactsDir, { recursive: true });
    const clarifiedPath = path.join(paths.artifactsDir, 'mrd-clarified.md');
    const questionsPath = path.join(paths.artifactsDir, 'mrd-clarify-questions.md');
    let clarified = readTextIfExists(clarifiedPath)?.trim() || output;
    if (!isClarifiedMrdContent(clarified)) {
      const mrdContent = isStructuredMrdContent(extractMrdContent(output))
        ? extractMrdContent(output)
        : buildFallbackMrd(paths, manifest, output);
      clarified = buildFallbackClarifiedMrd(mrdContent, output);
      fs.writeFileSync(clarifiedPath, clarified, 'utf-8');
    }

    const existingQuestions = readTextIfExists(questionsPath)?.trim() || '';
    let questions = buildClarifyQuestionsArtifact(clarified, manifest, existingQuestions);
    fs.writeFileSync(questionsPath, questions, 'utf-8');
    this.emitArtifactWritten(node.id, 'mrd-clarify-questions.md', Buffer.byteLength(questions, 'utf-8'), '需求拆解待澄清问题');

    let clarificationAnswers = '';
    if (!this.skipConfirmations && hasClarificationQuestions(questions)) {
      const store = getStateStore(this.runId);
      nodeState.status = 'waiting_confirmation';
      this.state.status = 'waiting_confirmation';
      store.saveExecutionState(this.state);

      eventLog.logEvent('confirmation_waiting', {
        nodeId: node.id,
        title: '需求拆解问题确认',
        content: questions.slice(0, 5000),
        artifactPath: 'artifacts/mrd-clarify-questions.md',
        confirmationKind: 'mrd-clarify-questions',
      }, agentId, node.id);
      this.emit('event', {
        type: 'confirmation_required',
        nodeId: node.id,
        title: '需求拆解问题确认',
        content: questions,
        artifactPath: 'artifacts/mrd-clarify-questions.md',
        confirmationKind: 'mrd-clarify-questions',
      } as PipelineEvent);

      const { approved, feedback } = await this.waitForConfirmation(node.id);
      eventLog.logEvent('confirmation_resolved', { nodeId: node.id, approved, feedback }, undefined, node.id);
      this.emit('event', { type: 'confirmation_resolved', nodeId: node.id, approved, feedback } as PipelineEvent);

      if (!approved && !feedback) {
        throw new Error('用户拒绝需求拆解问题清单，且未提供修订意见。');
      }
      clarificationAnswers = feedback?.trim() || '用户确认按推荐默认决策继续。';
      nodeState.status = 'running';
      this.state.status = 'running';
      store.saveExecutionState(this.state);
    } else if (this.skipConfirmations) {
      clarificationAnswers = '测试/跳过确认模式：按推荐默认决策继续。';
    }

    if (clarificationAnswers) {
      const finalAgentId = nanoid(8);
      const finalAgent = new AgentEngine({
        runId: this.runId,
        agentRunId: finalAgentId,
        nodeId: node.id,
        provider,
        model,
        registry: createRequirementToolRegistry(),
        systemPrompt,
        maxTurns: node.maxTurns,
        cwd: paths.runDir,
        projectDir: paths.projectDir,
        artifactsDir: paths.artifactsDir,
        runDir: paths.runDir,
        taskDescription: '根据用户回答生成最终需求拆解清单',
        requireToolUse: shouldRequireToolUse(),
      });

      this.currentAgent = finalAgent;
      let finalOutput = '';
      const finalPrompt = buildFinalRequirementDecompositionPrompt(clarified, questions, clarificationAnswers);
      for await (const event of finalAgent.run(finalPrompt)) {
        this.emitStageProgress(node.id, event);
        if (event.type === 'text') finalOutput += event.text;
        if (event.type === 'completed') finalOutput = event.finalText || finalOutput;
        if (event.type === 'error') throw new Error(event.message);
      }
      this.currentAgent = null;

      const finalClarified = finalOutput.trim();
      const finalFileClarified = readTextIfExists(clarifiedPath)?.trim() || finalClarified;
      clarified = isClarifiedMrdContent(finalFileClarified)
        ? finalFileClarified
        : isClarifiedMrdContent(finalClarified)
        ? finalClarified
        : appendClarificationAnswers(clarified, clarificationAnswers, finalClarified);
      if (!isClarifiedMrdContent(finalFileClarified)) {
        fs.writeFileSync(clarifiedPath, clarified, 'utf-8');
      }
    }

    const finalArtifactContent = readTextIfExists(clarifiedPath)?.trim() || clarified;
    if (finalArtifactContent !== clarified) clarified = finalArtifactContent;
    if (!fs.existsSync(clarifiedPath)) fs.writeFileSync(clarifiedPath, clarified, 'utf-8');
    this.emitArtifactWritten(node.id, 'mrd-clarified.md', Buffer.byteLength(clarified, 'utf-8'), '需求拆解与澄清清单');

    const fanoutDecision = deriveFanoutDecision({ manifest, clarifiedMrd: clarified });
    this.writeArtifact(
      paths,
      node.id,
      FANOUT_DECISION_ARTIFACT,
      serializeFanoutDecision(fanoutDecision),
      '项目 Fanout 决策'
    );
    if (this.state.workflowInstance) {
      applyFanoutDecisionToSessionWorkflowInstance({
        instance: this.state.workflowInstance,
        runId: this.runId,
        decision: fanoutDecision,
        artifactPath: FANOUT_DECISION_ARTIFACT_PATH,
      });
    }
    getEventLog(this.runId).logEvent('fanout_decision', {
      nodeId: 'project-fanout',
      artifactPath: FANOUT_DECISION_ARTIFACT_PATH,
      includedProjects: fanoutDecision.includedProjects.map(project => project.name),
      excludedProjects: fanoutDecision.excludedProjects.map(project => project.name),
      unresolvedProjects: fanoutDecision.unresolvedProjects.map(project => project.name),
      confidence: fanoutDecision.confidence,
      fallbackReason: fanoutDecision.fallbackReason,
    }, undefined, 'project-fanout');

    nodeState.outputArtifacts = [
      'artifacts/mrd-clarified.md',
      'artifacts/mrd-clarify-questions.md',
      FANOUT_DECISION_ARTIFACT_PATH,
    ];

    return clarified;
  }

  private tryRecoverMrdRenderFromArtifacts(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    nodeState: NodeState,
    manifest: ProjectManifest
  ): string | null {
    if ((nodeState.failureCount ?? 0) < 2) return null;
    const clarifiedPath = path.join(paths.artifactsDir, 'mrd-clarified.md');
    if (!fs.existsSync(clarifiedPath)) return null;
    const clarified = fs.readFileSync(clarifiedPath, 'utf-8').trim();
    if (!isClarifiedMrdContent(clarified)) return null;

    const questionsPath = path.join(paths.artifactsDir, 'mrd-clarify-questions.md');
    if (!fs.existsSync(questionsPath)) {
      const questions = buildClarifyQuestionsArtifact(clarified, manifest);
      fs.writeFileSync(questionsPath, questions, 'utf-8');
      this.emitArtifactWritten(node.id, 'mrd-clarify-questions.md', Buffer.byteLength(questions, 'utf-8'), '需求拆解待澄清问题');
    }

    const fanoutDecision = deriveFanoutDecision({ manifest, clarifiedMrd: clarified });
    this.writeArtifact(
      paths,
      node.id,
      FANOUT_DECISION_ARTIFACT,
      serializeFanoutDecision(fanoutDecision),
      '项目 Fanout 决策'
    );
    if (this.state.workflowInstance) {
      applyFanoutDecisionToSessionWorkflowInstance({
        instance: this.state.workflowInstance,
        runId: this.runId,
        decision: fanoutDecision,
        artifactPath: FANOUT_DECISION_ARTIFACT_PATH,
      });
    }
    getEventLog(this.runId).logEvent('fanout_decision', {
      nodeId: 'project-fanout',
      artifactPath: FANOUT_DECISION_ARTIFACT_PATH,
      includedProjects: fanoutDecision.includedProjects.map(project => project.name),
      excludedProjects: fanoutDecision.excludedProjects.map(project => project.name),
      unresolvedProjects: fanoutDecision.unresolvedProjects.map(project => project.name),
      confidence: fanoutDecision.confidence,
      fallbackReason: fanoutDecision.fallbackReason,
      recoveredFromArtifacts: true,
    }, undefined, 'project-fanout');

    nodeState.outputArtifacts = [
      'artifacts/mrd-clarified.md',
      'artifacts/mrd-clarify-questions.md',
      FANOUT_DECISION_ARTIFACT_PATH,
    ];
    return clarified;
  }

  private async executeMrdClarifyStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    nodeState: NodeState
  ): Promise<string> {
    const eventLog = getEventLog(this.runId);
    const mrdPath = path.join(paths.artifactsDir, 'mrd.md');
    if (!fs.existsSync(mrdPath)) {
      throw new Error('mrd-clarify requires artifacts/mrd.md from mrd-render');
    }

    const manifest = ensureProjectManifest(paths);
    const mrdContent = fs.readFileSync(mrdPath, 'utf-8');
    const model = getModelForStage(node.id, 0, this.state.modelOverrides);
    const provider = createLLMProvider(model.providerId);
    event_model_selected(this.runId, model, node.id);

    const agentId = nanoid(8);
    nodeState.agentRunId = agentId;
    const agent = new AgentEngine({
      runId: this.runId,
      agentRunId: agentId,
      nodeId: node.id,
      provider,
      model,
      registry: new ToolRegistry(),
      systemPrompt: loadPromptTemplate(node.id),
      maxTurns: node.maxTurns,
      cwd: paths.runDir,
      projectDir: paths.projectDir,
      artifactsDir: paths.artifactsDir,
      runDir: paths.runDir,
      taskDescription: '澄清全局 MRD',
    });

    this.currentAgent = agent;
    let output = '';
    for await (const event of agent.run(buildMrdClarifyPrompt(paths, manifest, mrdContent, nodeState.confirmation?.feedback))) {
      this.emitStageProgress(node.id, event);
      if (event.type === 'text') output += event.text;
      if (event.type === 'completed') output = event.finalText || output;
      if (event.type === 'error') throw new Error(event.message);
    }
    this.currentAgent = null;

    let clarified = output.trim();
    if (!isClarifiedMrdContent(clarified)) {
      clarified = buildFallbackClarifiedMrd(mrdContent, clarified);
    }

    fs.mkdirSync(paths.artifactsDir, { recursive: true });
    const clarifiedPath = path.join(paths.artifactsDir, 'mrd-clarified.md');
    fs.writeFileSync(clarifiedPath, clarified, 'utf-8');
    const clarifiedEvent = {
      nodeId: node.id,
      artifactPath: 'artifacts/mrd-clarified.md',
      size: Buffer.byteLength(clarified, 'utf-8'),
      description: '澄清版 MRD 文档',
    };
    eventLog.logEvent('artifact_written', clarifiedEvent, agentId, node.id);
    this.emit('event', {
      type: 'stage_progress', nodeId: node.id,
      event: { type: 'artifact_written', ...clarifiedEvent },
    } as PipelineEvent);

    const boundaries = buildImplementationBoundaries(clarified, manifest);
    const boundariesPath = path.join(paths.artifactsDir, 'implementation-boundaries.md');
    fs.writeFileSync(boundariesPath, boundaries, 'utf-8');
    const boundariesEvent = {
      nodeId: node.id,
      artifactPath: 'artifacts/implementation-boundaries.md',
      size: Buffer.byteLength(boundaries, 'utf-8'),
      description: '实施边界摘要',
    };
    eventLog.logEvent('artifact_written', boundariesEvent, agentId, node.id);
    this.emit('event', {
      type: 'stage_progress', nodeId: node.id,
      event: { type: 'artifact_written', ...boundariesEvent },
    } as PipelineEvent);

    const questions = buildClarifyQuestionsArtifact(clarified, manifest);
    const questionsPath = path.join(paths.artifactsDir, 'mrd-clarify-questions.md');
    fs.writeFileSync(questionsPath, questions, 'utf-8');
    const questionsEvent = {
      nodeId: node.id,
      artifactPath: 'artifacts/mrd-clarify-questions.md',
      size: Buffer.byteLength(questions, 'utf-8'),
      description: 'MRD 澄清问题清单',
    };
    eventLog.logEvent('artifact_written', questionsEvent, agentId, node.id);
    this.emit('event', {
      type: 'stage_progress', nodeId: node.id,
      event: { type: 'artifact_written', ...questionsEvent },
    } as PipelineEvent);

    nodeState.outputArtifacts = [
      'artifacts/mrd-clarified.md',
      'artifacts/implementation-boundaries.md',
      'artifacts/mrd-clarify-questions.md',
    ];
    return clarified;
  }

  private async executeSimpleAgent(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>
  ): Promise<string> {
    // Select model for this stage
    const model = getModelForStage(node.id, 0, this.state.modelOverrides);
    const provider = createLLMProvider(model.providerId);
    event_model_selected(this.runId, model, node.id);

    // Build prompt from previous stage outputs + prompt template
    const systemPrompt = loadPromptTemplate(node.id);
    const userPrompt = buildStagePrompt(node, paths, {
      feedback: this.state.nodes.find(n => n.id === node.id)?.confirmation?.feedback,
    });

    // Create agent engine (non-ReAct stages don't get full tool access typically,
    // but simple stages for PRD/design generation get read-only tools)
    const agentId = nanoid(8);
    const agentTools = new ToolRegistry();
    agentTools.register(ReadTool);
    agentTools.register(GlobTool);
    agentTools.register(GrepTool);
    registerKnowledgeTools(agentTools);
    // For archive stage, also register write to save the report
    if (node.id === 'archive' || node.id === 'java-review') {
      agentTools.register(WriteTool);
    }

    const agent = new AgentEngine({
      runId: this.runId,
      agentRunId: agentId,
      nodeId: node.id,
      provider,
      model,
      registry: agentTools,
      systemPrompt,
      maxTurns: node.maxTurns,
      cwd: paths.projectDir,
      projectDir: paths.projectDir,
      artifactsDir: paths.artifactsDir,
      runDir: paths.runDir,
    });

    this.currentAgent = agent;

    let output = '';
    for await (const event of agent.run(userPrompt)) {
      this.emitStageProgress(node.id, event);
      if (event.type === 'text') output += event.text;
      if (event.type === 'completed') output = event.finalText || output;
      if (event.type === 'error') throw new Error(event.message);
    }

    this.currentAgent = null;
    return output.trim();
  }

  private async executeSpecStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>
  ): Promise<{ content: string; artifacts: Record<string, string> }> {
    const eventLog = getEventLog(this.runId);
    const model = getModelForStage(node.id, 0, this.state.modelOverrides);
    const provider = createLLMProvider(model.providerId);
    event_model_selected(this.runId, model, node.id);

    const baseSystemPrompt = loadPromptTemplate(node.id);
    const manifest = ensureProjectManifest(paths);
    const baseUserPrompt = buildSpecGeneratePrompt(
      node,
      paths,
      manifest,
      this.state.nodes.find(n => n.id === node.id)?.confirmation?.feedback || '（无）',
    );
    const projects = this.filterProjectsForNode(node.id, detectProjectRoots(paths.projectDir));
    if (shouldUseDocumentationOnlyFallback(projects)) {
      return this.executeDocumentationOnlyImplementationPlanStage(node, paths, projects);
    }
    const runSpecAgent = async (
      project: { name: string; root: string },
      kind: 'dev' | 'test'
    ): Promise<{ projectName: string; kind: 'dev' | 'test'; output: string }> => {
      const agentId = nanoid(8);
      this.recordChildAgent(node.id, agentId);
      const agentTools = new ToolRegistry();
      agentTools.register(ReadTool);
      agentTools.register(WriteTool);
      agentTools.register(GlobTool);
      agentTools.register(GrepTool);
      registerKnowledgeTools(agentTools);
      const taskDescription = kind === 'dev'
        ? `生成 ${project.name} 项目的开发 OpenSpec 任务清单`
        : `生成 ${project.name} 项目的测试 OpenSpec 测试任务清单`;
      const systemPrompt = renderPromptTemplate(loadPromptFile('stage-subtask-system.md'), {
        base_system_prompt: baseSystemPrompt,
        task_description: taskDescription,
        project_name: project.name,
        project_root: project.root,
      });
      const techDesignPath = path.join(paths.artifactsDir, project.name, 'tech-design.md');
      const techDesign = fs.existsSync(techDesignPath)
        ? fs.readFileSync(techDesignPath, 'utf-8')
        : '';
      const userPrompt = renderPromptTemplate(loadPromptFile(
        kind === 'dev' ? 'spec-generate-dev-user.md' : 'spec-generate-test-user.md'
      ), {
        base_context: baseUserPrompt,
        project_name: project.name,
        project_root: project.root,
        tech_design: techDesign.slice(0, 30000),
        project_context: buildProjectStagePromptVariables(paths, project).project_context,
      });

      const agent = new AgentEngine({
        runId: this.runId,
        agentRunId: agentId,
        nodeId: node.id,
        provider,
        model,
        registry: agentTools,
        systemPrompt,
        maxTurns: node.maxTurns,
        cwd: project.root,
        projectDir: project.root,
        artifactsDir: paths.artifactsDir,
        runDir: paths.runDir,
        projectName: project.name,
        taskDescription,
        requireToolUse: shouldRequireToolUse(),
      });

      let output = '';
      for await (const event of agent.run(userPrompt)) {
        this.emitStageProgress(node.id, event);
        if (event.type === 'text') output += event.text;
        if (event.type === 'completed') output = event.finalText || output;
        if (event.type === 'error') throw new Error(`${taskDescription}失败：${event.message}`);
      }
      return { projectName: project.name, kind, output: output.trim() };
    };

    const results = await Promise.all(projects.flatMap(project => [
      runSpecAgent(project, 'dev'),
      runSpecAgent(project, 'test'),
    ]));

    const artifacts: Record<string, string> = {
    };
    const manifestProjects: Array<{
      project: string;
      devSpec: string;
      testSpec: string;
      openSpecChange: {
        changeId: string;
        proposal: string;
        design: string;
        tasks: string;
        spec: string;
      };
      devSummary: string;
      testSummary: string;
    }> = [];
    for (const project of projects) {
      const devArtifactPath = path.join(paths.artifactsDir, project.name, 'openspec-task.md');
      const testArtifactPath = path.join(paths.artifactsDir, project.name, 'openspec-test-task.md');
      const techDesign = readTextIfExists(path.join(paths.artifactsDir, project.name, 'tech-design.md')) || '';
      const dev = normalizeMarkdownArtifact(
        readTextIfExists(devArtifactPath) ||
          results.find(item => item.projectName === project.name && item.kind === 'dev')?.output || '',
        `${project.name} 开发 OpenSpec 任务清单`,
        loadOutputTemplate('spec-dev-fallback.md'),
      );
      const test = normalizeMarkdownArtifact(
        readTextIfExists(testArtifactPath) ||
          results.find(item => item.projectName === project.name && item.kind === 'test')?.output || '',
        `${project.name} 测试 OpenSpec 测试任务清单`,
        loadOutputTemplate('spec-test-fallback.md'),
      );
      if (process.env.AI_CODING_MOCK_LLM !== '1') {
        if (!isUsableSpecArtifact(dev, 'dev')) {
          throw new Error(`${project.name} 开发 OpenSpec 输出无效：未形成可执行任务清单。`);
        }
        if (!isUsableSpecArtifact(test, 'test')) {
          throw new Error(`${project.name} 测试 OpenSpec 输出无效：未形成可执行测试任务清单。`);
        }
      }
      const projectArtifactDir = path.join(paths.artifactsDir, project.name);
      fs.mkdirSync(projectArtifactDir, { recursive: true });
      const openSpecChange = writeProjectOpenSpecChange({
        paths,
        runId: this.runId,
        projectName: project.name,
        projectRoot: project.root,
        developmentTasks: dev,
        testTasks: test,
        prdSummary: summarizeMarkdown(readTextIfExists(path.join(paths.artifactsDir, 'prd.md')) || '', 800),
        techDesignSummary: summarizeMarkdown(techDesign, 800),
      });
      artifacts[`${project.name}/openspec-task.md`] = dev;
      artifacts[`${project.name}/openspec-test-task.md`] = test;
      artifacts[openSpecChange.proposalPath] = readTextIfExists(path.join(paths.artifactsDir, openSpecChange.proposalPath)) || '';
      artifacts[openSpecChange.designPath] = readTextIfExists(path.join(paths.artifactsDir, openSpecChange.designPath)) || '';
      artifacts[openSpecChange.tasksPath] = readTextIfExists(path.join(paths.artifactsDir, openSpecChange.tasksPath)) || '';
      artifacts[openSpecChange.specPath] = readTextIfExists(path.join(paths.artifactsDir, openSpecChange.specPath)) || '';
      manifestProjects.push({
        project: project.name,
        devSpec: `artifacts/${project.name}/openspec-task.md`,
        testSpec: `artifacts/${project.name}/openspec-test-task.md`,
        openSpecChange: {
          changeId: openSpecChange.changeId,
          proposal: `artifacts/${openSpecChange.proposalPath}`,
          design: `artifacts/${openSpecChange.designPath}`,
          tasks: `artifacts/${openSpecChange.tasksPath}`,
          spec: `artifacts/${openSpecChange.specPath}`,
        },
        devSummary: summarizeMarkdown(dev),
        testSummary: summarizeMarkdown(test),
      });
    }
    artifacts['spec-manifest.json'] = JSON.stringify({
      nodeId: 'spec-generate',
      implementationPlanManifest: 'artifacts/implementation-plan-manifest.json',
      projects: manifestProjects,
    }, null, 2);

    for (const [file, content] of Object.entries(artifacts)) {
      const artifactPath = path.join(paths.artifactsDir, file);
      fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
      fs.writeFileSync(artifactPath, content, 'utf-8');
      this.emitArtifactWritten(
        node.id,
        file,
        Buffer.byteLength(content, 'utf-8'),
        file === 'spec-manifest.json'
          ? 'Spec 产物索引'
          : file.endsWith('openspec-test-task.md')
            ? '测试 OpenSpec 测试任务清单'
            : '开发 OpenSpec 任务清单'
      );
    }

    return {
      artifacts,
      content: buildSpecConfirmationContent(manifestProjects),
    };
  }

  private async executeImplementationPlanStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>
  ): Promise<{ content: string; artifacts: Record<string, string> }> {
    const model = getModelForStage(node.id, 0, this.state.modelOverrides);
    const provider = createLLMProvider(model.providerId);
    event_model_selected(this.runId, model, node.id);

    const eventLog = getEventLog(this.runId);
    const baseSystemPrompt = loadPromptTemplate(node.id);
    const manifest = ensureProjectManifest(paths);
    const baseUserPrompt = buildImplementationPlanPrompt(
      node,
      paths,
      manifest,
      this.state.nodes.find(n => n.id === node.id)?.confirmation?.feedback || '（无）',
    );
    const projects = this.filterProjectsForNode(node.id, detectProjectRoots(paths.projectDir));
    if (shouldUseDocumentationOnlyFallback(projects)) {
      return this.executeDocumentationOnlySpecStage(node, paths, projects);
    }

    const runSimpleAgent = async (
      taskDescription: string,
      userPrompt: string,
      project?: { name: string; root: string },
    ): Promise<{ output: string; agentId: string }> => {
      const agentId = nanoid(8);
      this.recordChildAgent(node.id, agentId);
      const agentTools = new ToolRegistry();
      registerKnowledgeTools(agentTools);
      agentTools.register(ReadTool);
      agentTools.register(WriteTool);
      agentTools.register(GlobTool);
      agentTools.register(GrepTool);
      const systemPrompt = project
        ? renderPromptTemplate(loadPromptFile('stage-subtask-system.md'), {
            base_system_prompt: baseSystemPrompt,
            task_description: taskDescription,
            project_name: project.name,
            project_root: project.root,
          })
        : renderPromptTemplate(loadPromptFile('stage-global-subtask-system.md'), {
            base_system_prompt: baseSystemPrompt,
            task_description: taskDescription,
          });

      const agent = new AgentEngine({
        runId: this.runId,
        agentRunId: agentId,
        nodeId: node.id,
        provider,
        model,
        registry: agentTools,
        systemPrompt,
        maxTurns: node.maxTurns,
        cwd: project?.root || paths.projectDir,
        projectDir: project?.root || paths.projectDir,
        artifactsDir: paths.artifactsDir,
        runDir: paths.runDir,
        projectName: project?.name,
        taskDescription,
        requireToolUse: shouldRequireToolUse(),
      });

      let output = '';
      for await (const event of agent.run(userPrompt)) {
        this.emitStageProgress(node.id, event);
        if (event.type === 'text') output += event.text;
        if (event.type === 'completed') output = event.finalText || output;
        if (event.type === 'error') throw new Error(`${taskDescription}失败：${event.message}`);
      }
      return { output: output.trim(), agentId };
    };

    const prdResult = await runSimpleAgent(
      '生成 PRD / 验收口径',
      renderPromptTemplate(loadPromptFile('implementation-plan-prd-user.md'), {
        base_context: baseUserPrompt,
      }),
    );
    const prd = normalizeMarkdownArtifact(
      readTextIfExists(path.join(paths.artifactsDir, 'prd.md')) || prdResult.output,
      'PRD / 验收口径',
      loadOutputTemplate('prd-fallback.md'),
    );

    const techResults = await Promise.all(projects.map(async project => ({
      project,
      result: await runSimpleAgent(
        `生成 ${project.name} 项目文件夹的技术方案`,
        renderPromptTemplate(loadPromptFile('implementation-plan-tech-user.md'), {
          base_context: baseUserPrompt,
          project_name: project.name,
          project_root: project.root,
          project_context: buildProjectStagePromptVariables(paths, project).project_context,
        }),
        project,
      ),
    })));

    const artifacts: Record<string, string> = {
      'prd.md': prd,
    };
    const manifestProjects: Array<{
      project: string;
      artifact: string;
      summary: string;
      riskLevel: string;
    }> = [];
    for (const { project, result } of techResults) {
      const content = normalizeMarkdownArtifact(
        readTextIfExists(path.join(paths.artifactsDir, project.name, 'tech-design.md')) || result.output,
        `${project.name} 技术方案`,
        renderPromptTemplate(loadOutputTemplate('tech-design-fallback.md'), {
          project_name: project.name,
        }),
      );
      if (process.env.AI_CODING_MOCK_LLM !== '1' && !isUsableTechDesign(content)) {
        throw new Error(`${project.name} 技术方案输出无效：模型只返回了计划或内容过短，未形成可用技术方案。`);
      }
      artifacts[`${project.name}/tech-design.md`] = content;
      manifestProjects.push({
        project: project.name,
        artifact: `artifacts/${project.name}/tech-design.md`,
        summary: summarizeMarkdown(content),
        riskLevel: inferRiskLevel(content),
      });
    }
    const manifestArtifact = {
      nodeId: 'implementation-plan',
      prd: 'artifacts/prd.md',
      confirmedBoundaries: fs.existsSync(path.join(paths.artifactsDir, 'implementation-boundaries.md'))
        ? 'artifacts/implementation-boundaries.md'
        : undefined,
      projects: manifestProjects,
    };
    artifacts['implementation-plan-manifest.json'] = JSON.stringify(manifestArtifact, null, 2);

    for (const [file, content] of Object.entries(artifacts)) {
      const artifactPath = path.join(paths.artifactsDir, file);
      fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
      fs.writeFileSync(artifactPath, content, 'utf-8');
      this.emitArtifactWritten(
        node.id,
        file,
        Buffer.byteLength(content, 'utf-8'),
        file === 'prd.md'
          ? 'PRD / 验收口径'
          : file === 'implementation-plan-manifest.json'
            ? '实施方案产物索引'
            : '项目级技术方案'
      );
    }

    return {
      artifacts,
      content: buildImplementationPlanConfirmationContent(prd, manifestProjects, paths),
    };
  }

  private async executeJavaImplStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    nodeState: NodeState
  ): Promise<{ content: string; artifacts: Record<string, string> }> {
    const projects = this.filterProjectsForNode(node.id, detectProjectRoots(paths.projectDir));
    if (shouldUseDocumentationOnlyFallback(projects)) {
      return this.executeDocumentationOnlyJavaImplStage(node, paths, projects);
    }
    const results = await this.runProjectStageTasks(node, projects, async project => {
      const artifacts: Record<string, string> = {};
      const before = snapshotProjectFiles(project.root, JAVA_MAIN_CHANGE_PATTERN);
      const userPrompt = renderPromptTemplate(loadPromptFile('java-impl-user.md'), {
        ...buildProjectStagePromptVariables(paths, project),
        feedback: nodeState.confirmation?.feedback || '（无）',
      });

      const result = await this.runProjectAgent(node, paths, project, userPrompt, {
        nodeState,
        enablePlanMode: false,
        registry: createProjectToolRegistry('code'),
      });
      const after = snapshotProjectFiles(project.root, JAVA_MAIN_CHANGE_PATTERN);
      let changedFiles = diffProjectSnapshots(before, after);
      if (!changedFiles.length && process.env.AI_CODING_MOCK_LLM === '1') {
        changedFiles = [mockChangedJavaFile(project.name)];
      }
      if (!changedFiles.length && process.env.AI_CODING_MOCK_LLM !== '1') {
        changedFiles = [buildVirtualJavaImplementationFile(project.name, result.output)];
      }
      const openspecTaskPath = `${project.name}/openspec-task.md`;
      const openspecTaskAbsPath = path.join(paths.artifactsDir, openspecTaskPath);
      if (fs.existsSync(openspecTaskAbsPath)) {
        const currentTask = fs.readFileSync(openspecTaskAbsPath, 'utf-8');
        const completedTask = markMarkdownTasksCompleted(currentTask);
        if (completedTask !== currentTask) {
          artifacts[openspecTaskPath] = completedTask;
          this.writeArtifact(paths, node.id, openspecTaskPath, completedTask, '开发任务清单完成状态');
        }
      }
      const openSpecTasks = markProjectOpenSpecTasksCompleted({
        paths,
        runId: this.runId,
        projectName: project.name,
        section: 'development',
      });
      if (openSpecTasks?.updated) {
        artifacts[openSpecTasks.tasksPath] = fs.readFileSync(path.join(paths.artifactsDir, openSpecTasks.tasksPath), 'utf-8');
        this.emitArtifactWritten(
          node.id,
          openSpecTasks.tasksPath,
          fs.statSync(path.join(paths.artifactsDir, openSpecTasks.tasksPath)).size,
          'OpenSpec 开发任务完成状态'
        );
      }
      const written = this.writeCodeChangeArtifacts(paths, node.id, project.name, changedFiles);
      Object.assign(artifacts, written.artifacts);

      const reviewPrompt = renderPromptTemplate(loadPromptFile('java-review-user.md'), {
        ...buildProjectStagePromptVariables(paths, project),
      });
      const reviewResult = await this.runProjectAgent(node, paths, project, reviewPrompt, {
        registry: createProjectToolRegistry('read'),
        promptTemplateId: 'java-review',
        modelStageId: 'java-review',
        taskDescription: `评审 ${project.name} 项目文件夹的 Java 变更`,
        requireToolUse: false,
      });
      const report = normalizeMarkdownArtifact(
        reviewResult.output,
        `${project.name} 代码评审`,
        renderPromptTemplate(loadOutputTemplate('java-review-fallback.md'), {
          project_name: project.name,
        }),
      );
      const findings = buildReviewFindings(project.name, report);
      const reportPath = `${project.name}/code-review.md`;
      const findingsPath = `${project.name}/review-findings.json`;
      artifacts[reportPath] = report;
      artifacts[findingsPath] = JSON.stringify(findings, null, 2);
      this.writeArtifact(paths, node.id, reportPath, report, '项目级代码评审报告');
      this.writeArtifact(paths, node.id, findingsPath, artifacts[findingsPath], '项目级代码评审结构化问题');

      const summary: ProjectStageSummary = {
        project: project.name,
        title: `${project.name} Java 实现`,
        artifactPaths: [...written.paths, `artifacts/${reportPath}`, `artifacts/${findingsPath}`],
        summary: changedFiles.length
          ? `${changedFiles.length} 个主代码文件发生变更；代码评审结果：${findings.result}。`
          : `未检测到主代码文件变更；代码评审结果：${findings.result}。`,
      };
      return {
        artifacts,
        summary,
      };
    });

    const artifacts = Object.assign({}, ...results.map(result => result.artifacts));
    const summaries = results.map(result => result.summary);

    return {
      artifacts,
      content: buildProjectStageConfirmationContent('Java 实现结果', summaries),
    };
  }

  private async executeJavaReviewStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>
  ): Promise<{ content: string; artifacts: Record<string, string> }> {
    const projects = this.filterProjectsForNode(node.id, detectProjectRoots(paths.projectDir));
    if (shouldUseDocumentationOnlyFallback(projects)) {
      return this.executeDocumentationOnlyTestCodeStage(node, paths, projects);
    }
    const artifacts: Record<string, string> = {};
    const summaries: ProjectStageSummary[] = [];

    for (const project of projects) {
      const userPrompt = renderPromptTemplate(loadPromptFile('java-review-user.md'), {
        ...buildProjectStagePromptVariables(paths, project),
      });
      const result = await this.runProjectAgent(node, paths, project, userPrompt, {
        registry: createProjectToolRegistry('read'),
      });
      const report = normalizeMarkdownArtifact(
        result.output,
        `${project.name} 代码评审`,
        renderPromptTemplate(loadOutputTemplate('java-review-fallback.md'), {
          project_name: project.name,
        }),
      );
      const findings = buildReviewFindings(project.name, report);
      const reportPath = `${project.name}/code-review.md`;
      const findingsPath = `${project.name}/review-findings.json`;
      artifacts[reportPath] = report;
      artifacts[findingsPath] = JSON.stringify(findings, null, 2);
      this.writeArtifact(paths, node.id, reportPath, report, '项目级代码评审报告');
      this.writeArtifact(paths, node.id, findingsPath, artifacts[findingsPath], '项目级代码评审结构化问题');
      summaries.push({
        project: project.name,
        title: `${project.name} 代码评审`,
        artifactPaths: [`artifacts/${reportPath}`, `artifacts/${findingsPath}`],
        summary: `${findings.result}: ${summarizeMarkdown(report, 360)}`,
      });
    }

    return {
      artifacts,
      content: buildProjectStageConfirmationContent('代码评审确认', summaries),
    };
  }

  private executeDocumentationOnlyImplementationPlanStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    projects: Array<{ name: string; root: string }>
  ): { content: string; artifacts: Record<string, string> } {
    const clarified = readTextIfExists(path.join(paths.artifactsDir, 'mrd-clarified.md')) || '';
    const prd = readTextIfExists(path.join(paths.artifactsDir, 'prd.md')) ||
      buildDocumentationOnlyPrd(clarified);
    const artifacts: Record<string, string> = { 'prd.md': prd };
    const manifestProjects: Array<{ project: string; artifact: string; summary: string; riskLevel: string }> = [];

    for (const project of projects) {
      const techDesign = buildDocumentationOnlyTechDesign(project.name, clarified, listProjectFiles(project.root, 2));
      artifacts[`${project.name}/tech-design.md`] = techDesign;
      manifestProjects.push({
        project: project.name,
        artifact: `artifacts/${project.name}/tech-design.md`,
        summary: summarizeMarkdown(techDesign),
        riskLevel: 'medium',
      });
    }
    artifacts['implementation-plan-manifest.json'] = JSON.stringify({
      nodeId: 'implementation-plan',
      prd: 'artifacts/prd.md',
      projects: manifestProjects,
      fallbackReason: 'documentation-only-projects',
    }, null, 2);

    for (const [file, content] of Object.entries(artifacts)) {
      this.writeArtifact(paths, node.id, file, content, file === 'prd.md' ? 'PRD / 验收口径' : '文档型项目实施方案');
    }
    return {
      artifacts,
      content: buildImplementationPlanConfirmationContent(prd, manifestProjects, paths),
    };
  }

  private executeDocumentationOnlySpecStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    projects: Array<{ name: string; root: string }>
  ): { content: string; artifacts: Record<string, string> } {
    const artifacts: Record<string, string> = {};
    const manifestProjects: Array<{
      project: string;
      devSpec: string;
      testSpec: string;
      openSpecChange: { changeId: string; proposal: string; design: string; tasks: string; spec: string };
      devSummary: string;
      testSummary: string;
    }> = [];
    const prdSummary = summarizeMarkdown(readTextIfExists(path.join(paths.artifactsDir, 'prd.md')) || '', 800);

    for (const project of projects) {
      const techDesign = readTextIfExists(path.join(paths.artifactsDir, project.name, 'tech-design.md')) || '';
      const dev = buildDocumentationOnlyDevSpec(project.name);
      const test = buildDocumentationOnlyTestSpec(project.name);
      const openSpecChange = writeProjectOpenSpecChange({
        paths,
        runId: this.runId,
        projectName: project.name,
        projectRoot: project.root,
        developmentTasks: dev,
        testTasks: test,
        prdSummary,
        techDesignSummary: summarizeMarkdown(techDesign, 800),
      });
      artifacts[`${project.name}/openspec-task.md`] = dev;
      artifacts[`${project.name}/openspec-test-task.md`] = test;
      artifacts[openSpecChange.proposalPath] = readTextIfExists(path.join(paths.artifactsDir, openSpecChange.proposalPath)) || '';
      artifacts[openSpecChange.designPath] = readTextIfExists(path.join(paths.artifactsDir, openSpecChange.designPath)) || '';
      artifacts[openSpecChange.tasksPath] = readTextIfExists(path.join(paths.artifactsDir, openSpecChange.tasksPath)) || '';
      artifacts[openSpecChange.specPath] = readTextIfExists(path.join(paths.artifactsDir, openSpecChange.specPath)) || '';
      manifestProjects.push({
        project: project.name,
        devSpec: `artifacts/${project.name}/openspec-task.md`,
        testSpec: `artifacts/${project.name}/openspec-test-task.md`,
        openSpecChange: {
          changeId: openSpecChange.changeId,
          proposal: `artifacts/${openSpecChange.proposalPath}`,
          design: `artifacts/${openSpecChange.designPath}`,
          tasks: `artifacts/${openSpecChange.tasksPath}`,
          spec: `artifacts/${openSpecChange.specPath}`,
        },
        devSummary: summarizeMarkdown(dev),
        testSummary: summarizeMarkdown(test),
      });
    }
    artifacts['spec-manifest.json'] = JSON.stringify({
      nodeId: 'spec-generate',
      projects: manifestProjects,
      fallbackReason: 'documentation-only-projects',
    }, null, 2);

    for (const [file, content] of Object.entries(artifacts)) {
      this.writeArtifact(paths, node.id, file, content, file === 'spec-manifest.json' ? 'Spec 产物索引' : '文档型项目 OpenSpec 任务');
    }
    return { artifacts, content: buildSpecConfirmationContent(manifestProjects) };
  }

  private executeDocumentationOnlyJavaImplStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    projects: Array<{ name: string; root: string }>
  ): { content: string; artifacts: Record<string, string> } {
    const artifacts: Record<string, string> = {};
    const summaries: ProjectStageSummary[] = [];
    for (const project of projects) {
      this.markProjectForNode(node.id, project.name, 'running');
      const virtualFile = buildVirtualJavaImplementationFile(project.name, readTextIfExists(path.join(paths.artifactsDir, project.name, 'tech-design.md')) || '');
      const written = this.writeCodeChangeArtifacts(paths, node.id, project.name, [virtualFile]);
      Object.assign(artifacts, written.artifacts);
      const report = buildDocumentationOnlyReview(project.name);
      const findings = buildReviewFindings(project.name, report);
      const reportPath = `${project.name}/code-review.md`;
      const findingsPath = `${project.name}/review-findings.json`;
      artifacts[reportPath] = report;
      artifacts[findingsPath] = JSON.stringify(findings, null, 2);
      this.writeArtifact(paths, node.id, reportPath, report, '文档型项目代码评审报告');
      this.writeArtifact(paths, node.id, findingsPath, artifacts[findingsPath], '文档型项目代码评审结构化问题');
      summaries.push({
        project: project.name,
        title: `${project.name} Java 实现建议`,
        artifactPaths: [...written.paths, `artifacts/${reportPath}`, `artifacts/${findingsPath}`],
        summary: '项目缺少可直接修改的 Java/Maven 源码，已生成 traceKey 落地建议和伪代码预览。',
      });
      this.markProjectForNode(node.id, project.name, 'completed');
    }
    return { artifacts, content: buildProjectStageConfirmationContent('Java 实现结果', summaries) };
  }

  private executeDocumentationOnlyTestCodeStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    projects: Array<{ name: string; root: string }>
  ): { content: string; artifacts: Record<string, string> } {
    const artifacts: Record<string, string> = {};
    const summaries: ProjectStageSummary[] = [];
    for (const project of projects) {
      this.markProjectForNode(node.id, project.name, 'running');
      const virtualTest = buildVirtualTestImplementationFile(project.name, readTextIfExists(path.join(paths.artifactsDir, project.name, 'openspec-test-task.md')) || '');
      const written = this.writeTestCodeArtifacts(paths, node.id, project.name, [virtualTest], buildDocumentationOnlyTestReport(project.name));
      Object.assign(artifacts, written.artifacts);
      const testRunArtifacts = this.writeMavenTestArtifacts(paths, node.id, project.name, [
        '# Maven 单元测试执行结果',
        '',
        `项目 ${project.name} 未检测到 pom.xml，Maven 测试跳过。`,
        '已生成测试建议与伪代码预览，待真实源码接入后执行。',
      ].join('\n'));
      Object.assign(artifacts, testRunArtifacts.artifacts);
      summaries.push({
        project: project.name,
        title: `${project.name} 测试代码建议`,
        artifactPaths: [...written.paths, ...testRunArtifacts.paths],
        summary: '项目缺少 Maven 工程，已生成 traceKey 测试建议并将 Maven 执行标记为 skipped。',
      });
      this.markProjectForNode(node.id, project.name, 'completed');
    }
    return { artifacts, content: buildProjectStageConfirmationContent('测试代码生成结果', summaries) };
  }

  private async executeTestCodeGenerateStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    nodeState: NodeState
  ): Promise<{ content: string; artifacts: Record<string, string> }> {
    const projects = this.filterProjectsForNode(node.id, detectProjectRoots(paths.projectDir));
    const results = await this.runProjectStageTasks(node, projects, async project => {
      const artifacts: Record<string, string> = {};
      const before = snapshotProjectFiles(project.root, JAVA_TEST_CHANGE_PATTERN);
      const userPrompt = renderPromptTemplate(loadPromptFile('testcode-generate-user.md'), {
        ...buildProjectStagePromptVariables(paths, project),
        feedback: nodeState.confirmation?.feedback || '（无）',
      });
      const result = await this.runProjectAgent(node, paths, project, userPrompt, {
        nodeState,
        registry: createProjectToolRegistry('code'),
      });
      const after = snapshotProjectFiles(project.root, JAVA_TEST_CHANGE_PATTERN);
      let changedTests = diffProjectSnapshots(before, after);
      if (!changedTests.length && process.env.AI_CODING_MOCK_LLM === '1') {
        changedTests = [mockChangedTestFile(project.name)];
      }
      if (!changedTests.length && process.env.AI_CODING_MOCK_LLM !== '1') {
        changedTests = [buildVirtualTestImplementationFile(project.name, result.output)];
      }
      const written = this.writeTestCodeArtifacts(paths, node.id, project.name, changedTests, result.output);
      Object.assign(artifacts, written.artifacts);

      let mavenOutput = '';
      if (!fs.existsSync(path.join(project.root, 'pom.xml')) && process.env.AI_CODING_MOCK_LLM !== '1') {
        mavenOutput = [
          '# Maven 单元测试执行结果',
          '',
          `项目 ${project.name} 未检测到 pom.xml，当前输入更像技术文档或非 Maven 工程。`,
          '本节点已生成测试落地建议和伪代码预览，Maven 执行状态标记为 skipped。',
        ].join('\n');
      } else {
        const runnerPrompt = renderPromptTemplate(loadPromptFile('maven-test-runner-user.md'), {
          ...buildProjectStagePromptVariables(paths, project),
          feedback: nodeState.confirmation?.feedback || '（无）',
        });
        const runnerResult = await this.runProjectAgent(node, paths, project, runnerPrompt, {
          nodeState,
          registry: createProjectToolRegistry('runner'),
          promptTemplateId: 'maven-test-runner',
          modelStageId: 'maven-test-runner',
          taskDescription: `执行 ${project.name} 项目文件夹的 Maven 单元测试`,
          requireToolUse: process.env.AI_CODING_MOCK_LLM !== '1',
        });
        mavenOutput = runnerResult.toolResults
          .filter(item => item.name === 'maven_test')
          .map(item => item.result)
          .join('\n\n') || runnerResult.output;
        if (process.env.AI_CODING_MOCK_LLM !== '1' && !runnerResult.toolNames.includes('maven_test')) {
          const fallback = await this.runMavenTestFallback(node, paths, project);
          mavenOutput = [
            'Runner Agent 未调用 maven_test，Pipeline 已兜底执行真实 Maven 单元测试。',
            fallback.content,
          ].join('\n\n');
        }
      }
      const testRunArtifacts = this.writeMavenTestArtifacts(paths, node.id, project.name, mavenOutput);
      Object.assign(artifacts, testRunArtifacts.artifacts);
      const openSpecTasks = markProjectOpenSpecTasksCompleted({
        paths,
        runId: this.runId,
        projectName: project.name,
        section: 'test',
      });
      if (openSpecTasks?.updated) {
        artifacts[openSpecTasks.tasksPath] = fs.readFileSync(path.join(paths.artifactsDir, openSpecTasks.tasksPath), 'utf-8');
        this.emitArtifactWritten(
          node.id,
          openSpecTasks.tasksPath,
          fs.statSync(path.join(paths.artifactsDir, openSpecTasks.tasksPath)).size,
          'OpenSpec 测试任务完成状态'
        );
      }

      const summary: ProjectStageSummary = {
        project: project.name,
        title: `${project.name} 测试代码`,
        artifactPaths: [...written.paths, ...testRunArtifacts.paths],
        summary: changedTests.length
          ? `${changedTests.length} 个测试文件发生变更；已执行 Maven 单元测试。`
          : '未检测到测试代码文件变更；已执行 Maven 单元测试。',
      };
      return {
        artifacts,
        summary,
      };
    }, { concurrency: getConfig().workflow.branchConcurrency });

    const artifacts = Object.assign({}, ...results.map(result => result.artifacts));
    const summaries = results.map(result => result.summary);

    return {
      artifacts,
      content: buildProjectStageConfirmationContent('测试代码生成结果', summaries),
    };
  }

  private async executeMavenTestRunnerStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    nodeState: NodeState
  ): Promise<{ content: string; artifacts: Record<string, string> }> {
    const projects = this.filterProjectsForNode(node.id, detectProjectRoots(paths.projectDir));
    const artifacts: Record<string, string> = {};
    const summaries: ProjectStageSummary[] = [];

    for (const project of projects) {
      const userPrompt = renderPromptTemplate(loadPromptFile('maven-test-runner-user.md'), {
        ...buildProjectStagePromptVariables(paths, project),
        feedback: nodeState.confirmation?.feedback || '（无）',
      });
      const result = await this.runProjectAgent(node, paths, project, userPrompt, {
        nodeState,
        registry: createProjectToolRegistry('runner'),
      });
      let mavenOutput = result.toolResults
        .filter(item => item.name === 'maven_test')
        .map(item => item.result)
        .join('\n\n') || result.output;
      if (process.env.AI_CODING_MOCK_LLM !== '1' && !result.toolNames.includes('maven_test')) {
        const fallback = await this.runMavenTestFallback(node, paths, project);
        mavenOutput = [
          'Runner Agent 未调用 maven_test，Pipeline 已兜底执行真实 Maven 单元测试。',
          fallback.content,
        ].join('\n\n');
      }
      const written = this.writeMavenTestArtifacts(paths, node.id, project.name, mavenOutput);
      Object.assign(artifacts, written.artifacts);
      summaries.push({
        project: project.name,
        title: `${project.name} 单元测试执行`,
        artifactPaths: written.paths,
        summary: summarizeMarkdown(written.artifacts[`${project.name}/test-report.md`], 420),
      });
    }

    return {
      artifacts,
      content: buildProjectStageConfirmationContent('单元测试执行确认', summaries),
    };
  }

  private async runMavenTestFallback(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    project: { name: string; root: string }
  ): Promise<ToolResult> {
    const agentRunId = nanoid(8);
    this.recordChildAgent(node.id, agentRunId);
    const registry = createProjectToolRegistry('runner');
    return executeToolChain({
      toolName: 'maven_test',
      toolInput: {},
      registry,
      context: {
        runId: this.runId,
        agentRunId,
        nodeId: node.id,
        cwd: project.root,
        projectDir: project.root,
        artifactsDir: paths.artifactsDir,
        runDir: paths.runDir,
        canUseTool: async () => 'allow',
      },
    });
  }

  private async executeArchiveStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>
  ): Promise<{ content: string; artifacts: Record<string, string> }> {
    const projects = this.filterProjectsForNode(node.id, detectProjectRoots(paths.projectDir));
    const artifacts: Record<string, string> = {};
    const summaries: ProjectStageSummary[] = [];

    for (const project of projects) {
      const userPrompt = renderPromptTemplate(loadPromptFile('archive-user.md'), {
        ...buildProjectStagePromptVariables(paths, project),
      });
      const result = await this.runProjectAgent(node, paths, project, userPrompt, {
        registry: createProjectToolRegistry('artifact'),
        requireToolUse: process.env.AI_CODING_MOCK_LLM !== '1',
      });
      const reportPath = `${project.name}/archive-report.md`;
      const reportAbsPath = path.join(paths.artifactsDir, reportPath);
      let report = fs.existsSync(reportAbsPath)
        ? normalizeMarkdownArtifact(
          fs.readFileSync(reportAbsPath, 'utf-8'),
          `${project.name} 归档报告`,
          renderPromptTemplate(loadOutputTemplate('archive-report-fallback.md'), {
            project_name: project.name,
          }),
        )
        : normalizeMarkdownArtifact(
          result.output,
          `${project.name} 归档报告`,
          renderPromptTemplate(loadOutputTemplate('archive-report-fallback.md'), {
            project_name: project.name,
          }),
        );
      if (!report.includes('## 流水线执行指标')) {
        report = `${report.trimEnd()}\n\n${buildArchiveExecutionMetrics(paths, project.name)}\n`;
        fs.mkdirSync(path.dirname(reportAbsPath), { recursive: true });
        fs.writeFileSync(reportAbsPath, report, 'utf-8');
        this.emitArtifactWritten(node.id, reportPath, Buffer.byteLength(report, 'utf-8'), '项目级归档报告（含执行指标）');
      }
      artifacts[reportPath] = report;
      if (!fs.existsSync(reportAbsPath)) {
        this.writeArtifact(paths, node.id, reportPath, report, '项目级归档报告');
      }
      summaries.push({
        project: project.name,
        title: `${project.name} 归档`,
        artifactPaths: [`artifacts/${reportPath}`],
        summary: summarizeMarkdown(report, 360),
      });
      const branchSummaryArtifact = this.writeBranchSummary(paths, node.id, project.name);
      if (branchSummaryArtifact) {
        const relativeSummaryPath = branchSummaryArtifact.replace(/^artifacts\//, '');
        artifacts[relativeSummaryPath] = fs.readFileSync(path.join(paths.artifactsDir, relativeSummaryPath), 'utf-8');
        summaries[summaries.length - 1].artifactPaths.push(branchSummaryArtifact);
      }
    }

    const crossAppArtifacts = this.writeLegacyCrossAppReviewArtifacts(paths);
    Object.assign(artifacts, crossAppArtifacts);

    const zipArtifact = createProjectsZip(paths, this.runId, projects.map(project => project.name));
    const archiveManifest = {
      nodeId: 'archive',
      projects: summaries.map(summary => ({
        project: summary.project,
        report: summary.artifactPaths[0],
      })),
      crossAppReview: {
        codeReview: crossAppArtifacts['cross-app/code-review-findings.json'] ? 'artifacts/cross-app/code-review-findings.json' : undefined,
        integrationReview: crossAppArtifacts['cross-app/integration-review-findings.json'] ? 'artifacts/cross-app/integration-review-findings.json' : undefined,
        deliveryMetadata: crossAppArtifacts['cross-app/delivery-metadata.json'] ? 'artifacts/cross-app/delivery-metadata.json' : undefined,
      },
      download: zipArtifact ? `artifacts/${zipArtifact}` : undefined,
      generatedAt: new Date().toISOString(),
    };
    artifacts['archive-manifest.json'] = JSON.stringify(archiveManifest, null, 2);
    this.writeArtifact(paths, node.id, 'archive-manifest.json', artifacts['archive-manifest.json'], '归档产物索引');
    if (zipArtifact) {
      const zipPath = path.join(paths.artifactsDir, zipArtifact);
      this.emitArtifactWritten(node.id, zipArtifact, fs.statSync(zipPath).size, '项目文件夹下载包');
    }

    return {
      artifacts,
      content: buildProjectStageConfirmationContent('归档结果', summaries),
    };
  }

  private writeBranchSummary(
    paths: ReturnType<typeof getRunPaths>,
    nodeId: string,
    projectName: string
  ): string | null {
    const branch = this.state.workflowInstance?.branches?.find(item => item.projectName === projectName);
    if (!branch) return null;
    const branchArtifacts = Object.values(branch.artifactIndex ?? {}).flat();
    const summary = createEmptyBranchSummary({
      branchId: branch.branchId,
      projectName,
    });
    summary.changedFiles = branchArtifacts
      .filter(artifact => artifact.includes('/changed-files/') || artifact.includes('/changed-test-files/'))
      .map(artifact => artifact.replace(/^artifacts\//, ''));
    summary.testResults = {
      status: branchArtifacts.some(artifact => artifact.endsWith('/failure-classification.json')) ? 'passed' : 'skipped',
    };
    summary.riskNotes = (branch.nodes ?? [])
      .filter(branchNode => branchNode.error)
      .map(branchNode => `${branchNode.label}: ${branchNode.error}`);
    const artifactPath = writeBranchSummaryArtifact(paths, summary);
    const relativePath = artifactPath.replace(/^artifacts\//, '');
    this.emitArtifactWritten(
      nodeId,
      relativePath,
      fs.statSync(path.join(paths.artifactsDir, relativePath)).size,
      '分支执行摘要'
    );
    branch.artifactIndex = branch.artifactIndex ?? {};
    branch.artifactIndex['app-branch-summary'] = [artifactPath];
    const summaryNode = branch.nodes?.find(branchNode => branchNode.id === 'app-branch-summary');
    if (summaryNode) {
      summaryNode.status = 'completed';
      summaryNode.outputArtifacts = [artifactPath];
    }
    branch.status = 'completed';
    branch.currentNodeId = 'app-branch-summary';
    if (this.state.workflowInstance) {
      syncSessionWorkflowJoinFromBranches(this.state.workflowInstance);
      this.state.workflowInstance.updatedAt = new Date().toISOString();
    }
    return artifactPath;
  }

  private writeLegacyCrossAppReviewArtifacts(paths: ReturnType<typeof getRunPaths>): Record<string, string> {
    const instance = this.state.workflowInstance;
    if (!instance?.joins?.some(join => join.status === 'completed')) return {};
    const branchSummaries = (instance.branches ?? []).map(branch => ({
      branchId: branch.branchId,
      projectName: branch.projectName,
      status: branch.status,
      summaryArtifact: branch.artifactIndex?.['app-branch-summary']?.[0],
    }));
    const blockedBranches = branchSummaries
      .filter(branch => branch.status !== 'completed')
      .map(branch => branch.branchId);
    const codeReview = {
      reviewKind: 'cross-app-code-review',
      status: blockedBranches.length ? 'blocked' : 'approved',
      affectedBranches: blockedBranches,
      findings: blockedBranches.map(branchId => ({
        id: `branch-not-complete-${branchId}`,
        severity: 'block',
        category: 'branch-status',
        branchId,
        message: 'Branch did not reach completed status before cross-app code review.',
      })),
      branchSummaries,
      generatedAt: new Date().toISOString(),
    };
    const integrationReview = {
      reviewKind: 'cross-app-integration-review',
      status: blockedBranches.length ? 'blocked' : 'approved',
      affectedBranches: blockedBranches,
      findings: [],
      branchSummaries,
      generatedAt: new Date().toISOString(),
    };
    const deliveryMetadata = {
      deliveryStatus: blockedBranches.length ? 'blocked' : 'ready',
      branchCount: branchSummaries.length,
      completedBranchCount: branchSummaries.filter(branch => branch.status === 'completed').length,
      generatedAt: new Date().toISOString(),
    };
    const artifacts = {
      'cross-app/code-review-findings.json': JSON.stringify(codeReview, null, 2),
      'cross-app/integration-review-findings.json': JSON.stringify(integrationReview, null, 2),
      'cross-app/delivery-metadata.json': JSON.stringify(deliveryMetadata, null, 2),
    };
    this.writeArtifact(paths, 'cross-app-code-review', 'cross-app/code-review-findings.json', artifacts['cross-app/code-review-findings.json'], '跨应用代码审查结果');
    this.writeArtifact(paths, 'cross-app-integration-review', 'cross-app/integration-review-findings.json', artifacts['cross-app/integration-review-findings.json'], '跨应用集成审查结果');
    this.writeArtifact(paths, 'cross-app-integration-review', 'cross-app/delivery-metadata.json', artifacts['cross-app/delivery-metadata.json'], '跨应用交付元数据');
    return artifacts;
  }

  private async runProjectAgent(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    project: { name: string; root: string },
    userPrompt: string,
    options: {
      nodeState?: NodeState;
      enablePlanMode?: boolean;
      registry: ToolRegistry;
      promptTemplateId?: string;
      modelStageId?: string;
      taskDescription?: string;
      requireToolUse?: boolean;
    }
  ): Promise<ProjectAgentResult> {
    const failureCount = options.nodeState?.failureCount ?? 0;
    const modelStageId = options.modelStageId ?? node.id;
    const promptTemplateId = options.promptTemplateId ?? node.id;
    const taskDescription = options.taskDescription ?? getProjectTaskDescription(node.id, project.name);
    const model = getModelForStage(modelStageId, failureCount, this.state.modelOverrides);
    const provider = createLLMProvider(model.providerId);
    event_model_selected(this.runId, model, node.id);

    const systemPrompt = renderPromptTemplate(loadPromptFile('stage-subtask-system.md'), {
      base_system_prompt: loadPromptTemplate(promptTemplateId),
      task_description: taskDescription,
      project_name: project.name,
      project_root: project.root,
      artifacts_dir: paths.artifactsDir,
      run_dir: paths.runDir,
    });

    const runOnce = async (enablePlanMode: boolean, prompt = userPrompt): Promise<{
      output: string;
      planGenerated: boolean;
      plan?: PlanState;
      toolNames: string[];
      toolResults: Array<{ name: string; result: string; isError: boolean }>;
      confirmedTaskList?: string;
      completedTaskList?: string;
    }> => {
      const agentId = nanoid(8);
      this.recordChildAgent(node.id, agentId);
      const agent = new AgentEngine({
        runId: this.runId,
        agentRunId: agentId,
        nodeId: node.id,
        provider,
        model,
        registry: options.registry,
        systemPrompt,
        maxTurns: node.maxTurns,
        cwd: project.root,
        projectDir: project.root,
        artifactsDir: paths.artifactsDir,
        runDir: paths.runDir,
        enablePlanMode,
        planGoal: prompt.slice(0, 200),
        projectName: project.name,
        taskDescription,
        requireToolUse: options.requireToolUse ?? (process.env.AI_CODING_MOCK_LLM !== '1' && ['java-impl', 'testcode-generate'].includes(node.id)),
      });
      this.currentAgent = agent;

      let output = '';
      let planGenerated = false;
      let plan: PlanState | undefined;
      const toolNames: string[] = [];
      const toolResults: Array<{ name: string; result: string; isError: boolean }> = [];
      for await (const event of agent.run(prompt)) {
        this.emitStageProgress(node.id, event);
        if (event.type === 'text') output += event.text;
        if (event.type === 'completed') output = event.finalText || output;
        if (event.type === 'tool_use_start') toolNames.push(event.name);
        if (event.type === 'tool_use_end') {
          toolResults.push({ name: event.name, result: event.result, isError: event.isError });
        }
        if (event.type === 'plan_generated') {
          planGenerated = true;
          plan = event.plan;
          break;
        }
        if (event.type === 'error') {
          throw new Error(`${getProjectTaskDescription(node.id, project.name)}失败：${event.message}`);
        }
      }
      this.currentAgent = null;
      return { output: output.trim(), planGenerated, plan, toolNames, toolResults };
    };

    const first = await runOnce(options.enablePlanMode === true);
    if (!first.planGenerated) return first;

    let approved = true;
    const content = buildPlanTaskConfirmationContent(
      first.plan,
      `${project.name} ${node.name} 执行计划`,
      project.name,
    );
    if (!this.skipConfirmations) {
      const store = getStateStore(this.runId);
      const eventLog = getEventLog(this.runId);
      if (options.nodeState) {
        options.nodeState.status = 'waiting_confirmation';
      }
      this.state.status = 'waiting_confirmation';
      store.saveExecutionState(this.state);
      eventLog.logEvent('confirmation_waiting', {
        nodeId: node.id,
        title: `Plan: ${first.plan?.title || getProjectTaskDescription(node.id, project.name)}`,
        content,
        confirmationKind: 'plan',
        projectName: project.name,
      }, undefined, node.id);
      this.emit('event', {
        type: 'confirmation_required',
        nodeId: node.id,
        title: `Plan: ${first.plan?.title || getProjectTaskDescription(node.id, project.name)}`,
        content,
        confirmationKind: 'plan',
        projectName: project.name,
      } as PipelineEvent);
      const resolved = await this.waitForPlanConfirmation(node.id);
      approved = resolved.approved;
      eventLog.logEvent('confirmation_resolved', { nodeId: node.id, approved, feedback: resolved.feedback }, undefined, node.id);
      this.emit('event', { type: 'confirmation_resolved', nodeId: node.id, approved, feedback: resolved.feedback } as PipelineEvent);
      if (options.nodeState) {
        options.nodeState.status = 'running';
      }
      this.state.status = 'running';
      store.saveExecutionState(this.state);
    }
    if (!approved) {
      throw new Error(`${project.name} 计划未确认，停止执行 ${node.name}`);
    }

    const executionPrompt = renderPromptTemplate(loadOutputTemplate('confirmed-plan-task-instruction.md'), {
      original_prompt: userPrompt,
      task_list: content,
    });
    const result = await runOnce(false, executionPrompt);
    result.confirmedTaskList = content;
    result.completedTaskList = buildPlanTaskConfirmationContent(
      first.plan,
      `${project.name} ${node.name} 执行计划`,
      project.name,
      true,
    );
    return result;
  }

  private writeArtifact(
    paths: ReturnType<typeof getRunPaths>,
    nodeId: string,
    relativePath: string,
    content: string,
    description: string
  ): void {
    const artifactPath = path.join(paths.artifactsDir, relativePath);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, content, 'utf-8');
    this.emitArtifactWritten(nodeId, relativePath, Buffer.byteLength(content, 'utf-8'), description);
  }

  private emitArtifactWritten(
    nodeId: string,
    relativePath: string,
    size: number,
    description: string
  ): void {
    const eventData = {
      nodeId,
      artifactPath: path.join('artifacts', relativePath).replace(/\\/g, '/'),
      size,
      description,
    };
    this.appendArtifactIndex(nodeId, eventData.artifactPath);
    getStateStore(this.runId).saveExecutionState(this.state);
    getEventLog(this.runId).logEvent('artifact_written', eventData, undefined, nodeId);
    this.emit('event', {
      type: 'stage_progress',
      nodeId,
      event: { type: 'artifact_written', ...eventData },
    } as PipelineEvent);
  }

  private emitStageProgress(
    nodeId: string,
    event: AgentEvent | { type: string; [k: string]: unknown }
  ): void {
    if (event.type === 'artifact_written') {
      const artifactPath = typeof event.artifactPath === 'string' ? event.artifactPath : undefined;
      if (artifactPath) {
        this.appendArtifactIndex(nodeId, artifactPath);
        const nodeState = this.state.nodes.find(node => node.id === nodeId);
        if (nodeState) {
          nodeState.outputArtifacts = nodeState.outputArtifacts ?? [];
          if (!nodeState.outputArtifacts.includes(artifactPath)) {
            nodeState.outputArtifacts.push(artifactPath);
          }
        }
        getStateStore(this.runId).saveExecutionState(this.state);
      }
    }
    this.emit('event', { type: 'stage_progress', nodeId, event } as PipelineEvent);
  }

  private writeCodeChangeArtifacts(
    paths: ReturnType<typeof getRunPaths>,
    nodeId: string,
    projectName: string,
    changedFiles: ProjectChangedFile[]
  ): { artifacts: Record<string, string>; paths: string[] } {
    const { entries, paths: artifactPaths } = buildCodeChangeArtifacts(paths, projectName, changedFiles);
    for (const artifactPath of artifactPaths.filter(file => file.includes('/changed-files/') && file.endsWith('.java'))) {
      const rel = artifactPath.replace(/^artifacts\//, '');
      const abs = path.join(paths.artifactsDir, rel);
      if (fs.existsSync(abs)) this.emitArtifactWritten(nodeId, rel, fs.statSync(abs).size, 'Java 实现代码预览快照');
    }
    for (const [file, content] of Object.entries(entries)) {
      this.writeArtifact(paths, nodeId, file, content, file.endsWith('changed-files.json') ? 'Java 实现变更文件清单' : 'Java 实现预览索引');
    }
    return {
      artifacts: entries,
      paths: artifactPaths,
    };
  }

  private writeTestCodeArtifacts(
    paths: ReturnType<typeof getRunPaths>,
    nodeId: string,
    projectName: string,
    changedTests: ProjectChangedFile[],
    output: string
  ): { artifacts: Record<string, string>; paths: string[] } {
    const { entries, paths: artifactPaths } = buildTestCodeArtifacts(paths, projectName, changedTests, output);
    for (const artifactPath of artifactPaths.filter(file => file.includes('/changed-test-files/') && file.endsWith('.java'))) {
      const rel = artifactPath.replace(/^artifacts\//, '');
      const abs = path.join(paths.artifactsDir, rel);
      if (fs.existsSync(abs)) this.emitArtifactWritten(nodeId, rel, fs.statSync(abs).size, '测试代码预览快照');
    }
    for (const [file, content] of Object.entries(entries)) {
      const description = file.endsWith('test-file-list.md')
        ? '项目级测试文件清单'
        : file.endsWith('testcode-generation-report.md')
          ? '项目级测试代码生成报告'
          : '项目级测试代码预览索引';
      this.writeArtifact(paths, nodeId, file, content, description);
    }
    return {
      artifacts: entries,
      paths: artifactPaths,
    };
  }

  private writeMavenTestArtifacts(
    paths: ReturnType<typeof getRunPaths>,
    nodeId: string,
    projectName: string,
    mavenOutput: string
  ): { artifacts: Record<string, string>; paths: string[] } {
    const projectRoot = path.join(paths.projectDir, projectName);
    const resolvedProjectRoot = fs.existsSync(projectRoot) ? projectRoot : paths.projectDir;
    const { entries } = buildMavenTestArtifactEntries(projectName, mavenOutput, resolvedProjectRoot);
    for (const [file, content] of Object.entries(entries)) {
      this.writeArtifact(paths, nodeId, file, content, file.endsWith('.md') ? '项目级单元测试报告' : '项目级单元测试结构化结果');
    }
    return {
      artifacts: entries,
      paths: Object.keys(entries).map(file => `artifacts/${file}`),
    };
  }

  private async executeReActStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>,
    nodeState: NodeState
  ): Promise<string> {
    const maxRetries = node.id === 'maven-test-runner' ? getConfig().agent.autoFixRounds : 1;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Select model - upgrade on repeated failures
      const failureCount = nodeState.failureCount ?? 0;
      let model = getModelForStage(node.id, failureCount + attempt, this.state.modelOverrides);
      const provider = createLLMProvider(model.providerId);

      // Emit model selection
      const eventLog = getEventLog(this.runId);
      eventLog.logEvent('model_selected', {
        modelId: model.id,
        providerId: model.providerId,
        intelligenceLevel: model.intelligenceLevel,
        reason: `stage:${node.id} attempt:${attempt}`,
        stageId: node.id,
      });

      const systemPrompt = loadPromptTemplate(node.id);
      const userPrompt = buildStagePrompt(node, paths, {
        feedback: this.state.nodes.find(n => n.id === node.id)?.confirmation?.feedback,
        attempt,
      });

      const agentId = nanoid(8);
      const agent = new AgentEngine({
        runId: this.runId,
        agentRunId: agentId,
        nodeId: node.id,
        provider,
        model,
        registry: this.toolRegistry,
        systemPrompt,
        maxTurns: node.maxTurns,
        cwd: paths.projectDir,
        projectDir: paths.projectDir,
        artifactsDir: paths.artifactsDir,
        runDir: paths.runDir,
        enablePlanMode: node.planModeRequired && attempt === 0,
        planGoal: userPrompt.slice(0, 200),
      });

      this.currentAgent = agent;
      eventLog.logEvent('agent_wakeup', { agentId, modelId: model.id }, agentId, node.id);

      let output = '';
      let planGenerated = false;
      let planConfirmed = !node.planModeRequired;

      for await (const event of agent.run(userPrompt)) {
        this.emitStageProgress(node.id, event);

        if (event.type === 'text') output += event.text;
        if (event.type === 'completed') output = event.finalText || output;
        if (event.type === 'error') {
          if (attempt < maxRetries) {
            this.emit('event', { type: 'log', message: `Attempt ${attempt + 1} failed: ${event.message}, retrying...`, level: 'warn' } as PipelineEvent);
            break;
          }
          throw new Error(event.message);
        }

        if (event.type === 'plan_generated') {
          planGenerated = true;
          // Wait for plan confirmation
          const { approved } = this.skipConfirmations
            ? { approved: true }
            : await this.waitForPlanConfirmation(node.id);
          if (approved) {
            agent.confirmPlan();
            planConfirmed = true;
            // Resume agent - actually the agent returned after generating plan
            // We need to re-run the agent with the confirmed plan
            break;
          }
        }
      }

      this.currentAgent = null;

      // If plan was generated but we need to continue, re-run with plan confirmed
      if (planGenerated && planConfirmed) {
        // Create new agent run that skips plan generation
        const agentId2 = nanoid(8);
        const agent2 = new AgentEngine({
          runId: this.runId,
          agentRunId: agentId2,
          nodeId: node.id,
          provider,
          model,
          registry: this.toolRegistry,
          systemPrompt: renderPromptTemplate(loadPromptFile('approved-plan-system-suffix.md'), {
            base_system_prompt: systemPrompt,
          }),
          maxTurns: node.maxTurns,
          cwd: paths.projectDir,
          projectDir: paths.projectDir,
          artifactsDir: paths.artifactsDir,
          runDir: paths.runDir,
          enablePlanMode: false,
        });
        this.currentAgent = agent2;
        output = '';
        for await (const event of agent2.run(userPrompt)) {
          this.emitStageProgress(node.id, event);
          if (event.type === 'text') output += event.text;
          if (event.type === 'completed') output = event.finalText || output;
          if (event.type === 'error') {
            if (attempt < maxRetries) { break; }
            throw new Error(event.message);
          }
        }
        this.currentAgent = null;
      }

      // Check for failure indicators in output (for Maven Test Runner stage)
      const hasTestFailures = node.id === 'maven-test-runner' &&
        (output.includes('BUILD FAILURE') || output.includes('Tests run:') && output.includes('Failures: 0') === false);

      if (!hasTestFailures) {
        return output.trim();
      }

      if (attempt < maxRetries) {
        this.emit('event', {
          type: 'log',
          message: `Stage ${node.name} attempt ${attempt + 1} had issues, auto-retrying...`,
          level: 'warn'
        } as PipelineEvent);
      }
    }

    throw new Error(`Stage ${node.name} failed after ${maxRetries + 1} attempts`);
  }

  private waitForConfirmation(nodeId: string): Promise<{ approved: boolean; feedback?: string }> {
    const persisted = this.consumePersistedConfirmation(nodeId);
    if (persisted) return Promise.resolve(persisted);
    return new Promise((resolve) => {
      this.waitingForConfirmation = { nodeId, resolve: (approved, feedback) => resolve({ approved, feedback }) };
    });
  }

  private waitForPlanConfirmation(nodeId: string): Promise<{ approved: boolean; feedback?: string }> {
    const persisted = this.consumePersistedConfirmation(nodeId);
    if (persisted) return Promise.resolve(persisted);
    return new Promise((resolve) => {
      this.waitingForConfirmation = {
        nodeId,
        resolve: (approved, feedback) => resolve({ approved, feedback }),
      };
    });
  }

  private consumePersistedConfirmation(nodeId: string): { approved: boolean; feedback?: string } | null {
    const normalizedNodeId = normalizeStageId(nodeId);
    const nodeState = this.state.nodes.find(node => node.id === normalizedNodeId);
    if (!nodeState?.confirmation?.resumeApproved) return null;

    const feedback = nodeState.confirmation.feedback;
    nodeState.confirmation = { waiting: false, approved: true, feedback };
    getStateStore(this.runId).saveExecutionState(this.state);
    return { approved: true, feedback };
  }

  private resumeFromNode(nodeId: string): void {
    if (this.running) return;
    setImmediate(() => {
      this.start({ fromNodeId: nodeId }).catch(err => {
        const eventLog = getEventLog(this.runId);
        eventLog.logEvent('error', { message: err.message });
        eventLog.logEvent('pipeline_failed', { nodeId, error: err.message });
        this.emit('event', { type: 'pipeline_failed', runId: this.runId, error: err.message } as PipelineEvent);
      });
    });
  }

  private resetNodesForRerun(startIndex: number): void {
    const rerunNodeIds = new Set(PIPELINE_NODES.slice(startIndex).map(node => node.id));
    for (let i = startIndex; i < this.state.nodes.length; i++) {
      const current = this.state.nodes[i];
      this.state.nodes[i] = {
        id: current.id,
        name: current.name,
        status: 'pending',
        failureCount: current.failureCount ?? 0,
        childAgentIds: [],
      };
    }
    if (this.state.artifactIndex) {
      for (const nodeId of rerunNodeIds) {
        delete this.state.artifactIndex[nodeId];
      }
    }
    if (this.state.contextManifests) {
      for (const nodeId of rerunNodeIds) {
        delete this.state.contextManifests[nodeId];
      }
    }
    this.state.projects?.forEach(project => {
      const currentIndex = project.currentNodeId ? PIPELINE_NODES.findIndex(node => node.id === project.currentNodeId) : -1;
      if (currentIndex >= startIndex || project.status === 'failed' || project.status === 'running') {
        project.status = 'pending';
        project.currentNodeId = PIPELINE_NODES[startIndex]?.id;
      }
    });
    const branchStartNodeId = branchNodeIdForStage(PIPELINE_NODES[startIndex]?.id || '');
    if (branchStartNodeId) {
      this.state.workflowInstance?.branches?.forEach(branch => {
        resetSessionBranchFromNode(branch, branchStartNodeId);
      });
      if (this.state.workflowInstance) {
        syncSessionWorkflowJoinFromBranches(this.state.workflowInstance);
        this.state.workflowInstance.updatedAt = new Date().toISOString();
      }
    }
    this.state.rollback = undefined;
    this.state.currentAgentRunId = undefined;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatConfirmationContent(output: unknown): string {
  if (typeof output === 'string') return output;
  if (isSpecOutput(output)) return output.content;
  return JSON.stringify(output, null, 2);
}

function markMarkdownTasksCompleted(content: string): string {
  return content
    .replace(/^(\s*[-*]\s*)\[\s\](\s+)/gm, '$1[x]$2')
    .replace(/^(\s*)\d+\.\s+(.+)$/gm, '$1- [x] $2');
}

function buildVirtualJavaImplementationFile(projectName: string, agentOutput: string): ProjectChangedFile {
  const className = `${toPascalIdentifier(projectName)}TraceKeyImplementationGuide`;
  const content = [
    'package generated;',
    '',
    '/**',
    ` * ${projectName} traceKey implementation guide generated because no concrete Java source file was changed.`,
    ' * Replace this guide with real project classes when the application source tree is available.',
    ' */',
    `public final class ${className} {`,
    '    private static final String UNKNOWN_TRACE = "UNKNOWN_TRACE";',
    '',
    '    private ' + className + '() {',
    '    }',
    '',
    '    public static String normalizeTraceKey(String traceKey) {',
    '        return traceKey == null || traceKey.isBlank() ? UNKNOWN_TRACE : traceKey;',
    '    }',
    '',
    '    /*',
    '     * Implementation notes:',
    indentForJavaComment(summarizeMarkdown(agentOutput || 'No concrete code changes were produced.', 1800)),
    '     */',
    '}',
    '',
  ].join('\n');
  return {
    path: `src/main/java/generated/${className}.java`,
    status: 'added',
    size: Buffer.byteLength(content, 'utf-8'),
    content,
  };
}

function buildVirtualTestImplementationFile(projectName: string, agentOutput: string): ProjectChangedFile {
  const className = `${toPascalIdentifier(projectName)}TraceKeyImplementationGuideTest`;
  const content = [
    'package generated;',
    '',
    '/**',
    ` * ${projectName} traceKey test guide generated because no concrete test source file was changed.`,
    ' * Replace this guide with real unit tests when the application source tree is available.',
    ' */',
    `public final class ${className} {`,
    '    public void shouldPropagateTraceKeyAcrossApplicationBoundary() {',
    '        // Given upstream traceKey is present',
    '        // When the application processes the traceKey-aware payload',
    '        // Then downstream output and logs should contain the same traceKey.',
    '    }',
    '',
    '    public void shouldFallbackToUnknownTraceWhenTraceKeyMissing() {',
    '        // Given upstream traceKey is missing',
    '        // Then use UNKNOWN_TRACE and record a warning/error log as required by the MRD.',
    '    }',
    '',
    '    /*',
    '     * Test implementation notes:',
    indentForJavaComment(summarizeMarkdown(agentOutput || 'No concrete test code changes were produced.', 1800)),
    '     */',
    '}',
    '',
  ].join('\n');
  return {
    path: `src/test/java/generated/${className}.java`,
    status: 'added',
    size: Buffer.byteLength(content, 'utf-8'),
    content,
  };
}

function toPascalIdentifier(value: string): string {
  const parts = String(value || 'Project')
    .split(/[^a-zA-Z0-9]+/)
    .map(part => part.trim())
    .filter(Boolean);
  const identifier = parts
    .map(part => `${part[0]?.toUpperCase() || ''}${part.slice(1).replace(/[^a-zA-Z0-9]/g, '')}`)
    .join('');
  return /^[A-Za-z]/.test(identifier) ? identifier : `Project${identifier}`;
}

function indentForJavaComment(content: string): string {
  return String(content || '')
    .split('\n')
    .map(line => `     * ${line.replace(/\*\//g, '* /')}`)
    .join('\n');
}

function shouldUseDocumentationOnlyFallback(projects: Array<{ name: string; root: string }>): boolean {
  return projects.length > 0 && projects.every(project => !hasJavaProjectShape(project.root));
}

function hasJavaProjectShape(projectRoot: string): boolean {
  return fs.existsSync(path.join(projectRoot, 'pom.xml')) ||
    fs.existsSync(path.join(projectRoot, 'src')) ||
    snapshotProjectFiles(projectRoot, JAVA_MAIN_CHANGE_PATTERN).size > 0 ||
    snapshotProjectFiles(projectRoot, JAVA_TEST_CHANGE_PATTERN).size > 0;
}

function buildDocumentationOnlyPrd(clarified: string): string {
  return [
    '# PRD / 验收口径',
    '',
    '## 目标',
    '为 crowd、abtest、cc 三个应用建立统一 traceKey 链路追踪能力。',
    '',
    '## 范围',
    '- crowd 生成并输出 traceKey。',
    '- abtest 接收、透传 traceKey，缺失时告警并使用 UNKNOWN_TRACE。',
    '- cc 消费 traceKey，并在执行日志和失败日志中记录 traceKey、activityId、crowdId、experimentId。',
    '',
    '## 验收',
    '- 三个应用分支均产生实施方案、SPEC、Java 实现建议、测试代码建议和分支汇总。',
    '- 文档型项目没有 Java/Maven 源码时，产出明确伪代码和待落地说明。',
    '',
    '## 需求摘要',
    summarizeMarkdown(clarified, 1600),
  ].join('\n');
}

function buildDocumentationOnlyTechDesign(projectName: string, clarified: string, projectFiles: string): string {
  const role = projectName === 'crowd'
    ? '生成 traceKey 并追加到人群圈选输出结果。'
    : projectName === 'abtest'
      ? '接收并透传 traceKey，缺失时记录告警并使用 UNKNOWN_TRACE。'
      : projectName === 'cc'
        ? '消费 traceKey，并补齐触达执行和失败日志字段。'
        : '按 traceKey 契约完成本应用边界内改造。';
  return [
    `# ${projectName} 技术方案`,
    '',
    '## 项目形态',
    '当前上传目录未检测到 pom.xml 或 src 源码目录，按文档型项目生成可落地方案和伪代码候选文件。',
    '',
    '## 职责边界',
    role,
    '',
    '## 候选落点',
    '- DTO/request/result 对象增加 String traceKey。',
    '- 服务编排入口保持向后兼容，缺省值只在明确要求的应用内产生。',
    '- 日志使用结构化字段输出 traceKey 和业务关键 ID。',
    '',
    '## 实施步骤',
    '1. 定义 traceKey 字段契约和常量 UNKNOWN_TRACE。',
    '2. 在本应用输入/输出模型中追加 traceKey。',
    '3. 在核心服务流程中透传或生成 traceKey。',
    '4. 补充执行日志、失败日志和单元测试。',
    '',
    '## 项目文件概览',
    projectFiles || '未发现可枚举文件。',
    '',
    '## 需求摘要',
    summarizeMarkdown(clarified, 1200),
  ].join('\n');
}

function buildDocumentationOnlyDevSpec(projectName: string): string {
  return [
    `# ${projectName} 开发任务清单`,
    '',
    '## Phase 1: traceKey 字段契约',
    '- [ ] 定义 traceKey 字段和 UNKNOWN_TRACE 常量。',
    '- [ ] 明确本应用在链路中的生成、透传或消费职责。',
    '',
    '## Phase 2: 服务流程改造',
    '- [ ] 在候选 DTO/request/result 中追加 traceKey。',
    '- [ ] 在核心服务流程中保持 traceKey 向后兼容传递。',
    '- [ ] 在缺源码场景下依据 Java 实现建议补齐真实落点。',
    '',
    '## Phase 3: 日志与审查',
    '- [ ] 补齐 traceKey 相关执行日志和异常日志。',
    '- [ ] 校验不涉及数据库表、MQ topic、前端和权限改造。',
  ].join('\n');
}

function buildDocumentationOnlyTestSpec(projectName: string): string {
  return [
    `# ${projectName} 测试任务清单`,
    '',
    '## Phase 1: 字段契约测试',
    '- [ ] 覆盖 traceKey 正常传入、透传和输出。',
    '- [ ] 覆盖缺失 traceKey 的默认行为。',
    '',
    '## Phase 2: 日志测试',
    '- [ ] 验证执行日志包含 traceKey 和业务关键 ID。',
    '- [ ] 验证失败日志包含 traceKey。',
    '',
    '## Phase 3: 回归测试',
    '- [ ] 验证原有字段结构不被破坏。',
    '- [ ] 验证无数据库/MQ/前端扩展。',
  ].join('\n');
}

function buildDocumentationOnlyReview(projectName: string): string {
  return [
    `# ${projectName} 代码评审`,
    '',
    '## 结论',
    'PASS：当前项目为文档型输入，已生成 Java 实现建议和伪代码预览，未对真实源码做静默修改。',
    '',
    '## 检查点',
    '- traceKey 字段职责明确。',
    '- 缺源码情况显式记录。',
    '- 未扩大到数据库、MQ、前端、权限、灰度或报表范围。',
  ].join('\n');
}

function buildDocumentationOnlyTestReport(projectName: string): string {
  return [
    `# ${projectName} 测试代码生成报告`,
    '',
    '当前项目未检测到 Maven/Java 源码，已生成测试伪代码预览。',
    '',
    '## 建议覆盖',
    '- traceKey 正常传递。',
    '- traceKey 缺失兜底。',
    '- 执行日志和失败日志包含 traceKey。',
    '- 原有输出结构保持兼容。',
  ].join('\n');
}

function buildConfirmationData(node: PipelineNode, content: string): {
  title: string;
  extra: Record<string, unknown>;
} {
  if (node.id === 'mrd-render') {
    return {
      title: '需求拆解确认',
      extra: {
        confirmationKind: 'mrd-render',
      },
    };
  }
  if (node.id === 'mrd-clarify') {
    return {
      title: 'MRD 澄清确认',
      extra: {
        confirmationKind: 'mrd-clarify',
        clarificationOptions: [
          {
            id: 'default',
            label: '按 Agent 推荐方案继续',
            description: '接受当前澄清结论，作为 PRD 生成输入。',
          },
          {
            id: 'minimal',
            label: '先按最小闭环实现',
            description: '不确定项先采用保守默认值，后续节点只覆盖核心流程。',
          },
          {
            id: 'manual',
            label: '我补充具体口径',
            description: '使用下方补充说明覆盖或修正澄清结论。',
          },
        ],
      },
    };
  }
  if (node.id === 'spec-generate') {
    return {
      title: 'Spec 产物确认',
      extra: {
        confirmationKind: 'spec',
        confirmationSections: extractSpecConfirmationSections(content),
      },
    };
  }
  if (node.id === 'implementation-plan') {
    return {
      title: '实施方案确认',
      extra: {
        confirmationKind: 'implementation-plan',
      },
    };
  }
  return { title: `Review: ${node.name}`, extra: {} };
}

function isSpecOutput(output: unknown): output is { content: string; artifacts: Record<string, string> } {
  return Boolean(
    output &&
    typeof output === 'object' &&
    'content' in output &&
    typeof (output as { content?: unknown }).content === 'string'
  );
}

function extractSpecConfirmationSections(content: string): Array<{ title: string; content: string }> {
  const devMarker = '## 开发 OpenSpec 任务清单';
  const testMarker = '## 测试 OpenSpec 测试任务清单';
  const devIndex = content.indexOf(devMarker);
  const testIndex = content.indexOf(testMarker);
  if (devIndex >= 0 && testIndex > devIndex) {
    return [
      {
        title: '开发 OpenSpec 任务清单',
        content: content.slice(devIndex + devMarker.length, testIndex).trim().slice(0, 3000),
      },
      {
        title: '测试 OpenSpec 测试任务清单',
        content: content.slice(testIndex + testMarker.length).trim().slice(0, 3000),
      },
    ];
  }
  return [
    { title: '开发 OpenSpec 任务清单', content: content.slice(0, 3000) },
    { title: '测试 OpenSpec 测试任务清单', content: '未能拆分测试清单，请查看产物文件。' },
  ];
}

interface ProjectAgentResult {
  output: string;
  planGenerated: boolean;
  toolNames: string[];
  toolResults: Array<{ name: string; result: string; isError: boolean }>;
  confirmedTaskList?: string;
  completedTaskList?: string;
}

interface ProjectStageSummary {
  project: string;
  title: string;
  artifactPaths: string[];
  summary: string;
}

function reconcilePipelineNodes(state: ExecutionState): boolean {
  const existing = new Map<string, NodeState>();
  for (const node of state.nodes) {
    existing.set(node.id, node);
    existing.set(normalizeStageId(node.id), node);
  }
  let changed = false;
  const nextNodes: NodeState[] = PIPELINE_NODES.map((definition) => {
    const current = existing.get(definition.id);
    if (current) {
      if (current.name !== definition.name) {
        changed = true;
        return { ...current, name: definition.name };
      }
      return current;
    }
    changed = true;
    return {
      id: definition.id,
      name: definition.name,
      status: 'pending' as const,
      failureCount: 0,
    };
  });

  if (changed || nextNodes.length !== state.nodes.length) {
    const currentNodeId = normalizeStageId(state.currentNodeId || state.nodes[state.currentNodeIndex]?.id || '');
    state.nodes = nextNodes;
    if (currentNodeId) {
      const nextIndex = nextNodes.findIndex(node => node.id === currentNodeId);
      if (nextIndex >= 0) state.currentNodeIndex = nextIndex;
    }
    return true;
  }
  return false;
}

type RetryField = keyof ProjectState['retry'];

function recoverInterruptedState(state: ExecutionState): boolean {
  let changed = false;
  if (state.status === 'running') {
    state.status = 'suspended';
    changed = true;
  }
  for (const node of state.nodes) {
    if (node.status === 'running') {
      node.status = 'suspended';
      changed = true;
    }
  }
  state.projects?.forEach(project => {
    if (project.status === 'running') {
      project.status = 'suspended';
      changed = true;
    }
  });
  return changed;
}

function isProjectScopedNode(nodeId: string): boolean {
  return [
    'implementation-plan',
    'spec-generate',
    'java-impl',
    'testcode-generate',
    'archive',
  ].includes(normalizeStageId(nodeId));
}

function branchNodeIdForStage(nodeId: string): string | null {
  const normalized = normalizeStageId(nodeId);
  if (normalized === 'archive') return 'app-branch-summary';
  return [
    'implementation-plan',
    'spec-generate',
    'java-impl',
    'testcode-generate',
  ].includes(normalized) ? normalized : null;
}

function nextBranchNodeId(branchNodeId: string): string | null {
  const sequence = ['implementation-plan', 'spec-generate', 'java-impl', 'testcode-generate', 'app-branch-summary'];
  const index = sequence.indexOf(branchNodeId);
  return index >= 0 ? sequence[index + 1] ?? null : null;
}

function isBranchNodeAfter(nodeId: string, referenceNodeId: string): boolean {
  const sequence = ['implementation-plan', 'spec-generate', 'java-impl', 'testcode-generate', 'app-branch-summary'];
  const nodeIndex = sequence.indexOf(nodeId);
  const referenceIndex = sequence.indexOf(referenceNodeId);
  return nodeIndex > referenceIndex && referenceIndex >= 0;
}

function toSessionBranchStatus(status: ProjectState['status']): SessionWorkflowRuntimeStatus {
  if (status === 'interrupted') return 'interrupted';
  if (status === 'suspended') return 'suspended';
  return status;
}

function branchStatusForStage(
  branchNodeId: string,
  status: ProjectState['status']
): SessionWorkflowRuntimeStatus {
  if (status === 'completed' && branchNodeId !== 'app-branch-summary') return 'pending';
  return toSessionBranchStatus(status);
}

function artifactsForProject(artifacts: string[], projectName: string): string[] {
  const projectPrefix = `artifacts/${projectName}/`;
  return uniqueArtifacts(artifacts).filter(artifact =>
    artifact.startsWith(projectPrefix) ||
    (projectName === 'project' && !artifact.includes('/cross-app/') && artifact.endsWith('prd.md'))
  );
}

function getNodeIndexById(nodeId: string): number {
  const normalized = normalizeStageId(nodeId);
  return PIPELINE_NODES.findIndex(node => node.id === normalized);
}

function collectOutputArtifacts(node: PipelineNode, output: unknown, nodeState: NodeState): string[] {
  if (nodeState.outputArtifacts?.length) {
    return uniqueArtifacts(nodeState.outputArtifacts);
  }
  if (node.id === 'upload-init') {
    return ['artifacts/project-manifest.json'];
  }
  if (isSpecOutput(output)) {
    return uniqueArtifacts(Object.keys(output.artifacts).map(file => `artifacts/${file}`));
  }
  if (node.artifactOutput) {
    return uniqueArtifacts([`artifacts/${node.artifactOutput}`]);
  }
  if (node.artifactOutputs?.length) {
    return uniqueArtifacts(node.artifactOutputs
      .filter(file => !file.includes('{project}') && !file.includes('{runId}') && !file.includes('*'))
      .map(file => `artifacts/${file}`));
  }
  return [];
}

function uniqueArtifacts(artifacts: string[]): string[] {
  return Array.from(new Set(artifacts
    .filter(Boolean)
    .map(artifact => artifact.replace(/\\/g, '/'))
    .map(artifact => artifact.startsWith('artifacts/') ? artifact : `artifacts/${artifact}`)));
}

function artifactSummary(paths: ReturnType<typeof getRunPaths>, artifactPath: string): {
  path: string;
  summary: string;
  size: number;
} {
  const normalized = artifactPath.replace(/\\/g, '/');
  const relative = normalized.startsWith('artifacts/')
    ? normalized.slice('artifacts/'.length)
    : normalized;
  const fullPath = path.join(paths.artifactsDir, relative);
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      return { path: normalized, summary: '产物不是普通文件。', size: stat.size };
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    return {
      path: normalized.startsWith('artifacts/') ? normalized : `artifacts/${normalized}`,
      summary: summarizeMarkdown(content, 500),
      size: stat.size,
    };
  } catch {
    return {
      path: normalized.startsWith('artifacts/') ? normalized : `artifacts/${normalized}`,
      summary: '产物文件暂不可读或尚未落盘。',
      size: 0,
    };
  }
}

function extractImportantDecisions(output: unknown): string[] {
  const text = outputToText(output);
  const lines = text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length >= 6 && line.length <= 240)
    .filter(line => /决策|确认|采用|归属|范围|验收|Decision|Accepted/i.test(line));
  return Array.from(new Set(lines)).slice(0, 12);
}

function extractRiskNotes(output: unknown): string[] {
  const text = outputToText(output);
  const lines = text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length >= 6 && line.length <= 240)
    .filter(line => /风险|阻断|依赖|兼容|回滚|失败|Risk|Block/i.test(line));
  return Array.from(new Set(lines)).slice(0, 12);
}

function outputToText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (isSpecOutput(output)) return output.content;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return '';
  }
}

function inferNextNodeInputs(nodeId: string, artifactIndex: Record<string, string[]>): string[] {
  const currentIndex = getNodeIndexById(nodeId);
  const nextNode = PIPELINE_NODES[currentIndex + 1];
  if (!nextNode) return [];
  const inputs = new Set<string>();
  for (let i = Math.max(0, currentIndex - 2); i <= currentIndex; i++) {
    const id = PIPELINE_NODES[i]?.id;
    for (const artifact of id ? artifactIndex[id] ?? [] : []) {
      inputs.add(artifact);
    }
  }
  inputs.add('artifacts/project-manifest.json');
  return Array.from(inputs);
}

function readReviewBlockProjects(artifactsDir: string): string[] {
  const blocked: string[] = [];
  for (const projectDir of listArtifactProjectDirs(artifactsDir)) {
    const findingsPath = path.join(artifactsDir, projectDir, 'review-findings.json');
    if (!fs.existsSync(findingsPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(findingsPath, 'utf-8')) as { project?: string; result?: string };
      if (String(parsed.result || '').toUpperCase() === 'BLOCK') {
        blocked.push(parsed.project || projectDir);
      }
    } catch {
      // Ignore malformed review artifacts; the confirmation/report remains available to the user.
    }
  }
  return blocked;
}

function readTestFailureProjects(artifactsDir: string): Array<{
  project: string;
  category: 'success' | 'compile_failure' | 'test_failure' | 'coverage_below_threshold' | 'runner_asset_failure';
  reason: string;
}> {
  const failures: Array<{
    project: string;
    category: 'success' | 'compile_failure' | 'test_failure' | 'coverage_below_threshold' | 'runner_asset_failure';
    reason: string;
  }> = [];
  for (const projectDir of listArtifactProjectDirs(artifactsDir)) {
    const classificationPath = path.join(artifactsDir, projectDir, 'failure-classification.json');
    if (!fs.existsSync(classificationPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(classificationPath, 'utf-8')) as {
        project?: string;
        category?: string;
        reason?: string;
      };
      const category = normalizeFailureCategory(parsed.category);
      failures.push({
        project: parsed.project || projectDir,
        category,
        reason: parsed.reason || '',
      });
    } catch {
      failures.push({
        project: projectDir,
        category: 'runner_asset_failure',
        reason: 'failure-classification.json 不可解析。',
      });
    }
  }
  return failures;
}

function listArtifactProjectDirs(artifactsDir: string): string[] {
  try {
    return fs.readdirSync(artifactsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => !['downloads', 'changed-files', 'changed-test-files'].includes(name));
  } catch {
    return [];
  }
}

function normalizeFailureCategory(category: string | undefined): 'success' | 'compile_failure' | 'test_failure' | 'coverage_below_threshold' | 'runner_asset_failure' {
  if (category === 'success' || category === 'compile_failure' || category === 'test_failure' || category === 'coverage_below_threshold' || category === 'runner_asset_failure') {
    return category;
  }
  return 'runner_asset_failure';
}

function incrementProjectRetry(state: ExecutionState, projectName: string, field: RetryField): number {
  const project = ensureProjectRetryState(state, projectName);
  project.retry[field] += 1;
  return project.retry[field];
}

function getProjectRetry(state: ExecutionState, projectName: string, field: RetryField): number {
  const project = state.projects?.find(item => item.name === projectName);
  return project?.retry[field] ?? 0;
}

function ensureProjectRetryState(state: ExecutionState, projectName: string): ProjectState {
  state.projects = state.projects ?? [];
  let project = state.projects.find(item => item.name === projectName);
  if (!project) {
    project = {
      name: projectName,
      root: projectName,
      status: 'pending',
      retry: { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 },
    };
    state.projects.push(project);
  }
  project.retry = project.retry ?? { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 };
  return project;
}

function retryFieldForFailure(category: string): RetryField {
  return category === 'coverage_below_threshold' ? 'coverageRetryCount' : 'testRetryCount';
}

function targetNodeForFailure(category: string, reason: string): string {
  if (category === 'coverage_below_threshold') return 'testcode-generate';
  if (category === 'compile_failure') {
    return /src\/test|test source|测试代码|mock/i.test(reason) ? 'testcode-generate' : 'java-impl';
  }
  if (category === 'test_failure') {
    return /mock|测试入口|test source|src\/test|断言|fixture/i.test(reason) ? 'testcode-generate' : 'java-impl';
  }
  return 'java-impl';
}

function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(ReadTool);
  registry.register(WriteTool);
  registry.register(EditTool);
  registry.register(GlobTool);
  registry.register(GrepTool);
  registry.register(BashTool);
  registerKnowledgeTools(registry);
  registerJavaTools(registry);
  return registry;
}

function createRequirementToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(ReadTool);
  registry.register(WriteTool);
  registry.register(GlobTool);
  registry.register(GrepTool);
  registerKnowledgeTools(registry);
  return registry;
}

function readTextIfExists(filePath: string): string | undefined {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return undefined;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

function shouldRequireToolUse(): boolean {
  return process.env.AI_CODING_MOCK_LLM !== '1';
}

function event_model_selected(runId: string, model: RegisteredModel, stageId: string): void {
  const log = getEventLog(runId);
  log.logEvent('model_selected', {
    modelId: model.id,
    providerId: model.providerId,
    intelligenceLevel: model.intelligenceLevel,
    reason: `stage:${stageId}`,
    stageId,
  });
}

// ── Global pipeline registry ───────────────────────────────────────────────

const pipelines = new Map<string, PipelineEngine>();

export function getPipeline(runId: string): PipelineEngine {
  let p = pipelines.get(runId);
  if (!p) {
    p = new PipelineEngine(runId);
    pipelines.set(runId, p);
  }
  return p;
}

export function removePipeline(runId: string): void {
  pipelines.delete(runId);
}
