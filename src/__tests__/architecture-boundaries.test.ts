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
  'settings',
]);
const FOUNDATION_MODULES = new Set([
  'models',
  'persistence',
  'events',
  'runtime',
  'config',
  'integrations',
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
  if (!specifier.startsWith('.')) return undefined;
  const resolved = path.resolve(path.dirname(fromFile), specifier.replace(/\.js$/, '.ts'));
  const relativeToSrc = path.relative(SRC_ROOT, resolved);
  if (relativeToSrc.startsWith('..') || path.isAbsolute(relativeToSrc)) return undefined;
  return relativeToSrc.split(path.sep)[0];
}

function topLevelModule(file: string): string | undefined {
  const relativeToSrc = path.relative(SRC_ROOT, file);
  if (relativeToSrc.startsWith('..') || path.isAbsolute(relativeToSrc)) return undefined;
  return relativeToSrc.split(path.sep)[0];
}

function relative(file: string): string {
  return path.relative(process.cwd(), file);
}
