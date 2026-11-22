#!/usr/bin/env node
/**
 * scripts/verify-windows-qa-bundle.cjs
 * Zero-dependency fail-closed validator for the owner's Windows QA evidence bundle
 * (docs/WINDOWS-QA-HANDOFF.md, S0-04, S0-05, S4-01..S4-06).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MIN_SOAK_DURATION_SEC = 7200; // 2 hours (S4-01)
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const RAW_SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /ghp_[A-Za-z0-9]{36}/
];

const REQUIRED_SCREENSHOT_MODES = [
  { id: '1920x1080_100', label: '1920x1080 @ 100%', match: (n) => /1920[x×_]1080/i.test(n) },
  {
    id: '1366x768_100',
    label: '1366x768 @ 100%',
    match: (n) => /1366[x×_]768/i.test(n) && !/125/i.test(n)
  },
  {
    id: '1366x768_125',
    label: '1366x768 @ 125%',
    match: (n) => /1366[x×_]768/i.test(n) && /125/i.test(n)
  },
  { id: '1280x720_100', label: '1280x720 @ 100%', match: (n) => /1280[x×_]720/i.test(n) }
];

function readJsonStrict(filePath) {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch (err) {
    return { ok: false, error: `Failed to parse JSON (${path.basename(filePath)}): ${err.message}` };
  }
}

function findFilesRecursive(dir, predicate, maxDepth = 4, depth = 0) {
  if (!fs.existsSync(dir) || depth > maxDepth) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesRecursive(full, predicate, maxDepth, depth + 1));
    } else if (entry.isFile() && predicate(full, entry.name)) {
      results.push(full);
    }
  }
  return results.sort();
}

function parseSha256Sums(content) {
  const map = new Map();
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match) {
      map.set(match[2].trim(), match[1].toLowerCase());
    }
  }
  return map;
}

function isWin10(osObj) {
  const caption = String(osObj?.caption || '');
  const build = Number(osObj?.build || 0);
  return /windows\s+10/i.test(caption) || (build >= 10240 && build < 22000);
}

function isWin11(osObj) {
  const caption = String(osObj?.caption || '');
  const build = Number(osObj?.build || 0);
  return /windows\s+11/i.test(caption) || build >= 22000;
}

function validateCiArtifacts(evidenceDir, expectedVersion, requireSigned) {
  const errors = [];
  const sumsFiles = findFilesRecursive(evidenceDir, (_p, name) => name === 'SHA256SUMS.txt', 2);
  const verFiles = findFilesRecursive(evidenceDir, (_p, name) => name === 'ARTIFACT_VERIFICATION.json', 2);
  const sbomFiles = findFilesRecursive(evidenceDir, (_p, name) => name === 'sbom-cyclonedx.json', 2);

  let shaMap = new Map();
  let signingStatus = 'UNKNOWN';
  const expectedNsis = `ARC-Setup-${expectedVersion}-x64.exe`;
  const expectedPortable = `ARC-Portable-${expectedVersion}-x64.exe`;

  if (sumsFiles.length === 0) {
    errors.push('Missing SHA256SUMS.txt in evidence directory.');
  } else {
    shaMap = parseSha256Sums(fs.readFileSync(sumsFiles[0], 'utf8'));
    if (!shaMap.has(expectedNsis)) errors.push(`SHA256SUMS.txt missing ${expectedNsis}.`);
    if (!shaMap.has(expectedPortable)) errors.push(`SHA256SUMS.txt missing ${expectedPortable}.`);
    if (
      shaMap.has(expectedNsis) &&
      shaMap.has(expectedPortable) &&
      shaMap.get(expectedNsis) === shaMap.get(expectedPortable)
    ) {
      errors.push('SHA256SUMS.txt collision: NSIS and Portable hashes are identical.');
    }
  }

  if (verFiles.length === 0) {
    errors.push('Missing ARTIFACT_VERIFICATION.json in evidence directory.');
  } else {
    const parsed = readJsonStrict(verFiles[0]);
    if (!parsed.ok) {
      errors.push(parsed.error);
    } else {
      const report = parsed.data;
      if (report.version !== expectedVersion) {
        errors.push(`ARTIFACT_VERIFICATION.json version mismatch: expected ${expectedVersion}, got ${report.version}.`);
      }
      signingStatus = String(report.overallSigningStatus || 'UNKNOWN');
      if (!['TRUSTED_SIGNED', 'UNSIGNED'].includes(signingStatus)) {
        errors.push(`Invalid or untrusted signing status in ARTIFACT_VERIFICATION.json: ${signingStatus}.`);
      }
      if (requireSigned && signingStatus !== 'TRUSTED_SIGNED') {
        errors.push(`RequireSigned is enabled, but overallSigningStatus is ${signingStatus}.`);
      }
      const nsisSha = String(report.artifacts?.nsis?.sha256 || '').toLowerCase();
      const portableSha = String(report.artifacts?.portable?.sha256 || '').toLowerCase();
      if (shaMap.has(expectedNsis) && nsisSha !== shaMap.get(expectedNsis)) {
        errors.push('NSIS SHA-256 mismatch between SHA256SUMS.txt and ARTIFACT_VERIFICATION.json.');
      }
      if (shaMap.has(expectedPortable) && portableSha !== shaMap.get(expectedPortable)) {
        errors.push('Portable SHA-256 mismatch between SHA256SUMS.txt and ARTIFACT_VERIFICATION.json.');
      }
    }
  }

  if (sbomFiles.length === 0) {
    errors.push('Missing sbom-cyclonedx.json in evidence directory.');
  } else {
    const parsed = readJsonStrict(sbomFiles[0]);
    if (!parsed.ok) {
      errors.push(parsed.error);
    } else if (
      parsed.data.bomFormat !== 'CycloneDX' ||
      !Array.isArray(parsed.data.components) ||
      parsed.data.components.length === 0
    ) {
      errors.push('sbom-cyclonedx.json is not a valid populated CycloneDX BOM.');
    }
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    signingStatus,
    shaMap,
    errors,
    details: {
      sumsFile: sumsFiles[0] ? path.relative(evidenceDir, sumsFiles[0]) : null,
      verificationFile: verFiles[0] ? path.relative(evidenceDir, verFiles[0]) : null,
      sbomFile: sbomFiles[0] ? path.relative(evidenceDir, sbomFiles[0]) : null
    }
  };
}

function validateCleanOsPreflight(evidenceDir, shaMap) {
  const errors = [];
  const files = findFilesRecursive(
    evidenceDir,
    (_p, name) => /^qa-preflight-.*\.json$/i.test(name),
    3
  );

  let hasWin10 = false;
  let hasWin11 = false;
  let hasNonAdmin = false;

  if (files.length === 0) {
    errors.push('Missing preflight/qa-preflight-*.json files.');
  } else {
    for (const file of files) {
      const parsed = readJsonStrict(file);
      if (!parsed.ok) {
        errors.push(parsed.error);
        continue;
      }
      const d = parsed.data;
      if (isWin10(d.os)) hasWin10 = true;
      if (isWin11(d.os)) hasWin11 = true;
      if (d.environment?.isAdministrator === false) hasNonAdmin = true;

      if (d.artifact?.file && d.artifact?.sha256 && shaMap.has(d.artifact.file)) {
        const expected = shaMap.get(d.artifact.file);
        if (String(d.artifact.sha256).toLowerCase() !== expected) {
          errors.push(`Preflight artifact SHA-256 mismatch for ${d.artifact.file} in ${path.basename(file)}.`);
        }
      }
    }
    if (!hasWin10) errors.push('Clean OS matrix missing Windows 10 preflight evidence.');
    if (!hasWin11) errors.push('Clean OS matrix missing Windows 11 preflight evidence.');
    if (!hasNonAdmin) errors.push('Clean OS matrix missing non-admin (asInvoker) verification.');
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
    details: { fileCount: files.length, hasWin10, hasWin11, hasNonAdmin }
  };
}

function validateDiagnostics(evidenceDir, expectedVersion, expectedCommit) {
  const errors = [];
  const diagDir = path.join(evidenceDir, 'diagnostics');
  const files = findFilesRecursive(diagDir, (_p, name) => /\.json$/i.test(name), 2);
  let resolvedCommit = null;

  if (files.length === 0) {
    errors.push('Missing exported diagnostics JSON in diagnostics/.');
  } else {
    for (const file of files) {
      const raw = fs.readFileSync(file, 'utf8');
      for (const rx of RAW_SECRET_PATTERNS) {
        if (rx.test(raw)) {
          errors.push(`Potential unredacted secret pattern detected in ${path.basename(file)}.`);
          break;
        }
      }
      const parsed = readJsonStrict(file);
      if (!parsed.ok) {
        errors.push(parsed.error);
        continue;
      }
      const appInfo = parsed.data.app || {};
      if (appInfo.version !== expectedVersion) {
        errors.push(`Diagnostics app.version mismatch in ${path.basename(file)}: expected ${expectedVersion}, got ${appInfo.version}.`);
      }
      const commit = String(appInfo.commit || '').trim();
      if (!commit || commit.toLowerCase() === 'unknown' || commit === '9048f71') {
        errors.push(`Invalid or placeholder app.commit ('${commit}') in ${path.basename(file)}.`);
      } else {
        resolvedCommit = resolvedCommit || commit;
        if (expectedCommit && !expectedCommit.toLowerCase().startsWith(commit.toLowerCase()) && !commit.toLowerCase().startsWith(expectedCommit.toLowerCase())) {
          errors.push(`Diagnostics app.commit (${commit}) does not match expected commit (${expectedCommit}).`);
        }
      }
    }
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    resolvedCommit,
    errors,
    details: { fileCount: files.length, resolvedCommit }
  };
}

function validateSnapshotDiff(evidenceDir, scenario) {
  const errors = [];
  const rx = new RegExp(`^qa-diff-${scenario}-.*\\.json$`, 'i');
  const files = findFilesRecursive(evidenceDir, (_p, name) => rx.test(name), 3);

  if (files.length === 0) {
    errors.push(`Missing ${scenario} snapshot diff report (qa-diff-${scenario}-*.json).`);
  } else {
    const parsed = readJsonStrict(files[files.length - 1]);
    if (!parsed.ok) {
      errors.push(parsed.error);
    } else {
      const diff = parsed.data;
      if (diff.scenario !== scenario) {
        errors.push(`Snapshot diff scenario mismatch: expected ${scenario}, got ${diff.scenario}.`);
      }
      if (diff.verdict !== 'PASS') {
        const reasons = Array.isArray(diff.failures) && diff.failures.length > 0 ? diff.failures.join('; ') : 'non-PASS verdict';
        errors.push(`Snapshot ${scenario} check FAILED: ${reasons}.`);
      }
    }
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
    details: { file: files.length > 0 ? path.relative(evidenceDir, files[files.length - 1]) : null }
  };
}

function validateSoak(evidenceDir, minDurationSec) {
  const errors = [];
  const files = findFilesRecursive(evidenceDir, (_p, name) => name === 'soak-analysis.json', 4);
  let durationSec = 0;
  let orphanCount = null;

  if (files.length === 0) {
    errors.push('Missing soak/run-*/soak-analysis.json.');
  } else {
    const parsed = readJsonStrict(files[files.length - 1]);
    if (!parsed.ok) {
      errors.push(parsed.error);
    } else {
      const report = parsed.data;
      durationSec = Number(report.summary?.durationSec || 0);
      orphanCount = report.summary?.resources?.orphanCount ?? null;
      const fatalErrors = Number(report.summary?.resources?.fatalErrors ?? 0);
      const missingScenarios = Array.isArray(report.summary?.scenarios?.missing)
        ? report.summary.scenarios.missing
        : [];

      if (report.verdict !== 'PASS') {
        errors.push(`Soak verdict is ${report.verdict || 'UNKNOWN'} (must be PASS).`);
      }
      if (durationSec < minDurationSec) {
        errors.push(`Soak duration (${durationSec}s) is below required minimum (${minDurationSec}s).`);
      }
      if (orphanCount !== 0) {
        errors.push(`Soak detected orphan child processes (orphanCount=${orphanCount}).`);
      }
      if (fatalErrors > 0) {
        errors.push(`Soak detected fatal errors/crashes (fatalErrors=${fatalErrors}).`);
      }
      if (missingScenarios.length > 0) {
        errors.push(`Soak missing required scenarios: ${missingScenarios.join(', ')}.`);
      }
    }
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
    details: {
      file: files.length > 0 ? path.relative(evidenceDir, files[files.length - 1]) : null,
      durationSec,
      orphanCount
    }
  };
}

