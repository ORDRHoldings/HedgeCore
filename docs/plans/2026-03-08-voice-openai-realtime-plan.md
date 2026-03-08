# Voice Layer — Implementation Plan

**Design**: `2026-03-08-voice-openai-realtime-design.md`
**Estimated steps**: 5

## Step 1: Backend — Ephemeral token endpoint

**File**: `backend/app/api/routes/v1_voice_token.py` (new)

Create a single route file:
- `POST /v1/voice/token` — JWT-authenticated
- Reads `OPENAI_API_KEY_V` from env
- Calls `POST https://api.openai.com/v1/realtime/sessions` with session config:
  - model: `gpt-4o-realtime-preview`
  - voice: `alloy`
  - tools: 6 HedgeCore tools in OpenAI function format
  - instructions: ORDR system prompt
  - input_audio_transcription: { model: "whisper-1" }
  - turn_detection: { type: "server_vad" }
- Returns `{ token, expires_at }` from response's `client_secret`
- 403 if OPENAI_API_KEY_V not configured

**Register**: Add to `backend/app/api/router.py`

**Test**: `backend/tests/test_voice_token.py` — mock httpx call to OpenAI, verify JWT required, verify response shape

## Step 2: Frontend — OpenAI Realtime WebSocket hook

**File**: `frontend/src/hooks/useRealtimeVoice.ts` (new)

Custom React hook encapsulating all Realtime API logic:

```typescript
interface UseRealtimeVoiceOptions {
  token: string;           // JWT for backend auth
  onTranscript: (role: "user" | "assistant", text: string, delta: boolean) => void;
  onFunctionCall: (name: string, status: "calling" | "done") => void;
  onStatusChange: (status: VoiceStatus) => void;
  onError: (error: string) => void;
}

interface UseRealtimeVoiceReturn {
  connect: () => Promise<void>;
  disconnect: () => void;
  sendText: (text: string) => void;
  toggleMic: () => void;
  isMicOn: boolean;
  status: VoiceStatus;
}
```

Implementation:
1. `connect()`: fetch ephemeral token from backend, open WebSocket to OpenAI, send `session.update`
2. Mic toggle: getUserMedia → AudioContext → PCM16 conversion → `input_audio_buffer.append`
3. Audio playback: receive `response.audio.delta` → decode base64 → queue in AudioContext
4. Text: `conversation.item.create` + `response.create`
5. Tool calls: receive `response.function_call_arguments.done` → `dashboardFetch()` to backend → send `conversation.item.create` (function_call_output) → `response.create`
6. Transcript: `response.audio_transcript.delta` for assistant, `conversation.item.input_audio_transcription.completed` for user
7. Cleanup: close WebSocket, stop MediaStream, close AudioContext

## Step 3: Frontend — Tool execution bridge

**File**: `frontend/src/hooks/useRealtimeTools.ts` (new)

Maps OpenAI function call names to backend API calls:

```typescript
async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  token: string
): Promise<string>
```

Tool mapping:
- `calculate_hedge` → `POST /api/v1/calculate` (build payload from args)
- `get_spot_rate` → `GET /api/v1/market/fx/rates` (filter for pair)
- `list_positions` → `GET /api/v1/positions` (optional status_filter param)
- `get_portfolio_summary` → `GET /api/v1/dashboard/summary`
- `list_policies` → `GET /api/v1/policies/templates`
- `get_pending_approvals` → `GET /api/v1/proposals?status=PROPOSED&limit=10`

Each returns JSON string for OpenAI function_call_output.

## Step 4: Frontend — Rewrite VoiceTerminal component

**File**: `frontend/src/components/voice/VoiceTerminal.tsx` (rewrite)

Keep the floating panel UI pattern but replace internals:

- Remove: Web Speech API (SpeechRecognition, SpeechSynthesis)
- Remove: Backend WebSocket connection (`/api/v1/voice/realtime`)
- Add: `useRealtimeVoice` hook
- Keep: transcript display, text input, mic toggle button, floating panel, close button

UI states:
- `disconnected` → "Click to start"
- `connecting` → spinner
- `ready` → mic button active, text input enabled
- `listening` → mic button red/pulsing, VAD active
- `speaking` → assistant audio playing, waveform indicator

Message display:
- User messages (spoken or typed) with transcript
- Assistant messages with streaming text
- Function call indicators (calling → done)

## Step 5: Backend tests + integration verification

- `test_voice_token.py`: JWT auth required, mock OpenAI session creation, response shape
- Manual verification: open voice terminal, speak, verify round-trip
- Verify tool calls execute against real backend endpoints
- Verify text mode works alongside voice mode
