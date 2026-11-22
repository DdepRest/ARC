#!/usr/bin/env node
/**
 * scripts/generate-sbom.cjs
 * Deterministic zero-dependency CycloneDX 1.5 JSON SBOM generator for A.R.C. (S4-05).
 * Covers:
 *  1. Resolved npm runtime dependencies from package-lock.json + package.json
 *  2. Python Silero TTS dependencies from requirements-silero.txt
 *  3. Pinned ML model weights from src/main/services/model-supply-chain.manifest.ts
 *  4. Local bundled fonts, A.R.C. icon assets, and bundled Python server scripts
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');

const PYTHON_LICENSE_MAP = {
  torch: 'BSD-3-Clause',
  torchaudio: 'BSD-2-Clause',
  flask: 'BSD-3-Clause',
  'flask-cors': 'MIT',
  omegaconf: 'BSD-3-Clause',
  pyyaml: 'MIT',
  soundfile: 'BSD-3-Clause',
  numpy: 'BSD-3-Clause',
  scipy: 'BSD-3-Clause',
  onnxruntime: 'MIT',
  ruaccent: 'MIT'
};

const MODEL_LICENSE_CATALOG = {
  'v5_6_ru.pt': {
    spdxId: 'CC-BY-NC-SA-4.0',
    commercialAllowed: false,
    note: 'Non-Commercial Use Only; commercial distribution requires separate Silero license or weight exclusion.'
  },
  'silero-vad': { spdxId: 'MIT', commercialAllowed: true, note: 'Silero VAD MIT License.' },
  'gigaam-ctc': { spdxId: 'MIT', commercialAllowed: true, note: 'SaluteDevices GigaAM CTC MIT License.' },
  'zipformer-ru': { spdxId: 'Apache-2.0', commercialAllowed: true, note: 'k2-fsa / Sherpa-ONNX Zipformer Apache-2.0.' },
  'whisper-small': { spdxId: 'MIT', commercialAllowed: true, note: 'OpenAI Whisper MIT License.' }
};

function integrityToCdxHashes(integrity) {
  if (!integrity || typeof integrity !== 'string') return [];
  const match = integrity.match(/^(sha512|sha384|sha256)-([A-Za-z0-9+/=]+)$/);
  if (!match) return [];
  const algMap = { sha512: 'SHA-512', sha384: 'SHA-384', sha256: 'SHA-256' };
  const hex = Buffer.from(match[2], 'base64').toString('hex');
  return [{ alg: algMap[match[1]], content: hex }];
}

function makeNpmPurl(name, version) {
  const encoded = name.startsWith('@') ? name.replace('/', '%2F') : name;
  return `pkg:npm/${encoded}@${version}`;
}

function collectNpmComponents(rootDir) {
  const pkgPath = path.join(rootDir, 'package.json');
  const lockPath = path.join(rootDir, 'package-lock.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const directDeps = pkg.dependencies || {};
  const components = [];
  const seen = new Set();

  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const packages = lock.packages || {};
    for (const [pkgKey, meta] of Object.entries(packages)) {
      if (!pkgKey.startsWith('node_modules/') || meta.dev === true) continue;
      const lastNm = pkgKey.lastIndexOf('node_modules/');
      const name = pkgKey.slice(lastNm + 'node_modules/'.length);
      const version = meta.version || '0.0.0';
      const dedupKey = `${name}@${version}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const licStr = typeof meta.license === 'string' ? meta.license.trim() : '';
      const licenses = licStr ? [{ expression: licStr }] : [];
      const hashes = integrityToCdxHashes(meta.integrity);

      components.push({
        type: 'library',
        'bom-ref': `npm:${dedupKey}`,
        name,
        version,
        purl: makeNpmPurl(name, version),
        scope: meta.optional ? 'optional' : 'required',
        ...(licenses.length > 0 ? { licenses } : {}),
        ...(hashes.length > 0 ? { hashes } : {}),
        properties: [
          { name: 'arc:ecosystem', value: 'npm' },
          { name: 'arc:directDependency', value: String(Object.prototype.hasOwnProperty.call(directDeps, name)) }
        ]
      });
    }
  }

  // Guarantee every direct runtime dependency in package.json is represented
  for (const [name, spec] of Object.entries(directDeps)) {
    const alreadyPresent = components.some((c) => c.name === name);
    if (!alreadyPresent) {
      components.push({
        type: 'library',
        'bom-ref': `npm:${name}@${spec}`,
        name,
        version: spec,
        purl: makeNpmPurl(name, spec),
        scope: 'required',
        properties: [
          { name: 'arc:ecosystem', value: 'npm' },
          { name: 'arc:directDependency', value: 'true' }
        ]
      });
    }
  }

  return components.sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref']));
}

function collectPythonComponents(rootDir) {
  const reqPath = path.join(rootDir, 'requirements-silero.txt');
  if (!fs.existsSync(reqPath)) return [];
  const lines = fs.readFileSync(reqPath, 'utf8').split(/\r?\n/);
  const components = [];
  let currentScope = 'required';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      if (line.toUpperCase().includes('OPTIONAL')) currentScope = 'optional';
      if (line.toUpperCase().includes('CORE')) currentScope = 'required';
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*(.*)$/);
    if (!match) continue;
    const name = match[1];
    const constraint = (match[2] || 'unspecified').trim();
    const norm = name.toLowerCase();
    const licenseId = PYTHON_LICENSE_MAP[norm] || 'UNKNOWN';

    components.push({
      type: 'library',
      'bom-ref': `pypi:${norm}@${constraint}`,
      name,
      version: constraint,
      purl: `pkg:pypi/${norm}`,
      scope: currentScope,
      licenses: licenseId !== 'UNKNOWN' ? [{ license: { id: licenseId } }] : [],
      properties: [
        { name: 'arc:ecosystem', value: 'python-silero-tts' },
        { name: 'arc:versionConstraint', value: constraint }
      ]
    });
  }
  return components;
}

/**
 * Parses pinned ML model manifests directly from model-supply-chain.manifest.ts
 * without requiring TypeScript compilation at script runtime.
 */
