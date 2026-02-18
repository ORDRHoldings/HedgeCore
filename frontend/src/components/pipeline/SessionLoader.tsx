"use client";

/**
 * SessionLoader.tsx
 *
 * Previously dispatched loadSessionThunk on mount to restore auth from cookies.
 * Auth session restoration is now handled by AuthProvider in authContext.tsx
 * which reads the cookie on mount.
 *
 * This component is kept as a no-op to maintain compatibility with tests
 * that verify its existence in ClientProviders.tsx.
 *
 * Renders nothing — purely structural.
 */

export default function SessionLoader() {
  return null;
}
