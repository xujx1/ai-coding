/**
 * Minimal context compression.
 * When approaching context window limit, summarize old messages while preserving:
 * - Current task goal
 * - Files read (summary)
 * - Files modified (summary)
 * - Test results
 * - Todo items / plan steps
 * - Confirmation gate state
 */
import { LLMMessage, LLMProvider } from '../models/providers.js';
import { TokenBudget, estimateTokens } from './tokens.js';
import { getEventLog } from '../events/EventLog.js';

const COMPACT_SYSTEM_PROMPT = `You are compressing a conversation history for an AI coding agent.
Create a concise summary that preserves essential information for continuing the task.

Include in your summary:
1. Current task/goal (what is being implemented)
2. Key files read and what was learned from them (file paths + brief findings)
3. Files created/modified (file paths + what changed)
4. Compilation/test results (success/failure, key errors)
5. Current plan steps and their completion status
6. Any pending user confirmations or blockers
7. Important code patterns/conventions observed

Keep the summary under 2000 tokens. Be specific about file paths and technical details.
Do NOT include raw code snippets unless absolutely critical.
Output ONLY the summary text, no preamble.`;

export interface CompactResult {
  summaryMessage: LLMMessage;
  tokensBefore: number;
  tokensAfter: number;
  compactCount: number;
}

/**
 * Perform context compression.
 * Takes all messages, asks LLM to summarize old messages, replaces them with a single summary message.
 */
export async function compactContext(
  messages: LLMMessage[],
  systemPrompt: string,
  provider: LLMProvider,
  modelId: string,
  budget: TokenBudget,
  runId: string,
  agentRunId: string
): Promise<CompactResult> {
  const eventLog = getEventLog(runId);
  const tokensBefore = budget.getUsed();

  eventLog.logEvent('compact_start', { tokensBefore }, agentRunId);

  // Keep recent messages intact (last few turns are most relevant)
  // Keep: system prompt (handled separately), last N messages (recent context)
  const KEEP_RECENT = 6; // keep last 3 pairs (6 messages)
  const oldMessages = messages.slice(0, Math.max(0, messages.length - KEEP_RECENT));
  const recentMessages = messages.slice(Math.max(0, messages.length - KEEP_RECENT));

  // Build conversation history text for summarization
  let historyText = '';
  for (const msg of oldMessages) {
    const role = msg.role === 'assistant' ? 'Assistant' : 'User/Tool';
    historyText += `\n[${role}]:\n`;
    if (typeof msg.content === 'string') {
      historyText += msg.content.slice(0, 500);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') historyText += block.text.slice(0, 300) + '\n';
        else if (block.type === 'tool_use') historyText += `[Tool use: ${block.name}]\n`;
        else if (block.type === 'tool_result') historyText += `[Tool result: ${String(block.content).slice(0, 200)}]\n`;
      }
    }
    historyText += '\n---\n';
  }

  // Ask LLM to summarize
  let summary: string;
  try {
    const response = await provider.createMessage({
      model: modelId,
      messages: [
        { role: 'system', content: COMPACT_SYSTEM_PROMPT },
        { role: 'user', content: `Summarize this conversation history:\n\n${historyText.slice(0, 12000)}` },
      ],
      maxTokens: 3000,
      temperature: 0.2,
    });
    summary = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')
      .trim();
  } catch {
    // Fallback summary if LLM call fails
    summary = generateFallbackSummary(oldMessages);
  }

  // Build compressed message list
  const compressedContent = `## Context Summary (compressed at ${new Date().toISOString()})\n\n${summary}\n\n## Recent Context\n(Recent messages preserved below for continuity)`;

  const summaryMessage: LLMMessage = {
    role: 'user',
    content: compressedContent,
  };

  const newMessages = [summaryMessage, ...recentMessages];
  const tokensAfter = estimateTokens(compressedContent) + recentMessages.reduce(
    (acc, m) => acc + (typeof m.content === 'string' ? estimateTokens(m.content) : estimateTokens(JSON.stringify(m.content))),
    0
  );

  eventLog.logEvent('compact_end', {
    tokensBefore,
    tokensAfter,
    compressionRatio: tokensAfter / tokensBefore,
  }, agentRunId);

  return {
    summaryMessage,
    tokensBefore,
    tokensAfter,
    compactCount: 1,
  };
}

function generateFallbackSummary(messages: LLMMessage[]): string {
  const filesRead = new Set<string>();
  const filesWritten = new Set<string>();
  let compileStatus = 'unknown';
  let testStatus = 'unknown';

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    // Extract file paths from tool calls (rough heuristic)
    const readMatches = content.match(/read_file[^\"]*"file_path"\s*:\s*"([^"]+)"/g);
    const writeMatches = content.match(/write_file[^\"]*"file_path"\s*:\s*"([^"]+)"/g);
    const editMatches = content.match(/edit_file[^\"]*"file_path"\s*:\s*"([^"]+)"/g);
    if (readMatches) readMatches.forEach(m => {
      const f = m.match(/"([^"]+)"$/)?.[1]; if (f) filesRead.add(f);
    });
    if (writeMatches) writeMatches.forEach(m => {
      const f = m.match(/"([^"]+)"$/)?.[1]; if (f) filesWritten.add(f);
    });
    if (editMatches) editMatches.forEach(m => {
      const f = m.match(/"([^"]+)"$/)?.[1]; if (f) filesWritten.add(f);
    });
    if (content.includes('BUILD SUCCESS') || content.includes('compiled successfully')) compileStatus = 'passing';
    if (content.includes('BUILD FAILURE') || content.includes('compilation failure')) compileStatus = 'failing';
    if (content.includes('Tests run:')) {
      const match = content.match(/Tests run:\s*(\d+).*Failures:\s*(\d+).*Errors:\s*(\d+)/);
      if (match) {
        const failures = parseInt(match[2]) + parseInt(match[3]);
        testStatus = failures === 0 ? 'passing' : `${failures} failures`;
      }
    }
  }

  return `### Auto-summary (fallback)
- **Files examined**: ${[...filesRead].slice(0, 20).join(', ') || '(tracking unavailable)'}
- **Files modified**: ${[...filesWritten].slice(0, 20).join(', ') || '(none yet)'}
- **Compilation**: ${compileStatus}
- **Tests**: ${testStatus}
- **Note**: This is a mechanical summary. The LLM-based summarizer was unavailable.`;
}
