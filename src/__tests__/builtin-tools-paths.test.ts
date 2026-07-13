import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import type { ToolContext } from '../tools/base.js';
import { GlobTool } from '../tools/builtin/GlobTool.js';
import { GrepTool } from '../tools/builtin/GrepTool.js';
import { ReadTool } from '../tools/builtin/ReadTool.js';

test('builtin read/search tools resolve input paths from the run directory', async () => {
  const runDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coding-tool-input-')));
  const projectDir = path.join(runDir, 'workspace', 'project');
  const artifactsDir = path.join(runDir, 'artifacts');
  fs.mkdirSync(path.join(runDir, 'input'), { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'input', 'sample-mrd.md'), '# MRD\n\n库存保护校验\n', 'utf-8');

  const ctx: ToolContext = {
    runId: 'run-tools-paths',
    agentRunId: 'agent-tools-paths',
    cwd: projectDir,
    runDir,
    projectDir,
    artifactsDir,
    canUseTool: async () => 'allow',
  };

  const read = await ReadTool.execute({ file_path: 'input/sample-mrd.md' }, ctx);
  assert.equal(read.isError, undefined);
  assert.match(read.content, /库存保护校验/);

  const glob = await GlobTool.execute({ path: 'input', pattern: '**/*.md' }, ctx);
  assert.equal(glob.isError, undefined);
  assert.match(glob.content, /sample-mrd\.md/);

  const grep = await GrepTool.execute({ path: 'input', pattern: '库存保护' }, ctx);
  assert.equal(grep.isError, undefined);
  assert.match(grep.content, /sample-mrd\.md:3:库存保护校验/);
});
