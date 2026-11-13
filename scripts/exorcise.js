const fs = require('fs');
const path = require('path');
const cp = require('child_process');

console.log('[Exorcise] Starting complete project state purification...');

// 1. Process termination (Windows & Unix)
const isWin = process.platform === 'win32';
console.log(`[Exorcise] Detected platform: ${process.platform}`);

function killProcess(name) {
  try {
    if (isWin) {
      cp.execSync(`taskkill /F /IM ${name}.exe /T`, { stdio: 'ignore' });
    } else {
      cp.execSync(`pkill -9 -f ${name}`, { stdio: 'ignore' });
    }
    console.log(`[Exorcise] Terminated ${name} processes`);
  } catch {
    // Process might not be running
  }
}

killProcess('python');
killProcess('python3');

// 2. Remove builder caches
const dirsToRemove = [
  path.join(__dirname, '..', 'node_modules', '.vite'),
  path.join(__dirname, '..', 'out'),
  path.join(__dirname, '..', 'dist')
];

for (const dir of dirsToRemove) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[Exorcise] Purged cache directory: ${path.relative(process.cwd(), dir)}`);
    }
  } catch (err) {
    console.warn(`[Exorcise] Warning: failed to remove ${dir}: ${err.message}`);
  }
}

// 3. Purge SQLite CMU database and WAL/SHM artifacts
const cmuBasePaths = [
  path.join(__dirname, '..', 'cmu_dictionary.db'),
  path.join(__dirname, '..', 'Voice', 'dicts', 'cmu_dictionary.db')
];

for (const base of cmuBasePaths) {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = base + suffix;
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
        console.log(`[Exorcise] Deleted SQLite artifact: ${path.relative(process.cwd(), target)}`);
      }
    } catch (err) {
      console.warn(`[Exorcise] Warning: failed to delete ${target}: ${err.message}`);
    }
  }
}

// 4. Purge obsolete removed renderer and legacy server files left behind by in-place ZIP extraction
const obsoleteRendererFiles = [
  'vosk_server.py',
  'resources/vosk_server.py',
  'src/renderer/components/ui/HudWidgetShell.vue',
  'src/renderer/components/ui/PerformanceTelemetryOverlay.vue',
  'src/renderer/features/settings/components/HubSettings.vue',
  'src/renderer/features/settings/components/sections/general/SystemResourcesSection.vue',
  'src/renderer/features/settings/components/sections/general/VoiceAudioSection.vue',
  'src/renderer/layouts/components/MusicCapsuleWidget.vue'
];

for (const rel of obsoleteRendererFiles) {
  const full = path.join(__dirname, '..', rel);
  try {
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      console.log(`[Exorcise] Removed obsolete legacy file: ${rel}`);
    }
  } catch (err) {
    console.warn(`[Exorcise] Warning: failed to remove ${rel}: ${err.message}`);
  }
}

const accidentalResourceVenv = path.join(__dirname, '..', 'resources', 'silero_env');
try {
  if (fs.existsSync(accidentalResourceVenv)) {
    fs.rmSync(accidentalResourceVenv, { recursive: true, force: true });
    console.log('[Exorcise] Removed accidental resources/silero_env directory');
  }
} catch {}

console.log('[Exorcise] Project purification completed successfully!');
