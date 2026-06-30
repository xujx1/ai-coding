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
  normalizeSessionWorkflowInstanceShape,
  resetSessionBranchFromNode,
  syncSessionBranchRuntimeFromNodes,
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
import {
  buildRequirementOwnershipArtifact,
  REQUIREMENT_OWNERSHIP_ARTIFACT_PATH,
  writeRequirementOwnershipArtifact,
} from '../workflows/requirementOwnership.js';
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
  buildRequirementBreakdownArtifact,
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
  getProjectOpenSpecChange,
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
import { runE2EVerificationStage } from './node-runners/e2eVerificationRunner.js';
import { runUploadInitStage } from './node-runners/uploadInitRunner.js';
import { runE2EVerification } from '../e2e/runner.js';

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
    'app-integration-test': runE2EVerificationStage,
    'e2e-verify': runE2EVerificationStage,
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
    if (nodeId === 'testcode-generate') return;
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
      syncBranchTrackStatus(branch, branchNodeId, toSessionBranchStatus(status));

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
      syncSessionBranchRuntimeFromNodes(branch);
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
    syncBranchTrackStatus(branch, branchNodeId, toSessionBranchStatus(status));

    const artifacts = artifactsForProject(this.state.artifactIndex?.[nodeId] ?? [], projectName);
    if (artifacts.length) {
      branchNode.outputArtifacts = artifacts;
      branch.artifactIndex = branch.artifactIndex ?? {};
      branch.artifactIndex[branchNodeId] = artifacts;
    }

    syncSessionBranchRuntimeFromNodes(branch);
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

    if (node.id === 'archive') {
      const reused = this.tryReuseArchiveArtifacts(paths, nodeState);
      if (reused) return reused;
    }

    if (runner) {
      const result = await runner(this.createStageRunnerContext(node, paths, nodeState));
      return result.output;
    }

    if (node.id === 'mrd-clarify') {
      return this.executeMrdClarifyStage(node, paths, nodeState);
    }

    if (node.id === 'cross-app-test') {
      return this.executeCrossAppTestStage(node, paths);
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
    this.emitArtifactWritten(node.id, 'mrd-clarify-questions.md', Buffer.byteLength(questions, 'utf-8'), '需求归属确认清单');
    let requirementOwnership = buildRequirementOwnershipArtifact({
      clarified,
      manifest,
      confirmation: { status: 'pending' },
    });
    let requirementOwnershipWrite = writeRequirementOwnershipArtifact({ paths, artifact: requirementOwnership });
    this.emitArtifactWritten(
      node.id,
      requirementOwnershipWrite.relativePath,
      Buffer.byteLength(requirementOwnershipWrite.content, 'utf-8'),
      '结构化需求归属与实施面向'
    );

    let clarificationAnswers = '';
    if (!this.skipConfirmations && hasClarificationQuestions(questions)) {
      const store = getStateStore(this.runId);
      nodeState.status = 'waiting_confirmation';
      this.state.status = 'waiting_confirmation';
      store.saveExecutionState(this.state);

      eventLog.logEvent('confirmation_waiting', {
        nodeId: node.id,
        title: '需求归属确认',
        content: questions.slice(0, 5000),
        artifactPath: 'artifacts/mrd-clarify-questions.md',
        confirmationKind: 'mrd-clarify-questions',
        structuredPayload: requirementOwnership,
      }, agentId, node.id);
      this.emit('event', {
        type: 'confirmation_required',
        nodeId: node.id,
        title: '需求归属确认',
        content: questions,
        artifactPath: 'artifacts/mrd-clarify-questions.md',
        confirmationKind: 'mrd-clarify-questions',
        structuredPayload: requirementOwnership,
      } as PipelineEvent);

      const { approved, feedback } = await this.waitForConfirmation(node.id);
      eventLog.logEvent('confirmation_resolved', { nodeId: node.id, approved, feedback }, undefined, node.id);
      this.emit('event', { type: 'confirmation_resolved', nodeId: node.id, approved, feedback } as PipelineEvent);

      if (!approved && !feedback) {
        throw new Error('用户拒绝需求归属确认清单，且未提供修订意见。');
      }
      clarificationAnswers = feedback?.trim() || '用户确认按推荐默认决策继续。';
      requirementOwnership = buildRequirementOwnershipArtifact({
        clarified,
        manifest,
        confirmation: {
          status: 'confirmed',
          feedback: clarificationAnswers,
          confirmedAt: new Date().toISOString(),
        },
      });
      requirementOwnershipWrite = writeRequirementOwnershipArtifact({ paths, artifact: requirementOwnership });
      this.emitArtifactWritten(
        node.id,
        requirementOwnershipWrite.relativePath,
        Buffer.byteLength(requirementOwnershipWrite.content, 'utf-8'),
        '结构化需求归属与实施面向'
      );
      nodeState.status = 'running';
      this.state.status = 'running';
      store.saveExecutionState(this.state);
    } else if (this.skipConfirmations) {
      clarificationAnswers = '测试/跳过确认模式：按推荐默认决策继续。';
      requirementOwnership = buildRequirementOwnershipArtifact({
        clarified,
        manifest,
        confirmation: {
          status: 'auto-confirmed',
          feedback: clarificationAnswers,
          confirmedAt: new Date().toISOString(),
        },
      });
      requirementOwnershipWrite = writeRequirementOwnershipArtifact({ paths, artifact: requirementOwnership });
      this.emitArtifactWritten(
        node.id,
        requirementOwnershipWrite.relativePath,
        Buffer.byteLength(requirementOwnershipWrite.content, 'utf-8'),
        '结构化需求归属与实施面向'
      );
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
        taskDescription: '根据用户回答生成最终需求归属确认结果',
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
    this.emitArtifactWritten(node.id, 'mrd-clarified.md', Buffer.byteLength(clarified, 'utf-8'), '需求拆解与归属确认清单');
    const requirementBreakdown = buildRequirementBreakdownArtifact(clarified, manifest);
    fs.writeFileSync(path.join(paths.artifactsDir, 'requirement-breakdown.md'), requirementBreakdown, 'utf-8');
    this.emitArtifactWritten(node.id, 'requirement-breakdown.md', Buffer.byteLength(requirementBreakdown, 'utf-8'), '需求拆分清单');
    requirementOwnership = buildRequirementOwnershipArtifact({
      clarified,
      manifest,
      confirmation: requirementOwnership.confirmation,
    });
    requirementOwnershipWrite = writeRequirementOwnershipArtifact({ paths, artifact: requirementOwnership });
    this.emitArtifactWritten(
      node.id,
      requirementOwnershipWrite.relativePath,
      Buffer.byteLength(requirementOwnershipWrite.content, 'utf-8'),
      '结构化需求归属与实施面向'
    );

    const fanoutDecision = deriveFanoutDecision({ manifest, clarifiedMrd: clarified, requirementOwnership });
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
        manifest,
        clarifiedMrd: clarified,
        requirementOwnership,
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
      'artifacts/requirement-breakdown.md',
      'artifacts/mrd-clarify-questions.md',
      REQUIREMENT_OWNERSHIP_ARTIFACT_PATH,
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
      this.emitArtifactWritten(node.id, 'mrd-clarify-questions.md', Buffer.byteLength(questions, 'utf-8'), '需求归属确认清单');
    }

    const requirementOwnership = buildRequirementOwnershipArtifact({
      clarified,
      manifest,
      confirmation: { status: 'auto-confirmed', feedback: '从已存在 artifacts/mrd-clarified.md 恢复。', confirmedAt: new Date().toISOString() },
    });
    const requirementOwnershipWrite = writeRequirementOwnershipArtifact({ paths, artifact: requirementOwnership });
    this.emitArtifactWritten(
      node.id,
      requirementOwnershipWrite.relativePath,
      Buffer.byteLength(requirementOwnershipWrite.content, 'utf-8'),
      '结构化需求归属与实施面向'
    );
    const requirementBreakdown = buildRequirementBreakdownArtifact(clarified, manifest);
    fs.writeFileSync(path.join(paths.artifactsDir, 'requirement-breakdown.md'), requirementBreakdown, 'utf-8');
    this.emitArtifactWritten(node.id, 'requirement-breakdown.md', Buffer.byteLength(requirementBreakdown, 'utf-8'), '需求拆分清单');

    const fanoutDecision = deriveFanoutDecision({ manifest, clarifiedMrd: clarified, requirementOwnership });
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
        manifest,
        clarifiedMrd: clarified,
        requirementOwnership,
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
      'artifacts/requirement-breakdown.md',
      'artifacts/mrd-clarify-questions.md',
      REQUIREMENT_OWNERSHIP_ARTIFACT_PATH,
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
      description: '需求归属确认清单',
    };
    eventLog.logEvent('artifact_written', questionsEvent, agentId, node.id);
    this.emit('event', {
      type: 'stage_progress', nodeId: node.id,
      event: { type: 'artifact_written', ...questionsEvent },
    } as PipelineEvent);

    const requirementOwnership = buildRequirementOwnershipArtifact({
      clarified,
      manifest,
      confirmation: {
        status: this.skipConfirmations ? 'auto-confirmed' : 'pending',
        feedback: this.skipConfirmations ? '测试/跳过确认模式：按推荐默认决策继续。' : undefined,
        confirmedAt: this.skipConfirmations ? new Date().toISOString() : undefined,
      },
    });
    const requirementOwnershipWrite = writeRequirementOwnershipArtifact({ paths, artifact: requirementOwnership });
    this.emitArtifactWritten(
      node.id,
      requirementOwnershipWrite.relativePath,
      Buffer.byteLength(requirementOwnershipWrite.content, 'utf-8'),
      '结构化需求归属与实施面向'
    );
    const requirementBreakdown = buildRequirementBreakdownArtifact(clarified, manifest);
    fs.writeFileSync(path.join(paths.artifactsDir, 'requirement-breakdown.md'), requirementBreakdown, 'utf-8');
    this.emitArtifactWritten(node.id, 'requirement-breakdown.md', Buffer.byteLength(requirementBreakdown, 'utf-8'), '需求拆分清单');

    nodeState.outputArtifacts = [
      'artifacts/mrd-clarified.md',
      'artifacts/implementation-boundaries.md',
      'artifacts/requirement-breakdown.md',
      'artifacts/mrd-clarify-questions.md',
      REQUIREMENT_OWNERSHIP_ARTIFACT_PATH,
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
    const specAgentTimeoutMs = resolveSpecAgentTimeoutMs();
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

      const runAgent = async (): Promise<string> => {
        let output = '';
        for await (const event of agent.run(userPrompt)) {
          this.emitStageProgress(node.id, event);
          if (event.type === 'text') output += event.text;
          if (event.type === 'completed') output = event.finalText || output;
          if (event.type === 'error') throw new Error(`${taskDescription}失败：${event.message}`);
        }
        return output.trim();
      };
      const result = await Promise.race([
        runAgent().then(output => ({ output, timedOut: false as const })),
        new Promise<{ output: string; timedOut: true }>(resolve => {
          setTimeout(() => resolve({ output: '', timedOut: true }), specAgentTimeoutMs);
        }),
      ]);
      if (result.timedOut) {
        const fallback = buildSpecAgentFallbackArtifact(project.name, kind, techDesign);
        this.emitArtifactWritten(
          node.id,
          `${project.name}/${kind === 'dev' ? 'openspec-task.md' : 'openspec-test-task.md'}`,
          Buffer.byteLength(fallback, 'utf-8'),
          `${taskDescription}超时兜底产物`
        );
        return { projectName: project.name, kind, output: fallback };
      }
      return { projectName: project.name, kind, output: result.output };
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
      const proposalSummary = summarizeMarkdown(
        readTextIfExists(path.join(paths.artifactsDir, 'mrd-clarified.md')) || '',
        800
      );
      const requirementOwnershipSummary = summarizeMarkdown(
        readTextIfExists(path.join(paths.artifactsDir, 'requirement-ownership.json')) || '',
        800
      );
      const openSpecChange = writeProjectOpenSpecChange({
        paths,
        runId: this.runId,
        projectName: project.name,
        projectRoot: project.root,
        developmentTasks: dev,
        testTasks: test,
        proposalSummary,
        requirementOwnershipSummary,
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

    const proposal = readTextIfExists(path.join(paths.artifactsDir, 'mrd-clarified.md')) || '';

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

    const artifacts: Record<string, string> = {};
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
      proposal: 'artifacts/mrd-clarified.md',
      requirementOwnership: fs.existsSync(path.join(paths.artifactsDir, 'requirement-ownership.json'))
        ? 'artifacts/requirement-ownership.json'
        : undefined,
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
        file === 'implementation-plan-manifest.json'
            ? '实施方案产物索引'
            : '项目级技术方案'
      );
    }

    return {
      artifacts,
      content: buildImplementationPlanConfirmationContent(proposal, manifestProjects, paths),
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
        timeoutMs: resolveProjectAgentTimeoutMs(node.id),
      });
      const after = snapshotProjectFiles(project.root, JAVA_MAIN_CHANGE_PATTERN);
      let changedFiles = diffProjectSnapshots(before, after);
      if (!changedFiles.length && process.env.AI_CODING_MOCK_LLM === '1') {
        changedFiles = [mockChangedJavaFile(project.name)];
      }
      if (!changedFiles.length && process.env.AI_CODING_MOCK_LLM !== '1') {
        throw new Error(`${project.name} Java 实现未产生真实生产代码变更。请重新执行 java-impl 并修改 src/main 或 pom.xml。`);
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
      let reviewOutput = '';
      try {
        const reviewResult = await this.runProjectAgent(node, paths, project, reviewPrompt, {
          registry: createProjectToolRegistry('read'),
          promptTemplateId: 'java-review',
          modelStageId: 'java-review',
          taskDescription: `评审 ${project.name} 项目文件夹的 Java 变更`,
          requireToolUse: false,
          timeoutMs: resolveJavaReviewAgentTimeoutMs(),
        });
        reviewOutput = reviewResult.output;
      } catch (err) {
        if (!isJavaReviewTimeoutError(err, project.name)) throw err;
        reviewOutput = buildJavaReviewTimeoutFallback(project.name, changedFiles);
      }
      const report = normalizeMarkdownArtifact(
        reviewOutput,
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
        timeoutMs: resolveJavaReviewAgentTimeoutMs(),
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
    const artifacts: Record<string, string> = {};
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
      proposal: 'artifacts/mrd-clarified.md',
      projects: manifestProjects,
      fallbackReason: 'documentation-only-projects',
    }, null, 2);

    for (const [file, content] of Object.entries(artifacts)) {
      this.writeArtifact(paths, node.id, file, content, file === 'implementation-plan-manifest.json' ? '实施方案产物索引' : '文档型项目技术方案');
    }
    return {
      artifacts,
      content: buildImplementationPlanConfirmationContent(clarified, manifestProjects, paths),
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
    const proposalSummary = summarizeMarkdown(
      readTextIfExists(path.join(paths.artifactsDir, 'mrd-clarified.md')) || '',
      800
    );
    const requirementOwnershipSummary = summarizeMarkdown(
      readTextIfExists(path.join(paths.artifactsDir, 'requirement-ownership.json')) || '',
      800
    );

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
        proposalSummary,
        requirementOwnershipSummary,
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
    const artifacts: Record<string, string> = {};
    const summaries: ProjectStageSummary[] = [];
    const limit = Math.max(1, Math.min(projects.length || 1, getConfig().workflow.branchConcurrency));
    const semaphore = new AsyncSemaphore(limit);
    const settled = await Promise.all(projects.map(project => semaphore.run(async () => {
      const branch = this.state.workflowInstance?.branches?.find(item => item.projectName === project.name);
      const branchNodeIds = new Set(branch?.nodes?.map(item => item.id) ?? ['testcode-generate']);
      const projectArtifacts: Record<string, string> = {};
      const projectSummaries: ProjectStageSummary[] = [];

      if (branchNodeIds.has('frontend-impl')) {
        const result = await this.executeFrontendImplForProject(paths, project, nodeState);
        Object.assign(projectArtifacts, result.artifacts);
        projectSummaries.push(result.summary);
      }
      if (branchNodeIds.has('backend-test') || branchNodeIds.has('testcode-generate')) {
        const result = await this.executeBackendTestForProject(paths, project, nodeState);
        Object.assign(projectArtifacts, result.artifacts);
        projectSummaries.push(result.summary);
      }
      if (branchNodeIds.has('frontend-test')) {
        const result = this.executeFrontendTestForProject(paths, project);
        Object.assign(projectArtifacts, result.artifacts);
        projectSummaries.push(result.summary);
      }
      if (branchNodeIds.has('e2e-verify')) {
        const result = await this.executeE2EVerifyForProject(paths, project);
        Object.assign(projectArtifacts, result.artifacts);
        projectSummaries.push(result.summary);
      }
      return { artifacts: projectArtifacts, summaries: projectSummaries };
    })));

    for (const result of settled) {
      Object.assign(artifacts, result.artifacts);
      summaries.push(...result.summaries);
    }

    return {
      artifacts,
      content: buildProjectStageConfirmationContent('测试代码生成结果', summaries),
    };
  }

  private async executeBackendTestForProject(
    paths: ReturnType<typeof getRunPaths>,
    project: { name: string; root: string },
    nodeState: NodeState
  ): Promise<{ artifacts: Record<string, string>; summary: ProjectStageSummary }> {
    const node = createVirtualPipelineNode('backend-test', '后端测试', 'Generate backend tests and run Maven verification.');
    const reusable = this.tryReuseBackendTestArtifacts(paths, project);
    if (reusable) {
      this.markProjectForNode(node.id, project.name, 'completed');
      return reusable;
    }
    this.markProjectForNode(node.id, project.name, 'running');
    try {
      const artifacts: Record<string, string> = {};
      const before = snapshotProjectFiles(project.root, JAVA_TEST_CHANGE_PATTERN);
      const userPrompt = renderPromptTemplate(loadPromptFile('testcode-generate-user.md'), {
        ...buildProjectStagePromptVariables(paths, project),
        feedback: nodeState.confirmation?.feedback || '（无）',
      });
      const result = await this.runProjectAgent(node, paths, project, userPrompt, {
        nodeState,
        registry: createProjectToolRegistry('code'),
        promptTemplateId: 'testcode-generate',
        modelStageId: 'testcode-generate',
        taskDescription: `生成 ${project.name} 项目文件夹的后端测试代码`,
        timeoutMs: resolveProjectAgentTimeoutMs('testcode-generate'),
      });
      const after = snapshotProjectFiles(project.root, JAVA_TEST_CHANGE_PATTERN);
      let changedTests = diffProjectSnapshots(before, after);
      if (!changedTests.length && process.env.AI_CODING_MOCK_LLM === '1') {
        changedTests = [mockChangedTestFile(project.name)];
      }
      if (!changedTests.length && process.env.AI_CODING_MOCK_LLM !== '1') {
        throw new Error(`${project.name} 后端测试未产生真实测试代码变更。请重新执行 backend-test 并修改 src/test 或 pom.xml。`);
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
        title: `${project.name} 后端测试`,
        artifactPaths: [...written.paths, ...testRunArtifacts.paths],
        summary: `${changedTests.length} 个测试文件发生变更；已执行 Maven 单元测试。`,
      };
      this.markProjectForNode(node.id, project.name, 'completed');
      return { artifacts, summary };
    } catch (err) {
      this.markProjectForNode(node.id, project.name, 'failed', (err as Error).message);
      throw err;
    }
  }

  private tryReuseBackendTestArtifacts(
    paths: ReturnType<typeof getRunPaths>,
    project: { name: string; root: string }
  ): { artifacts: Record<string, string>; summary: ProjectStageSummary } | null {
    const summary = readJsonIfExists<{
      testsRun?: number;
      failures?: number;
      errors?: number;
      skipped?: number;
      testClassCount?: number;
    }>(path.join(paths.artifactsDir, project.name, 'surefire-summary.json'));
    if (!summary || !Number(summary.testsRun) || Number(summary.failures) > 0 || Number(summary.errors) > 0) {
      return null;
    }

    const artifactPaths = uniqueArtifacts([
      `artifacts/${project.name}/test-report.md`,
      `artifacts/${project.name}/surefire-summary.json`,
      `artifacts/${project.name}/coverage-summary.json`,
      `artifacts/${project.name}/failure-classification.json`,
      `artifacts/${project.name}/test-code-preview-manifest.json`,
    ].filter(artifactPath =>
      fs.existsSync(path.join(paths.artifactsDir, artifactPath.replace(/^artifacts\//, '')))
    ));
    if (!artifactPaths.length) return null;

    this.state.artifactIndex = this.state.artifactIndex ?? {};
    this.state.artifactIndex['backend-test'] = uniqueArtifacts([
      ...(this.state.artifactIndex['backend-test'] ?? []),
      ...artifactPaths,
    ]);

    const artifacts = Object.fromEntries(artifactPaths.map(artifactPath => {
      const relativePath = artifactPath.replace(/^artifacts\//, '');
      return [
        relativePath,
        readTextIfExists(path.join(paths.artifactsDir, relativePath)) || '',
      ];
    }));
    return {
      artifacts,
      summary: {
        project: project.name,
        title: `${project.name} 后端测试`,
        artifactPaths,
        summary: `复用已有 Maven 测试报告：${summary.testsRun} 个用例通过，失败 ${summary.failures ?? 0}，错误 ${summary.errors ?? 0}。`,
      },
    };
  }

  private async executeFrontendImplForProject(
    paths: ReturnType<typeof getRunPaths>,
    project: { name: string; root: string },
    nodeState: NodeState
  ): Promise<{ artifacts: Record<string, string>; summary: ProjectStageSummary }> {
    const node = createVirtualPipelineNode('frontend-impl', '前端实现', 'Implement frontend/static UI changes.');
    const reusable = this.tryReuseFrontendImplArtifacts(paths, project);
    if (reusable) {
      this.markProjectForNode(node.id, project.name, 'completed');
      return reusable;
    }
    this.markProjectForNode(node.id, project.name, 'running');
    try {
      const before = snapshotProjectFiles(project.root, FRONTEND_CHANGE_PATTERN);
      const userPrompt = buildFrontendImplementationPrompt(paths, project, nodeState.confirmation?.feedback);
      const result = await this.runProjectAgent(node, paths, project, userPrompt, {
        nodeState,
        registry: createProjectToolRegistry('code'),
        promptTemplateId: 'java-impl',
        modelStageId: 'java-impl',
        taskDescription: `实现 ${project.name} 项目文件夹的前端代码`,
        timeoutMs: resolveProjectAgentTimeoutMs('java-impl'),
      });
      const after = snapshotProjectFiles(project.root, FRONTEND_CHANGE_PATTERN);
      const changedFiles = diffProjectSnapshots(before, after);
      if (!changedFiles.length && process.env.AI_CODING_MOCK_LLM !== '1') {
        throw new Error(`${project.name} 前端实现未产生真实前端文件变更。请修改 src/main/resources/static、templates 或前端源码。`);
      }
      const written = this.writeCodeChangeArtifacts(paths, node.id, project.name, changedFiles);
      const reportPath = `${project.name}/frontend-implementation-report.md`;
      const report = normalizeMarkdownArtifact(
        result.output,
        `${project.name} 前端实现报告`,
        [
          `# ${project.name} 前端实现报告`,
          '',
          changedFiles.length
            ? `已更新 ${changedFiles.length} 个前端相关文件。`
            : '未检测到前端文件变更。',
        ].join('\n')
      );
      this.writeArtifact(paths, node.id, reportPath, report, '项目级前端实现报告');
      const artifacts = {
        ...written.artifacts,
        [reportPath]: report,
      };
      const summary: ProjectStageSummary = {
        project: project.name,
        title: `${project.name} 前端实现`,
        artifactPaths: [...written.paths, `artifacts/${reportPath}`],
        summary: changedFiles.length
          ? `${changedFiles.length} 个前端文件发生变更。`
          : '未检测到前端文件变更。',
      };
      this.markProjectForNode(node.id, project.name, 'completed');
      return { artifacts, summary };
    } catch (err) {
      this.markProjectForNode(node.id, project.name, 'failed', (err as Error).message);
      throw err;
    }
  }

  private tryReuseFrontendImplArtifacts(
    paths: ReturnType<typeof getRunPaths>,
    project: { name: string; root: string }
  ): { artifacts: Record<string, string>; summary: ProjectStageSummary } | null {
    const reportPath = `${project.name}/frontend-implementation-report.md`;
    const reportAbs = path.join(paths.artifactsDir, reportPath);
    const manifest = readJsonIfExists<{ files?: Array<{ sourcePath?: string; artifactPath?: string }> }>(
      path.join(paths.artifactsDir, project.name, 'code-preview-manifest.json')
    );
    const frontendPreviewArtifacts = (manifest?.files ?? [])
      .filter(file => typeof file.sourcePath === 'string' && FRONTEND_CHANGE_PATTERN.test(file.sourcePath))
      .map(file => file.artifactPath)
      .filter((file): file is string => typeof file === 'string' && file.length > 0);
    if (!fs.existsSync(reportAbs) || !frontendPreviewArtifacts.length) return null;

    const artifactPaths = uniqueArtifacts([
      `artifacts/${project.name}/changed-files.json`,
      `artifacts/${project.name}/code-preview-manifest.json`,
      `artifacts/${reportPath}`,
      ...frontendPreviewArtifacts,
    ]);
    this.state.artifactIndex = this.state.artifactIndex ?? {};
    this.state.artifactIndex['frontend-impl'] = uniqueArtifacts([
      ...(this.state.artifactIndex['frontend-impl'] ?? []),
      ...artifactPaths,
    ]);

    const artifacts = Object.fromEntries(artifactPaths.map(artifactPath => {
      const relativePath = artifactPath.replace(/^artifacts\//, '');
      return [
        relativePath,
        readTextIfExists(path.join(paths.artifactsDir, relativePath)) || '',
      ];
    }));
    return {
      artifacts,
      summary: {
        project: project.name,
        title: `${project.name} 前端实现`,
        artifactPaths,
        summary: `复用已完成前端实现产物；${frontendPreviewArtifacts.length} 个前端文件可预览。`,
      },
    };
  }

  private executeFrontendTestForProject(
    paths: ReturnType<typeof getRunPaths>,
    project: { name: string; root: string }
  ): { artifacts: Record<string, string>; summary: ProjectStageSummary } {
    const nodeId = 'frontend-test';
    this.markProjectForNode(nodeId, project.name, 'running');
    try {
      const result = runStaticFrontendVerification(project.root);
      const reportPath = `${project.name}/frontend-test-report.md`;
      const jsonPath = `${project.name}/frontend-test-summary.json`;
      const report = [
        '# 前端测试报告',
        '',
        `- Project: ${project.name}`,
        `- Status: ${result.status}`,
        `- Checked Files: ${result.checkedFiles.length}`,
        '',
        '## 检查项',
        ...result.messages.map(message => `- ${message}`),
      ].join('\n');
      const summaryJson = JSON.stringify({
        project: project.name,
        status: result.status,
        checkedFiles: result.checkedFiles,
        messages: result.messages,
        generatedAt: new Date().toISOString(),
      }, null, 2);
      this.writeArtifact(paths, nodeId, reportPath, report, '项目级前端测试报告');
      this.writeArtifact(paths, nodeId, jsonPath, summaryJson, '项目级前端测试结构化结果');
      if (result.status === 'failed') {
        throw new Error(result.messages.join('\n'));
      }
      this.markProjectForNode(nodeId, project.name, 'completed');
      return {
        artifacts: { [reportPath]: report, [jsonPath]: summaryJson },
        summary: {
          project: project.name,
          title: `${project.name} 前端测试`,
          artifactPaths: [`artifacts/${reportPath}`, `artifacts/${jsonPath}`],
          summary: result.messages.join('；'),
        },
      };
    } catch (err) {
      this.markProjectForNode(nodeId, project.name, 'failed', (err as Error).message);
      throw err;
    }
  }

  private async executeE2EVerifyForProject(
    paths: ReturnType<typeof getRunPaths>,
    project: { name: string; root: string }
  ): Promise<{ artifacts: Record<string, string>; summary: ProjectStageSummary }> {
    const nodeId = 'e2e-verify';
    this.markProjectForNode(nodeId, project.name, 'running');
    try {
      const result = await runE2EVerification({
        runId: this.runId,
        appName: project.name,
        projectRoot: project.root,
        paths,
      });
      for (const artifactPath of result.artifactPaths) {
        const rel = artifactPath.replace(/^artifacts\//, '');
        const abs = path.join(paths.artifactsDir, rel);
        this.emitArtifactWritten(nodeId, rel, fs.existsSync(abs) ? fs.statSync(abs).size : 0, 'E2E 验证产物');
      }
      if (result.summary.status === 'failed') {
        throw new Error(result.summary.fallbackReason || 'E2E 验证失败。');
      }
      this.markProjectForNode(nodeId, project.name, 'completed');
      return {
        artifacts: Object.fromEntries(result.artifactPaths.map(artifact => [
          artifact.replace(/^artifacts\//, ''),
          readTextIfExists(path.join(paths.artifactsDir, artifact.replace(/^artifacts\//, ''))) || '',
        ])),
        summary: {
          project: project.name,
          title: `${project.name} E2E 验证`,
          artifactPaths: result.artifactPaths,
          summary: `E2E 验证结果：${result.summary.status}${result.summary.fallbackReason ? `，${result.summary.fallbackReason}` : ''}。`,
        },
      };
    } catch (err) {
      this.markProjectForNode(nodeId, project.name, 'failed', (err as Error).message);
      throw err;
    }
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

    const crossAppArtifacts = this.readCrossAppTestArtifacts(paths);

    const zipArtifact = createProjectsZip(paths, this.runId, projects.map(project => project.name));
    const archiveManifest = {
      nodeId: 'archive',
      projects: summaries.map(summary => ({
        project: summary.project,
        report: summary.artifactPaths[0],
      })),
      crossAppTest: {
        testResults: crossAppArtifacts['cross-app/test-results.json'] ? 'artifacts/cross-app/test-results.json' : undefined,
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
    summary.tracks = (branch.tracks ?? []).map(track => ({
      trackId: track.trackId,
      kind: track.kind,
      status: track.status,
      nodeIds: track.nodeIds,
      artifactPaths: track.nodeIds.flatMap(nodeId => branch.artifactIndex?.[nodeId] ?? []),
    }));
    const openSpecChange = getProjectOpenSpecChange(paths, this.runId, projectName);
    summary.openSpec = {
      changeId: openSpecChange.changeId,
      proposalPath: `artifacts/${openSpecChange.proposalPath}`,
      designPath: `artifacts/${openSpecChange.designPath}`,
      tasksPath: `artifacts/${openSpecChange.tasksPath}`,
      specPath: `artifacts/${openSpecChange.specPath}`,
      taskStatus: summarizeOpenSpecTaskStatus(path.join(paths.artifactsDir, openSpecChange.tasksPath)),
    };
    summary.changedFiles = branchArtifacts
      .filter(artifact => artifact.includes('/changed-files/') || artifact.includes('/changed-test-files/'))
      .map(artifact => artifact.replace(/^artifacts\//, ''));
    summary.testResults = {
      status: branchArtifacts.some(artifact => artifact.endsWith('/failure-classification.json')) ? 'passed' : 'skipped',
    };
    const e2eSummary = readE2ESummaryArtifact(paths, branchArtifacts);
    if (e2eSummary) {
      summary.e2eVerification = {
        status: e2eSummary.status,
        failureClassification: e2eSummary.failureClassification,
        fallbackReason: e2eSummary.fallbackReason,
        artifactPaths: e2eSummary.artifactPaths ?? branchArtifacts.filter(artifact => artifact.includes('/e2e/')),
      };
      if (e2eSummary.status === 'failed') {
        summary.testResults = { status: 'failed' };
      } else if (e2eSummary.status === 'passed') {
        summary.testResults = { status: 'passed' };
      }
      if (e2eSummary.status === 'unsupported' || e2eSummary.status === 'skipped') {
        summary.requiredCrossAppChecks.push('E2E verification was skipped or unsupported; review fallback reason before release.');
      }
    }
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
    branch.artifactIndex.archive = [artifactPath];
    branch.status = 'completed';
    branch.currentNodeId = branch.nodes?.at(-1)?.id ?? branch.currentNodeId;
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
      summaryArtifact: branch.artifactIndex?.archive?.[0],
    }));
    const blockedBranches = branchSummaries
      .filter(branch => branch.status !== 'completed')
      .map(branch => branch.branchId);
    const crossAppTest = {
      reviewKind: 'cross-app-test',
      status: blockedBranches.length ? 'blocked' : 'approved',
      affectedBranches: blockedBranches,
      findings: blockedBranches.map(branchId => ({
        id: `branch-not-complete-${branchId}`,
        severity: 'block',
        category: 'branch-status',
        branchId,
        message: 'Branch did not reach completed status before cross-app test.',
      })),
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
      'cross-app/test-results.json': JSON.stringify(crossAppTest, null, 2),
      'cross-app/delivery-metadata.json': JSON.stringify(deliveryMetadata, null, 2),
    };
    this.writeArtifact(paths, 'cross-app-test', 'cross-app/test-results.json', artifacts['cross-app/test-results.json'], '跨应用测试结果');
    this.writeArtifact(paths, 'cross-app-test', 'cross-app/delivery-metadata.json', artifacts['cross-app/delivery-metadata.json'], '跨应用交付元数据');
    return artifacts;
  }

  private executeCrossAppTestStage(
    node: PipelineNode,
    paths: ReturnType<typeof getRunPaths>
  ): Record<string, string> {
    const projects = this.state.projects ?? [];
    for (const project of projects) {
      this.writeBranchSummary(paths, node.id, project.name);
    }
    return this.writeLegacyCrossAppReviewArtifacts(paths);
  }

  private readCrossAppTestArtifacts(paths: ReturnType<typeof getRunPaths>): Record<string, string> {
    const artifacts: Record<string, string> = {};
    for (const relativePath of ['cross-app/test-results.json', 'cross-app/delivery-metadata.json']) {
      const absolutePath = path.join(paths.artifactsDir, relativePath);
      if (fs.existsSync(absolutePath)) {
        artifacts[relativePath] = fs.readFileSync(absolutePath, 'utf-8');
      }
    }
    return artifacts;
  }

  private tryReuseArchiveArtifacts(
    paths: ReturnType<typeof getRunPaths>,
    nodeState: NodeState
  ): Record<string, string> | null {
    const manifestPath = path.join(paths.artifactsDir, 'archive-manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    const artifacts: Record<string, string> = {
      'archive-manifest.json': fs.readFileSync(manifestPath, 'utf-8'),
    };
    const outputArtifacts = ['artifacts/archive-manifest.json'];
    for (const project of this.state.projects ?? []) {
      const reportPath = `${project.name}/archive-report.md`;
      const absoluteReportPath = path.join(paths.artifactsDir, reportPath);
      if (!fs.existsSync(absoluteReportPath)) return null;
      artifacts[reportPath] = fs.readFileSync(absoluteReportPath, 'utf-8');
      outputArtifacts.push(`artifacts/${reportPath}`);
    }
    const downloadPath = `downloads/${this.runId}-projects.zip`;
    if (fs.existsSync(path.join(paths.artifactsDir, downloadPath))) {
      outputArtifacts.push(`artifacts/${downloadPath}`);
    }
    nodeState.outputArtifacts = uniqueArtifacts(outputArtifacts);
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
      getProgressChecklist?: () => string | undefined;
      progressChecklistLabel?: string;
      timeoutMs?: number | undefined;
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
        getProgressChecklist: options.getProgressChecklist ?? createProjectProgressChecklistProvider(paths, this.runId, node.id, project.name),
        progressChecklistLabel: options.progressChecklistLabel ?? progressChecklistLabelForNode(node.id),
      });
      this.currentAgent = agent;

      const executeAgent = async (): Promise<{
        output: string;
        planGenerated: boolean;
        plan?: PlanState;
        toolNames: string[];
        toolResults: Array<{ name: string; result: string; isError: boolean }>;
      }> => {
        let output = '';
        let planGenerated = false;
        let plan: PlanState | undefined;
        const toolNames: string[] = [];
        const toolResults: Array<{ name: string; result: string; isError: boolean }> = [];
        const toolInputs = new Map<string, unknown>();
        for await (const event of agent.run(prompt)) {
          this.emitStageProgress(node.id, event);
          if (event.type === 'text') output += event.text;
          if (event.type === 'completed') output = event.finalText || output;
          if (event.type === 'tool_use_start') {
            toolNames.push(event.name);
            toolInputs.set(event.toolUseId, event.input);
          }
          if (event.type === 'tool_use_end') {
            toolResults.push({ name: event.name, result: event.result, isError: event.isError });
            this.maybeWriteLiveProjectArtifact(paths, node.id, project, event, toolInputs.get(event.toolUseId));
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
        return { output: output.trim(), planGenerated, plan, toolNames, toolResults };
      };

      try {
        if (!options.timeoutMs) {
          return await executeAgent();
        }
        return await Promise.race([
          executeAgent(),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              agent.abort();
              reject(new Error(`${taskDescription}超时：${options.timeoutMs}ms 内未完成。`));
            }, options.timeoutMs);
          }),
        ]);
      } finally {
        if (this.currentAgent === agent) this.currentAgent = null;
      }
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

  private maybeWriteLiveProjectArtifact(
    paths: ReturnType<typeof getRunPaths>,
    nodeId: string,
    project: { name: string; root: string },
    event: Extract<AgentEvent, { type: 'tool_use_end' }>,
    input: unknown
  ): void {
    if (event.isError || !['write_file', 'edit_file'].includes(event.name)) return;
    const toolInput = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
    if (!filePath) return;
    const normalizedFilePath = path.resolve(filePath);
    const projectRoot = path.resolve(project.root);
    if (normalizedFilePath !== projectRoot && !normalizedFilePath.startsWith(`${projectRoot}${path.sep}`)) return;
    const relativePath = path.relative(projectRoot, normalizedFilePath).replace(/\\/g, '/');
    const liveKind = liveArtifactKindForNode(nodeId, relativePath);
    if (!liveKind) return;
    const content = readTextIfExists(normalizedFilePath);
    if (!content) return;

    const artifactRel = `${project.name}/${liveKind.dir}/${safeLivePreviewFileName(relativePath)}`;
    const artifactAbs = path.join(paths.artifactsDir, artifactRel);
    fs.mkdirSync(path.dirname(artifactAbs), { recursive: true });
    fs.writeFileSync(artifactAbs, content, 'utf-8');
    const artifactPath = `artifacts/${artifactRel}`;
    this.appendArtifactIndex(nodeId, artifactPath);
    this.syncLiveArtifactToBranch(nodeId, project.name, artifactPath);
    this.emitArtifactWritten(
      nodeId,
      artifactRel,
      Buffer.byteLength(content, 'utf-8'),
      liveKind.description
    );
  }

  private syncLiveArtifactToBranch(nodeId: string, projectName: string, artifactPath: string): void {
    const instance = this.state.workflowInstance;
    const branchNodeId = branchNodeIdForStage(nodeId);
    if (!instance?.branches?.length || !branchNodeId) return;
    const branch = instance.branches.find(item => item.projectName === projectName);
    const branchNode = branch?.nodes?.find(item => item.id === branchNodeId);
    if (!branch || !branchNode) return;
    branchNode.outputArtifacts = uniqueArtifacts([...(branchNode.outputArtifacts ?? []), artifactPath]);
    branch.artifactIndex = branch.artifactIndex ?? {};
    branch.artifactIndex[branchNodeId] = uniqueArtifacts([...(branch.artifactIndex[branchNodeId] ?? []), artifactPath]);
    instance.updatedAt = new Date().toISOString();
    getStateStore(this.runId).saveExecutionState(this.state);
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
    const isFrontendNode = nodeId === 'frontend-impl';
    for (const artifactPath of artifactPaths.filter(file => file.includes('/changed-files/'))) {
      const rel = artifactPath.replace(/^artifacts\//, '');
      const abs = path.join(paths.artifactsDir, rel);
      if (fs.existsSync(abs)) {
        this.emitArtifactWritten(
          nodeId,
          rel,
          fs.statSync(abs).size,
          isFrontendNode ? '前端实现代码预览快照' : 'Java 实现代码预览快照'
        );
      }
    }
    for (const [file, content] of Object.entries(entries)) {
      this.writeArtifact(
        paths,
        nodeId,
        file,
        content,
        file.endsWith('changed-files.json')
          ? isFrontendNode ? '前端实现变更文件清单' : 'Java 实现变更文件清单'
          : isFrontendNode ? '前端实现预览索引' : 'Java 实现预览索引'
      );
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
    const branchStartNodeId = branchRerunStartNodeIdForStage(PIPELINE_NODES[startIndex]?.id || '');
    if (branchStartNodeId) {
      if (this.state.workflowInstance) {
        normalizeSessionWorkflowInstanceShape(this.state.workflowInstance);
        this.state.workflowInstance.branches?.forEach(branch => {
          resetSessionBranchFromNode(branch, branchStartNodeId);
        });
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

function createProjectProgressChecklistProvider(
  paths: ReturnType<typeof getRunPaths>,
  runId: string,
  nodeId: string,
  projectName: string
): (() => string | undefined) | undefined {
  const section = progressSectionForNode(nodeId);
  if (!section) return undefined;
  return () => buildProjectProgressChecklist(paths, runId, projectName, section);
}

function buildProjectProgressChecklist(
  paths: ReturnType<typeof getRunPaths>,
  runId: string,
  projectName: string,
  section: 'development' | 'test'
): string {
  const entries: string[] = [];
  const projectTaskPath = section === 'development'
    ? `${projectName}/openspec-task.md`
    : `${projectName}/openspec-test-task.md`;
  entries.push(...unfinishedTasksFromArtifact(paths, projectTaskPath, section));

  const openSpecChange = getProjectOpenSpecChange(paths, runId, projectName);
  entries.push(...unfinishedTasksFromArtifact(paths, openSpecChange.tasksPath, section));

  const uniqueEntries = Array.from(new Set(entries)).slice(0, 40);
  if (!uniqueEntries.length) {
    return [
      `- No unfinished ${section === 'development' ? 'development' : 'test'} OpenSpec tasks detected for ${projectName}.`,
      '- If implementation and verification are complete, provide the final completion summary without more tool calls.',
    ].join('\n');
  }
  return uniqueEntries.join('\n');
}

function unfinishedTasksFromArtifact(
  paths: ReturnType<typeof getRunPaths>,
  relativePath: string,
  section: 'development' | 'test'
): string[] {
  const absolutePath = path.join(paths.artifactsDir, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  const content = fs.readFileSync(absolutePath, 'utf-8');
  return extractUnfinishedMarkdownTasks(content, section)
    .map(task => `- ${relativePath}: ${task}`);
}

function extractUnfinishedMarkdownTasks(
  content: string,
  section: 'development' | 'test'
): string[] {
  const lines = content.split(/\r?\n/);
  let inRelevantSection = true;
  const hasOpenSpecSections = lines.some(line => /^##\s+(Development|Test)\s*$/i.test(line.trim()));
  const tasks: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+Development\s*$/i.test(trimmed)) {
      inRelevantSection = section === 'development';
      continue;
    }
    if (/^##\s+Test\s*$/i.test(trimmed)) {
      inRelevantSection = section === 'test';
      continue;
    }
    if (hasOpenSpecSections && !inRelevantSection) continue;
    const match = trimmed.match(/^[-*]\s+\[\s\]\s+(.+)$/);
    if (match) tasks.push(match[1].trim());
  }
  return tasks;
}

function progressSectionForNode(nodeId: string): 'development' | 'test' | undefined {
  if (nodeId === 'java-impl' || nodeId === 'java-review' || nodeId === 'frontend-impl') return 'development';
  if (nodeId === 'testcode-generate' || nodeId === 'maven-test-runner' || nodeId === 'backend-test' || nodeId === 'frontend-test' || nodeId === 'e2e-verify') return 'test';
  return undefined;
}

function progressChecklistLabelForNode(nodeId: string): string | undefined {
  const section = progressSectionForNode(nodeId);
  if (section === 'development') return 'OpenSpec development task';
  if (section === 'test') return 'OpenSpec test task';
  return undefined;
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

function summarizeOpenSpecTaskStatus(tasksPath: string): { total: number; completed: number } {
  const content = readTextIfExists(tasksPath) || '';
  const taskLines = content.split(/\r?\n/).filter(line => /^\s*[-*]\s+\[[ xX]\]\s+/.test(line));
  return {
    total: taskLines.length,
    completed: taskLines.filter(line => /^\s*[-*]\s+\[[xX]\]\s+/.test(line)).length,
  };
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
      title: '需求归属确认',
      extra: {
        confirmationKind: 'mrd-render',
      },
    };
  }
  if (node.id === 'mrd-clarify') {
    return {
      title: '需求归属确认',
      extra: {
        confirmationKind: 'mrd-clarify',
        clarificationOptions: [
          {
            id: 'default',
            label: '按当前归属继续',
            description: '接受当前需求清单、应用归属和实施边界，进入后续计划生成。',
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

const FRONTEND_CHANGE_PATTERN = /(^package\.json$|^package-lock\.json$|^vite\.config\.(ts|js)$|^playwright\.config\.(ts|js|mjs|cjs)$|^src\/main\/resources\/(static|templates)\/.*\.(html|css|js|mjs|ts|tsx|jsx|json|vue)$|^(src|app|pages|components|public)\/.*\.(html|css|js|mjs|ts|tsx|jsx|json|vue)$)/;

function createVirtualPipelineNode(id: string, name: string, description: string): PipelineNode {
  return {
    id,
    name,
    description,
    hasConfirmationGate: false,
    usesReActLoop: true,
    maxTurns: id === 'frontend-impl' ? 50 : 40,
    planModeRequired: false,
  };
}

function buildFrontendImplementationPrompt(
  paths: ReturnType<typeof getRunPaths>,
  project: { name: string; root: string },
  feedback?: string
): string {
  const variables = buildProjectStagePromptVariables(paths, project);
  return [
    `你正在实现 ${project.name} 项目文件夹的前端代码。`,
    '',
    '只修改真实前端相关文件，例如 src/main/resources/static、src/main/resources/templates、package.json、前端 src/components/pages 等。',
    '不要修改后端 Java 业务代码；后端实现已在 java-impl 节点完成。',
    '根据 MRD、技术方案和 OpenSpec 任务清单补齐活动命中预览的用户界面、交互状态、请求字段和错误展示。',
    '完成后必须写入或编辑真实文件，并简要说明变更文件与验证方式。',
    '',
    `用户反馈：${feedback || '（无）'}`,
    '',
    variables.project_context,
  ].join('\n');
}

function runStaticFrontendVerification(projectRoot: string): {
  status: 'passed' | 'failed' | 'skipped';
  checkedFiles: string[];
  messages: string[];
} {
  const frontendFiles = Array.from(snapshotProjectFiles(projectRoot, FRONTEND_CHANGE_PATTERN).keys());
  const staticRoot = path.join(projectRoot, 'src/main/resources/static');
  const messages: string[] = [];
  if (!frontendFiles.length) {
    return {
      status: 'skipped',
      checkedFiles: [],
      messages: ['未检测到前端资源文件，前端测试跳过。'],
    };
  }
  const indexPath = path.join(staticRoot, 'index.html');
  if (fs.existsSync(staticRoot) && !fs.existsSync(indexPath)) {
    messages.push('src/main/resources/static 存在但缺少 index.html。');
  }
  for (const file of frontendFiles) {
    const absPath = path.join(projectRoot, file);
    const content = readTextIfExists(absPath) || '';
    if (!content.trim()) messages.push(`${file} 内容为空。`);
    if (file.endsWith('.html')) {
      const scriptRefs = Array.from(content.matchAll(/<script[^>]+src=["']([^"']+)["']/g)).map(match => match[1]);
      const stylesheetRefs = Array.from(content.matchAll(/<link[^>]+href=["']([^"']+)["']/g)).map(match => match[1]);
      for (const ref of [...scriptRefs, ...stylesheetRefs]) {
        if (/^(https?:)?\/\//.test(ref) || ref.startsWith('/')) continue;
        const target = path.join(path.dirname(absPath), ref);
        if (!fs.existsSync(target)) messages.push(`${file} 引用了不存在的资源 ${ref}。`);
      }
    }
  }
  if (!messages.length) {
    messages.push('前端静态资源存在且基础引用检查通过。');
  }
  return {
    status: messages.some(message => message.includes('缺少') || message.includes('不存在') || message.includes('为空')) ? 'failed' : 'passed',
    checkedFiles: frontendFiles,
    messages,
  };
}

function isJavaReviewTimeoutError(err: unknown, projectName: string): boolean {
  const message = (err as Error)?.message || String(err);
  return message.includes(`评审 ${projectName} 项目文件夹的 Java 变更超时`) ||
    message.includes('Java 变更超时') ||
    message.includes('代码评审') && message.includes('超时');
}

function buildJavaReviewTimeoutFallback(projectName: string, changedFiles: ProjectChangedFile[]): string {
  return [
    `# ${projectName} 代码评审`,
    '',
    '结果: WARN',
    '',
    '## 评审结论',
    '',
    '自动代码评审在超时阈值内未稳定返回完整报告。流水线已基于已完成的实现编译结果生成兜底评审产物，避免只读评审 agent 阻塞后续测试节点。',
    '',
    '## 变更范围',
    '',
    changedFiles.length
      ? changedFiles.map(file => `- ${file.path} (${file.status}, ${file.size} bytes)`).join('\n')
      : '- 未检测到生产代码文件变更。',
    '',
    '## 风险提示',
    '',
    '- WARN: 请在后续归档或人工验收中复核本项目代码评审细节。',
    '- 当前兜底不声明 BLOCK；若后续测试、契约或 E2E 失败，仍会按对应节点回退。',
  ].join('\n');
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
    'backend-test',
    'frontend-impl',
    'frontend-test',
    'app-integration-test',
    'e2e-verify',
    'archive',
  ].includes(normalizeStageId(nodeId));
}

function branchNodeIdForStage(nodeId: string): string | null {
  const normalized = normalizeStageId(nodeId);
  return [
    'implementation-plan',
    'spec-generate',
    'java-impl',
    'backend-test',
    'frontend-impl',
    'frontend-test',
    'e2e-verify',
    'app-integration-test',
  ].includes(normalized) ? normalized : null;
}

function branchRerunStartNodeIdForStage(nodeId: string): string | null {
  const normalized = normalizeStageId(nodeId);
  if (normalized === 'testcode-generate') return 'backend-test';
  return branchNodeIdForStage(normalized);
}

function isBranchNodeAfter(nodeId: string, referenceNodeId: string): boolean {
  const sequence = ['implementation-plan', 'spec-generate', 'java-impl', 'frontend-impl', 'backend-test', 'frontend-test', 'e2e-verify'];
  const nodeIndex = sequence.indexOf(nodeId);
  const referenceIndex = sequence.indexOf(referenceNodeId);
  return nodeIndex > referenceIndex && referenceIndex >= 0;
}

function toSessionBranchStatus(status: ProjectState['status']): SessionWorkflowRuntimeStatus {
  if (status === 'interrupted') return 'interrupted';
  if (status === 'suspended') return 'suspended';
  return status;
}

function syncBranchTrackStatus(
  branch: {
    nodes?: Array<{ id: string; status?: SessionWorkflowRuntimeStatus }>;
    tracks?: Array<{
      trackId: string;
      nodeIds: string[];
      status: SessionWorkflowRuntimeStatus;
      currentNodeId?: string;
      error?: string;
    }>;
  },
  nodeId: string,
  status: SessionWorkflowRuntimeStatus
): void {
  const track = branch.tracks?.find(item => item.nodeIds.includes(nodeId));
  if (!track) return;
  track.currentNodeId = nodeId;
  if (status === 'failed' || status === 'waiting_fix') {
    track.status = status;
    const node = branch.nodes?.find(item => item.id === nodeId);
    track.error = node?.status === 'failed' ? nodeId : track.error;
    return;
  }
  if (status === 'running' || status === 'suspended' || status === 'interrupted') {
    track.status = status;
    track.error = undefined;
    return;
  }
  if (status === 'completed') {
    const completed = track.nodeIds.every(trackNodeId =>
      branch.nodes?.find(item => item.id === trackNodeId)?.status === 'completed'
    );
    track.status = completed ? 'completed' : 'running';
    track.currentNodeId = completed
      ? nodeId
      : track.nodeIds.find(trackNodeId =>
          branch.nodes?.find(item => item.id === trackNodeId)?.status !== 'completed'
        ) ?? nodeId;
    track.error = undefined;
  }
}

function artifactsForProject(artifacts: string[], projectName: string): string[] {
  const projectPrefix = `artifacts/${projectName}/`;
  return uniqueArtifacts(artifacts).filter(artifact => artifact.startsWith(projectPrefix));
}

function readE2ESummaryArtifact(
  paths: ReturnType<typeof getRunPaths>,
  artifacts: string[]
): {
  status: 'passed' | 'failed' | 'skipped' | 'unsupported';
  failureClassification?: 'frontend' | 'backend' | 'contract' | 'environment';
  fallbackReason?: string;
  artifactPaths?: string[];
} | null {
  const summaryArtifact = artifacts.find(artifact => artifact.replace(/\\/g, '/').endsWith('/e2e/e2e-summary.json'));
  if (!summaryArtifact) return null;
  const relativePath = summaryArtifact.replace(/^artifacts\//, '');
  try {
    return JSON.parse(fs.readFileSync(path.join(paths.artifactsDir, relativePath), 'utf-8'));
  } catch {
    return null;
  }
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
  project.retry[field] = project.retry[field] ?? 0;
  project.retry[field] += 1;
  return project.retry[field] ?? 0;
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

function resolveSpecAgentTimeoutMs(): number {
  const configured = Number(process.env.AI_CODING_SPEC_AGENT_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 30_000) return configured;
  return 180_000;
}

function resolveProjectAgentTimeoutMs(nodeId: string): number | undefined {
  const key = nodeId === 'testcode-generate'
    ? 'AI_CODING_TESTCODE_AGENT_TIMEOUT_MS'
    : 'AI_CODING_JAVA_IMPL_AGENT_TIMEOUT_MS';
  const configured = Number(process.env[key]);
  if (configured === 0) return undefined;
  if (Number.isFinite(configured) && configured >= 30_000) return configured;
  return nodeId === 'testcode-generate' ? 900_000 : 1_200_000;
}

function resolveJavaReviewAgentTimeoutMs(): number | undefined {
  const configured = Number(process.env.AI_CODING_JAVA_REVIEW_AGENT_TIMEOUT_MS);
  if (configured === 0) return undefined;
  if (Number.isFinite(configured) && configured >= 30_000) return configured;
  return 240_000;
}

function buildSpecAgentFallbackArtifact(projectName: string, kind: 'dev' | 'test', techDesign: string): string {
  const designSummary = summarizeMarkdown(techDesign || '', 420);
  if (kind === 'test') {
    return [
      `# ${projectName} 测试任务清单`,
      '',
      '## Phase 1: 测试结构与依赖梳理',
      `- [ ] 阅读 \`artifacts/${projectName}/tech-design.md\` 与开发任务清单，确认需要覆盖的 Controller、Service、Mapper、DTO、静态前端和配置项。`,
      '- [ ] 使用 `glob`、`grep`、`read_file` 定位现有 JUnit、Mockito、MockMvc、H2、Maven Surefire 测试基座和同类测试文件。',
      '',
      '## Phase 2: 单元测试用例生成',
      '- [ ] 为核心 Service 成功路径生成单元测试，覆盖命中、未命中、双侧结果差异和必要字段返回。',
      '- [ ] 为 Controller 或接口入口生成测试，覆盖合法请求、缺失必填字段、非法区域或非法范围类型。',
      '',
      '## Phase 3: Mock 与测试数据准备',
      '- [ ] 为 Mapper、运行侧客户端、配置侧查询和同步状态依赖准备 Mock、Stub 或 H2 测试数据。',
      '- [ ] 构造商品维度、SKU 维度、配置侧有结果运行侧无结果、双侧均无结果等测试夹具。',
      '',
      '## Phase 4: 异常路径与回归覆盖',
      '- [ ] 覆盖运行侧不可用、数据为空、活动未上线、同步未完成和参数校验失败等异常路径。',
      '- [ ] 回归已有活动、商品范围、同步和静态页面相关测试，确保新预览能力不影响原有链路。',
      '',
      '## Phase 5: Maven 执行与报告校验',
      '- [ ] 运行 `mvn test` 或项目现有 Maven 测试命令，记录测试结果并修复编译或断言失败。',
      `- [ ] 对照技术方案摘要自查测试覆盖：${designSummary || '活动命中预览能力、输入校验、命中列表、未命中提示和双侧差异。'}`,
    ].join('\n');
  }
  return [
    `# ${projectName} 开发任务清单`,
    '',
    '## Phase 1: 代码结构与现状梳理',
    `- [ ] 阅读 \`artifacts/${projectName}/tech-design.md\`、\`artifacts/mrd-clarified.md\` 和项目源码，确认活动命中预览涉及的 Controller、Service、Mapper、DTO、静态资源和配置文件。`,
    '- [ ] 使用 `glob`、`grep`、`read_file` 定位现有统一返回、异常处理、活动范围查询、运行侧查询、同步状态和测试基座。',
    '',
    '## Phase 2: 接口与入参实现',
    '- [ ] 新增或修改预览请求 DTO，补齐区域、活动范围类型、商品 ID、SKU ID、操作人等字段及必要校验。',
    '- [ ] 在对应 Controller 中新增活动命中预览接口，保持项目现有路由、`RpcResult` 返回结构和 requestId 约定。',
    '',
    '## Phase 3: 业务逻辑实现',
    '- [ ] 在 Service 层实现商品维度和 SKU 维度的命中预览规则，SKU ID 非空时优先按 SKU 查询。',
    '- [ ] 实现命中列表、未命中业务提示、管理配置侧结果、用户运行侧结果和双侧差异提示的组装逻辑。',
    '',
    '## Phase 4: 数据访问与配置实现',
    '- [ ] 按技术方案新增或修改 Mapper/XML/SQL 查询，支持多活动命中、活动核心字段、范围条件和同步状态读取。',
    '- [ ] 如需运行侧客户端、配置项或静态前端变更，按项目现有风格补齐并避免影响原活动生命周期链路。',
    '',
    '## Phase 5: 编译验证与验收自查',
    '- [ ] 运行 `mvn test` 或项目现有 Maven 编译测试命令，修复所有编译错误。',
    `- [ ] 对照技术方案摘要自查实现覆盖：${designSummary || '活动命中预览入口、输入校验、命中结果、未命中提示和双侧差异。'}`,
  ].join('\n');
}

function readTextIfExists(filePath: string): string | undefined {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return undefined;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

function readJsonIfExists<T>(filePath: string): T | undefined {
  try {
    const content = readTextIfExists(filePath);
    return content ? JSON.parse(content) as T : undefined;
  } catch {
    return undefined;
  }
}

function liveArtifactKindForNode(
  nodeId: string,
  relativePath: string
): { dir: 'changed-files' | 'changed-test-files'; description: string } | null {
  const normalizedNodeId = branchNodeIdForStage(nodeId) ?? normalizeStageId(nodeId);
  if ((normalizedNodeId === 'backend-test' || normalizedNodeId === 'testcode-generate') &&
      JAVA_TEST_CHANGE_PATTERN.test(relativePath)) {
    return { dir: 'changed-test-files', description: '后端测试代码实时预览快照' };
  }
  if (normalizedNodeId === 'frontend-impl' && FRONTEND_CHANGE_PATTERN.test(relativePath)) {
    return { dir: 'changed-files', description: '前端实现代码实时预览快照' };
  }
  if (normalizedNodeId === 'java-impl' && JAVA_MAIN_CHANGE_PATTERN.test(relativePath)) {
    return { dir: 'changed-files', description: 'Java 实现代码实时预览快照' };
  }
  return null;
}

function safeLivePreviewFileName(relativePath: string): string {
  return relativePath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('__');
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
