import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable when DSN is configured
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring sample rate (adjust for production traffic)
  tracesSampleRate: 1.0,

  // Session replay for debugging (sample 10% of sessions, 100% on error)
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],
});
