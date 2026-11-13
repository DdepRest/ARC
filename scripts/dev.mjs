import { spawn } from 'node:child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

console.log('--- Starting A.R.C. OS Dev Environment ---');

// 1. Start XTTS Server (if env exists)
const venvPath = path.join(process.cwd(), 'xtts_env');
let xttsProcess = null;

if (fs.existsSync(venvPath)) {
  console.log('Found XTTS Python environment. Starting XTTS server...');
  const pythonCmd = os.platform() === 'win32' 
    ? path.join(venvPath, 'Scripts', 'python')
    : path.join(venvPath, 'bin', 'python');
    
  xttsProcess = spawn(pythonCmd, ['xtts_server.py'], {
    stdio: 'inherit',
    shell: true
  });
  
  xttsProcess.on('error', (err) => {
    console.error('Failed to start XTTS server:', err);
  });
} else {
  console.log('XTTS environment not found. XTTS server will not be started (using Edge TTS fallback).');
}

// 2. Start Vite / Electron-Vite
const isPreview = process.argv.includes('--preview');
const command = isPreview ? ['preview'] : ['dev'];

console.log(`Starting electron-vite ${command.join(' ')}`);

const viteProcess = spawn('npx', ['electron-vite', ...command], {
  stdio: 'inherit',
  shell: true
});

viteProcess.on('exit', (code) => {
  if (xttsProcess) {
    xttsProcess.kill();
  }
  process.exit(code || 0);
});

// Cleanup on exit
process.on('SIGINT', () => {
  if (xttsProcess) xttsProcess.kill();
  if (viteProcess) viteProcess.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (xttsProcess) xttsProcess.kill();
  if (viteProcess) viteProcess.kill();
  process.exit(0);
});
