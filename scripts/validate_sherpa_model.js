const path = require('path');
const fs = require('fs');

const modelPath = process.argv[2];
const tokensPath = process.argv[3];

if (!modelPath || !tokensPath) {
  console.error(JSON.stringify({ success: false, error: 'Missing modelPath or tokensPath' }));
  process.exit(1);
}

if (!fs.existsSync(modelPath)) {
  console.error(JSON.stringify({ success: false, error: `Model file not found: ${modelPath}` }));
  process.exit(2);
}

if (!fs.existsSync(tokensPath)) {
  console.error(JSON.stringify({ success: false, error: `Tokens file not found: ${tokensPath}` }));
  process.exit(3);
}

try {
  const sherpa = require('sherpa-onnx-node');
  if (!sherpa || !sherpa.OfflineRecognizer) {
    console.error(JSON.stringify({ success: false, error: 'sherpa.OfflineRecognizer not available' }));
    process.exit(4);
  }

  const rec = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 64 },
    modelConfig: {
      nemoCtc: { model: modelPath },
      tokens: tokensPath,
      numThreads: 1,
      provider: 'cpu',
      debug: 0
    }
  });

  const stream = rec.createStream();
  if (!stream) {
    console.error(JSON.stringify({ success: false, error: 'Failed to create OfflineStream' }));
    process.exit(5);
  }

  console.log(JSON.stringify({ success: true, verified: true }));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ success: false, error: err.message || String(err) }));
  process.exit(1);
}
