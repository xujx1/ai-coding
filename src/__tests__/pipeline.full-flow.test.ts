import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

test('fixed pipeline completes end-to-end with mock LLM', async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coding-pipeline-test-'));
  process.env.RUNTIME_DIR = runtimeDir;
  process.env.AI_CODING_MOCK_LLM = '1';

  const { getSessionManager } = await import('../session/SessionManager.js');
  const { getPipeline, removePipeline } = await import('../pipeline/engine.js');
  const { getRunPaths } = await import('../runtime/paths.js');
  const { getStateStore } = await import('../persistence/stateStore.js');
  const { getEventLog, closeEventLog } = await import('../events/EventLog.js');

  const session = getSessionManager().createRun('全流程测试运行');
  const paths = getRunPaths(session.runId);

  fs.writeFileSync(
    path.join(paths.inputDir, 'mrd.md'),
    '# 测试需求\n\n实现一个最小 MRD 到代码流水线闭环。',
    'utf-8',
  );
  fs.writeFileSync(
    path.join(paths.projectDir, 'pom.xml'),
    '<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId><artifactId>demo</artifactId><version>1.0.0</version></project>',
    'utf-8',
  );

  const pipeline = getPipeline(session.runId);
  await pipeline.start({ skipConfirmations: true });

  const finalState = getStateStore(session.runId).loadExecutionState();
  assert.equal(finalState?.status, 'completed');
  assert.equal(finalState?.nodes.every(node => node.status === 'completed'), true);
  assert.ok(finalState?.projects?.some(project => project.name === 'project'), 'execution state should track project states');
  assert.ok(finalState?.artifactIndex?.['upload-init']?.includes('artifacts/project-manifest.json'), 'artifact index should include init manifest');
  assert.ok(finalState?.artifactIndex?.['mrd-render']?.includes('artifacts/fanout-decision.json'), 'artifact index should include fanout decision');
  assert.ok(finalState?.artifactIndex?.['implementation-plan']?.includes('artifacts/implementation-plan-manifest.json'), 'artifact index should include implementation manifest');
  assert.ok(finalState?.artifactIndex?.['java-impl']?.includes('artifacts/project/review-findings.json'), 'artifact index should include review findings under Java Impl');
  assert.ok(finalState?.artifactIndex?.['cross-app-code-review']?.includes('artifacts/cross-app/code-review-findings.json'), 'artifact index should include cross-app code review');
  assert.ok(finalState?.artifactIndex?.['cross-app-integration-review']?.includes('artifacts/cross-app/integration-review-findings.json'), 'artifact index should include cross-app integration review');
  assert.equal(finalState?.workflowInstance?.fanoutDecisionArtifact, 'artifacts/fanout-decision.json');
  assert.ok(finalState?.workflowInstance?.branches?.some(branch => branch.projectName === 'project'), 'workflow instance should include runtime branch refs');
  const projectBranch = finalState?.workflowInstance?.branches?.find(branch => branch.projectName === 'project');
  assert.equal(projectBranch?.status, 'completed', 'project branch should complete after archive');
  assert.ok(
    projectBranch?.nodes?.some(node => node.id === 'java-impl' && node.status === 'completed'),
    'branch-local java node should be completed'
  );
  assert.ok(
    projectBranch?.artifactIndex?.['app-branch-summary']?.includes('artifacts/project/branch-summary.json'),
    'branch summary should be indexed on branch-local state'
  );
  assert.equal(finalState?.workflowInstance?.joins?.[0]?.status, 'completed', 'join should complete when branch completes');
  assert.ok(finalState?.contextManifests?.['implementation-plan'], 'context manifest should be indexed in execution state');
  assert.ok(
    finalState?.nodes.some(node => node.id === 'spec-generate' && (node.childAgentIds?.length ?? 0) >= 2),
    'project-scoped nodes should record child agent ids'
  );
  for (const checkpoint of [
    'upload-init-context-manifest.json',
    'mrd-render-context-manifest.json',
    'implementation-plan-context-manifest.json',
    'java-impl-context-manifest.json',
    'archive-context-manifest.json',
  ]) {
    const checkpointPath = path.join(paths.checkpointsDir, checkpoint);
    assert.equal(fs.existsSync(checkpointPath), true, `${checkpoint} should exist`);
    const manifest = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
    assert.ok(Array.isArray(manifest.outputArtifacts), `${checkpoint} should include outputArtifacts`);
    assert.ok(Array.isArray(manifest.nextNodeInputs), `${checkpoint} should include nextNodeInputs`);
  }

  for (const artifact of [
    'mrd-clarified.md',
    'mrd-clarify-questions.md',
    'fanout-decision.json',
    'implementation-plan-manifest.json',
    'project/tech-design.md',
    'project/openspec-task.md',
    'project/openspec-test-task.md',
    'project/changed-files.json',
    'project/code-preview-manifest.json',
    'project/code-review.md',
    'project/review-findings.json',
    'project/test-file-list.md',
    'project/testcode-generation-report.md',
    'project/test-report.md',
    'project/surefire-summary.json',
    'project/coverage-summary.json',
    'project/failure-classification.json',
    'project/autofix-history.md',
    'project/archive-report.md',
    'project/branch-summary.json',
    'cross-app/code-review-findings.json',
    'cross-app/integration-review-findings.json',
    'cross-app/delivery-metadata.json',
    'archive-manifest.json',
  ]) {
    const artifactPath = path.join(paths.artifactsDir, artifact);
    assert.equal(fs.existsSync(artifactPath), true, `${artifact} should exist`);
    assert.ok(fs.readFileSync(artifactPath, 'utf-8').length > 0, `${artifact} should not be empty`);
  }

  // Requirement decomposition produces the final clarified checklist and its question list.
  const mrdContent = fs.readFileSync(path.join(paths.artifactsDir, 'mrd-clarified.md'), 'utf-8');
  assert.ok(mrdContent.length > 0, 'mrd-clarified.md should not be empty');
  assert.ok(
    mrdContent.includes('Project Ownership') || mrdContent.includes('项目'),
    'mrd-clarified.md should contain project ownership section'
  );
  const questionContent = fs.readFileSync(path.join(paths.artifactsDir, 'mrd-clarify-questions.md'), 'utf-8');
  assert.ok(questionContent.includes('MRD Clarify Questions'), 'mrd-clarify-questions.md should contain question header');
  assert.ok(questionContent.includes('需求-应用实现边界确认'), 'question list should include requirement-to-application boundary confirmation');
  assert.ok(questionContent.includes('应用归属'), 'question list should include project ownership confirmation');

  const implementationManifest = JSON.parse(
    fs.readFileSync(path.join(paths.artifactsDir, 'implementation-plan-manifest.json'), 'utf-8')
  );
  assert.equal(implementationManifest.nodeId, 'implementation-plan');
  assert.equal(implementationManifest.proposal, 'artifacts/mrd-clarified.md');
  assert.ok(Array.isArray(implementationManifest.projects), 'implementation manifest should have projects array');
  assert.ok(
    implementationManifest.projects.some((project: { artifact?: string }) => project.artifact === 'artifacts/project/tech-design.md'),
    'implementation manifest should reference project tech design'
  );
  const specManifest = JSON.parse(
    fs.readFileSync(path.join(paths.artifactsDir, 'spec-manifest.json'), 'utf-8')
  );
  const projectSpecEntry = specManifest.projects.find((project: { project?: string }) => project.project === 'project');
  assert.ok(projectSpecEntry?.openSpecChange, 'spec manifest should reference project OpenSpec change artifacts');
  const openSpecTasksPath = path.join(
    paths.artifactsDir,
    'project',
    'openspec',
    'changes',
    `run-${session.runId.toLowerCase()}-project`,
    'tasks.md',
  );
  assert.equal(fs.existsSync(openSpecTasksPath), true, 'project OpenSpec tasks.md should exist');
  const openSpecTasks = fs.readFileSync(openSpecTasksPath, 'utf-8');
  assert.match(openSpecTasks, /^## Development$/m, 'OpenSpec tasks should contain Development section');
  assert.match(openSpecTasks, /^## Test$/m, 'OpenSpec tasks should contain Test section');
  assert.ok(
    openSpecTasks.split(/^## Test$/m)[0].includes('- [x] '),
    'java-impl should mark OpenSpec development tasks complete'
  );
  assert.ok(
    openSpecTasks.split(/^## Test$/m)[1].includes('- [x] '),
    'testcode-generate should mark OpenSpec test tasks complete'
  );

  const devTaskList = fs.readFileSync(path.join(paths.artifactsDir, 'project/openspec-task.md'), 'utf-8');
  assert.match(devTaskList, /^#\s+.+开发任务清单/m, 'development spec should be a task list');
  assert.match(devTaskList, /^##\s+Phase\s+\d+[:：]/m, 'development spec should use phase sections');
  assert.match(devTaskList, /^-\s+\[[ x]\]\s+/m, 'development spec should use checkbox tasks');
  const testTaskList = fs.readFileSync(path.join(paths.artifactsDir, 'project/openspec-test-task.md'), 'utf-8');
  assert.match(testTaskList, /^#\s+.+测试任务清单/m, 'test spec should be a task list');
  assert.match(testTaskList, /^##\s+Phase\s+\d+[:：]/m, 'test spec should use phase sections');
  assert.match(testTaskList, /^-\s+\[\s\]\s+/m, 'test spec should use unchecked checkbox tasks');

  // project-manifest.json should exist
  const manifestPath = path.join(paths.artifactsDir, 'project-manifest.json');
  assert.equal(fs.existsSync(manifestPath), true, 'project-manifest.json should exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.ok(Array.isArray(manifest.requirements), 'manifest should have requirements array');
  assert.ok(Array.isArray(manifest.projects), 'manifest should have projects array');

  // Key events should be logged
  const allEvents = getEventLog(session.runId).getAllEvents();
  const eventTypes = allEvents.map(event => event.type);
  assert.ok(eventTypes.includes('pipeline_completed'), 'pipeline completion event should be logged');
  assert.ok(eventTypes.includes('model_selected'), 'model selection events should be logged');
  assert.ok(eventTypes.includes('artifact_written'), 'artifact_written events should be logged');
  assert.ok(eventTypes.includes('context_compacted'), 'context_compacted events should be logged');
  assert.ok(eventTypes.includes('fanout_decision'), 'fanout decision event should be logged');
  assert.ok(eventTypes.includes('branch_transition'), 'branch transition events should be logged');
  assert.ok(eventTypes.includes('join_state_updated'), 'join update events should be logged');

  // artifact_written events should include both requirement decomposition files
  const artifactEvents = allEvents.filter(e => e.type === 'artifact_written');
  const mrdWritten = artifactEvents.find(e =>
    (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/mrd-clarified.md'
  );
  assert.ok(mrdWritten, 'should have artifact_written event for mrd-clarified.md');
  const questionsWritten = artifactEvents.find(e =>
    (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/mrd-clarify-questions.md'
  );
  assert.ok(questionsWritten, 'should have artifact_written event for mrd-clarify-questions.md');
  assert.ok(
    artifactEvents.some(e => (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/implementation-plan-manifest.json'),
    'should have artifact_written event for implementation-plan-manifest.json'
  );
  assert.ok(
    artifactEvents.some(e => (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/project/tech-design.md'),
    'should have artifact_written event for project tech-design.md'
  );
  assert.ok(
    artifactEvents.some(e => (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/project/changed-files.json'),
    'should have artifact_written event for project changed-files.json'
  );
  assert.ok(
    artifactEvents.some(e => (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/project/code-review.md'),
    'should have artifact_written event for project code-review.md'
  );
  assert.ok(
    artifactEvents.some(e => (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/project/test-report.md'),
    'should have artifact_written event for project test-report.md'
  );
  assert.ok(
    artifactEvents.some(e => (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/project/archive-report.md'),
    'should have artifact_written event for project archive-report.md'
  );

  const agents = getStateStore(session.runId).listAgentStates();
  assert.ok(agents.length >= 1, 'agents should be persisted');
  assert.ok(agents.some(agent => agent.nodeId === 'java-impl'), 'java-impl agent should be persisted');
  assert.equal(agents.some(agent => agent.nodeId === 'java-impl' && agent.plan), false, 'java-impl should not use plan mode');
  assert.ok(
    agents.some(agent => agent.projectName === 'project' && agent.taskDescription && (agent.outputArtifacts?.length ?? 0) > 0),
    'project child agents should persist task and artifact metadata'
  );
  assert.ok(
    agents.every(agent => agent.transcriptPath === 'logs/events.ndjson'),
    'agent states should persist transcript path'
  );

  removePipeline(session.runId);
  closeEventLog(session.runId);
});

test('requirement decomposition handles multiple requirement files and produces markdown artifacts', async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coding-mrd-multi-test-'));
  process.env.RUNTIME_DIR = runtimeDir;
  process.env.AI_CODING_MOCK_LLM = '1';

  const { getSessionManager } = await import('../session/SessionManager.js');
  const { getPipeline, removePipeline } = await import('../pipeline/engine.js');
  const { getRunPaths } = await import('../runtime/paths.js');
  const { getEventLog, closeEventLog } = await import('../events/EventLog.js');

  const session = getSessionManager().createRun('MRD 多文件测试');
  const paths = getRunPaths(session.runId);

  // Write multiple requirement files
  fs.writeFileSync(
    path.join(paths.inputDir, 'requirements.md'),
    '# 业务需求\n\n## 背景\n需要建设一个营销活动管理系统。\n\n## 目标\n提升营销效率 30%。',
    'utf-8',
  );
  fs.writeFileSync(
    path.join(paths.inputDir, 'tech-constraints.txt'),
    '技术约束：使用 Java 17 + Spring Boot 3，数据库使用 MySQL 8.0。',
    'utf-8',
  );
  fs.writeFileSync(
    path.join(paths.projectDir, 'pom.xml'),
    '<project><modelVersion>4.0.0</modelVersion><groupId>com.marketing</groupId><artifactId>marketing-platform</artifactId><version>1.0.0</version></project>',
    'utf-8',
  );

  const pipeline = getPipeline(session.runId);
  await pipeline.start({ skipConfirmations: true });

  // Check requirement decomposition artifacts exist and are non-empty
  const mrdPath = path.join(paths.artifactsDir, 'mrd-clarified.md');
  assert.equal(fs.existsSync(mrdPath), true, 'mrd-clarified.md should exist');
  const mrdContent = fs.readFileSync(mrdPath, 'utf-8');
  assert.ok(mrdContent.length > 0, 'mrd-clarified.md should not be empty');
  assert.ok(mrdContent.includes('Feature Inventory'), 'mrd-clarified.md should contain feature inventory');
  assert.ok(mrdContent.includes('Project Ownership'), 'mrd-clarified.md should contain project ownership');
  const questionsPath = path.join(paths.artifactsDir, 'mrd-clarify-questions.md');
  assert.equal(fs.existsSync(questionsPath), true, 'mrd-clarify-questions.md should exist');
  const questionContent = fs.readFileSync(questionsPath, 'utf-8');
  assert.ok(questionContent.length > 0, 'mrd-clarify-questions.md should not be empty');
  assert.ok(questionContent.includes('需求-应用实现边界确认'), 'mrd clarify questions should require boundary confirmation');
  assert.ok(questionContent.includes('需要改代码'), 'mrd clarify questions should ask which applications need code changes');

  // Check project-manifest.json lists all input files
  const manifestPath = path.join(paths.artifactsDir, 'project-manifest.json');
  assert.equal(fs.existsSync(manifestPath), true, 'project-manifest.json should exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.ok(manifest.requirements.length >= 2, 'manifest should list multiple input files');
  assert.ok(manifest.projects.length >= 1, 'manifest should list at least one project');

  // Verify key events for mrd-render
  const allEvents = getEventLog(session.runId).getAllEvents();
  const eventTypes = allEvents.map(e => e.type);
  assert.ok(eventTypes.includes('model_selected'), 'should have model_selected event');
  assert.ok(eventTypes.includes('artifact_written'), 'should have artifact_written events');

  const mrdWritten = allEvents.filter(
    e => e.type === 'artifact_written' && (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/mrd-clarified.md'
  );
  assert.ok(mrdWritten.length >= 1, 'should have artifact_written for mrd-clarified.md');
  const questionsWritten = allEvents.filter(
    e => e.type === 'artifact_written' && (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/mrd-clarify-questions.md'
  );
  assert.ok(questionsWritten.length >= 1, 'should have artifact_written for mrd-clarify-questions.md');

  removePipeline(session.runId);
  closeEventLog(session.runId);
});

test('requirement decomposition confirmation gate fires and resolution leads to implementation-plan', async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coding-confirm-test-'));
  process.env.RUNTIME_DIR = runtimeDir;
  process.env.AI_CODING_MOCK_LLM = '1';

  const { getSessionManager } = await import('../session/SessionManager.js');
  const { getPipeline, removePipeline } = await import('../pipeline/engine.js');
  const { getRunPaths } = await import('../runtime/paths.js');
  const { getEventLog, closeEventLog } = await import('../events/EventLog.js');

  const session = getSessionManager().createRun('确认门测试');
  const paths = getRunPaths(session.runId);

  fs.writeFileSync(
    path.join(paths.inputDir, 'mrd.md'),
    '# 测试需求\n\n实现一个功能。',
    'utf-8',
  );
  fs.writeFileSync(
    path.join(paths.projectDir, 'pom.xml'),
    '<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId><artifactId>demo</artifactId><version>1.0.0</version></project>',
    'utf-8',
  );

  const pipeline = getPipeline(session.runId);
  const eventLog = getEventLog(session.runId);
  let mrdConfirmed = false;
  let implementationPlanStarted = false;

  // Listen for pipeline events
  pipeline.on('event', (evt: { type: string; nodeId?: string }) => {
    if (evt.type === 'confirmation_required' && evt.nodeId === 'mrd-render') {
      // Resolve mrd-render confirmation
      setImmediate(() => {
        try {
          pipeline.resolveConfirmation('mrd-render', true);
          mrdConfirmed = true;
        } catch { /* already resolved */ }
      });
    }
    if (evt.type === 'stage_start' && evt.nodeId === 'implementation-plan') {
      implementationPlanStarted = true;
      // Once implementation-plan starts, abort the pipeline (we've proven downstream works)
      setImmediate(() => pipeline.abort());
    }
  });

  // Run pipeline - will be aborted after implementation-plan starts
  await pipeline.start({ skipConfirmations: false });

  // Verify requirement decomposition confirmation gate was triggered and resolved
  assert.ok(mrdConfirmed, 'mrd-render confirmation should have been resolved');
  assert.ok(implementationPlanStarted, 'implementation-plan should start after requirement decomposition is confirmed');

  const allEvents = eventLog.getAllEvents();
  assert.ok(
    allEvents.some(e => e.type === 'confirmation_waiting' && e.nodeId === 'mrd-render'),
    'should log confirmation_waiting for mrd-render'
  );
  assert.ok(
    allEvents.some(e => e.type === 'confirmation_resolved' && e.nodeId === 'mrd-render'),
    'should log confirmation_resolved for mrd-render'
  );

  // Verify requirement decomposition artifacts exist.
  assert.equal(fs.existsSync(path.join(paths.artifactsDir, 'mrd-clarified.md')), true, 'mrd-clarified.md should exist');
  assert.ok(
    fs.readFileSync(path.join(paths.artifactsDir, 'mrd-clarified.md'), 'utf-8').length > 0,
    'mrd-clarified.md should be non-empty'
  );
  assert.equal(fs.existsSync(path.join(paths.artifactsDir, 'mrd-clarify-questions.md')), true, 'mrd-clarify-questions.md should exist');

  removePipeline(session.runId);
  closeEventLog(session.runId);
});

test('requirement decomposition handles large requirement files without requiring full inline content', async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coding-mrd-large-test-'));
  process.env.RUNTIME_DIR = runtimeDir;
  process.env.AI_CODING_MOCK_LLM = '1';

  const { getSessionManager } = await import('../session/SessionManager.js');
  const { getPipeline, removePipeline } = await import('../pipeline/engine.js');
  const { getRunPaths } = await import('../runtime/paths.js');
  const { getEventLog, closeEventLog } = await import('../events/EventLog.js');

  const session = getSessionManager().createRun('MRD 大文件测试');
  const paths = getRunPaths(session.runId);

  fs.writeFileSync(
    path.join(paths.inputDir, 'large-requirements.md'),
    '# 大型需求文档\n\n' + '大型需求内容\n'.repeat(4000),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(paths.inputDir, 'small-requirements.txt'),
    '小需求：补充验收标准和安全约束。',
    'utf-8',
  );
  fs.writeFileSync(
    path.join(paths.projectDir, 'pom.xml'),
    '<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId><artifactId>demo</artifactId><version>1.0.0</version></project>',
    'utf-8',
  );

  const pipeline = getPipeline(session.runId);
  await pipeline.start({ skipConfirmations: true });

  const artifactPath = path.join(paths.artifactsDir, 'mrd-clarified.md');
  assert.equal(fs.existsSync(artifactPath), true, 'mrd-clarified.md should exist');
  const content = fs.readFileSync(artifactPath, 'utf-8');
  assert.ok(content.includes('Feature Inventory'), 'decomposition should include feature inventory');
  assert.ok(content.includes('Project Ownership'), 'decomposition should include project ownership');
  assert.equal(
    fs.existsSync(path.join(paths.artifactsDir, 'mrd-clarify-questions.md')),
    true,
    'mrd-clarify-questions.md should exist'
  );

  const allEvents = getEventLog(session.runId).getAllEvents();
  assert.ok(
    allEvents.some(e => e.type === 'artifact_written' && (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/mrd-clarified.md'),
    'should log artifact_written for mrd-clarified.md'
  );
  assert.ok(
    allEvents.some(e => e.type === 'artifact_written' && (e.data as Record<string, unknown>)?.artifactPath === 'artifacts/mrd-clarify-questions.md'),
    'should log artifact_written for mrd-clarify-questions.md'
  );

  removePipeline(session.runId);
  closeEventLog(session.runId);
});
