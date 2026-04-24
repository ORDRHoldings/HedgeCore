/**
 * lib/logger.ts
 * Universal structured logger for both server-side (Next.js API routes, RSC)
 * and client-side React components.
 *
 * Behavior matrix:
 *   ENV            debug  info   warn   error
 *   development    stdout stdout stdout stdout
 *   test           silent silent silent silent
 *   production     silent silent stdout stdout + Sentry
 *
 * Two call styles are supported:
 *   1. Structured:  logger.info({ event: "x", userId: "y" })
 *   2. Positional:  logger.error("failed to fetch", err, { runId })
 *
 * Positional style matches existing `console.error` call sites and is
 * preferred for client components; structured style is preferred for
 * server-side API routes (machine-parseable in Vercel logs).
 */

type Level = "debug" | "info" | "warn" | "error";

interface LogPayload {
  [key: string]: unknown;
}

const ENV = process.env.NODE_ENV;
const IS_TEST = ENV === "test";
const IS_PROD = ENV === "production";

function shouldEmit(level: Level): boolean {
  if (IS_TEST) return false;
  if (IS_PROD && (level === "debug" || level === "info")) return false;
  return true;
}

function emitStructured(level: Level, payload: LogPayload): void {
  if (!shouldEmit(level)) return;
  const line = JSON.stringify({ level, ts: Date.now(), ...payload });
  // eslint-disable-next-line no-console
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(line);
}

function emitPositional(level: Level, args: unknown[]): void {
  if (!shouldEmit(level)) return;
  // eslint-disable-next-line no-console
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(...args);
}

function sendToSentry(level: Level, args: unknown[]): void {
  if (!IS_PROD) return;
  if (level !== "error" && level !== "warn") return;
  // Sentry's SeverityLevel is "fatal"|"error"|"warning"|"log"|"info"|"debug"
  const sentryLevel: "error" | "warning" = level === "warn" ? "warning" : "error";
  // Lazy import so test/dev bundles don't pull Sentry into every page.
  // Errors are non-fatal if Sentry is unavailable.
  try {
    import("@sentry/nextjs")
      .then((Sentry) => {
        const err = args.find((a) => a instanceof Error) as Error | undefined;
        const context = args.filter((a) => !(a instanceof Error));
        if (err) {
          Sentry.captureException(err, { level: sentryLevel, extra: { context } });
        } else {
          Sentry.captureMessage(args.map((a) => String(a)).join(" "), { level: sentryLevel });
        }
      })
      .catch(() => {
        /* Sentry not available — swallow */
      });
  } catch {
    /* swallow */
  }
}

function call(level: Level, args: unknown[]): void {
  // Structured style: single object argument
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !(args[0] instanceof Error)) {
    emitStructured(level, args[0] as LogPayload);
  } else {
    emitPositional(level, args);
  }
  sendToSentry(level, args);
}

export const logger = {
  debug: (...args: unknown[]) => call("debug", args),
  info: (...args: unknown[]) => call("info", args),
  warn: (...args: unknown[]) => call("warn", args),
  error: (...args: unknown[]) => call("error", args),
} as const;

export default logger;
