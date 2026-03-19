import pino from 'pino';
import { Writable } from 'node:stream';
import { env } from '../config/env.js';

// ─── Ring buffer: keeps last N log entries in memory ────
const MAX_LOG_ENTRIES = 500;
const logBuffer: object[] = [];

const bufferStream = new Writable({
  write(chunk, _encoding, callback) {
    try {
      const entry = JSON.parse(chunk.toString());
      logBuffer.push(entry);
      if (logBuffer.length > MAX_LOG_ENTRIES) logBuffer.shift();
    } catch { /* ignore parse errors */ }
    callback();
  },
});

// In production, tee to both stdout and the ring buffer
const destination = env.NODE_ENV === 'production'
  ? pino.multistream([
      { stream: process.stdout },
      { stream: bufferStream },
    ])
  : pino.multistream([
      { stream: bufferStream },
    ]);

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: { service: 'ensaio-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
}, env.NODE_ENV === 'production' ? destination : undefined);

export function createChildLogger(module: string) {
  return logger.child({ module });
}

/** Return the last `n` log entries (newest last). */
export function getRecentLogs(n = MAX_LOG_ENTRIES): object[] {
  return logBuffer.slice(-n);
}