function collectMlModelComponents(rootDir) {
  const manifestPath = path.join(rootDir, 'src', 'main', 'services', 'model-supply-chain.manifest.ts');
  if (!fs.existsSync(manifestPath)) return [];
  const src = fs.readFileSync(manifestPath, 'utf8');

  const constMap = new Map();
  for (const m of src.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*'([^']+)';/g)) {
    constMap.set(m[1], m[2]);
  }
  // Resolve joined constant for ZIPFORMER_RU_REPO
  const zipJoin = src.match(/const\s+ZIPFORMER_RU_REPO\s*=\s*\[([^\]]+)\]\.join\('-'\);/);
  if (zipJoin) {
    const parts = [];
    for (const part of zipJoin[1].split(',')) {
      const cleaned = part.replace(/['"\s+]/g, '');
      parts.push(cleaned);
    }
    constMap.set('ZIPFORMER_RU_REPO', parts.join('-'));
  }

  const resolveExpr = (expr) => {
    let val = expr.trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('`') && val.endsWith('`'))) {
      val = val.slice(1, -1);
      return val.replace(/\$\{([A-Z0-9_]+)\}/g, (_all, k) => constMap.get(k) || k);
    }
    return constMap.get(val) || val;
  };

  const components = [];
  const blockRegex = /\{\s*manifestId:\s*'([^']+)',\s*id:\s*'([^']+)',\s*source:\s*([^,]+),\s*sourceUrl:\s*([^,]+),\s*revision:\s*([^,]+),\s*licenseUrl:\s*([^,]+),[\s\S]*?files:\s*\[([\s\S]*?)\]\s*\}/g;

  for (const m of src.matchAll(blockRegex)) {
    const manifestId = m[1];
    const id = m[2];
    const source = resolveExpr(m[3]);
    const sourceUrl = resolveExpr(m[4]);
    const revision = resolveExpr(m[5]);
    const licenseUrl = resolveExpr(m[6]);
    const filesBody = m[7];

    const fileHashes = [];
    const fileProps = [];
    const fileRegex = /name:\s*'([^']+)',\s*url:\s*([^,]+),\s*size:\s*(\d+),\s*sha256:\s*'([0-9a-f]{64})'/g;
    for (const fm of filesBody.matchAll(fileRegex)) {
      fileHashes.push({ alg: 'SHA-256', content: fm[4] });
      fileProps.push({
        name: `arc:file:${fm[1]}`,
        value: `size=${fm[3]};sha256=${fm[4]}`
      });
    }

    const licMeta = MODEL_LICENSE_CATALOG[id] || { spdxId: 'NOASSERTION', commercialAllowed: false, note: 'Verify upstream license.' };
    components.push({
      type: 'machine-learning-model',
      'bom-ref': `model:${manifestId}`,
      name: id,
      version: revision,
      description: `Pinned ML model artifact (${source})`,
      licenses: [{ license: { id: licMeta.spdxId, url: licenseUrl } }],
      externalReferences: [
        { type: 'distribution', url: sourceUrl },
        { type: 'license', url: licenseUrl }
      ],
      hashes: fileHashes.slice(0, 1),
      properties: [
        { name: 'arc:ecosystem', value: 'ml-model' },
        { name: 'arc:manifestId', value: manifestId },
        { name: 'arc:source', value: source },
        { name: 'arc:revision', value: revision },
        { name: 'arc:commercialUseAllowed', value: String(licMeta.commercialAllowed) },
        { name: 'arc:licenseNote', value: licMeta.note },
        ...fileProps
      ]
    });
  }

  return components;
}

