/**
 * S3-11 & S3-12 Static Boundary Checker (zero external dependencies beyond installed vue/typescript).
 * Verifies:
 *  1. Vue SFC parse + <template>/<script setup> compile integrity across src/renderer/**\/*.vue
 *  2. IPC boundary parity between preload bridge (ipcRenderer.invoke/send/on) and Main process handlers/senders
 *  3. Hardened security & build-identity anti-regression guards (no child_process.exec in hardened modules,
 *     no stale hardcoded commit SHA, valid packaging identity and icon assets)
 */
const fs = require('fs');
const path = require('path');
const { parse: parseSfc, compileTemplate, compileScript } = require('@vue/compiler-sfc');

const REPO_ROOT = path.resolve(__dirname, '..');

function walkFiles(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'out', 'coverage', '.git'].includes(entry.name)) continue;
      walkFiles(full, predicate, acc);
    } else if (predicate(full, entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Validates a single Vue SFC source string for parse, script-setup, and template compile errors.
 */
function validateVueSfcSource(source, filename) {
  const errors = [];
  const { descriptor, errors: parseErrors } = parseSfc(source, { filename });
  for (const err of parseErrors) {
    errors.push(`${filename}: SFC parse error — ${err.message || String(err)}`);
  }
  if (parseErrors.length > 0) return errors;

  const id = filename.replace(/[^a-zA-Z0-9]/g, '_').slice(-32) || 'sfc';
  if (descriptor.script || descriptor.scriptSetup) {
    try {
      compileScript(descriptor, { id, inlineTemplate: false });
    } catch (err) {
      errors.push(`${filename}: <script> compile error — ${err.message || String(err)}`);
    }
  }

  if (descriptor.template) {
    const templateResult = compileTemplate({
      source: descriptor.template.content,
      filename,
      id,
      compilerOptions: { mode: 'module' }
    });
    for (const err of templateResult.errors || []) {
      const msg = typeof err === 'string' ? err : err.message || String(err);
      errors.push(`${filename}: <template> compile error — ${msg}`);
    }
  }

  return errors;
}

function checkAllVueSfcs(rootDir = REPO_ROOT) {
  const rendererDir = path.join(rootDir, 'src', 'renderer');
  const vueFiles = walkFiles(rendererDir, (_full, name) => name.endsWith('.vue'));
  const errors = [];

  for (const file of vueFiles) {
    const rel = path.relative(rootDir, file).replace(/\\/g, '/');
    const source = fs.readFileSync(file, 'utf8');
    errors.push(...validateVueSfcSource(source, rel));
  }

  return { checkedCount: vueFiles.length, errors };
}

/**
 * Checks IPC channel parity between preload files and main-process handlers/emitters.
 */
function checkIpcBoundaryParity(rootDir = REPO_ROOT) {
  const mainDir = path.join(rootDir, 'src', 'main');
  const preloadFiles = fs.existsSync(mainDir)
    ? fs
        .readdirSync(mainDir)
        .filter((f) => f.startsWith('preload') && f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .map((f) => path.join(mainDir, f))
    : [];

  const invoked = new Map();
  const sent = new Map();
  const listened = new Map();

  for (const file of preloadFiles) {
    const rel = path.relative(rootDir, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    for (const m of content.matchAll(/ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g)) {
      invoked.set(m[1], rel);
    }
    for (const m of content.matchAll(/ipcRenderer\.send\(\s*['"]([^'"]+)['"]/g)) {
      sent.set(m[1], rel);
    }
    for (const m of content.matchAll(/ipcRenderer\.on\(\s*['"]([^'"]+)['"]/g)) {
      listened.set(m[1], rel);
    }
  }

  const preloadSet = new Set(preloadFiles);
  const mainFiles = walkFiles(
    mainDir,
    (full, name) =>
      !preloadSet.has(full) &&
      (name.endsWith('.ts') || name.endsWith('.js')) &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.spec.ts')
  );

  const handled = new Set();
  const mainOnOrOnce = new Set();
  const mainLiteralMentions = new Set();

  // Read shared IPC_CHANNELS constants if present so IPC_CHANNELS.FOO references resolve cleanly
  const sharedChannelMap = new Map();
  const channelsFile = path.join(rootDir, 'src', 'shared', 'constants', 'channels.ts');
  if (fs.existsSync(channelsFile)) {
    const chContent = fs.readFileSync(channelsFile, 'utf8');
    for (const m of chContent.matchAll(/([A-Z0-9_]+)\s*:\s*['"]([a-z][a-z0-9_-]*:[a-zA-Z0-9_:-]+)['"]/g)) {
      sharedChannelMap.set(m[1], m[2]);
    }
  }

  for (const file of mainFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const m of content.matchAll(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g)) {
      handled.add(m[1]);
    }
    for (const m of content.matchAll(/ipcMain\.(?:on|once)\(\s*['"]([^'"]+)['"]/g)) {
      mainOnOrOnce.add(m[1]);
    }
    for (const m of content.matchAll(/['"]([a-z][a-z0-9_-]*:[a-zA-Z0-9_:-]+)['"]/g)) {
      mainLiteralMentions.add(m[1]);
    }
    // Resolve IPC_CHANNELS.<KEY> references used in Main
    for (const m of content.matchAll(/\bIPC_CHANNELS\.([A-Z0-9_]+)\b/g)) {
      const resolved = sharedChannelMap.get(m[1]);
      if (resolved) mainLiteralMentions.add(resolved);
    }
    // Resolve dynamic prefix loops like: for (const eventName of ['fallback', 'ready', 'engine-ready'] ...) ... `stt:${eventName}`
    for (const m of content.matchAll(
      /for\s*\(\s*const\s+(\w+)\s+of\s+\[([^\]]+)\][^]*?`([a-z][a-z0-9_-]*):\$\{\1\}`/g
    )) {
      const prefix = m[3];
      for (const item of m[2].matchAll(/['"]([a-zA-Z0-9_:-]+)['"]/g)) {
        mainLiteralMentions.add(`${prefix}:${item[1]}`);
      }
    }
  }

  // Documented legacy event listeners retained in preload.ts for backwards compatibility;
  // any NEW orphaned ipcRenderer.on() channel will fail the check.
  const LEGACY_EVENT_ALLOWLIST = new Set([
    'media:play',
    'media:pause',
    'stt:model-download-progress'
  ]);

  const errors = [];
  for (const [channel, file] of invoked.entries()) {
    if (!handled.has(channel)) {
      errors.push(`IPC invoke mismatch: '${channel}' exposed in ${file} has no ipcMain.handle() in src/main`);
    }
  }
  for (const [channel, file] of sent.entries()) {
    if (!mainOnOrOnce.has(channel)) {
      errors.push(`IPC send mismatch: '${channel}' exposed in ${file} has no ipcMain.on()/once() in src/main`);
    }
  }
  for (const [channel, file] of listened.entries()) {
    if (!mainLiteralMentions.has(channel) && !LEGACY_EVENT_ALLOWLIST.has(channel)) {
      errors.push(`IPC event mismatch: '${channel}' subscribed in ${file} is never emitted in src/main`);
    }
  }

  return {
    invokedCount: invoked.size,
    sentCount: sent.size,
    listenedCount: listened.size,
    handledCount: handled.size,
    errors
  };
}

const HARDENED_NO_SHELL_EXEC_FILES = [
  'src/main/services/tts.service.ts',
  'src/main/services/system-tts.util.ts',
  'src/main/services/storage-reset.util.ts',
  'src/main/services/security/electron-security.util.ts',
  'src/main/utils/backup-redaction.util.ts',
  'src/main/utils/zip-codec.util.ts',
  'src/main/utils/zip-writer.ts',
  'src/shared/config/build-metadata.ts',
  'src/shared/config/build-metadata.resolver.ts'
];

function checkHardenedSecurityRegressions(rootDir = REPO_ROOT) {
  const errors = [];
  const execPattern = /\b(?:child_process\.exec|execSync)\s*\(|\bfrom\s+['"]child_process['"][^;]*\bexec\b/;

  for (const rel of HARDENED_NO_SHELL_EXEC_FILES) {
    const abs = path.join(rootDir, rel);
    if (!fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs, 'utf8');
    if (execPattern.test(content) || /import\s*\{[^}]*\bexec\b[^}]*\}\s*from\s*['"]child_process['"]/.test(content)) {
      errors.push(`Security regression in ${rel}: shell-based child_process.exec/execSync is forbidden in hardened modules`);
    }
  }

  // Ensure stale hardcoded commit SHA '9048f71' never returns in build configs or runtime code
  const shaCheckTargets = ['electron.vite.config.ts', 'vite.config.ts', 'src/renderer/main.ts'];
  for (const rel of shaCheckTargets) {
    const abs = path.join(rootDir, rel);
    if (!fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs, 'utf8');
    if (content.includes('9048f71')) {
      errors.push(`Build metadata regression in ${rel}: stale hardcoded commit SHA '9048f71' detected`);
    }
  }

  return { checkedFiles: HARDENED_NO_SHELL_EXEC_FILES.length, errors };
}

function checkPackagingIdentity(rootDir = REPO_ROOT) {
  const errors = [];
  const pkgPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { errors: ['package.json not found'] };
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  if (!pkg.author) errors.push('package.json: missing author metadata');
  if (!pkg.homepage) errors.push('package.json: missing homepage metadata');
  if (!pkg.repository) errors.push('package.json: missing repository metadata');
  if (!pkg.build?.win?.icon) errors.push('package.json: missing build.win.icon');
  if (pkg.build?.nsis?.deleteAppDataOnUninstall !== false) {
    errors.push('package.json: build.nsis.deleteAppDataOnUninstall must be explicitly false');
  }
  if (pkg.build?.win?.requestedExecutionLevel !== 'asInvoker') {
    errors.push('package.json: build.win.requestedExecutionLevel must be "asInvoker"');
  }

  const iconIco = path.join(rootDir, pkg.build?.win?.icon || 'build/icon.ico');
  const iconPng = path.join(rootDir, 'build', 'icon.png');
  if (!fs.existsSync(iconIco)) errors.push(`Missing Windows ICO asset: ${path.relative(rootDir, iconIco)}`);
  if (!fs.existsSync(iconPng)) errors.push(`Missing PNG window icon asset: ${path.relative(rootDir, iconPng)}`);

  return { errors };
}

function runAllStaticBoundaryChecks(rootDir = REPO_ROOT) {
  const vue = checkAllVueSfcs(rootDir);
  const ipc = checkIpcBoundaryParity(rootDir);
  const security = checkHardenedSecurityRegressions(rootDir);
  const packaging = checkPackagingIdentity(rootDir);

  const errors = [...vue.errors, ...ipc.errors, ...security.errors, ...packaging.errors];
  return { vue, ipc, security, packaging, errors };
}

if (require.main === module) {
  const report = runAllStaticBoundaryChecks(REPO_ROOT);
  if (report.errors.length > 0) {
    console.error('Static boundary checks FAILED:');
    for (const err of report.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log(
    `Static boundary checks PASSED: Vue SFCs=${report.vue.checkedCount}, IPC invoke=${report.ipc.invokedCount}/${report.ipc.handledCount}, send=${report.ipc.sentCount}, events=${report.ipc.listenedCount}, hardened files=${report.security.checkedFiles}, packaging identity=OK.`
  );
  process.exit(0);
}

module.exports = {
  validateVueSfcSource,
  checkAllVueSfcs,
  checkIpcBoundaryParity,
  checkHardenedSecurityRegressions,
  checkPackagingIdentity,
  runAllStaticBoundaryChecks
};
