import * as fs from 'fs/promises';
import * as path from 'path';
import { nanoid } from 'nanoid';
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from '@langchain/langgraph';
import { PipelineEvent } from '../../../events/types.js';

export type SpikeStatus =
  | 'pending'
  | 'prepared'
  | 'waiting_confirmation'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'cancelled';

export interface SpikeDecision {
  approved: boolean;
  feedback?: string;
}

export interface SpikeInterruptPayload {
  nodeId: 'approval';
  title: string;
  content: string;
}

export interface SpikeFileCheckpoint {
  id: string;
  runId: string;
  state: Record<string, unknown>;
  createdAt: number;
}

const SpikeState = Annotation.Root({
  runId: Annotation<string>(),
  status: Annotation<SpikeStatus>(),
  approved: Annotation<boolean | undefined>(),
  events: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

export function createLangGraphSpikeApp(checkpointer: unknown = new MemorySaver()) {
  return new StateGraph(SpikeState)
    .addNode('prepare', async (state) => ({
      status: 'prepared' as const,
      events: [`prepare:${state.runId}`],
    }))
    .addNode('approval', async () => {
      const decision = interrupt<SpikeInterruptPayload, SpikeDecision>({
        nodeId: 'approval',
        title: 'Approve LangGraph spike',
        content: 'Resume this run to verify interrupt recovery.',
      });

      return {
        approved: decision.approved,
        status: decision.approved ? ('approved' as const) : ('rejected' as const),
        events: [`approval:${decision.approved ? 'approved' : 'rejected'}`],
      };
    })
    .addNode('finalize', async (state) => ({
      status: state.approved ? ('completed' as const) : ('cancelled' as const),
      events: ['finalize'],
    }))
    .addEdge(START, 'prepare')
    .addEdge('prepare', 'approval')
    .addEdge('approval', 'finalize')
    .addEdge('finalize', END)
    .compile({ checkpointer: checkpointer as never });
}

export function langGraphRunConfig(runId: string) {
  return {
    configurable: {
      thread_id: runId,
    },
  };
}

export async function startLangGraphSpike(runId: string) {
  const app = createLangGraphSpikeApp();
  const config = langGraphRunConfig(runId);
  const firstResult = await app.invoke(
    {
      runId,
      status: 'pending' as const,
      events: [],
    },
    config
  );
  const waitingState = await app.getState(config);

  return {
    app,
    config,
    firstResult,
    waitingState,
  };
}

export async function resumeLangGraphSpike(
  app: ReturnType<typeof createLangGraphSpikeApp>,
  runId: string,
  decision: SpikeDecision
) {
  return app.invoke(new Command({ resume: decision }), langGraphRunConfig(runId));
}

export function mapSpikeStreamChunkToPipelineEvents(
  runId: string,
  chunk: Record<string, unknown>,
  timestamp = Date.now()
): PipelineEvent[] {
  const interruptPayload = chunk.__interrupt__;
  if (Array.isArray(interruptPayload)) {
    return interruptPayload.map((item) => {
      const value = isRecord(item) && isRecord(item.value) ? item.value : {};
      return {
        id: nanoid(),
        type: 'confirmation_waiting',
        runId,
        timestamp,
        nodeId: String(value.nodeId ?? 'approval'),
        data: {
          title: String(value.title ?? 'Confirmation required'),
          content: String(value.content ?? ''),
        },
      };
    });
  }

  return Object.entries(chunk).map(([nodeId, update]) => ({
    id: nanoid(),
    type: 'pipeline_node_end',
    runId,
    timestamp,
    nodeId,
    data: {
      update,
    },
  }));
}

export async function collectSpikeStreamEvents(
  runId: string,
  decision: SpikeDecision
): Promise<PipelineEvent[]> {
  const app = createLangGraphSpikeApp();
  const config = {
    ...langGraphRunConfig(runId),
    streamMode: 'updates' as const,
  };
  const events: PipelineEvent[] = [];

  const firstStream = await app.stream(
    { runId, status: 'pending' as const, events: [] },
    config
  );
  for await (const chunk of firstStream) {
    events.push(...mapSpikeStreamChunkToPipelineEvents(runId, chunk));
  }

  const resumeStream = await app.stream(new Command({ resume: decision }), config);
  for await (const chunk of resumeStream) {
    events.push(...mapSpikeStreamChunkToPipelineEvents(runId, chunk));
  }

  return events;
}

export async function writeSpikeFileCheckpoint(
  runDir: string,
  checkpoint: SpikeFileCheckpoint
): Promise<string> {
  const checkpointDir = path.join(runDir, 'langgraph', 'checkpoints');
  await fs.mkdir(checkpointDir, { recursive: true });

  const checkpointPath = path.join(checkpointDir, `${checkpoint.id}.json`);
  const checkpointTmpPath = `${checkpointPath}.${process.pid}.${Date.now()}.tmp`;
  const latestPath = path.join(runDir, 'langgraph', 'latest.json');
  const latestTmpPath = `${latestPath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(checkpoint, null, 2);

  await fs.writeFile(checkpointTmpPath, content, 'utf-8');
  await fs.rename(checkpointTmpPath, checkpointPath);
  await fs.writeFile(latestTmpPath, content, 'utf-8');
  await fs.rename(latestTmpPath, latestPath);

  return checkpointPath;
}

export async function readLatestSpikeFileCheckpoint(
  runDir: string
): Promise<SpikeFileCheckpoint | null> {
  try {
    const latestPath = path.join(runDir, 'langgraph', 'latest.json');
    const content = await fs.readFile(latestPath, 'utf-8');
    return JSON.parse(content) as SpikeFileCheckpoint;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
