import * as fs from 'fs';
import * as path from 'path';
import {
  ApiBaseUrlConvention,
  ProjectStartupCapabilitySnapshot,
  StartupCommandEvidence,
  StartupConfidence,
} from './types.js';

const FRONTEND_ENV_CONVENTIONS = [
  'VITE_API_BASE_URL',
  'NEXT_PUBLIC_API_BASE_URL',
  'REACT_APP_API_BASE_URL',
];

const PLAYWRIGHT_CONFIG_NAMES = [
  'playwright.config.ts',
  'playwright.config.js',
  'playwright.config.mjs',
  'playwright.config.cjs',
];

export function detectProjectStartupCapabilities(
  projectRoot: string,
  generatedAt = new Date().toISOString()
): ProjectStartupCapabilitySnapshot {
  const packageJson = readPackageJson(projectRoot);
  const packageScripts = packageJson?.scripts && typeof packageJson.scripts === 'object'
    ? packageJson.scripts as Record<string, string>
    : {};
  const files = listProjectFiles(projectRoot, 3);
  const frontend = detectFrontend(projectRoot, packageScripts, files);
  const backend = detectBackend(projectRoot, packageScripts, files);
  const playwrightConfig = PLAYWRIGHT_CONFIG_NAMES
    .map(name => path.join(projectRoot, name))
    .find(candidate => fs.existsSync(candidate));
  const conventions = detectApiBaseUrlConventions(projectRoot, files);
  const readinessEndpoints = detectReadinessEndpoints(projectRoot, files);
  const fallbackReasons = [
    ...(!frontend ? ['No trusted frontend startup command or framework convention was detected.'] : []),
    ...(!backend && hasBackendSignals(projectRoot, packageScripts, files)
      ? ['Backend signals were detected, but no trusted backend startup command was found.']
      : []),
  ];
  const confidence = highestConfidence([frontend?.confidence, backend?.confidence, playwrightConfig ? 'high' : undefined]);

  return {
    projectRoot,
    frontend,
    backend,
    readinessEndpoints,
    apiBaseUrlConventions: conventions,
    playwrightConfig: playwrightConfig ? path.relative(projectRoot, playwrightConfig).replace(/\\/g, '/') : undefined,
    trustedStartup: Boolean(frontend || backend || playwrightConfig),
    confidence,
    fallbackReasons,
    generatedAt,
  };
}

export function selectApiBaseUrlConvention(
  snapshot: Pick<ProjectStartupCapabilitySnapshot, 'apiBaseUrlConventions'>
): ApiBaseUrlConvention {
  return snapshot.apiBaseUrlConventions[0] ?? {
    name: 'VITE_API_BASE_URL',
    source: 'common',
    confidence: 'medium',
  };
}

export { FRONTEND_ENV_CONVENTIONS };

function detectFrontend(
  projectRoot: string,
  scripts: Record<string, string>,
  files: string[]
): StartupCommandEvidence | undefined {
  const frameworkSignals = [
    ...fileSignals(files, ['vite.config.ts', 'vite.config.js'], 'vite'),
    ...fileSignals(files, ['next.config.ts', 'next.config.js', 'next.config.mjs'], 'next'),
    ...dependencySignals(projectRoot, ['vite', 'next', 'react-scripts', '@vitejs/plugin-react']),
  ];
  const scriptName = ['dev', 'start', 'preview'].find(name => scripts[name]);
  const scriptSignals = scriptName ? [`package.json script '${scriptName}'`] : [];
  if (!scriptName && !frameworkSignals.length) return undefined;
  const command = scriptName
    ? `npm run ${scriptName}`
    : frameworkSignals.includes('vite')
      ? 'npx vite --host 127.0.0.1'
      : 'npm run dev';
  return {
    kind: 'frontend',
    command,
    workingDirectory: projectRoot,
    evidence: [...scriptSignals, ...frameworkSignals.map(signal => `framework '${signal}'`)],
    confidence: scriptName && frameworkSignals.length ? 'high' : 'medium',
    frameworkSignals,
    scriptSignals,
  };
}

