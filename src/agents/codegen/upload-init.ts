import * as fs from 'fs';
import * as path from 'path';
import { getRunPaths } from '../../runtime/paths.js';
import {
  ProjectStartupCapabilitySnapshot,
} from '../../tools/testing/types.js';
import { detectProjectStartupCapabilities } from '../../tools/testing/capabilities.js';

export interface ProjectManifest {
  requirements: Array<{ name: string; path: string; size: number }>;
  customPrompt?: string;
  projects: Array<{
    name: string;
    root: string;
    buildTool?: string;
    pomPath?: string;
    sourceRoots?: string[];
    testRoots?: string[];
    capabilities?: ProjectStartupCapabilitySnapshot;
  }>;
}

export function listProjectFiles(dir: string, maxDepth: number = 2, depth: number = 0): string {
  if (depth >= maxDepth) return '';
  let result = '';
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 50);
    for (const entry of entries) {
      if (entry.name.startsWith('.') || ['node_modules', 'target', '.git'].includes(entry.name)) continue;
      const indent = '  '.repeat(depth);
      result += `${indent}- ${entry.name}`;
      if (entry.isDirectory()) {
        result += '/\n';
        result += listProjectFiles(path.join(dir, entry.name), maxDepth, depth + 1);
      } else {
        result += '\n';
      }
    }
  } catch {
    // ignore unreadable folders
  }
  return result;
}

export function detectProjectRoots(projectDir: string): Array<{ name: string; root: string }> {
  if (isProjectRoot(projectDir)) {
    return [{ name: 'project', root: projectDir }];
  }
  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !['node_modules', 'target'].includes(entry.name));
    const roots = entries
      .map(entry => ({ name: safeProjectArtifactName(entry.name), root: path.join(projectDir, entry.name) }))
      .filter(project => isProjectRoot(project.root));
    if (roots.length) {
      return roots;
    }
    if (!looksLikeSingleProjectDirectory(projectDir) && entries.length > 1) {
      return entries.map(entry => ({
        name: safeProjectArtifactName(entry.name),
        root: path.join(projectDir, entry.name),
      }));
    }
    if (entries.length > 0) {
      return [{ name: 'project', root: projectDir }];
    }
  } catch {
    // fall through
  }
  return [];
}

export function generateProjectManifest(paths: ReturnType<typeof getRunPaths>): ProjectManifest {
  const requirements: ProjectManifest['requirements'] = [];
  if (fs.existsSync(paths.inputDir)) {
    for (const f of fs.readdirSync(paths.inputDir)) {
      const fullPath = path.join(paths.inputDir, f);
      if (fs.statSync(fullPath).isFile() && f !== 'custom-prompt.md') {
        requirements.push({
          name: f,
          path: `input/${f}`,
          size: fs.statSync(fullPath).size,
        });
      }
    }
  }

  let customPrompt: string | undefined;
  if (fs.existsSync(path.join(paths.inputDir, 'custom-prompt.md'))) {
    customPrompt = 'input/custom-prompt.md';
  }

  const projects: ProjectManifest['projects'] = detectProjectRoots(paths.projectDir).map(p => {
    const pomPath = path.join(p.root, 'pom.xml');
    const hasPom = fs.existsSync(pomPath);
    const sourceRoots: string[] = [];
    const testRoots: string[] = [];
    const mainJava = path.join(p.root, 'src', 'main', 'java');
    const testJava = path.join(p.root, 'src', 'test', 'java');
    const srcDir = path.join(p.root, 'src');
    const appDir = path.join(p.root, 'app');
    const pagesDir = path.join(p.root, 'pages');
    const springStaticDir = path.join(p.root, 'src', 'main', 'resources', 'static');
    const springTemplatesDir = path.join(p.root, 'src', 'main', 'resources', 'templates');
    const publicDir = path.join(p.root, 'public');
    const testsDir = path.join(p.root, '__tests__');
    if (fs.existsSync(mainJava)) sourceRoots.push('src/main/java');
    if (fs.existsSync(srcDir) && !sourceRoots.includes('src/main/java')) sourceRoots.push('src');
    if (fs.existsSync(appDir)) sourceRoots.push('app');
    if (fs.existsSync(pagesDir)) sourceRoots.push('pages');
    if (fs.existsSync(springStaticDir)) sourceRoots.push('src/main/resources/static');
    if (fs.existsSync(springTemplatesDir)) sourceRoots.push('src/main/resources/templates');
    if (fs.existsSync(publicDir)) sourceRoots.push('public');
    if (fs.existsSync(testJava)) testRoots.push('src/test/java');
    if (fs.existsSync(testsDir)) testRoots.push('__tests__');
    if (hasFrontendTestFile(p.root)) testRoots.push('frontend-tests');
    return {
      name: p.name,
      root: path.relative(path.join(paths.runDir, 'workspace'), p.root),
      buildTool: hasPom ? 'maven' : undefined,
      pomPath: hasPom ? path.join(path.relative(path.join(paths.runDir, 'workspace'), p.root), 'pom.xml') : undefined,
      sourceRoots: sourceRoots.length ? sourceRoots : undefined,
      testRoots: testRoots.length ? testRoots : undefined,
      capabilities: {
        ...detectProjectStartupCapabilities(p.root),
        projectRoot: path.relative(path.join(paths.runDir, 'workspace'), p.root),
      },
    };
  });

  return { requirements, customPrompt, projects };
}

export function ensureProjectManifest(paths: ReturnType<typeof getRunPaths>): ProjectManifest {
  const manifestPath = path.join(paths.artifactsDir, 'project-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ProjectManifest;
    } catch {
      // fall through to regenerate
    }
  }
  const manifest = generateProjectManifest(paths);
  fs.mkdirSync(paths.artifactsDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
}

function isProjectRoot(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'pom.xml')) ||
    fs.existsSync(path.join(dir, 'build.gradle')) ||
    fs.existsSync(path.join(dir, 'build.gradle.kts')) ||
    fs.existsSync(path.join(dir, 'package.json'));
}

function looksLikeSingleProjectDirectory(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'src')) ||
    fs.existsSync(path.join(dir, 'package.json')) ||
    fs.existsSync(path.join(dir, 'settings.gradle')) ||
    fs.existsSync(path.join(dir, 'settings.gradle.kts')) ||
    fs.existsSync(path.join(dir, 'README.md'));
}

function safeProjectArtifactName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

function hasFrontendTestFile(root: string): boolean {
  try {
    return fs.readdirSync(root, { withFileTypes: true }).some(entry =>
      entry.isFile() && /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)
    );
  } catch {
    return false;
  }
}
