export interface SessionState {
  runId: string;
  createdAt: number;
  lastAccessedAt: number;
  suspendedAt?: number;
  resumedAt?: number;
}
