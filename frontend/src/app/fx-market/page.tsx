"use client";

/**
 * fx-market/page.tsx — FX Market (canonical route)
 *
 * Formerly at /currency-fx (now redirects here via next.config.js).
 * Full independent implementation in Step 17.
 * For now, renders the FX rates content via client-side module reuse.
 */

// Re-export the currency-fx page content at the new canonical route.
// Step 17 will refactor this into a standalone implementation.
export { default } from "@/app/currency-fx/page";