function validateUxScreenshots(evidenceDir) {
  const errors = [];
  const screenshotsDir = path.join(evidenceDir, 'screenshots');
  const files = findFilesRecursive(
    screenshotsDir,
    (fullPath, name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()) && fs.statSync(fullPath).size > 0,
    3
  );
  const relNames = files.map((f) => path.relative(screenshotsDir, f));
  const coveredModes = [];
  const missingModes = [];

  for (const mode of REQUIRED_SCREENSHOT_MODES) {
    if (relNames.some((n) => mode.match(n))) {
      coveredModes.push(mode.id);
    } else {
      missingModes.push(mode.label);
    }
  }

  if (files.length === 0) {
    errors.push('Missing non-empty UX screenshots in screenshots/.');
  } else if (missingModes.length > 0) {
    errors.push(`UX screenshot matrix missing required modes: ${missingModes.join(', ')}.`);
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
    details: { fileCount: files.length, coveredModes, missingModes }
  };
}

function validateWindowsQaBundle(evidenceDir, options = {}) {
  const absDir = path.resolve(evidenceDir);
  const expectedVersion = String(options.expectedVersion || '1.0.12');
  const expectedCommit = options.expectedCommit ? String(options.expectedCommit).trim() : null;
  const requireSigned = Boolean(options.requireSigned);
  const minDurationSec = Number(options.minSoakDurationSec ?? MIN_SOAK_DURATION_SEC);

  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return {
      schemaVersion: 1,
      verdict: 'BLOCKED',
      evaluatedAt: new Date().toISOString(),
      evidenceDir: absDir,
      expectedVersion,
      expectedCommit,
      resolvedCommit: null,
      signingStatus: 'UNKNOWN',
      requireSigned,
      gates: {},
      blockingReasons: [`Evidence directory does not exist: ${absDir}`],
      taskReadiness: {
        'S0-04': 'BLOCKED', 'S0-05': 'BLOCKED', 'S4-01': 'BLOCKED',
        'S4-02': 'BLOCKED', 'S4-03': 'BLOCKED', 'S4-04': 'BLOCKED', 'S4-06': 'BLOCKED'
      }
    };
  }

  const ci = validateCiArtifacts(absDir, expectedVersion, requireSigned);
  const preflight = validateCleanOsPreflight(absDir, ci.shaMap);
  const diagnostics = validateDiagnostics(absDir, expectedVersion, expectedCommit);
  const upgrade = validateSnapshotDiff(absDir, 'upgrade');
  const uninstall = validateSnapshotDiff(absDir, 'uninstall');
  const soak = validateSoak(absDir, minDurationSec);
  const screenshots = validateUxScreenshots(absDir);

  const gates = {
    ciArtifacts: { status: ci.status, details: ci.details, errors: ci.errors },
    cleanOsPreflight: { status: preflight.status, details: preflight.details, errors: preflight.errors },
    diagnosticsProvenance: { status: diagnostics.status, details: diagnostics.details, errors: diagnostics.errors },
    upgradePreservation: { status: upgrade.status, details: upgrade.details, errors: upgrade.errors },
    uninstallPreservation: { status: uninstall.status, details: uninstall.details, errors: uninstall.errors },
    multiProcessSoak: { status: soak.status, details: soak.details, errors: soak.errors },
    uxScreenshots: { status: screenshots.status, details: screenshots.details, errors: screenshots.errors }
  };

  const blockingReasons = Object.values(gates).flatMap((g) => g.errors);
  const ready = (ok) => (ok ? 'READY_FOR_VERIFIED' : 'BLOCKED');

  return {
    schemaVersion: 1,
    verdict: blockingReasons.length === 0 ? 'RELEASE_READY' : 'BLOCKED',
    evaluatedAt: new Date().toISOString(),
    evidenceDir: absDir,
    expectedVersion,
    expectedCommit,
    resolvedCommit: diagnostics.resolvedCommit,
    signingStatus: ci.signingStatus,
    requireSigned,
    gates,
    blockingReasons,
    taskReadiness: {
      'S0-04': ready(ci.status === 'PASS'),
      'S0-05': ready(ci.status === 'PASS' && preflight.status === 'PASS'),
      'S4-01': ready(soak.status === 'PASS'),
      'S4-02': ready(upgrade.status === 'PASS' && uninstall.status === 'PASS'),
      'S4-03': ready(preflight.status === 'PASS' && diagnostics.status === 'PASS'),
      'S4-04': ready(screenshots.status === 'PASS'),
      'S4-06': ready(blockingReasons.length === 0)
    }
  };
}

