import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import test from 'node:test';

const SRC_ROOT = path.join(process.cwd(), 'src');
const PRODUCT_MODULES = new Set([
  'application',
  'knowledge',
  'requirements',
  'requirement-pi',
  'app-ops',
  'testing',
  'settings',
]);
const FOUNDATION_MODULES = new Set([
  'models',
  'persistence',
  'events',
  'runtime',
  'config',
  'integrations',
  'storage',
]);
const SHARED_LOWER_MODULES = new Set([
  'workflows',
  'agents',
  'tools',
]);

test('lower layers do not import product services or server controllers', () => {
  const violations: string[] = [];
  for (const file of listTypeScriptFiles(SRC_ROOT)) {
    const sourceTopLevel = topLevelModule(file);
    if (!sourceTopLevel || sourceTopLevel === '__tests__' || sourceTopLevel === 'server') continue;
    const isFoundation = FOUNDATION_MODULES.has(sourceTopLevel);
    const isSharedLower = SHARED_LOWER_MODULES.has(sourceTopLevel);
    const isProduct = PRODUCT_MODULES.has(sourceTopLevel);
    if (!isFoundation && !isSharedLower && !isProduct) continue;

    for (const specifier of readImportSpecifiers(file)) {
      const targetTopLevel = resolveTopLevelModule(file, specifier);
      if (!targetTopLevel) continue;

      if ((isFoundation || isSharedLower) && (targetTopLevel === 'server' || PRODUCT_MODULES.has(targetTopLevel))) {
        violations.push(`${relative(file)} imports ${specifier}`);
      }
      if (isProduct && targetTopLevel === 'server') {
        violations.push(`${relative(file)} imports ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('testing migration boundaries stay layered', () => {
  const violations: string[] = [];
  for (const file of listTypeScriptFiles(SRC_ROOT)) {
    const sourceTopLevel = topLevelModule(file);
    if (!sourceTopLevel || sourceTopLevel === '__tests__' || sourceTopLevel === 'server') continue;
    if (!['workflows', 'agents', 'tools', 'lifecycle', 'runtime', 'models', 'persistence', 'events', 'config', 'integrations'].includes(sourceTopLevel)) continue;

    for (const specifier of readImportSpecifiers(file)) {
      const targetTopLevel = resolveTopLevelModule(file, specifier);
      if (targetTopLevel === 'testing' || targetTopLevel === 'server') {
        violations.push(`${relative(file)} imports ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('testing agents use shared testing tools instead of private tool implementations', () => {
  const privateToolFiles = listTypeScriptFiles(path.join(SRC_ROOT, 'agents', 'testing'))
    .filter(file => /tool/i.test(path.basename(file)) && !file.endsWith('e2eVerificationAgent.ts'));
  const invalidImports: string[] = [];
  for (const file of listTypeScriptFiles(path.join(SRC_ROOT, 'agents', 'testing'))) {
    for (const specifier of readImportSpecifiers(file)) {
      if (specifier.includes('/tools/') && !specifier.includes('/tools/testing/')) {
        invalidImports.push(`${relative(file)} imports ${specifier}`);
      }
    }
  }

  assert.deepEqual(privateToolFiles.map(relative), []);
  assert.deepEqual(invalidImports, []);
});

test('product and workflow layers do not import concrete storage adapters', () => {
  const violations: string[] = [];
  for (const file of listTypeScriptFiles(SRC_ROOT)) {
    const sourceTopLevel = topLevelModule(file);
    if (!sourceTopLevel || sourceTopLevel === '__tests__' || sourceTopLevel === 'storage') continue;
    if (!PRODUCT_MODULES.has(sourceTopLevel) && !SHARED_LOWER_MODULES.has(sourceTopLevel)) continue;
    for (const specifier of readImportSpecifiers(file)) {
      const target = resolveSourcePath(file, specifier);
      if (target && /^storage\/(postgres|artifacts\/s3)(?:\/|$)/.test(target)) {
        violations.push(`${relative(file)} imports ${specifier}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('production source contains no prohibited Demo path literal', () => {
  const violations: string[] = [];
  for (const file of listTypeScriptFiles(SRC_ROOT)) {
    if (topLevelModule(file) === '__tests__') continue;
    // The explicit ecom-demo composition is the sole approved location for
    // example asset identities; production modules must remain path-free.
    if (relative(file) === 'src/platform-sources/profiles.ts') continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/(?:demo\/(?:ecom|mrd)|ecom-integration-tests)/g)) {
      violations.push(`${relative(file)}:${match.index}`);
    }
  }
  assert.deepEqual(violations, []);
});

function listTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  };
  visit(root);
  return files;
}

function readImportSpecifiers(file: string): string[] {
  const content = fs.readFileSync(file, 'utf-8');
  const specifiers: string[] = [];
  const importExportPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const pattern of [importExportPattern, dynamicImportPattern]) {
    for (const match of content.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function resolveTopLevelModule(fromFile: string, specifier: string): string | undefined {
  const sourcePath = resolveSourcePath(fromFile, specifier);
  return sourcePath?.split('/')[0];
}

function resolveSourcePath(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const resolved = path.resolve(path.dirname(fromFile), specifier.replace(/\.js$/, '.ts'));
  const relativeToSrc = path.relative(SRC_ROOT, resolved);
  if (relativeToSrc.startsWith('..') || path.isAbsolute(relativeToSrc)) return undefined;
  return relativeToSrc.split(path.sep).join('/');
}

function topLevelModule(file: string): string | undefined {
  const relativeToSrc = path.relative(SRC_ROOT, file);
  if (relativeToSrc.startsWith('..') || path.isAbsolute(relativeToSrc)) return undefined;
  return relativeToSrc.split(path.sep)[0];
}

function relative(file: string): string {
  return path.relative(process.cwd(), file);
}
