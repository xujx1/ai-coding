const SEARCH_COMMANDS = new Set(['find', 'grep', 'rg', 'ag', 'ack', 'locate', 'which', 'whereis']);
const READ_COMMANDS = new Set(['cat', 'head', 'tail', 'less', 'more', 'wc', 'stat', 'file', 'strings', 'jq', 'awk', 'cut', 'sort', 'uniq', 'tr', 'pwd', 'printenv']);
const LIST_COMMANDS = new Set(['ls', 'tree', 'du']);
const NEUTRAL_COMMANDS = new Set(['echo', 'printf', 'true', 'false', ':']);
const WRITE_REDIRECTS = new Set(['>', '>>', '>&', '2>', '2>>', '&>']);

export interface BashCommandAnalysis {
  isReadOnly: boolean;
  isSearch: boolean;
  isRead: boolean;
  isList: boolean;
  commands: string[];
  reason?: string;
}

export function analyzeBashCommand(command: string): BashCommandAnalysis {
  const parts = splitCommand(command);
  const commands: string[] = [];
  let isSearch = false;
  let isRead = false;
  let isList = false;
  let sawNonNeutral = false;

  for (const part of parts) {
    if (!part) continue;
    if (isOperator(part)) continue;
    if (WRITE_REDIRECTS.has(part)) {
      return { isReadOnly: false, isSearch: false, isRead: false, isList: false, commands, reason: 'write redirect' };
    }
    if (part.startsWith('$(') || part.includes('`')) {
      return { isReadOnly: false, isSearch: false, isRead: false, isList: false, commands, reason: 'command substitution' };
    }

    const base = stripCommandPrefix(part);
    if (!base) continue;
    commands.push(base);
    if (NEUTRAL_COMMANDS.has(base)) continue;
    sawNonNeutral = true;

    if (SEARCH_COMMANDS.has(base)) {
      isSearch = true;
      continue;
    }
    if (READ_COMMANDS.has(base)) {
      isRead = true;
      continue;
    }
    if (LIST_COMMANDS.has(base)) {
      isList = true;
      continue;
    }
    return { isReadOnly: false, isSearch: false, isRead: false, isList: false, commands, reason: `command ${base} is not read-only` };
  }

  return {
    isReadOnly: sawNonNeutral || commands.some(cmd => NEUTRAL_COMMANDS.has(cmd)),
    isSearch,
    isRead,
    isList,
    commands,
  };
}

function splitCommand(command: string): string[] {
  return command
    .replace(/([;&|()<>])/g, ' $1 ')
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function isOperator(part: string): boolean {
  return [';', '&&', '||', '|', '(', ')', '<'].includes(part) || part === '&';
}

function stripCommandPrefix(part: string): string {
  const cleaned = part.replace(/^command\s+/, '').replace(/^builtin\s+/, '');
  const base = cleaned.split('=')[0] === cleaned ? cleaned : '';
  return base.replace(/^["']|["']$/g, '');
}
