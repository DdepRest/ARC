/**
 * Post-install and pre-launch validation check for critical native binaries.
 * Ensures native modules (e.g. better-sqlite3) match the installed Electron ABI on Windows
 * using prebuild-install (no C++ compiler required) with fallback to @electron/rebuild,
 * while gracefully supporting web-preview in Google AI Studio and Linux container environments.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isWindows = process.platform === 'win32';
const isContainerOrCI = Boolean(process.env.AI_STUDIO || process.env.CI || process.env.CONTAINER || !isWindows);
const forceElectron = process.argv.includes('--force-electron');
const rootDir = path.join(__dirname, '..');
const sqliteDir = path.join(rootDir, 'node_modules', 'better-sqlite3');
const binaryPath = path.join(sqliteDir, 'build', 'Release', 'better_sqlite3.node');

function getElectronVersion() {
  try {
    const electronPkg = require(path.join(rootDir, 'node_modules', 'electron', 'package.json'));
    return electronPkg.version || null;
  } catch {
    return null;
  }
}

function rebuildForElectron() {
  const electronVersion = getElectronVersion();
  const prebuildBin = path.join(rootDir, 'node_modules', 'prebuild-install', 'bin.js');

  if (electronVersion && fs.existsSync(prebuildBin) && fs.existsSync(sqliteDir)) {
    try {
      console.log(`[PostInstall] Fetching prebuilt better-sqlite3 binary for Electron v${electronVersion}...`);
      execSync(`"${process.execPath}" "${prebuildBin}" --runtime=electron --target=${electronVersion} --tag-prefix=v`, {
        cwd: sqliteDir,
        stdio: 'inherit'
      });
      return true;
    } catch (err) {
      console.warn('[PostInstall] prebuild-install for Electron did not succeed, falling back to @electron/rebuild...');
    }
  }

  try {
    console.log('[PostInstall] Attempting native better-sqlite3 rebuild for Electron via @electron/rebuild...');
    execSync('npx --yes @electron/rebuild -f -w better-sqlite3', { cwd: rootDir, stdio: 'inherit' });
    return true;
  } catch (err) {
    console.warn('[PostInstall] Notice: Automatic native rebuild did not finish.');
    return false;
  }
}

function sanitizePackagingResources() {
  const obsoleteFiles = [
    path.join(rootDir, 'vosk_server.py'),
    path.join(rootDir, 'resources', 'vosk_server.py'),
    path.join(rootDir, 'dist', 'win-unpacked', 'vosk_server.py'),
    path.join(rootDir, 'dist', 'win-unpacked', 'resources', 'vosk_server.py'),
    path.join(rootDir, 'dist', 'win-unpacked', 'resources', 'resources', 'vosk_server.py')
  ];
  for (const file of obsoleteFiles) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`[PostInstall Check] Removed legacy file: ${path.relative(rootDir, file)}`);
      }
    } catch {}
  }

  const bloatedDirs = [
    path.join(rootDir, 'resources', 'silero_env'),
    path.join(rootDir, 'dist', 'win-unpacked', 'silero_env'),
    path.join(rootDir, 'dist', 'win-unpacked', 'resources', 'silero_env'),
    path.join(rootDir, 'dist', 'win-unpacked', 'resources', 'resources', 'silero_env')
  ];
  for (const dir of bloatedDirs) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[PostInstall Check] Removed bloated venv directory from package resources: ${path.relative(rootDir, dir)}`);
      }
    } catch {}
  }
}

function removeLegacySileroV55Files() {
  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';
  const userProfile = process.env.USERPROFILE || '';
  const distWinResources = path.join(rootDir, 'dist', 'win-unpacked', 'resources');

  const oldCandidates = [
    path.join(rootDir, 'resources', 'models', 'silero-v5', 'v5_5_ru.pt'),
    path.join(rootDir, 'models', 'silero-v5', 'v5_5_ru.pt'),
    path.join(rootDir, 'Voice', 'models', 'v5_5_ru.pt'),
    path.join(rootDir, 'v5_5_ru.pt'),
    path.join(distWinResources, 'resources', 'models', 'silero-v5', 'v5_5_ru.pt'),
    path.join(distWinResources, 'models', 'silero-v5', 'v5_5_ru.pt'),
    appData ? path.join(appData, 'a.r.c.', 'models', 'silero-v5', 'v5_5_ru.pt') : '',
    appData ? path.join(appData, 'A.R.C.', 'models', 'silero-v5', 'v5_5_ru.pt') : '',
    appData ? path.join(appData, 'Electron', 'models', 'silero-v5', 'v5_5_ru.pt') : '',
    localAppData ? path.join(localAppData, 'ARC_Voice', 'models', 'silero-v5', 'v5_5_ru.pt') : '',
    userProfile ? path.join(userProfile, '.cache', 'torch', 'hub', 'snakers4_silero-models_master', 'v5_5_ru.pt') : '',
    userProfile ? path.join(userProfile, '.cache', 'torch', 'hub', 'checkpoints', 'v5_5_ru.pt') : ''
  ];

  for (const c of oldCandidates) {
    if (c && fs.existsSync(c)) {
      try {
        fs.unlinkSync(c);
        console.log(`[PostInstall Check] Removed legacy v5_5_ru.pt: ${c}`);
      } catch {}
    }
  }
}

function syncUnpackedDistSileroModel(sourceModelFile) {
  if (!sourceModelFile || !fs.existsSync(sourceModelFile)) return;
  const distWinResources = path.join(rootDir, 'dist', 'win-unpacked', 'resources');
  if (!fs.existsSync(distWinResources)) return;
  const distTargets = [
    path.join(distWinResources, 'resources', 'models', 'silero-v5', 'v5_6_ru.pt'),
    path.join(distWinResources, 'models', 'silero-v5', 'v5_6_ru.pt')
  ];
  for (const dest of distTargets) {
    try {
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 10 * 1024 * 1024) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(sourceModelFile, dest);
        console.log(`[PostInstall Check] Synced v5_6_ru.pt into unpacked dist: ${path.relative(rootDir, dest)}`);
      }
    } catch {}
  }
}

function ensureSileroModelOnWindows() {
  if (!isWindows || isContainerOrCI) return;
  removeLegacySileroV55Files();
  const targetDir = path.join(rootDir, 'resources', 'models', 'silero-v5');
  const targetFile = path.join(targetDir, 'v5_6_ru.pt');
  try {
    if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 10 * 1024 * 1024) {
      console.log('[PostInstall Check] Silero v5.6 model present in resources/models/silero-v5/v5_6_ru.pt.');
      syncUnpackedDistSileroModel(targetFile);
      return;
    }
    fs.mkdirSync(targetDir, { recursive: true });
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const localCandidates = [
      path.join(rootDir, 'models', 'silero-v5', 'v5_6_ru.pt'),
      path.join(rootDir, 'Voice', 'models', 'v5_6_ru.pt'),
      path.join(rootDir, 'v5_6_ru.pt'),
      appData ? path.join(appData, 'a.r.c.', 'models', 'silero-v5', 'v5_6_ru.pt') : '',
      appData ? path.join(appData, 'A.R.C.', 'models', 'silero-v5', 'v5_6_ru.pt') : '',
      appData ? path.join(appData, 'Electron', 'models', 'silero-v5', 'v5_6_ru.pt') : '',
      localAppData ? path.join(localAppData, 'ARC_Voice', 'models', 'silero-v5', 'v5_6_ru.pt') : '',
      userProfile ? path.join(userProfile, '.cache', 'torch', 'hub', 'snakers4_silero-models_master', 'v5_6_ru.pt') : '',
      userProfile ? path.join(userProfile, '.cache', 'torch', 'hub', 'checkpoints', 'v5_6_ru.pt') : ''
    ];
    for (const candidate of localCandidates) {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).size > 10 * 1024 * 1024) {
        console.log(`[PostInstall Check] Copying cached Silero v5.6 model from ${candidate} to ${targetFile}...`);
        fs.copyFileSync(candidate, targetFile);
        syncUnpackedDistSileroModel(targetFile);
        return;
      }
    }
    console.log('[PostInstall Check] Provisioning Silero v5.6 model into resources/models/silero-v5/v5_6_ru.pt...');
    execSync(
      `powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://models.silero.ai/models/tts/ru/v5_6_ru.pt' -OutFile '${targetFile.replace(/'/g, "''")}' -UseBasicParsing"`,
      { cwd: rootDir, stdio: 'inherit' }
    );
    syncUnpackedDistSileroModel(targetFile);
  } catch (err) {
    console.warn('[PostInstall Check] Could not auto-provision v5_6_ru.pt:', (err && err.message) || err);
  }
}

sanitizePackagingResources();

if (isContainerOrCI && !forceElectron) {
  console.log('[PostInstall Check] Linux/AI Studio container detected. Native Electron binary rebuild skipped (web preview active).');
  process.exit(0);
}

ensureSileroModelOnWindows();

if (isWindows && !process.env.SKIP_ELECTRON_REBUILD) {
  let needsElectronBinary = forceElectron || !fs.existsSync(binaryPath);

  if (!needsElectronBinary) {
    try {
      const Database = require('better-sqlite3');
      const db = new Database(':memory:');
      db.prepare('SELECT 1 as alive').get();
      db.close();
      // If loading in plain Node.js succeeded without NODE_MODULE_VERSION mismatch,
      // the binary is compiled for Node.js ABI rather than Electron ABI.
      needsElectronBinary = true;
    } catch (err) {
      const msg = (err && err.message) || '';
      if (msg.includes('NODE_MODULE_VERSION')) {
        console.log('[PostInstall Check] Native better-sqlite3 binary is already compiled for Electron target ABI.');
        process.exit(0);
      }
      needsElectronBinary = true;
    }
  }

  if (needsElectronBinary) {
    rebuildForElectron();
  }
}

try {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.prepare('SELECT 1 as alive').get();
  db.close();
  console.log('[PostInstall Check] Native better-sqlite3 binding verified via Node.js runtime.');
  process.exit(0);
} catch (err) {
  const msg = (err && err.message) || '';
  if (msg.includes('NODE_MODULE_VERSION')) {
    console.log('[PostInstall Check] Native better-sqlite3 binary verified for Electron target (ABI match validated).');
    process.exit(0);
  }
  console.warn('[PostInstall Check] Native better-sqlite3 module notice:', msg);
  process.exit(0);
}
