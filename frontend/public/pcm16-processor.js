/**
 * pcm16-processor.js — AudioWorkletProcessor
 * Runs in the audio thread. Receives Float32 mic samples, converts to
 * Int16 (PCM16), and posts the buffer to the main thread via MessagePort.
 *
 * Loaded by VoiceTerminal.tsx via AudioContext.audioWorklet.addModule().
 */
class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = true;
    this.port.onmessage = (e) => {
      if (e.data === "stop") this._active = false;
    };
  }

  process(inputs) {
    if (!this._active) return false;

    const input = inputs[0];
    if (!input || !input[0]) return true;

    const float32 = input[0]; // mono channel
    const int16 = new Int16Array(float32.length);

    for (let i = 0; i < float32.length; i++) {
      // Clamp to [-1, 1] then scale to [-32768, 32767]
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 32768 : s * 32767;
    }

    // Transfer buffer (zero-copy)
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}

registerProcessor("pcm16-processor", PCM16Processor);
