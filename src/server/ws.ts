/**
 * WebSocket Hub - manages real-time event streaming to connected clients.
 * Broadcasts pipeline events to all clients subscribed to a given run.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { PipelineEngine } from '../pipeline/engine.js';
import { getEventLog } from '../events/EventLog.js';
import { PipelineEvent as LoggedPipelineEvent } from '../events/types.js';

interface ClientSubscription {
  ws: WebSocket;
  runId: string;
}

export class WebSocketHub {
  private clients = new Map<string, Set<WebSocket>>();
  private wss: WebSocketServer | null = null;
  private eventLogSubscriptions = new Set<string>();

  attach(server: any): void {
    this.wss = new WebSocketServer({ server, path: '/api/ws' });

    this.wss.on('connection', (ws: WebSocket, req: any) => {
      // Parse runId from URL query: /api/ws?runId=xxx
      const url = new URL(req.url, 'http://localhost');
      const runId = url.searchParams.get('runId');

      if (!runId) {
        ws.send(JSON.stringify({ type: 'error', message: 'runId query parameter required' }));
        ws.close();
        return;
      }

      this.addClient(runId, ws);

      ws.on('message', (data: string) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleClientMessage(runId, msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.removeClient(runId, ws);
      });

      // Send initial connected event
      ws.send(JSON.stringify({ type: 'connected', runId, timestamp: Date.now() }));
    });
  }

  private addClient(runId: string, ws: WebSocket): void {
    if (!this.clients.has(runId)) {
      this.clients.set(runId, new Set());
    }
    this.clients.get(runId)!.add(ws);
  }

  private removeClient(runId: string, ws: WebSocket): void {
    const set = this.clients.get(runId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.clients.delete(runId);
    }
  }

  private handleClientMessage(runId: string, msg: any): void {
    // Client commands
    switch (msg.type) {
      case 'ping':
        this.sendToClient(runId, msg.ws, { type: 'pong', timestamp: Date.now() });
        break;
      // Other commands (confirm, interrupt, etc.) are handled via HTTP API
    }
  }

  /**
   * Broadcast an event to all clients subscribed to a run.
   */
  broadcast(runId: string, event: unknown): void {
    const clients = this.clients.get(runId);
    if (!clients) return;
    const message = JSON.stringify(event);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  /** Send to one specific client */
  private sendToClient(runId: string, ws: WebSocket, event: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  /** Connect pipeline engine events to WebSocket broadcast */
  subscribePipeline(runId: string, engine: PipelineEngine): void {
    engine.on('event', (event: unknown) => {
      this.broadcast(runId, event);
    });
  }

  /** Connect EventLog entries to the legacy WebSocket message shapes. */
  subscribeEventLog(runId: string): void {
    if (this.eventLogSubscriptions.has(runId)) return;
    this.eventLogSubscriptions.add(runId);
    getEventLog(runId).on('event', (event: LoggedPipelineEvent) => {
      const mapped = mapLoggedEventToWebSocketMessage(event);
      if (mapped) this.broadcast(runId, mapped);
    });
  }
}

function mapLoggedEventToWebSocketMessage(event: LoggedPipelineEvent): unknown | null {
  switch (event.type) {
    case 'pipeline_node_start':
      return {
        type: 'stage_start',
        nodeId: event.nodeId ?? event.data?.nodeId,
        nodeName: event.data?.nodeName,
      };
    case 'pipeline_node_end':
      return {
        type: 'stage_end',
        nodeId: event.nodeId ?? event.data?.nodeId,
        success: event.data?.success !== false,
        output: event.data?.error,
      };
    case 'confirmation_waiting':
      return {
        type: 'confirmation_required',
        nodeId: event.nodeId ?? event.data?.nodeId,
        title: event.data?.title,
        content: event.data?.content,
        artifactPath: event.data?.artifactPath,
        confirmationKind: event.data?.confirmationKind,
      };
    case 'confirmation_resolved':
      return {
        type: 'confirmation_resolved',
        nodeId: event.nodeId ?? event.data?.nodeId,
        approved: event.data?.approved,
        feedback: event.data?.feedback,
      };
    case 'artifact_written':
      return {
        type: 'stage_progress',
        nodeId: event.nodeId ?? event.data?.nodeId,
        event: {
          type: 'artifact_written',
          ...event.data,
        },
      };
    case 'fanout_decision':
    case 'branch_transition':
    case 'join_state_updated':
    case 'branch_rerun_scheduled':
    case 'branch_cancelled':
    case 'node_rollback_requested':
    case 'node_rollback_started':
      return {
        type: 'stage_progress',
        nodeId: event.nodeId ?? event.data?.nodeId,
        event: {
          type: event.type,
          ...event.data,
        },
      };
    case 'pipeline_completed':
      return { type: 'pipeline_complete', runId: event.runId };
    case 'pipeline_failed':
      return { type: 'pipeline_failed', runId: event.runId, error: event.data?.error ?? event.data?.message };
    case 'pipeline_cancelled':
      return { type: 'pipeline_cancelled', runId: event.runId };
    case 'error':
      return { type: 'pipeline_failed', runId: event.runId, error: event.data?.message };
    default:
      return null;
  }
}

// Singleton
let _hub: WebSocketHub | null = null;
export function getWebSocketHub(): WebSocketHub {
  if (!_hub) _hub = new WebSocketHub();
  return _hub;
}
