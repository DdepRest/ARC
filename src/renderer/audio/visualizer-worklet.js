class VisualizerWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._lastUpdate = currentTime;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      
      // Calculate amplitude
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) {
        sum += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sum / channelData.length);
      
      // Send message ~60 times a second
      if (currentTime - this._lastUpdate > 0.016) {
        this.port.postMessage({ volume: rms });
        this._lastUpdate = currentTime;
      }
    }
    
    return true; // Keep alive
  }
}

registerProcessor('visualizer-worklet', VisualizerWorklet);
