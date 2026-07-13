import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getRunPaths } from '../../runtime/paths.js';

export interface ProjectChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  size: number;
  content?: string;
}

export interface CodeArtifactBundle {
  entries: Record<string, string>;
  paths: string[];
}

interface FileSnapshot {
  path: string;
  absPath: string;
  size: number;
  hash: string;
  content?: string;
}

export const JAVA_MAIN_CHANGE_PATTERN = /(^pom\.xml$|^src\/main\/.*\.(java|xml|yml|yaml|properties)$|^src\/main\/resources\/static\/.*\.(html|css|js|mjs|json)$)/;
export const JAVA_TEST_CHANGE_PATTERN = /(^pom\.xml$|^src\/test\/.*\.(java|xml|yml|yaml|properties)$)/;

export function snapshotProjectFiles(projectRoot: string, includePattern: RegExp): Map<string, FileSnapshot> {
  const snapshots = new Map<string, FileSnapshot>();
  const ignored = new Set(['target', '.git', '.idea', 'node_modules']);
  const walk = (dir: string, depth: number) => {
    if (depth > 10) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.mrd-to-code-config.json') continue;
      if (ignored.has(entry.name)) continue;
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(projectRoot, absPath).replace(/\\/g, '/');
      if (!includePattern.test(rel)) continue;
      try {
        const content = fs.readFileSync(absPath, 'utf-8');
        snapshots.set(rel, {
          path: rel,
          absPath,
          size: Buffer.byteLength(content, 'utf-8'),
          hash: crypto.createHash('sha256').update(content).digest('hex'),
          content,
        });
      } catch {
        // skip binary or unreadable files
      }
    }
  };
  walk(projectRoot, 0);
  return snapshots;
}

export function diffProjectSnapshots(
  before: Map<string, FileSnapshot>,
  after: Map<string, FileSnapshot>,
): ProjectChangedFile[] {
  const changed: ProjectChangedFile[] = [];
  for (const [rel, next] of after.entries()) {
    const prev = before.get(rel);
    if (!prev) {
      changed.push({ path: rel, status: 'added', size: next.size, content: next.content });
    } else if (prev.hash !== next.hash) {
      changed.push({ path: rel, status: 'modified', size: next.size, content: next.content });
    }
  }
  for (const [rel] of before.entries()) {
    if (!after.has(rel)) {
      changed.push({ path: rel, status: 'deleted', size: 0 });
    }
  }
  return changed.sort((a, b) => a.path.localeCompare(b.path));
}

export function mockChangedJavaFile(projectName: string): ProjectChangedFile {
  const content = renderTemplate(loadTemplate('mock-java-service.java'), {
    project_name: projectName,
  });
  return {
    path: 'src/main/java/demo/DemoService.java',
    status: 'added',
    size: Buffer.byteLength(content, 'utf-8'),
    content,
  };
}

export function mockChangedTestFile(projectName: string): ProjectChangedFile {
  const content = renderTemplate(loadTemplate('mock-java-test.java'), {
    project_name: projectName,
  });
  return {
    path: 'src/test/java/demo/DemoServiceTest.java',
    status: 'added',
    size: Buffer.byteLength(content, 'utf-8'),
    content,
  };
}

