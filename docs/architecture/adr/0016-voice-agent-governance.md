# ADR-0016: Voice Agent Governance Contract

**Status:** accepted
**Date:** 2026-04-25
**Author:** ORDR Edge
**Supersedes:** —
**Amends:** ADR-0014 (introduces a *bounded* deviation from advisory-only)

## Context

ORDR Terminal ships a real-time voice assistant ("ORDR Voice") backed by the
OpenAI Realtime API over WebRTC. Audio and text bypass our backend entirely on
the wire, so the integrity, disclosure, and oversight controls that apply to
the rest of the platform must be reconstructed at the application layer.

Three regulatory regimes apply:

- **MiFID II Art. 16(7)** — durable records of all client-facing communications.
- **EU AI Act Art. 14** — meaningful human oversight, including a working
  affordance to escalate to a human operator.
- **EU AI Act Art. 52** — transparency: users must be informed they are
  interacting with an AI system.
- **Fed SR 11-7** — model-risk management: provenance for which model + prompt
  + tools produced any given output.

ADR-0014 declared all AI outputs "advisory-only" with no state mutations. The
voice agent introduces two mutating tools (`pin_pair`, `unpin_pair`) that
modify the user's primary watchlist. We need a documented decision for how
this deviation is bounded and audited, and for the supporting controls.

## Decision

The voice agent operates under a **Tier-5 governance contract** consisting of
nine controls. Each control has a mapped artifact in code; the ADR is the
authoritative reference.

### 1. WORM transcript chain

- All voice events are written to `audit_events` via `emit_audit()` from the
  client-side Realtime session, batched through
  `POST /v1/voice/transcript`.
- Event types: `VOICE_SESSION_START`, `VOICE_TURN`, `VOICE_TOOL_CALL`,
  `VOICE_AI_DISCLOSURE_ACK`, `VOICE_HUMAN_HANDOFF`, `VOICE_SESSION_END`.
- The hash chain is per-tenant; tampering with any voice event invalidates
  every later hash for that tenant.

### 2. AI disclosure acknowledgement (Art. 52)

- First-launch disclosure copy explains the AI nature and the data flow.
- User confirmation persists `voice_disclosure_v1` in localStorage AND emits a
  one-shot `VOICE_AI_DISCLOSURE_ACK` event so consent is tamper-evident.
- A bumped disclosure version (`_v2`, etc.) requires fresh consent.

### 3. Mutating tool gate (deviation from ADR-0014)

- `MUTATING_TOOLS = {"pin_pair", "unpin_pair"}` in
  `frontend/src/hooks/useRealtimeTools.ts`.
- The hook intercepts every tool dispatch; if the tool is mutating, the model
  receives a `confirmation_required` placeholder result and the UI surfaces a
  confirm/deny card.
- Click-to-confirm is the human approval moment that keeps the system within
  the *spirit* of ADR-0014 — no state change happens without an explicit
  human action; the model has merely *requested* a change.
- On denial, the tool resolves with `{"error": "User denied execution"}` and
  the model is informed so it does not retry.
- New mutating tools must be added to the `MUTATING_TOOLS` set; reviewers
  must reject PRs that add a mutating dispatch case without a corresponding
  set entry.

### 4. Human handoff affordance (Art. 14)

- A "Talk to a human" button in `VoiceTerminal` is always visible while the
  panel is open.
- Triggering it: optionally collects a reason via `window.prompt`; emits a
  `VOICE_HUMAN_HANDOFF` audit event; denies any in-flight mutating-tool
  confirmation; disconnects the WebRTC session.
- The affordance is what regulators audit, not its outcome — even an
  empty-reason handoff is audited.

### 5. Provenance manifest (SR 11-7)

- `POST /v1/voice/token` returns `model_id`, `instructions_sha256`,
  `tools_sha256`. The hash is computed *per request* because language
  injection (control 8) varies the prompt.
- The frontend stamps these into the audit buffer; the first flush
  (carrying `session_start`) writes them to `VOICE_SESSION_START.payload.manifest`.
- Auditors can replay any session with the exact prompt + tool surface that
  was active.

### 6. Auto-reconnect on transient failure

- WebRTC `iceConnectionState === "failed"` triggers exponential backoff
  retry (1s/3s/8s, three attempts).
- `"disconnected"` is **intentionally not** a retry trigger — per WebRTC
  spec it can self-recover.
- Each retry is a new OpenAI Realtime session (the API has no resume), so
  the WORM chain shows clean session_end → session_start boundaries; the
  UX stays continuous (panel open, transcript preserved, disclosure ack
  already in localStorage).

