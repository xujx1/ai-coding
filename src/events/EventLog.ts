/**
 * NDJSON event logger. Writes events to logs/events.ndjson and broadcasts
 * to connected WebSocket listeners.
 */
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { PipelineEvent, EventType } from './types.js';
import { getRunPaths, ensureRunDirectories } from '../runtime/paths.js';

export class EventLog extends EventEmitter {
  private writeStream: fs.WriteStream | null = null;
  private events: PipelineEvent[] = [];
  private logsDir: string;

  constructor(private runId: string) {
    super();
    const paths = ensureRunDirectories(runId);
    this.logsDir = paths.logsDir;
    this.writeStream = fs.createWriteStream(paths.eventsLog, { flags: 'a' });
  }

  logEvent(
    type: EventType,
    data?: Record<string, unknown>,
    agentRunId?: string,
    nodeId?: string
  ): PipelineEvent {
    const event: PipelineEvent = {
      id: nanoid(),
      type,
      runId: this.runId,
      timestamp: Date.now(),
      agentRunId,
      nodeId,
      data,
    };
    this.events.push(event);
    if (this.writeStream) {
      this.writeStream.write(JSON.stringify(event) + '\n');
    }
    super.emit('event', event);
    super.emit(type, event);
    return event;
  }

  getEvents(since?: number, limit?: number): PipelineEvent[] {
    let evts = this.events;
    if (since !== undefined) {
      evts = evts.filter(e => e.timestamp > since);
    }
    if (limit !== undefined) {
      evts = evts.slice(-limit);
    }
    return evts;
  }

  getAllEvents(): PipelineEvent[] {
    return [...this.events];
  }

  /** Load existing events from disk (for session resume) */
  loadFromDisk(): void {
    const paths = getRunPaths(this.runId);
    if (!fs.existsSync(paths.eventsLog)) return;
    const content = fs.readFileSync(paths.eventsLog, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    this.events = [];
    for (const line of lines) {
      try {
        this.events.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
  }

  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

/** Global registry of event logs per run */
const eventLogs = new Map<string, EventLog>();

export function getEventLog(runId: string): EventLog {
  let log = eventLogs.get(runId);
  if (!log) {
    log = new EventLog(runId);
    eventLogs.set(runId, log);
  }
  return log;
}

export function closeEventLog(runId: string): void {
  const log = eventLogs.get(runId);
  if (log) {
    log.close();
    eventLogs.delete(runId);
  }
}
