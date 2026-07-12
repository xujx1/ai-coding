import * as fs from 'fs';
import * as path from 'path';
import { listFilesRecursive } from './paths.js';

export function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

export function buildFileTreeFromRelativePaths(root: string, relativePaths: string[]): unknown[] {
  const nodes: Array<Record<string, unknown>> = [];
  for (const relPath of relativePaths) {
    const fullPath = path.resolve(root, relPath);
    if (!isPathInside(root, fullPath) || !fs.existsSync(fullPath)) continue;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      addDirectoryNodes(nodes, relPath, listFilesRecursive(fullPath, fullPath));
    } else if (stat.isFile()) {
      addFileNode(nodes, relPath, stat.size, stat.mtimeMs);
    }
  }
  return sortFileTree(nodes);
}

function addDirectoryNodes(nodes: Array<Record<string, unknown>>, relPath: string, children: unknown[]): void {
  const cleanPath = relPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleanPath) return;
  const parts = cleanPath.split('/');
  let cursor = nodes;
  let currentPath = '';
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    let dir = cursor.find(node => node.type === 'directory' && node.name === part) as Record<string, unknown> | undefined;
    if (!dir) {
      dir = { name: part, path: currentPath, type: 'directory', children: [] };
      cursor.push(dir);
    }
    cursor = dir.children as Array<Record<string, unknown>>;
  }
  cursor.push(...children as Array<Record<string, unknown>>);
}

function addFileNode(nodes: Array<Record<string, unknown>>, relPath: string, size: number, modified: number): void {
  const cleanPath = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = cleanPath.split('/').filter(Boolean);
  if (!parts.length) return;
  let cursor = nodes;
  let currentPath = '';
  for (const part of parts.slice(0, -1)) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    let dir = cursor.find(node => node.type === 'directory' && node.name === part) as Record<string, unknown> | undefined;
    if (!dir) {
      dir = { name: part, path: currentPath, type: 'directory', children: [] };
      cursor.push(dir);
    }
    cursor = dir.children as Array<Record<string, unknown>>;
  }
  cursor.push({ name: parts[parts.length - 1], path: cleanPath, type: 'file', size, modified });
}

function sortFileTree(nodes: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  for (const node of nodes) {
    if (Array.isArray(node.children)) node.children = sortFileTree(node.children as Array<Record<string, unknown>>);
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
}
