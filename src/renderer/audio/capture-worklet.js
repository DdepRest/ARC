class AudioCaptureProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const chunk = new Float32Array(input[0]);
      this.port.postMessage(chunk, [chunk.buffer]);
    }
    return true;
  }
}
registerProcessor('audio-capture-processor', AudioCaptureProcessor);
