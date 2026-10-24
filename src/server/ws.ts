/**
 * WebSocket Hub - manages real-time event streaming to connected clients.
 * Broadcasts pipeline events to all clients subscribed to a given run.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { PipelineEngine } from '../workflows/engine/pipelineEngine.js';
import type { EventBus, EventNotification } from '../events/eventBus.js';
import { EventReplayService } from '../events/eventReplay.js';
import type { EventRepository } from '../storage/contracts/eventRepository.js';
import type { StorageContext } from '../storage/contracts/common.js';

export class WebSocketHub {
  private clients = new Map<string, Set<WebSocket>>();
  private wss: WebSocketServer | null = null;
  private eventBusUnsubscribe?: () => Promise<void>;
  private replay?: EventReplayService;
  private replayContext?: StorageContext;
  private readonly seenNotificationEventIds = new Set<string>();

  async configureDurableEvents(args: { eventBus: EventBus; events: EventRepository; context: StorageContext }): Promise<void> {
    this.replay = new EventReplayService(args.events);
    this.replayContext = args.context;
    const unsubscribe = await args.eventBus.subscribe(notification => this.receiveNotification(notification));
    await this.eventBusUnsubscribe?.();
    this.eventBusUnsubscribe = unsubscribe;
  }

  attach(server: any): void {
    this.wss = new WebSocketServer({ server, path: '/api/ws' });

    this.wss.on('connection', (ws: WebSocket, req: any) => {
      void this.acceptConnection(ws, req);
    });
  }

  private async acceptConnection(ws: WebSocket, req: any): Promise<void> {
      // Parse runId from URL query: /api/ws?runId=xxx
      const url = new URL(req.url, 'http://localhost');
      const runId = url.searchParams.get('runId');
      const afterSequence = Number(url.searchParams.get('afterSequence') ?? '0');

      if (!runId) {
        ws.send(JSON.stringify({ type: 'error', message: 'runId query parameter required' }));
        ws.close();
        return;
      }

      this.addClient(runId, ws);

      if (this.replay && this.replayContext) {
        try {
          for (const event of await this.replay.after(this.replayContext, runId, Number.isFinite(afterSequence) ? Math.max(0, afterSequence) : 0)) {
            this.sendToClient(runId, ws, { type: 'durable_event', event });
          }
        } catch (error) {
          this.sendToClient(runId, ws, { type: 'error', message: error instanceof Error ? error.message : 'Event replay failed.' });
        }
      }

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

  private async receiveNotification(notification: EventNotification): Promise<void> {
    if (!this.replay || !this.replayContext) return;
    if (this.seenNotificationEventIds.has(notification.eventId)) return;
    this.seenNotificationEventIds.add(notification.eventId);
    try {
      const events = await this.replay.after(this.replayContext, notification.runId, Math.max(0, notification.sequence - 1), 1);
      const event = events.find(item => item.id === notification.eventId || item.sequence === notification.sequence);
      if (!event) {
        this.seenNotificationEventIds.delete(notification.eventId);
        return;
      }
      this.seenNotificationEventIds.add(event.id);
      if (this.seenNotificationEventIds.size > 10_000) {
        this.seenNotificationEventIds.delete(this.seenNotificationEventIds.values().next().value!);
      }
      this.broadcast(notification.runId, { type: 'durable_event', event });
    } catch (error) {
      this.seenNotificationEventIds.delete(notification.eventId);
      throw error;
    }
  }
}

// Singleton
let _hub: WebSocketHub | null = null;
export function getWebSocketHub(): WebSocketHub {
  if (!_hub) _hub = new WebSocketHub();
  return _hub;
}
