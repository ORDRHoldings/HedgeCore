// sentry.client.config.ts — browser-side Sentry init
// No-op when NEXT_PUBLIC_SENTRY_DSN is unset (local dev)
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENV ?? "dev",
    tracesSampleRate: 0.1,
    // Do not send PII: email addresses, user names
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip user PII from browser events
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete (event.user as Record<string, unknown>).name;
      }
      return event;
    },
  });
}
