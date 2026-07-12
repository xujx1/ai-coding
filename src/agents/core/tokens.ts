/**
 * Token estimation utilities.
 * Simple token counting (approximate - uses 4 chars ≈ 1 token heuristic for speed).
 */

// Rough approximation: ~4 characters per token for English/code
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessageTokens(message: { role: string; content: string | any[] }): number {
  let total = 4; // per-message overhead
  if (typeof message.content === 'string') {
    total += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block.type === 'text') total += estimateTokens(block.text);
      else if (block.type === 'tool_use') total += estimateTokens(JSON.stringify(block.input)) + 20;
      else if (block.type === 'tool_result') total += estimateTokens(String(block.content)) + 10;
      else if (block.type === 'thinking') total += estimateTokens(block.thinking);
    }
  }
  // Function definitions overhead
  total += 2;
  return total;
}

export function estimateTotalTokens(messages: Array<{ role: string; content: string | any[] }>, systemPrompt?: string): number {
  let total = 0;
  if (systemPrompt) total += estimateTokens(systemPrompt);
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  return total;
}

/**
 * Token budget tracking for context window management.
 */
export class TokenBudget {
  private used: number = 0;

  constructor(
    private contextWindow: number,
    private thresholdRatio: number = 0.8,
    private reserveRatio: number = 0.3,
  ) {}

  update(messages: Array<{ role: string; content: string | any[] }>, systemPrompt?: string): void {
    this.used = estimateTotalTokens(messages, systemPrompt);
  }

  getUsed(): number { return this.used; }
  getRemaining(): number { return this.contextWindow - this.used; }
  getUsageRatio(): number { return this.used / this.contextWindow; }

  shouldCompact(): boolean {
    return this.used > this.contextWindow * this.thresholdRatio;
  }

  getTargetTokens(): number {
    return Math.floor(this.contextWindow * this.reserveRatio);
  }
}
