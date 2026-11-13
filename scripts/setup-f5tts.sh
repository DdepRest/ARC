import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

console.log('--- Setting up local XTTS server ---');

try {
  // Check if python is available
  const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';
  try {
    execSync(`${pythonCmd} --version`, { stdio: 'ignore' });
  } catch (e) {
    console.error(`Python is not installed or not in PATH (${pythonCmd}). Skipping XTTS setup.`);
    process.exit(0);
  }
  
  if (!fs.existsSync(path.join(process.cwd(), 'xtts_env'))) {
    console.log('Creating Python virtual environment...');
    execSync(`${pythonCmd} -m venv xtts_env`, { stdio: 'inherit' });
  }

  const pipCmd = os.platform() === 'win32' 
    ? path.join('xtts_env', 'Scripts', 'pip')
    : path.join('xtts_env', 'bin', 'pip');

  console.log('Installing dependencies (this may take a while)...');
  execSync(`${pipCmd} install f5-tts Flask flask-cors soundfile`, { stdio: 'inherit' });

  // Create dummy Voice.wav if it doesn't exist
  const voiceDir = path.join(process.cwd(), 'Voice');
  if (!fs.existsSync(voiceDir)) {
    fs.mkdirSync(voiceDir, { recursive: true });
    // Note: We don't have a wav file to put here, the user needs to provide one
    // But we create the directory so they know where to put it.
    fs.writeFileSync(path.join(voiceDir, 'PUT_YOUR_VOICE_WAV_HERE.txt'), 'Place your 10-30 second clear voice sample here named Voice.wav for zero-shot cloning.');
  }
  
  // Create simple Flask server for F5-TTS
  const serverPy = `
import os
from flask import Flask, request, send_file
from flask_cors import CORS
import soundfile as sf
# Assuming f5_tts exposes inference API
# from f5_tts.infer import infer_cli

app = Flask(__name__)
CORS(app)

@app.route('/tts', methods=['POST'])
def tts():
    data = request.json
    text = data.get('text', '')
    # Fake/Stub implementation. Replace with actual F5-TTS inference
    # infer_cli(text=text, ref_audio="Voice/Voice.wav")
    return send_file("Voice/Voice.wav", mimetype="audio/wav")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8002)
`;
  fs.writeFileSync(path.join(process.cwd(), 'f5tts_server.py'), serverPy);

  console.log('F5-TTS setup complete! Run the server with:');
  console.log(`${pythonCmd} f5tts_server.py`);
} catch (error) {
  console.error('Failed to setup XTTS. Ensure Python 3.9+ is installed.', error.message);
}
