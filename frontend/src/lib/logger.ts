/**
 * lib/logger.ts
 * Thin structured logger for server-side Next.js API routes.
 * Emits JSON to stdout (visible in Vercel function logs).
 * Suppressed in test environment.
 */

type Level = "info" | "warn" | "error";

interface LogPayload {
  [key: string]: unknown;
}

function emit(level: Level, payload: LogPayload): void {
  if (process.env.NODE_ENV === "test") return;
  const line = JSON.stringify({ level, ts: Date.now(), ...payload });
  if (level === "error") {
    console.error(line); // eslint-disable-line no-console
  } else if (level === "warn") {
    console.warn(line); // eslint-disable-line no-console
  } else {
    console.log(line); // eslint-disable-line no-console
  }
}

export const logger = {
  info: (payload: LogPayload) => emit("info", payload),
  warn: (payload: LogPayload) => emit("warn", payload),
  error: (payload: LogPayload) => emit("error", payload),
} as const;
