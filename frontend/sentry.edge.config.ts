// sentry.edge.config.ts — Next.js Edge Runtime Sentry init
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENV ?? "dev",
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
  });
}
