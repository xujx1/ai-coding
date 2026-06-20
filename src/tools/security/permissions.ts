/**
 * Permission system - enforces rules for tool usage.
 * Persists to permissions.json and logs/permission-decisions.ndjson.
 *
 * Permission modes:
 * - plan: read-only, no writes/executes
 * - default: ask for destructive ops, allow reads
 * - acceptEdits: auto-allow file edits, ask for bash
 * - dontAsk: auto-allow everything (bypass ask prompts)
 * - locked: deny everything except reads
 */
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../../config/index.js';
import { getRunPaths, RunPaths } from '../../runtime/paths.js';
import { checkDangerousCommand } from './pathValidator.js';
import { analyzeBashCommand } from './bashSafety.js';

export type PermissionMode = 'plan' | 'default' | 'acceptEdits' | 'dontAsk' | 'locked';

export interface PermissionRule {
  tool: string;
  action: 'allow' | 'deny' | 'ask';
  pattern?: string;  // regex pattern for input matching
}

export interface PendingPermissionRequest {
  id: string;
  runId: string;
  toolName: string;
  input: unknown;
  timestamp: number;
  resolved: boolean;
  decision?: 'allow' | 'deny';
}

export interface PermissionDecisionLog {
  id: string;
  runId: string;
  timestamp: number;
  toolName: string;
  input: unknown;
  decision: 'allow' | 'deny' | 'ask';
  reason?: string;
}

export interface PermissionState {
  mode: PermissionMode;
  rules: PermissionRule[];
  pendingRequests: PendingPermissionRequest[];
  sessionGrants: Array<{ tool: string; pattern?: string; expiresAt?: number }>;
}

// Default permission rules
const DEFAULT_RULES: PermissionRule[] = [
  // Read tools are always allowed
  { tool: 'read_file', action: 'allow' },
  { tool: 'glob', action: 'allow' },
  { tool: 'grep', action: 'allow' },
  { tool: 'discover_skills', action: 'allow' },
  { tool: 'skill', action: 'allow' },
  { tool: 'review_artifact', action: 'allow' },
  // File edits are path-validated before execution; allow them in default mode.
  { tool: 'write_file', action: 'allow' },
  { tool: 'edit_file', action: 'allow' },
  // Bash always asks
  { tool: 'bash', action: 'ask' },
  // Java/Maven tools execute inside the project workspace using configured binaries.
  { tool: 'maven_compile', action: 'allow' },
  { tool: 'maven_test', action: 'allow' },
  { tool: 'jdk_javac', action: 'allow' },
  { tool: 'jdk_java', action: 'allow' },
];

export class PermissionManager {
  private state: PermissionState;
  private paths: RunPaths;
  private permWriteStream: fs.WriteStream | null = null;

  constructor(private runId: string, mode?: PermissionMode) {
    this.paths = getRunPaths(runId);
    this.state = this.loadState(mode);
    this.permWriteStream = fs.createWriteStream(this.paths.permissionLog, { flags: 'a' });
  }

  private loadState(mode?: PermissionMode): PermissionState {
    const permFile = this.paths.permissionsFile;
    if (fs.existsSync(permFile)) {
      try {
        const saved = JSON.parse(fs.readFileSync(permFile, 'utf-8'));
        return { ...saved, pendingRequests: saved.pendingRequests ?? [] };
      } catch {
        // fall through to defaults
      }
    }
    return {
      mode: mode ?? getConfig().permissions.defaultMode,
      rules: [...DEFAULT_RULES],
      pendingRequests: [],
      sessionGrants: [],
    };
  }

  getMode(): PermissionMode {
    return this.state.mode;
  }

  setMode(mode: PermissionMode): void {
    this.state.mode = mode;
    this.saveState();
  }

  getState(): PermissionState {
    return { ...this.state, pendingRequests: [...this.state.pendingRequests] };
  }

