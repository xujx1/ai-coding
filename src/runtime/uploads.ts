/**
 * Upload handling - processes uploaded files and extracts them into the runtime directory.
 * Supports:
 * - Multiple file/folder uploads with relative path preservation
 * - Project uploads (zip)
 * - Auto-extraction of archives
 * - Dependency directory filtering (node_modules, target, .git)
 */
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { getRunPaths, ensureRunDirectories } from './paths.js';

const require = createRequire(import.meta.url);
let AdmZip: any;
try {
  AdmZip = require('adm-zip');
} catch {
  // zip extraction will be limited
}

export interface UploadResult {
  files: Array<{ name: string; size: number; path: string; type: 'input' | 'project' }>;
  projectExtracted: boolean;
  warnings: string[];
}

// Directories to skip during extraction
const SKIP_DIRS = new Set([
  'node_modules', 'target', '.git', '.idea', '.vscode',
  'dist', 'build', '__pycache__', '.next', '.nuxt',
  '.DS_Store', 'Thumbs.db',
]);

const SKIP_EXTENSIONS = new Set([
  '.jar', '.war', '.class', '.pyc', '.o', '.so', '.dll',
  '.exe', '.bin', '.obj',
]);

/**
 * Handle uploaded files for a run.
 * files: array of { originalname, buffer/filename, mimetype }
 * projectFile: if set, this zip file is extracted to workspace/project
 */
export function processUploads(
  runId: string,
  files: Array<{ name: string; data: Buffer; mimetype?: string; target?: 'input' | 'project' }>,
  projectFileName?: string
): UploadResult {
  const paths = ensureRunDirectories(runId);
  const result: UploadResult = {
    files: [],
    projectExtracted: false,
    warnings: [],
  };

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    const safeRelativeName = sanitizeRelativePath(file.name);
    if (!safeRelativeName) {
      result.warnings.push(`Skipped unsafe path: ${file.name}`);
      continue;
    }

    // Check if this is the project file (zip)
    if (projectFileName && file.name === projectFileName) {
      if (ext === '.zip' && AdmZip) {
        try {
          extractZip(file.data, paths.projectDir);
          result.projectExtracted = true;
          result.files.push({ name: file.name, size: file.data.length, path: 'workspace/project', type: 'project' });
        } catch (err) {
          result.warnings.push(`Failed to extract ${file.name}: ${(err as Error).message}`);
          // Save as-is to input dir
          saveFile(paths.inputDir, safeRelativeName, file.data);
          result.files.push({ name: safeRelativeName, size: file.data.length, path: `input/${safeRelativeName}`, type: 'input' });
        }
      } else {
        // Not a zip or no zip support - save to input dir
        saveFile(paths.inputDir, safeRelativeName, file.data);
        result.files.push({ name: safeRelativeName, size: file.data.length, path: `input/${safeRelativeName}`, type: 'input' });
        if (ext !== '.zip') {
          result.warnings.push(`Project file ${file.name} is not a .zip file. Save as zip and upload again, or manually extract to workspace/project.`);
        }
      }
      continue;
    }

    // Skip dependency/binaries in input files
    if (SKIP_EXTENSIONS.has(ext)) {
      result.warnings.push(`Skipped binary file: ${file.name}`);
      continue;
    }

    if (file.target === 'project') {
      saveFile(paths.projectDir, safeRelativeName, file.data);
      result.projectExtracted = true;
      result.files.push({ name: safeRelativeName, size: file.data.length, path: `workspace/project/${safeRelativeName}`, type: 'project' });
      continue;
    }

    // Save input files
    saveFile(paths.inputDir, safeRelativeName, file.data);
    result.files.push({ name: safeRelativeName, size: file.data.length, path: `input/${safeRelativeName}`, type: 'input' });

    // If it's a zip, also try to extract as project if project dir is empty
    if (ext === '.zip' && AdmZip && isDirEmpty(paths.projectDir)) {
      try {
        extractZip(file.data, paths.projectDir);
        result.projectExtracted = true;
        result.warnings.push(`Auto-extracted ${file.name} to workspace/project`);
      } catch (err) {
        result.warnings.push(`Failed to auto-extract ${file.name}: ${(err as Error).message}`);
      }
    }
  }

  return result;
}

/**
 * Extract a local directory (for "upload project from local path" option).
 */
export function extractLocalProject(runId: string, localPath: string): UploadResult {
  const paths = ensureRunDirectories(runId);
  const result: UploadResult = { files: [], projectExtracted: false, warnings: [] };

  if (!fs.existsSync(localPath)) {
    result.warnings.push(`Path not found: ${localPath}`);
    return result;
  }

  if (fs.statSync(localPath).isDirectory()) {
    copyDir(localPath, paths.projectDir);
    result.projectExtracted = true;
    result.files.push({ name: path.basename(localPath), size: 0, path: 'workspace/project', type: 'project' });
  } else if (localPath.endsWith('.zip') && AdmZip) {
    const data = fs.readFileSync(localPath);
    extractZip(data, paths.projectDir);
    result.projectExtracted = true;
    result.files.push({ name: path.basename(localPath), size: data.length, path: 'workspace/project', type: 'project' });
  } else {
    saveFile(paths.inputDir, path.basename(localPath), fs.readFileSync(localPath));
    result.files.push({ name: path.basename(localPath), size: fs.statSync(localPath).size, path: `input/${path.basename(localPath)}`, type: 'input' });
  }

  return result;
}

function saveFile(dir: string, filename: string, data: Buffer): void {
  const safeName = sanitizeRelativePath(filename);
  if (!safeName) throw new Error(`Unsafe upload path: ${filename}`);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, safeName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, data);
}

function sanitizeRelativePath(filename: string): string | null {
  const normalized = filename.replace(/\\/g, '/');
  const rawParts = normalized.split('/').filter(Boolean);
  const parts: string[] = [];
  for (const part of rawParts) {
    if (part === '.' || part === '..') return null;
    if (SKIP_DIRS.has(part)) return null;
    const safe = part.replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
    if (!safe) return null;
    parts.push(safe);
  }
  return parts.length ? parts.join(path.sep) : null;
}

function extractZip(data: Buffer, targetDir: string): void {
  if (!AdmZip) throw new Error('ZIP extraction not available');
  fs.mkdirSync(targetDir, { recursive: true });
  const zip = new AdmZip(data);
  const entries = zip.getEntries();
  for (const entry of entries) {
    const entryPath = entry.entryName;
    // Skip directories and filtered paths
    if (entry.isDirectory) continue;
    const parts = entryPath.split('/');
    if (parts.some((p: string) => SKIP_DIRS.has(p) || p.startsWith('.'))) continue;

    // Strip top-level directory if the zip has a single root folder
    let relativePath = entryPath;
    if (parts.length > 1 && entries.every((e: any) => e.entryName.startsWith(parts[0] + '/'))) {
      relativePath = parts.slice(1).join('/');
    }

    if (!relativePath) continue;
    const ext = path.extname(relativePath).toLowerCase();
    if (SKIP_EXTENSIONS.has(ext)) continue;

    const outPath = path.join(targetDir, relativePath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, entry.getData());
  }
}

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!SKIP_EXTENSIONS.has(ext)) {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }
}

function isDirEmpty(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch {
    return true;
  }
}
