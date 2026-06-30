/**
 * Path validation - ensures tools only access allowed directories.
 * Rules:
 * - Write/Edit: only workspace/project or artifacts
 * - Read: runtime dir, reference code dir, and allowlist
 * - Java/Maven cwd: must be workspace/project
 */
import * as path from 'path';
import * as fs from 'fs';
import { getConfig } from '../../config/index.js';
import { resolveMavenBin } from '../builtin/javaRuntime.js';

export type AccessType = 'read' | 'write' | 'execute';

export interface ValidatePathResult {
  valid: boolean;
  resolvedPath: string;
  reason?: string;
}

export function validatePath(
  requestedPath: string,
  accessType: AccessType,
  ctx: { runDir: string; projectDir: string; artifactsDir: string }
): ValidatePathResult {
  // Normalize and resolve
  let resolved = path.resolve(requestedPath);

  // Resolve symlinks
  try {
    // Check if path exists; if not, resolve parent dir
    if (fs.existsSync(resolved)) {
      resolved = fs.realpathSync(resolved);
    } else {
      const parent = path.dirname(resolved);
      if (fs.existsSync(parent)) {
        resolved = path.join(fs.realpathSync(parent), path.basename(resolved));
      }
    }
  } catch {
    // fall through with normalized path
  }

  const { runDir, projectDir, artifactsDir } = ctx;

  // ── Write/Edit checks ────────────────────────────────────────────────
  if (accessType === 'write') {
    if (
      resolved.startsWith(projectDir + path.sep) ||
      resolved === projectDir ||
      resolved.startsWith(artifactsDir + path.sep) ||
      resolved === artifactsDir
    ) {
      return { valid: true, resolvedPath: resolved };
    }
    return {
      valid: false,
      resolvedPath: resolved,
      reason: `Write access denied: ${resolved} is outside workspace/project or artifacts directory`,
    };
  }

  // ── Execute checks (Bash in project dir, Maven/JDK in project dir) ───
  if (accessType === 'execute') {
    // For cwd checks (done separately for bash, but general execute path check)
    if (
      resolved.startsWith(projectDir + path.sep) ||
      resolved === projectDir
    ) {
      return { valid: true, resolvedPath: resolved };
    }
    // Allow executing tools in JAVA_HOME/MAVEN_HOME bin dirs
    const config = getConfig();
    const javaBin = config.java.javaHome ? path.join(config.java.javaHome, 'bin') : '';
    const mavenBin = resolveMavenBin(config.java.mavenHome);
    if ((javaBin && resolved.startsWith(javaBin)) || (mavenBin && resolved.startsWith(mavenBin))) {
      return { valid: true, resolvedPath: resolved };
    }
    return {
      valid: false,
      resolvedPath: resolved,
      reason: `Execute access denied: ${resolved} is outside workspace/project`,
    };
  }

  // ── Read checks ──────────────────────────────────────────────────────
  // Allow read access inside the current run directory.
  const allowedReadPrefixes = [
    runDir,
  ];

  for (const prefix of allowedReadPrefixes) {
    if (resolved.startsWith(prefix + path.sep) || resolved === prefix) {
      return { valid: true, resolvedPath: resolved };
    }
  }

  // Block sensitive paths
  const blockedPatterns = [
    '/etc/passwd', '/etc/shadow', '/root/.ssh', '/.ssh/id_',
    '.env.production', 'credentials.json', 'secrets.json',
  ];
  for (const pattern of blockedPatterns) {
    if (resolved.includes(pattern)) {
      return { valid: false, resolvedPath: resolved, reason: `Access denied to sensitive path: ${pattern}` };
    }
  }

  // Allow reading from tmp or within run dir explicitly
  // For safety, default deny for paths outside allowed prefixes
  return {
    valid: false,
    resolvedPath: resolved,
    reason: `Read access denied: ${resolved} is outside allowed directories`,
  };
}


/** Validate cwd for Bash/Maven execution - must be inside workspace/project */
export function validateCwd(cwd: string, projectDir: string): { valid: boolean; reason?: string } {
  const resolved = path.resolve(cwd);
  if (resolved.startsWith(projectDir + path.sep) || resolved === projectDir) {
    return { valid: true };
  }
  return { valid: false, reason: `Working directory must be inside workspace/project, got: ${cwd}` };
}

/** Check for dangerous bash commands */
export function checkDangerousCommand(command: string): { safe: boolean; reason?: string } {
  const config = getConfig();
  const trimmed = command.trim().toLowerCase();

  for (const pattern of config.permissions.dangerousCommands) {
    if (trimmed.startsWith(pattern.toLowerCase()) || trimmed.includes(' ' + pattern.toLowerCase())) {
      return { safe: false, reason: `Dangerous command detected: ${pattern}` };
    }
  }

  // Check for fork bombs
  if (trimmed.includes('(){') || trimmed.includes(':(){')) {
    return { safe: false, reason: 'Fork bomb pattern detected' };
  }

  // Check for commands that modify system outside cwd
  const systemModifiers = [
    /^rm\s+(-[rf]+\s+)?~\/?/,
    /^rm\s+(-[rf]+\s+)?\/(?!tmp\/)/,
    /^dd\s+/,
    /^mkfs\b/,
    /^mount\s/,
    /^umount\s/,
    /^systemctl\s/,
    /^service\s+\w+\s+(start|stop|restart)/,
    /^apt(-get)?\s+(install|remove|purge)/,
    /^yum\s+(install|remove)/,
    /^npm\s+install\s+-g\s/,
    /^pip\s+install\s+/,
  ];
  for (const regex of systemModifiers) {
    if (regex.test(trimmed)) {
      return { safe: false, reason: `System-modifying command blocked: ${command.slice(0, 80)}` };
    }
  }

  return { safe: true };
}
