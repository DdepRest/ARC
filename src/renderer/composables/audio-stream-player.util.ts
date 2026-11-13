/**
 * Gapless Web Audio PCM/WAV Stream Player for A.R.C.
 * Decodes chunked int16 PCM (22050 Hz, mono) with optional 44-byte RIFF/WAV header
 * and schedules AudioBufferSourceNodes sequentially without gaps.
 */

export class AudioStreamPlayer {
  private sampleRate = 22050;
  private nextStartTime = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private headerStripped = false;
  private leftoverByte: number | null = null;
  private streamEnded = false;

  public startStream(sampleRate = 22050): void {
    this.stop();
    this.sampleRate = sampleRate || 22050;
    this.headerStripped = false;
    this.leftoverByte = null;
    this.streamEnded = false;
  }

  public feedChunk(
    rawChunk: Uint8Array | ArrayBuffer,
    audioContext: AudioContext,
    analyserNode: AnalyserNode | null,
    visualizerWorkletNode: AudioWorkletNode | null,
    onFirstChunkPlay?: () => void,
    onAllEnded?: () => void
  ): void {
    let bytes = rawChunk instanceof Uint8Array
      ? new Uint8Array(rawChunk.buffer, rawChunk.byteOffset, rawChunk.byteLength)
      : new Uint8Array(rawChunk);

    if (bytes.byteLength === 0) return;

    // Strip 44-byte RIFF/WAVE header on the initial chunk if present
    if (!this.headerStripped) {
      this.headerStripped = true;
      if (
        bytes.byteLength >= 44 &&
        bytes[0] === 0x52 && // 'R'
        bytes[1] === 0x49 && // 'I'
        bytes[2] === 0x46 && // 'F'
        bytes[3] === 0x46    // 'F'
      ) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const parsedRate = view.getUint32(24, true);
        if (parsedRate >= 8000 && parsedRate <= 96000) {
          this.sampleRate = parsedRate;
        }
        bytes = bytes.subarray(44);
      }
    }

    if (bytes.byteLength === 0) return;

    // Reconstruct even-length byte buffer if previous chunk had an odd trailing byte
    if (this.leftoverByte !== null) {
      const merged = new Uint8Array(bytes.byteLength + 1);
      merged[0] = this.leftoverByte;
      merged.set(bytes, 1);
      bytes = merged;
      this.leftoverByte = null;
    }

    if (bytes.byteLength % 2 !== 0) {
      this.leftoverByte = bytes[bytes.byteLength - 1];
      bytes = bytes.subarray(0, bytes.byteLength - 1);
    }

    const numSamples = bytes.byteLength >> 1;
    if (numSamples <= 0) return;

    const float32 = new Float32Array(numSamples);
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < numSamples; i++) {
      const s = dataView.getInt16(i * 2, true);
      float32[i] = s / 32768.0;
    }

    const audioBuffer = audioContext.createBuffer(1, numSamples, this.sampleRate);
    audioBuffer.copyToChannel(float32, 0);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    if (visualizerWorkletNode) {
      source.connect(visualizerWorkletNode);
    }
    if (analyserNode) {
      source.connect(analyserNode);
    } else {
      source.connect(audioContext.destination);
    }

    const wasEmpty = this.activeSources.size === 0;
    this.activeSources.add(source);

    const now = audioContext.currentTime;
    // Small 15ms safety lookahead on the very first chunk to prevent underrun jitter
    if (this.nextStartTime < now) {
      this.nextStartTime = now + (wasEmpty ? 0.015 : 0);
    }

    const startAt = this.nextStartTime;
    this.nextStartTime += audioBuffer.duration;

    if (wasEmpty && onFirstChunkPlay) {
      onFirstChunkPlay();
    }

    source.onended = () => {
      this.activeSources.delete(source);
      try {
        source.disconnect();
        source.buffer = null;
      } catch {}
      if (this.activeSources.size === 0 && this.streamEnded && onAllEnded) {
        onAllEnded();
      }
    };

    source.start(startAt);
  }

  public markStreamEnd(onAllEnded?: () => void): void {
    this.streamEnded = true;
    if (this.activeSources.size === 0 && onAllEnded) {
      onAllEnded();
    }
  }

  public isPlaying(): boolean {
    return this.activeSources.size > 0;
  }

  public stop(): void {
    this.nextStartTime = 0;
    this.leftoverByte = null;
    this.headerStripped = false;
    this.streamEnded = true;
    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
        src.buffer = null;
      } catch {}
    }
    this.activeSources.clear();
  }
}