function parseCliArgs(argv) {
  const args = { dir: '', expectedVersion: '1.0.12', expectedCommit: null, requireSigned: false, out: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir' && argv[i + 1]) args.dir = argv[++i];
    else if (arg === '--expected-version' && argv[i + 1]) args.expectedVersion = argv[++i];
    else if (arg === '--expected-commit' && argv[i + 1]) args.expectedCommit = argv[++i];
    else if (arg === '--require-signed') args.requireSigned = true;
    else if (arg === '--out' && argv[i + 1]) args.out = argv[++i];
  }
  return args;
}

if (require.main === module) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.dir) {
    console.error('Usage: node scripts/verify-windows-qa-bundle.cjs --dir <evidenceDir> [--expected-version 1.0.12] [--expected-commit <sha>] [--require-signed] [--out <verdict.json>]');
    process.exit(2);
  }
  const result = validateWindowsQaBundle(args.dir, {
    expectedVersion: args.expectedVersion,
    expectedCommit: args.expectedCommit,
    requireSigned: args.requireSigned
  });
  const json = JSON.stringify(result, null, 2) + '\n';
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(path.resolve(args.out), json, 'utf8');
  }
  console.log(json);
  process.exit(result.verdict === 'RELEASE_READY' ? 0 : 1);
}

module.exports = {
  MIN_SOAK_DURATION_SEC,
  REQUIRED_SCREENSHOT_MODES,
  validateWindowsQaBundle,
  parseSha256Sums
};