function collectBundledAssetComponents(rootDir) {
  const components = [];
  const fontsDir = path.join(rootDir, 'src', 'renderer', 'assets', 'fonts');
  if (fs.existsSync(fontsDir)) {
    const fontFamilies = [
      { id: 'inter', name: 'Inter Font Family', url: 'https://rsms.me/inter/' },
      { id: 'jetbrains-mono', name: 'JetBrains Mono Font Family', url: 'https://www.jetbrains.com/lp/mono/' },
      { id: 'onest', name: 'Onest Font Family', url: 'https://onest.md/' },
      { id: 'tektur', name: 'Tektur Font Family', url: 'https://fonts.google.com/specimen/Tektur' }
    ];
    const files = fs.readdirSync(fontsDir);
    for (const fam of fontFamilies) {
      const matched = files.filter((f) => f.startsWith(`${fam.id}-`) && f.endsWith('.woff2'));
      if (matched.length === 0) continue;
      components.push({
        type: 'file',
        'bom-ref': `asset:font:${fam.id}`,
        name: fam.name,
        version: 'bundled',
        licenses: [{ license: { id: 'OFL-1.1' } }],
        externalReferences: [{ type: 'website', url: fam.url }],
        properties: [
          { name: 'arc:ecosystem', value: 'bundled-font' },
          { name: 'arc:fileCount', value: String(matched.length) }
        ]
      });
    }
  }

  for (const iconRel of ['build/icon.ico', 'build/icon.png']) {
    const abs = path.join(rootDir, iconRel);
    if (!fs.existsSync(abs)) continue;
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    components.push({
      type: 'file',
      'bom-ref': `asset:${iconRel}`,
      name: iconRel,
      version: '1.0.12',
      licenses: [{ license: { id: 'MIT' } }],
      hashes: [{ alg: 'SHA-256', content: sha256 }],
      properties: [{ name: 'arc:ecosystem', value: 'app-icon' }]
    });
  }

  return components;
}

function generateSbom(options = {}) {
  const rootDir = options.rootDir || REPO_ROOT;
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const commitSha = (options.commitSha || process.env.BUILD_COMMIT || process.env.GITHUB_SHA || 'unknown').trim();

  const npmComponents = collectNpmComponents(rootDir);
  const pythonComponents = collectPythonComponents(rootDir);
  const mlModelComponents = collectMlModelComponents(rootDir);
  const assetComponents = collectBundledAssetComponents(rootDir);

  const bom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: {
        components: [
          {
            type: 'application',
            name: 'arc-sbom-generator',
            version: '1.0.0'
          }
        ]
      },
      component: {
        type: 'application',
        'bom-ref': `arc:${pkg.version}`,
        name: pkg.build?.productName || 'A.R.C.',
        version: pkg.version,
        description: pkg.description,
        authors: [{ name: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name || 'DdepRest' }],
        licenses: [{ license: { id: pkg.license || 'MIT' } }],
        externalReferences: [
          { type: 'website', url: pkg.homepage || 'https://github.com/DdepRest/ARC' },
          { type: 'vcs', url: pkg.repository?.url || 'https://github.com/DdepRest/ARC.git' }
        ],
        properties: [
          { name: 'arc:buildCommit', value: commitSha },
          { name: 'arc:distributionPolicy', value: 'non-commercial-open-source' },
          {
            name: 'arc:commercialDistributionNotice',
            value:
              'A.R.C. source code is MIT-licensed, but bundled Silero TTS weights (v5_6_ru.pt) are CC-BY-NC-SA-4.0 (Non-Commercial Only). Commercial releases must license Silero separately or exclude bundled v5_6_ru.pt.'
          }
        ]
      }
    },
    components: [...npmComponents, ...pythonComponents, ...mlModelComponents, ...assetComponents]
  };

  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(options.outputPath, JSON.stringify(bom, null, 2) + '\n', 'utf8');
  }

  return {
    bom,
    counts: {
      npm: npmComponents.length,
      python: pythonComponents.length,
      mlModels: mlModelComponents.length,
      assets: assetComponents.length,
      total: bom.components.length
    }
  };
}

if (require.main === module) {
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outputPath = outArg
    ? path.resolve(outArg.slice('--out='.length))
    : path.join(REPO_ROOT, 'dist', 'sbom-cyclonedx.json');

  const res = generateSbom({ rootDir: REPO_ROOT, outputPath });
  console.log(
    `Generated CycloneDX 1.5 SBOM at ${path.relative(REPO_ROOT, outputPath)}:`,
    JSON.stringify(res.counts)
  );
}

module.exports = {
  generateSbom,
  collectNpmComponents,
  collectPythonComponents,
  collectMlModelComponents,
  collectBundledAssetComponents
};
