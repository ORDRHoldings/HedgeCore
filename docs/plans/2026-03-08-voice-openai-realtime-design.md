# Voice Layer — OpenAI Realtime API

**Date**: 2026-03-08
**Status**: Approved
**Scope**: Replace browser speech APIs + Anthropic Claude with OpenAI Realtime API for voice interaction

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Voice API | OpenAI Realtime API | True voice-to-voice streaming, sub-second latency |
| AI Brain | GPT-4o (via Realtime) | Full OpenAI — replaces Claude for voice channel |
| Input modes | Dual-mode (voice + text) | Same Realtime session handles both |
| Connection | Browser-direct to OpenAI (temporary) | Simpler initial architecture, migrate to backend proxy later |
| Security | Ephemeral token pattern | Backend mints short-lived tokens, API key never reaches client |
| Tool execution | Browser calls backend API | dashboardFetch() with JWT, results sent back to OpenAI |

## Architecture

```
Browser                         Backend                    OpenAI
  |                               |                          |
  |--POST /api/v1/voice/token-->  |--POST /v1/realtime/sessions-->
  |<--- { token, expires_at } --  |<-- ephemeral_token ----  |
  |                               |                          |
  |--WSS api.openai.com/v1/realtime?model=gpt-4o-realtime-preview->
  |<----------- audio/text/function_calls ----------------   |
  |                               |                          |
  | (on function_call)            |                          |
  |--GET/POST /api/v1/... -----> |                          |
  |<---- JSON result ----------- |                          |
  |--tool_result to OpenAI ------------------------------>   |
```

## Backend Changes

### 1. New route: `backend/app/api/routes/v1_voice_token.py`

Single endpoint:

```
POST /api/v1/voice/token
Auth: JWT (get_current_user)
Returns: { token: string, expires_at: string }
```

Implementation:
- Read `OPENAI_API_KEY_V` from environment
- POST to `https://api.openai.com/v1/realtime/sessions` with:
  - `model`: `gpt-4o-realtime-preview`
  - `voice`: `alloy`
  - `tools`: all 6 HedgeCore tool definitions in OpenAI format
  - `instructions`: ORDR system prompt
- Return the ephemeral `client_secret.value` and `client_secret.expires_at`

### 2. Tool definitions (OpenAI format)

Port all 6 tools from Anthropic format to OpenAI function calling:

| Tool | Backend API called | Method |
|------|-------------------|--------|
| `calculate_hedge` | `POST /api/v1/calculate` | POST |
| `get_spot_rate` | `GET /api/v1/market/fx/rates` | GET |
| `list_positions` | `GET /api/v1/positions` | GET |
| `get_portfolio_summary` | `GET /api/v1/dashboard/summary` | GET |
| `list_policies` | `GET /api/v1/policies/templates` | GET |
| `get_pending_approvals` | `GET /api/v1/proposals?status=PROPOSED&limit=10` | GET |

### 3. Existing voice_agent.py

Keep as-is. Not modified. Can serve as text-only fallback or be removed later.

### 4. Route registration

Add `v1_voice_token_router` to `backend/app/api/router.py`.

## Frontend Changes

### 1. Rewrite `VoiceTerminal.tsx`

Replace browser Web Speech API + backend WebSocket with OpenAI Realtime WebSocket.

**Connection lifecycle:**
1. User opens voice terminal
2. `POST /api/v1/voice/token` → get ephemeral token
3. Open `new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview")` with `Authorization: Bearer <token>` in protocol header
4. Send `session.update` with instructions, voice, tools config
5. Ready for interaction

**Voice input:**
- `navigator.mediaDevices.getUserMedia({ audio: true })` → MediaStream
- AudioContext + ScriptProcessorNode/AudioWorklet → PCM16 24kHz
- Send as `input_audio_buffer.append` events (base64-encoded)
- Server detects speech end → `input_audio_buffer.committed` → triggers response

**Voice output:**
- Receive `response.audio.delta` events (base64 PCM16 24kHz)
- Decode and queue in Web Audio API AudioBufferSourceNode
- Play sequentially for smooth audio

**Text input:**
- User types in text field → send as:
  ```json
  { "type": "conversation.item.create", "item": { "type": "message", "role": "user", "content": [{ "type": "input_text", "text": "..." }] } }
  ```
- Then send `{ "type": "response.create" }` to trigger response
- Response text arrives in `response.text.delta` / `response.audio_transcript.delta`

**Tool execution (browser-side):**
1. Receive `response.function_call_arguments.done` with `call_id`, `name`, `arguments`
2. Parse arguments JSON
3. Call backend: `dashboardFetch("/v1/calculate", token, { method: "POST", body })` (or GET for read endpoints)
4. Send result back:
   ```json
   { "type": "conversation.item.create", "item": { "type": "function_call_output", "call_id": "...", "output": "{ JSON result }" } }
   ```
5. Send `{ "type": "response.create" }` to get follow-up response

**Transcript display:**
- `response.audio_transcript.delta` → append to assistant message in UI
- `conversation.item.input_audio_transcription.completed` → show user's spoken text
- Text messages → show directly

### 2. UI Layout

Keep the existing floating panel design:
- Header: ORDR VOICE title, close button
- Transcript area: scrollable message list (user/assistant)
- Bottom: text input + mic button (toggle)
- Mic button: red when streaming, gray when idle
- Status indicator: connecting / ready / speaking / processing

### 3. Audio configuration

- Sample rate: 24000 Hz (OpenAI Realtime requirement)
- Format: PCM16 (signed 16-bit little-endian)
- Channels: mono
- Turn detection: server VAD (default, OpenAI handles silence detection)

## Environment Variables

| Variable | Location | Required |
|----------|----------|----------|
| `OPENAI_API_KEY_V` | Backend (.env) | Yes |

No frontend env vars needed.

## What stays unchanged

- All backend API routes (calculate, positions, policies, etc.)
- JWT authentication flow
- `voice_agent.py` (kept, not modified)
- Dashboard, sidebar, widget system
- All other frontend components

## Future migration (C1 → C2)

When moving to backend-proxy architecture:
1. Backend opens server-side WebSocket to OpenAI
2. Backend proxies audio between browser and OpenAI
3. Backend executes tool calls internally (no browser round-trip)
4. Frontend simplifies to audio streaming only
5. Remove ephemeral token endpoint
