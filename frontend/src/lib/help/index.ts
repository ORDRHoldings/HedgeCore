/**
 * lib/help/index.ts — Help System V2 barrel export
 *
 * Re-exports all module help objects and shared types so pages can import
 * from a single path: `import { DASHBOARD_HELP } from "@/lib/help"`
 */

export * from "./types";
export { DASHBOARD_HELP }   from "./dashboard";
export { POSITIONS_HELP }   from "./positions";
export { POLICIES_HELP }    from "./policies";
export { EXECUTION_HELP }   from "./execution";
export { REPORTS_HELP }     from "./reports";
export { AUDIT_HELP }       from "./audit";
export { SETTINGS_HELP }    from "./settings";
export { SANDBOX_HELP }     from "./sandbox";
