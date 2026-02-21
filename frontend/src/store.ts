/**
 * src/store.ts — DEPRECATED re-export shim.
 *
 * The canonical Redux store is at src/lib/store/index.ts.
 * This file is kept only for backwards compatibility with any lingering imports
 * from the old src/store path.  All new code should import from "@/lib/store".
 */
export { store } from "./lib/store";
export type { RootState, AppDispatch } from "./lib/store";
