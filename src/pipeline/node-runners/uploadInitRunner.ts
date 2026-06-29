import * as fs from 'fs';
import * as path from 'path';
import {
  generateProjectManifest,
  listProjectFiles,
} from '../node-agents/upload-init.js';
import {
  loadOutputTemplate,
  renderPromptTemplate,
} from '../node-agents/prompt-files.js';
import { StageRunnerContext, StageRunnerResult } from '../nodeRunners.js';

export async function runUploadInitStage(
  ctx: StageRunnerContext
): Promise<StageRunnerResult> {
  const { paths, node, nodeState, executionState } = ctx;
  const manifest = generateProjectManifest(paths);

  executionState.projects = manifest.projects.map(project => ({
    name: project.name,
    root: project.root,
    status: 'pending',
    retry: { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 },
  }));

  fs.mkdirSync(paths.artifactsDir, { recursive: true });
  ctx.writeArtifact(
    'project-manifest.json',
    JSON.stringify(manifest, null, 2),
    '项目识别与上传文件清单'
  );

  const inputFiles = fs.existsSync(paths.inputDir)
    ? fs.readdirSync(paths.inputDir).filter(file => fs.statSync(path.join(paths.inputDir, file)).isFile())
    : [];
  const projectSummary = fs.existsSync(paths.projectDir) && fs.readdirSync(paths.projectDir).length > 0
    ? listProjectFiles(paths.projectDir, 2)
    : 'No project uploaded yet. Starting with empty workspace.';
  const inputLines = inputFiles.length
    ? inputFiles.map(file => {
      const stat = fs.statSync(path.join(paths.inputDir, file));
      return `- ${file} (${(stat.size / 1024).toFixed(1)}KB)`;
    }).join('\n')
    : '- No MRD/input file uploaded yet.';

  let mrdExcerpt = 'No MRD file found. Pipeline will proceed with available context.';
  const mrdFiles = inputFiles.filter(f => f.endsWith('.md') || f.endsWith('.txt'));
  if (mrdFiles.length > 0) {
    const mrdContent = fs.readFileSync(path.join(paths.inputDir, mrdFiles[0]), 'utf-8');
    mrdExcerpt = mrdContent.slice(0, 10000);
  }

  const summary = renderPromptTemplate(loadOutputTemplate('input-summary.md'), {
    input_lines: inputLines,
    project_structure: projectSummary,
    mrd_excerpt: mrdExcerpt,
  });
  ctx.writeArtifact('input-summary.md', summary, '上传文件与项目空间摘要');

  nodeState.outputArtifacts = ['artifacts/input-summary.md', 'artifacts/project-manifest.json'];

  return {
    output: summary,
    outputArtifacts: nodeState.outputArtifacts,
  };
}
