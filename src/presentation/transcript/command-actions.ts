import type { AgentCommandAction } from './types.js';

function stripShellWrapper(command: string): string {
  const trimmed = command.trim();
  const shellMatch = trimmed.match(/^(?:\/bin\/)?(?:ba|z|fi)?sh\s+-lc\s+(['"])([\s\S]*)\1$/i);
  if (shellMatch?.[2]) return shellMatch[2].trim();
  return trimmed;
}

function truncateActionValue(value: string, max = 120): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function splitCommandClauses(command: string): string[] {
  return command
    .split(/\s*(?:&&|\|\||;)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanToken(token: string): string {
  return token.replace(/^['"]|['"]$/g, '').trim();
}

function parseSearchQuery(command: string): string | undefined {
  const quoted = command.match(/['"]([^'"]{2,})['"]/);
  if (quoted?.[1]) return truncateActionValue(quoted[1]);
  const token = command
    .split(/\s+/)
    .map(cleanToken)
    .find((part) => part && !part.startsWith('-') && !part.includes('/') && !part.includes('*'));
  return token ? truncateActionValue(token) : undefined;
}

function parsePathishToken(command: string): string | undefined {
  const tokens = command.split(/\s+/).map(cleanToken).filter(Boolean);
  for (let i = tokens.length - 1; i >= 1; i--) {
    const token = tokens[i];
    if (!token || token.startsWith('-')) continue;
    if (token === '.' || token === '..' || token.includes('/') || token.includes('.')) {
      return truncateActionValue(token);
    }
  }
  const fallback = tokens.at(-1);
  return fallback && !fallback.startsWith('-') ? truncateActionValue(fallback) : undefined;
}

function parseReadClause(clause: string): AgentCommandAction | null {
  const readMatch = clause.match(/^(cat|bat|less|more|head|tail)\b/i);
  if (readMatch) {
    const path = parsePathishToken(clause);
    return {
      type: 'read',
      command: truncateActionValue(clause),
      path,
      name: path ? path.split('/').at(-1) : undefined,
    };
  }

  const sedMatch = clause.match(/^sed\b/i);
  if (sedMatch) {
    const path = parsePathishToken(clause);
    if (path) {
      return {
        type: 'read',
        command: truncateActionValue(clause),
        path,
        name: path.split('/').at(-1),
      };
    }
  }

  return null;
}

function parseListClause(clause: string): AgentCommandAction | null {
  if (/^(ls|tree)\b/i.test(clause)) {
    return {
      type: 'list_files',
      command: truncateActionValue(clause),
      path: parsePathishToken(clause),
    };
  }

  if (/^(fd|find)\b/i.test(clause) && !/\b(name|iname|grep|exec)\b/i.test(clause)) {
    return {
      type: 'list_files',
      command: truncateActionValue(clause),
      path: parsePathishToken(clause),
    };
  }

  if (/^rg\b/i.test(clause) && /\s--files(?:\s|$)/.test(clause)) {
    return {
      type: 'list_files',
      command: truncateActionValue(clause),
      path: parsePathishToken(clause),
    };
  }

  return null;
}

function parseSearchClause(clause: string): AgentCommandAction | null {
  if (/^(rg|grep)\b/i.test(clause) || (/^find\b/i.test(clause) && /\b(name|iname)\b/i.test(clause))) {
    return {
      type: 'search',
      command: truncateActionValue(clause),
      query: parseSearchQuery(clause),
      path: parsePathishToken(clause),
    };
  }

  return null;
}

export function parseCommandActions(command: string): AgentCommandAction[] {
  const normalized = stripShellWrapper(command);
  const clauses = splitCommandClauses(normalized);
  if (clauses.length === 0) {
    return [{ type: 'unknown', command: truncateActionValue(normalized || command) }];
  }

  const parsed = clauses.map((clause) => {
    return (
      parseReadClause(clause) ??
      parseListClause(clause) ??
      parseSearchClause(clause) ?? {
        type: 'unknown' as const,
        command: truncateActionValue(clause),
      }
    );
  });

  const deduped: AgentCommandAction[] = [];
  for (const action of parsed) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.type === action.type &&
      prev.command === action.command &&
      prev.path === action.path &&
      prev.query === action.query &&
      prev.name === action.name
    ) {
      continue;
    }
    deduped.push(action);
  }
  return deduped;
}

export function summarizeCommandAction(action: AgentCommandAction): string {
  switch (action.type) {
    case 'read':
      return `Read ${action.name ?? action.path ?? action.command}`;
    case 'list_files':
      return `List ${action.path ?? action.command}`;
    case 'search':
      if (action.query && action.path) return `Search ${action.query} in ${action.path}`;
      return `Search ${action.query ?? action.command}`;
    default:
      return `Run ${action.command}`;
  }
}