  /**
   * Check permission for a tool call.
   * Returns 'allow', 'deny', or 'ask' (pending user confirmation).
   */
  async checkPermission(
    toolName: string,
    input: unknown,
    requestId: string
  ): Promise<'allow' | 'deny' | 'ask'> {
    // Locked mode: only read tools allowed
    if (this.state.mode === 'locked') {
      if (['read_file', 'glob', 'grep'].includes(toolName)) {
        return this.logAndReturn(toolName, input, 'allow', 'locked mode: read-only');
      }
      return this.logAndReturn(toolName, input, 'deny', 'locked mode');
    }

    // Plan mode: only reads
    if (this.state.mode === 'plan') {
      if (['read_file', 'glob', 'grep'].includes(toolName)) {
        return this.logAndReturn(toolName, input, 'allow', 'plan mode read');
      }
      return this.logAndReturn(toolName, input, 'deny', 'plan mode: no writes/executes');
    }

    // dontAsk mode: allow everything except dangerous commands
    if (this.state.mode === 'dontAsk') {
      if (toolName === 'bash') {
        const cmd = (input as any)?.command ?? '';
        const danger = checkDangerousCommand(cmd);
        if (!danger.safe) {
          return this.logAndReturn(toolName, input, 'deny', danger.reason);
        }
      }
      return this.logAndReturn(toolName, input, 'allow', 'dontAsk mode');
    }

    // acceptEdits: auto-allow file edits, ask for bash
    if (this.state.mode === 'acceptEdits') {
      if (['write_file', 'edit_file'].includes(toolName)) {
        return this.logAndReturn(toolName, input, 'allow', 'acceptEdits mode');
      }
    }

    // Check session grants (temporary allows from user approval)
    for (const grant of this.state.sessionGrants) {
      if (grant.tool === toolName) {
        if (!grant.expiresAt || grant.expiresAt > Date.now()) {
          if (!grant.pattern || matchesPattern(input, grant.pattern)) {
            return this.logAndReturn(toolName, input, 'allow', 'session grant');
          }
        }
      }
    }

    // Check specific rules
    for (const rule of this.state.rules) {
      if (rule.tool === toolName) {
        if (rule.action === 'allow') {
          return this.logAndReturn(toolName, input, 'allow');
        }
        if (rule.action === 'deny') {
          return this.logAndReturn(toolName, input, 'deny', 'rule denied');
        }
        // action === 'ask' -> fall through
      }
    }

    // Dangerous command check for bash
    if (toolName === 'bash') {
      const cmd = (input as any)?.command ?? '';
      const danger = checkDangerousCommand(cmd);
      if (!danger.safe) {
        return this.logAndReturn(toolName, input, 'deny', danger.reason);
      }
      const analysis = analyzeBashCommand(cmd);
      if (analysis.isReadOnly) {
        return this.logAndReturn(toolName, input, 'allow', 'read-only bash command');
      }
    }

    // Default: ask for confirmation
    const pending: PendingPermissionRequest = {
      id: requestId,
      runId: this.runId,
      toolName,
      input,
      timestamp: Date.now(),
      resolved: false,
    };
    this.state.pendingRequests.push(pending);
    this.saveState();
    return this.logAndReturn(toolName, input, 'ask');
  }

  /** Resolve a pending permission request (from UI) */
  resolvePermission(requestId: string, decision: 'allow' | 'deny', persistGrant: boolean = false): void {
    const req = this.state.pendingRequests.find(r => r.id === requestId);
    if (!req) return;
    req.resolved = true;
    req.decision = decision;

    if (decision === 'allow' && persistGrant) {
      this.state.sessionGrants.push({
        tool: req.toolName,
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 min
      });
    }

    this.saveState();

    // Log decision
    this.logDecision({
      id: requestId + '-resolved',
      runId: this.runId,
      timestamp: Date.now(),
      toolName: req.toolName,
      input: req.input,
      decision,
      reason: persistGrant ? 'user approved (persistent)' : 'user approved',
    });
  }

  getPendingRequests(): PendingPermissionRequest[] {
    return this.state.pendingRequests.filter(r => !r.resolved);
  }

  getPermissionRequest(requestId: string): PendingPermissionRequest | undefined {
    return this.state.pendingRequests.find(r => r.id === requestId);
  }

  pruneResolvedRequests(maxAgeMs: number = 5 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.state.pendingRequests.length;
    this.state.pendingRequests = this.state.pendingRequests.filter(r => !r.resolved || r.timestamp >= cutoff);
    if (this.state.pendingRequests.length !== before) this.saveState();
  }

  private logAndReturn(
    toolName: string,
    input: unknown,
    decision: 'allow' | 'deny' | 'ask',
    reason?: string
  ): 'allow' | 'deny' | 'ask' {
    this.logDecision({
      id: `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      runId: this.runId,
      timestamp: Date.now(),
      toolName,
      input: safeInputForLog(input),
      decision,
      reason,
    });
    return decision;
  }

  private logDecision(entry: PermissionDecisionLog): void {
    if (this.permWriteStream) {
      this.permWriteStream.write(JSON.stringify(entry) + '\n');
    }
  }

  private saveState(): void {
    fs.mkdirSync(this.paths.runDir, { recursive: true });
    fs.writeFileSync(
      this.paths.permissionsFile,
      JSON.stringify(this.state, null, 2)
    );
  }

  close(): void {
    if (this.permWriteStream) {
      this.permWriteStream.end();
      this.permWriteStream = null;
    }
  }
}

function safeInputForLog(input: unknown): unknown {
  if (typeof input === 'string' && input.length > 500) {
    return input.slice(0, 500) + '...(truncated)';
  }
  return input;
}

function matchesPattern(input: unknown, pattern: string): boolean {
  try {
    const str = typeof input === 'string' ? input : JSON.stringify(input);
    return new RegExp(pattern).test(str);
  } catch {
    return false;
  }
}

// ── Global permission manager registry ────────────────────────────────────

const managers = new Map<string, PermissionManager>();

export function getPermissionManager(runId: string, mode?: PermissionMode): PermissionManager {
  let mgr = managers.get(runId);
  if (!mgr) {
    mgr = new PermissionManager(runId, mode);
    managers.set(runId, mgr);
  }
  return mgr;
}

export function closePermissionManager(runId: string): void {
  const mgr = managers.get(runId);
  if (mgr) {
    mgr.close();
    managers.delete(runId);
  }
}
