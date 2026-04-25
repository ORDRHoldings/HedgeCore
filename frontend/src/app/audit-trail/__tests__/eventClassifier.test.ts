/**
 * Pure-function tests for the audit-trail event-bucket classifier.
 *
 * The classifier is regulatory-load-bearing: it routes every backend
 * `audit_events.event_type` to the UI bucket auditors filter on. Misroutes
 * are silent — events disappear from the tab a reviewer expects them in.
 *
 * The VOICE bucket (ADR-0016 control 7) MUST keep its highest-precedence
 * branch ordering — `voice_*` event_types must never fall through into
 * other buckets even when their substrings overlap (e.g. an "approval"
 * event with the word "voice" in the description, or a future event type
 * `VOICE_APPROVAL_GRANTED`).
 */

import { inferEventType } from "../eventClassifier";

describe("inferEventType — bucket routing", () => {
  describe("VOICE bucket (ADR-0016)", () => {
    it("routes every voice_* prefix to VOICE", () => {
      for (const t of [
        "VOICE_SESSION_START",
        "VOICE_SESSION_END",
        "VOICE_TURN",
        "VOICE_TOOL_CALL",
        "VOICE_AI_DISCLOSURE_ACK",
        "VOICE_HUMAN_HANDOFF",
      ]) {
        expect(inferEventType(t)).toBe("VOICE");
      }
    });

    it("is case-insensitive on the voice_ prefix", () => {
      expect(inferEventType("voice_session_start")).toBe("VOICE");
      expect(inferEventType("Voice_Turn")).toBe("VOICE");
    });

    it("preserves VOICE precedence over substring overlaps", () => {
      // Future-proof: even if a VOICE event has "approval" or "executed" in
      // the type, the voice_ prefix wins. This is the *spirit* of the bucket
      // — every voice event lands under "Voice Sessions" for auditors.
      expect(inferEventType("VOICE_TOOL_APPROVAL")).toBe("VOICE");
      expect(inferEventType("VOICE_HEDGE_EXECUTED")).toBe("VOICE");
      expect(inferEventType("VOICE_PROPOSAL.CREATED")).toBe("VOICE");
      expect(inferEventType("VOICE_POLICY.APPLIED")).toBe("VOICE");
    });
  });

  describe("APPROVAL bucket", () => {
    it("matches 'approved' and 'approval' substrings", () => {
      expect(inferEventType("PROPOSAL_APPROVED")).toBe("APPROVAL");
      expect(inferEventType("approval.granted")).toBe("APPROVAL");
      expect(inferEventType("EXECUTION_APPROVAL_REQUESTED")).toBe("APPROVAL");
    });
  });

  describe("EXECUTION bucket", () => {
    it("matches 'executed', 'hedged', 'execution' substrings", () => {
      expect(inferEventType("HEDGE_EXECUTED")).toBe("EXECUTION");
      expect(inferEventType("position.hedged")).toBe("EXECUTION");
      expect(inferEventType("execution.confirmed")).toBe("EXECUTION");
    });

    it("yields APPROVAL precedence over EXECUTION when both substrings present", () => {
      // "EXECUTION_APPROVAL_REQUESTED" matches both "approval" and "execution"
      // but APPROVAL is checked first — auditors see this in approvals queue.
      expect(inferEventType("EXECUTION_APPROVAL_REQUESTED")).toBe("APPROVAL");
    });
  });

  describe("PROPOSAL bucket", () => {
    it("matches 4 dotted prefixes", () => {
      expect(inferEventType("proposal.created")).toBe("PROPOSAL");
      expect(inferEventType("position.created")).toBe("PROPOSAL");
      expect(inferEventType("calculation.completed")).toBe("PROPOSAL");
      expect(inferEventType("run.started")).toBe("PROPOSAL");
    });

    it("does NOT match prefixes without the dot", () => {
      // 'proposalsmth' shouldn't be a proposal (no dot) — falls to SYSTEM.
      expect(inferEventType("proposalsomething")).toBe("SYSTEM");
    });
  });

  describe("POLICY bucket", () => {
    it("matches 'policy.' prefix only", () => {
      expect(inferEventType("policy.created")).toBe("POLICY");
      expect(inferEventType("policy.revised")).toBe("POLICY");
      expect(inferEventType("policymaker.foo")).toBe("SYSTEM");
    });
  });

  describe("IMPORT bucket", () => {
    it("matches 'import.' and 'connector.' prefixes", () => {
      expect(inferEventType("import.started")).toBe("IMPORT");
      expect(inferEventType("connector.oauth_completed")).toBe("IMPORT");
    });
  });

  describe("SYSTEM fallback", () => {
    it("classifies anything else as SYSTEM", () => {
      expect(inferEventType("LOGIN_SUCCESS")).toBe("SYSTEM");
      expect(inferEventType("user.created")).toBe("SYSTEM");
      expect(inferEventType("")).toBe("SYSTEM");
      expect(inferEventType("unknown_event")).toBe("SYSTEM");
    });
  });
});