### 7. Audit-trail UI bucket

- `VOICE_*` events surface as a dedicated `VOICE` event type in
  `frontend/src/app/audit-trail/page.tsx` with the VoiceTerminal accent
  color (`#1C62F2`) and a "Voice Sessions" tab.
- Operators auditing a regulatory voice session do not need to grep raw
  `event_type` strings.

### 8. Multi-language i18n

- `POST /v1/voice/token` accepts an optional BCP-47 `language` field;
  primary subtag is matched against `{"en", "es", "fr", "de", "ja", "zh"}`
  and a localized directive is appended to `ORDR_INSTRUCTIONS`.
- Unknown / missing codes fall back to English (backwards compatibility).
- FX terminology (`spot`, `forward`, `NDF`) stays in English in non-English
  directives — the desk vocabulary is anchored globally; localizing it
  would degrade comprehension.
- Frontend sends `navigator.language`. The provenance hash (control 5)
  reflects the language so audits can replay which localization ran.

### 9. Tenant-scoped multi-turn memory

- `GET /v1/voice/memory/recent?limit=N` reads `VOICE_*` events from
  `audit_events` filtered by `current_user.company_id`, groups by
  `entity_id` (= session_id), folds into compact per-session summaries.
- Surfaced as the `recall_recent_sessions` tool. Each invocation lands a
  `VOICE_TOOL_CALL` audit row — recall is logged, not silently spliced.
- Cross-tenant recall is structurally impossible: the SQL `WHERE
  company_id = ?` predicate is the only data gate.

## Consequences

### Positive

- **Audit defensibility**: a compliance review can reconstruct every voice
  session — model, prompt hash, tool catalog, full transcript, every tool
  call argument, the user's ack of disclosure, any human handoff — from
  the per-tenant WORM chain alone.
- **Bounded state mutation**: the deviation from ADR-0014 is small (two
  watchlist tools), explicit (the `MUTATING_TOOLS` set is a single source
  of truth), and gated (UI confirm card before any mutation runs).
- **Resilience**: ICE-failed reconnection means a brief network blip does
  not lose the session for the user; the audit chain remains coherent
  across the boundary.
- **Localization without prompt drift**: language is a parameter to the
  prompt, not a fork — the production system prompt source remains a
  single string; only the directive line changes.
- **Continuity across sessions**: `recall_recent_sessions` lets the agent
  reference prior work without bloating instructions or storing context
  outside the WORM chain.

### Constraints / Negative

- **Two mutating tools is the cap** for the foreseeable future. Adding a
  third (e.g., a tool that creates an execution proposal directly) must
  be re-evaluated against ADR-0014 and likely require a fresh ADR.
- **Disclosure version bumps invalidate localStorage acks**. Any change
  to the consent text must increment the version key (`_v1` → `_v2`) so
  users re-acknowledge — silent edits would compromise consent integrity.
- **Provenance hash is per-request, not per-boot**. Boot-time
  `INSTRUCTIONS_SHA256` reflects only the English baseline; auditors must
  read the per-session `manifest.instructions_sha256` to know which
  language ran.
- **Recall is bounded by audit_events retention**. If a tenant's audit
  retention is shorter than their typical "last conversation" recall
  horizon, the tool returns empty. Acceptable: there is no expectation
  of indefinite memory.

### Frozen artifacts

The following files implement the contract and are subject to ADR-only
modification (per `.claude/rules/architecture.md`):

- `backend/app/api/routes/v1_voice_token.py` — controls 5, 8
- `backend/app/api/routes/v1_voice_transcript.py` — controls 1, 2, 4
- `backend/app/api/routes/v1_voice_memory.py` — control 9
- `frontend/src/hooks/useRealtimeVoice.ts` — controls 1, 4, 6
- `frontend/src/hooks/useRealtimeTools.ts` — control 3 (`MUTATING_TOOLS`)
- `frontend/src/components/voice/VoiceTerminal.tsx` — controls 2, 4

## References

- ADR-0014 — AI Add-on Tier: Advisory-Only Contract (parent contract)
- MiFID II Art. 16(7) — communications recording
- EU AI Act Arts. 14, 52 — human oversight and transparency
- Fed SR 11-7 — model-risk management
- OpenAI Realtime API session lifecycle: https://platform.openai.com/docs/guides/realtime
- WebRTC `iceConnectionState` semantics: https://www.w3.org/TR/webrtc/#dom-rtciceconnectionstate
- Implementation commits (master): `a8733b3` (audit-trail bucket), `9345b86` (i18n), `fc261cd` (memory), preceding voice work in branch history