export function buildCodeChangeArtifacts(
  paths: ReturnType<typeof getRunPaths>,
  projectName: string,
  changedFiles: ProjectChangedFile[]
): CodeArtifactBundle {
  const scopedChangedFiles = changedFiles.filter(file => !isMockDemoArtifactPath(file.path));
  const previewFiles = writeChangedFilePreviews(paths, projectName, 'changed-files', scopedChangedFiles);
  const changedFileEntries = scopedChangedFiles
    .map(file => ({
      path: file.path,
      status: file.status,
      size: file.size,
      previewArtifact: previewFiles.get(file.path),
      absolutePreviewArtifact: toAbsoluteArtifactPath(paths, previewFiles.get(file.path)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const previewEntries = scopedChangedFiles
    .map(file => ({
      sourcePath: file.path,
      status: file.status,
      language: file.path.endsWith('.java') ? 'java' : 'text',
      artifactPath: previewFiles.get(file.path),
      absoluteArtifactPath: toAbsoluteArtifactPath(paths, previewFiles.get(file.path)),
    }))
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  const manifest = {
    project: projectName,
    generatedAt: new Date().toISOString(),
    changedFiles: changedFileEntries,
  };
  const previewManifest = {
    project: projectName,
    files: previewEntries,
  };
  const entries: Record<string, string> = {
    [`${projectName}/changed-files.json`]: JSON.stringify(manifest, null, 2),
    [`${projectName}/code-preview-manifest.json`]: JSON.stringify(previewManifest, null, 2),
  };
  return {
    entries,
    paths: [
      `artifacts/${projectName}/changed-files.json`,
      `artifacts/${projectName}/code-preview-manifest.json`,
      ...Array.from(previewFiles.values()).filter(Boolean) as string[],
    ],
  };
}

export function buildTestCodeArtifacts(
  paths: ReturnType<typeof getRunPaths>,
  projectName: string,
  changedTests: ProjectChangedFile[],
  output: string
): CodeArtifactBundle {
  const scopedChangedTests = changedTests.filter(file => !isMockDemoArtifactPath(file.path));
  const previewFiles = writeChangedFilePreviews(paths, projectName, 'changed-test-files', scopedChangedTests);
  const previewEntries = scopedChangedTests
    .map(file => ({
      sourcePath: file.path,
      status: file.status,
      language: 'java',
      artifactPath: previewFiles.get(file.path),
      absoluteArtifactPath: toAbsoluteArtifactPath(paths, previewFiles.get(file.path)),
    }))
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  const testFileList = renderTemplate(loadTemplate('test-file-list.md'), {
    project_name: projectName,
    test_file_lines: previewEntries.length
      ? previewEntries.map(file => `- ${String(file.sourcePath || '')}`).join('\n')
      : '未检测到测试文件变更。',
  });
  const report = normalizeMarkdownArtifact(
    output,
    `${projectName} 测试代码生成报告`,
    renderTemplate(loadTemplate('testcode-generation-report-fallback.md'), {
      project_name: projectName,
    }),
  );
  const previewManifest = {
    project: projectName,
    files: previewEntries,
  };
  const entries: Record<string, string> = {
    [`${projectName}/test-file-list.md`]: testFileList,
    [`${projectName}/testcode-generation-report.md`]: report,
    [`${projectName}/test-code-preview-manifest.json`]: JSON.stringify(previewManifest, null, 2),
  };
  return {
    entries,
    paths: [
      `artifacts/${projectName}/test-file-list.md`,
      `artifacts/${projectName}/testcode-generation-report.md`,
      `artifacts/${projectName}/test-code-preview-manifest.json`,
      ...Array.from(previewFiles.values()).filter(Boolean) as string[],
    ],
  };
}

function isMockDemoArtifactPath(filePath: string): boolean {
  return filePath === 'src/main/java/demo/DemoService.java' || filePath === 'src/test/java/demo/DemoServiceTest.java';
}

function writeChangedFilePreviews(
  paths: ReturnType<typeof getRunPaths>,
  projectName: string,
  dirName: 'changed-files' | 'changed-test-files',
  changedFiles: ProjectChangedFile[]
): Map<string, string> {
  const previewFiles = new Map<string, string>();
  for (const file of changedFiles) {
    if (!file.content || !isPreviewableTextFile(file.path)) continue;
    const previewRel = `${projectName}/${dirName}/${safePreviewFileName(file.path)}`;
    const previewAbs = path.join(paths.artifactsDir, previewRel);
    fs.mkdirSync(path.dirname(previewAbs), { recursive: true });
    fs.writeFileSync(previewAbs, file.content, 'utf-8');
    previewFiles.set(file.path, `artifacts/${previewRel}`);
  }
  return previewFiles;
}

function toAbsoluteArtifactPath(paths: ReturnType<typeof getRunPaths>, artifactPath?: string): string | undefined {
  if (!artifactPath) return undefined;
  const relativePath = artifactPath.replace(/^artifacts\//, '');
  return path.join(paths.artifactsDir, relativePath);
}

function normalizeMarkdownArtifact(output: string, title: string, fallback: string): string {
  let content = (output || '').trim();
  content = content.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!content) return fallback;
  if (/^(好的|以下是|我将|我会|Here is|Sure)/i.test(content.slice(0, 80))) {
    const headingIndex = content.search(/^#\s+/m);
    if (headingIndex > 0) content = content.slice(headingIndex).trim();
  }
  return content.startsWith('#') ? content : `# ${title}\n\n${content}`;
}

function loadTemplate(fileName: string): string {
  const templatePath = path.join(process.cwd(), 'prompts', 'template', fileName);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Output template not found: prompts/template/${fileName}`);
  }
  return fs.readFileSync(templatePath, 'utf-8');
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => variables[key] ?? '');
}

function safePreviewFileName(relPath: string): string {
  return relPath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('__');
}

function isPreviewableTextFile(relPath: string): boolean {
  return /\.(java|xml|ya?ml|properties|html|css|js|mjs|ts|tsx|jsx|json|md|txt)$/i.test(relPath);
}
