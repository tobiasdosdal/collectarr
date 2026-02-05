type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

const DEBUG_SCOPE_ENV = process.env.ACDB_DEBUG_SCOPES || process.env.DEBUG_SCOPES || '';

function parseDebugScopes(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map(scope => scope.trim().toLowerCase())
      .filter(Boolean)
  );
}

const DEBUG_SCOPES = parseDebugScopes(DEBUG_SCOPE_ENV);
const DEBUG_ALL = DEBUG_SCOPES.has('*');

function isDebugScopeEnabled(scope: string): boolean {
  if (DEBUG_ALL) {
    return true;
  }

  const normalizedScope = scope.toLowerCase();
  if (DEBUG_SCOPES.has(normalizedScope)) {
    return true;
  }

  for (const configuredScope of DEBUG_SCOPES) {
    if (normalizedScope.startsWith(`${configuredScope}.`)) {
      return true;
    }
  }

  return false;
}

function emitLog(level: LogLevel, scope: string, message: string, context?: LogContext): void {
  const prefix = `[${scope}] ${message}`;

  if (context && Object.keys(context).length > 0) {
    console[level](prefix, context);
    return;
  }

  console[level](prefix);
}

export interface ScopedLogger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
}

export function createLogger(scope: string): ScopedLogger {
  const normalizedScope = scope.trim();

  return {
    debug: (message, context) => {
      if (!isDebugScopeEnabled(normalizedScope)) {
        return;
      }
      emitLog('debug', normalizedScope, message, context);
    },
    info: (message, context) => {
      emitLog('info', normalizedScope, message, context);
    },
    warn: (message, context) => {
      emitLog('warn', normalizedScope, message, context);
    },
    error: (message, context) => {
      emitLog('error', normalizedScope, message, context);
    },
  };
}