function detectBackend(
  projectRoot: string,
  scripts: Record<string, string>,
  files: string[]
): StartupCommandEvidence | undefined {
  const frameworkSignals = [
    ...fileSignals(files, ['pom.xml'], 'maven'),
    ...fileSignals(files, ['build.gradle', 'build.gradle.kts'], 'gradle'),
    ...fileSignals(files, ['src/main/java'], 'spring-boot'),
    ...dependencySignals(projectRoot, ['express', 'fastify', '@nestjs/core']),
  ];
  const scriptName = ['server', 'backend', 'start:server', 'start', 'dev:server'].find(name => scripts[name]);
  const scriptSignals = scriptName ? [`package.json script '${scriptName}'`] : [];
  if (scriptName) {
    return {
      kind: 'backend',
      command: `npm run ${scriptName}`,
      workingDirectory: projectRoot,
      evidence: [...scriptSignals, ...frameworkSignals.map(signal => `framework '${signal}'`)],
      confidence: 'high',
      frameworkSignals,
      scriptSignals,
    };
  }
  if (fs.existsSync(path.join(projectRoot, 'pom.xml'))) {
    return {
      kind: 'backend',
      command: 'mvn spring-boot:run',
      workingDirectory: projectRoot,
      evidence: ['pom.xml', ...frameworkSignals.map(signal => `framework '${signal}'`)],
      confidence: 'medium',
      frameworkSignals,
      scriptSignals,
    };
  }
  return undefined;
}

function detectApiBaseUrlConventions(projectRoot: string, files: string[]): ApiBaseUrlConvention[] {
  const envFileMatches = files
    .filter(file => path.basename(file).startsWith('.env'))
    .flatMap(file => readText(path.join(projectRoot, file)).split(/\r?\n/));
  const sourceMatches = files
    .filter(file => /\.(ts|tsx|js|jsx|vue)$/.test(file))
    .slice(0, 80)
    .flatMap(file => FRONTEND_ENV_CONVENTIONS.filter(name => readText(path.join(projectRoot, file)).includes(name)));
  const conventions = new Map<string, ApiBaseUrlConvention>();
  for (const name of FRONTEND_ENV_CONVENTIONS) {
    const envHit = envFileMatches.some(line => line.trim().startsWith(`${name}=`));
    if (envHit) {
      conventions.set(name, { name, source: 'env-file', confidence: 'high' });
      continue;
    }
    if (sourceMatches.includes(name)) {
      conventions.set(name, { name, source: 'source', confidence: 'high' });
      continue;
    }
    conventions.set(name, { name, source: 'common', confidence: 'medium' });
  }
  return [...conventions.values()];
}

function detectReadinessEndpoints(projectRoot: string, files: string[]): string[] {
  const content = files
    .filter(file => /\.(ts|tsx|js|jsx|java|kt|go|py|yml|yaml|json)$/.test(file))
    .slice(0, 120)
    .map(file => readText(path.join(projectRoot, file)))
    .join('\n');
  const endpoints = new Set<string>();
  for (const endpoint of ['/health', '/ready', '/readiness', '/actuator/health']) {
    if (content.includes(endpoint) || endpoint === '/health') endpoints.add(endpoint);
  }
  return [...endpoints];
}

function hasBackendSignals(
  projectRoot: string,
  scripts: Record<string, string>,
  files: string[]
): boolean {
  return Boolean(
    fs.existsSync(path.join(projectRoot, 'pom.xml')) ||
    fs.existsSync(path.join(projectRoot, 'build.gradle')) ||
    scripts.server ||
    scripts.backend ||
    files.some(file => /controller|router|server|app\.(ts|js|java)$/.test(file.toLowerCase()))
  );
}

function readPackageJson(projectRoot: string): Record<string, unknown> | undefined {
  try {
    const file = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function dependencySignals(projectRoot: string, names: string[]): string[] {
  const packageJson = readPackageJson(projectRoot);
  const deps = {
    ...(packageJson?.dependencies as Record<string, string> | undefined),
    ...(packageJson?.devDependencies as Record<string, string> | undefined),
  };
  return names.filter(name => Boolean(deps[name]));
}

function fileSignals(files: string[], names: string[], signal: string): string[] {
  return files.some(file => names.includes(file) || names.some(name => file.endsWith(`/${name}`))) ? [signal] : [];
}

function listProjectFiles(root: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && !entry.name.startsWith('.env')) continue;
    if (['node_modules', 'target', 'dist', 'build', '.git'].includes(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(entry.name);
      files.push(...listProjectFiles(full, maxDepth, depth + 1).map(file => `${entry.name}/${file}`));
    } else {
      files.push(entry.name);
    }
  }
  return files;
}

function readText(file: string): string {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size > 512_000) return '';
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

function highestConfidence(values: Array<StartupConfidence | undefined>): StartupConfidence {
  const order: StartupConfidence[] = ['high', 'medium', 'low', 'none'];
  return order.find(value => values.includes(value)) ?? 'none';
}
