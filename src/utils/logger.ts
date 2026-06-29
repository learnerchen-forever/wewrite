// Structured debug logger — all output prefixed with [WeWrite:ModuleName]
// console.debug is suppressed by default in Electron/browser consoles,
// so boundary logs have zero performance impact during normal operation.

type LogData = Record<string, unknown> | string | number | undefined;

function fmt(data: LogData): string {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (typeof data === 'number') return String(data);
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' | ');
}

export interface Logger {
  debug: (action: string, detail?: LogData, extra?: LogData) => void;
  info: (message: string, detail?: LogData) => void;
  warn: (action: string, detail?: LogData, extra?: LogData) => void;
  error: (action: string, detail?: LogData, extra?: LogData) => void;
  /** Measure elapsed time. Returns a stop fn that logs the duration and returns elapsed ms. */
  timer: (label: string) => () => number;
}

export function createLogger(module: string): Logger {
  const prefix = `[WeWrite:${module}]`;

  return {
    debug(action, detail, extra) {
      const parts = [prefix, action];
      const d = fmt(detail);
      if (d) parts.push(d);
      const e = fmt(extra);
      if (e) parts.push(e);
      console.debug(parts.join(' '));
    },

    info(message, detail) {
      const parts = [prefix, message];
      const d = fmt(detail);
      if (d) parts.push(d);
      console.log(parts.join(' '));
    },

    warn(action, detail, extra) {
      const parts = [prefix, '⚠', action];
      const d = fmt(detail);
      if (d) parts.push(d);
      const e = fmt(extra);
      if (e) parts.push(e);
      console.warn(parts.join(' '));
    },

    error(action, detail, extra) {
      const parts = [prefix, '✗', action];
      const d = fmt(detail);
      if (d) parts.push(d);
      const e = fmt(extra);
      if (e) parts.push(e);
      console.error(parts.join(' '));
    },

    timer(label) {
      const start = performance.now();
      return () => {
        const elapsed = Math.round(performance.now() - start);
        console.debug(`${prefix} ${label}: ${elapsed}ms`);
        return elapsed;
      };
    },
  };
}

/** Redact API keys/tokens for safe logging */
export function redact(s: string, show = 4): string {
  if (!s || s.length <= show) return '***';
  return s.slice(0, show) + '***';
}

/** Summarize a request body for logging (keys only, no values) */
export function summarizeBody(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  if (body instanceof ArrayBuffer) return `[binary ${body.byteLength}B]`;
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length === 0) return '{}';
  if (keys.length <= 5) return `{${keys.join(', ')}}`;
  return `{${keys.slice(0, 5).join(', ')} +${keys.length - 5} more}`;
}
