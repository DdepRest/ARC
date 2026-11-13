const fs = require('fs');
const sherpa = require('sherpa-onnx-node');
const config = {
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    whisper: {
      encoder: 'Voice/models/sherpa-ru/turbo-encoder.int8.onnx',
      decoder: 'Voice/models/sherpa-ru/turbo-decoder.int8.onnx',
      language: 'ru',
      task: 'transcribe'
    },
    tokens: 'Voice/models/sherpa-ru/turbo-tokens.txt',
    modelType: 'whisper',
    numThreads: 2,
    provider: 'cpu',
    debug: 0
  }
};
console.log("Creating recognizer");
const recognizer = new sherpa.OfflineRecognizer(config);
console.log("Recognizer created");
