/**
 * lib/help/guides/index.ts — Guide Documentation barrel export
 *
 * `GUIDES` is the canonical ordered array consumed by the Help page.
 * Order matches the left-sidebar navigation.
 */

import type { GuideDoc } from "./types";
export * from "./types";

import { GETTING_STARTED }    from "./getting-started";
import { DASHBOARD_WIDGETS }  from "./dashboard-widgets";
import { DATA_INGESTION }     from "./data-ingestion";
import { POSITION_DESK_GUIDE } from "./position-desk";
import { POLICY_ENGINE_GUIDE } from "./policy-engine";
import { SANDBOX_SIMULATION }  from "./sandbox-simulation";
import { EXECUTION_PIPELINE }  from "./execution-pipeline";
import { EXECUTION_BRIDGE }    from "./execution-bridge";
import { FX_RATES }            from "./fx-rates";
import { POLISOPHIC }          from "./polisophic";
import { GOVERNANCE }          from "./governance";
import { TROUBLESHOOTING }     from "./troubleshooting";
import { API_REFERENCE }       from "./api-reference";
import { FAQ }                 from "./faq";

export const GUIDES: GuideDoc[] = [
  GETTING_STARTED,
  DASHBOARD_WIDGETS,
  DATA_INGESTION,
  POSITION_DESK_GUIDE,
  POLICY_ENGINE_GUIDE,
  SANDBOX_SIMULATION,
  EXECUTION_PIPELINE,
  EXECUTION_BRIDGE,
  FX_RATES,
  POLISOPHIC,
  GOVERNANCE,
  TROUBLESHOOTING,
  API_REFERENCE,
  FAQ,
];

// Re-export individual guides for direct import
export {
  GETTING_STARTED, DASHBOARD_WIDGETS, DATA_INGESTION,
  POSITION_DESK_GUIDE, POLICY_ENGINE_GUIDE, SANDBOX_SIMULATION,
  EXECUTION_PIPELINE, EXECUTION_BRIDGE, FX_RATES, POLISOPHIC,
  GOVERNANCE, TROUBLESHOOTING, API_REFERENCE, FAQ,
};
