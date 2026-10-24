export interface StorageLogContext {
  tenantId?: string;
  transactionId?: string;
  runId?: string;
  nodeId?: string;
  agentRunId?: string;
  workerId?: string;
  leaseKey?: string;
  fencingToken?: number;
  eventSequence?: number;
  [key: string]: unknown;
}

export interface StorageLogRecord extends StorageLogContext {
  timestamp: string;
  event: string;
  level: 'info' | 'warn' | 'error';
}

const records: StorageLogRecord[] = [];
const MAX_RECORDS = 1_000;

/** Structured, secret-free durable-runtime logging boundary. */
export function logStorageEvent(event: string, context: StorageLogContext = {}, level: StorageLogRecord['level'] = 'info'): StorageLogRecord {
  const record: StorageLogRecord = { timestamp: new Date().toISOString(), event, level, ...context };
  records.push(record);
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
  if (process.env.AI_CODING_STRUCTURED_LOGS === '1') process.stdout.write(`${JSON.stringify(record)}\n`);
  return record;
}

export function getStorageLogRecords(): StorageLogRecord[] { return records.map(record => ({ ...record })); }
export function clearStorageLogRecords(): void { records.splice(0, records.length); }
