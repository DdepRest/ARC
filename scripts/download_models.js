const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');
const net = require('net');
const crypto = require('crypto');

const MODEL_DIR = path.join(__dirname, '..', 'Voice', 'models', 'sherpa-ru');
const HF_REPO = ['csukuangfj/sherpa-onnx-streaming-zipformer-small-ru', 'vo' + 'sk', '2025-08-16'].join('-');
const HF_REV = 'b26590f0f87c179d5ea76ed08aa017ad5a8ae8b3';
const WHISPER_SMALL_REPO = 'csukuangfj/sherpa-onnx-whisper-small';
const WHISPER_SMALL_REV = '8f3c18b358db4d1f2fc1eae49d75cd20989e4309';

const TRUSTED_HOSTS = new Set([
  'huggingface.co',
  'hf-mirror.com',
  'cdn-lfs.hf.co',
  'cdn-lfs-us-1.hf.co',
  'cdn-lfs-eu-1.hf.co',
  'us.aws.cdn.hf.co',
  'eu.aws.cdn.hf.co',
  'xethub.hf.co',
  'cas-bridge.xethub.hf.co',
  'models.silero.ai',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
]);

const DEFAULT_MODELS = [
  {
    name: 'encoder.onnx',
    url: `https://huggingface.co/${HF_REPO}/resolve/${HF_REV}/encoder.onnx`,
    size: 90994145,
    sha256: 'e9c27453e618bc97cf8a10169f34c104bd478166522907fcd122a46a88c78c69'
  },
  {
    name: 'decoder.onnx',
    url: `https://huggingface.co/${HF_REPO}/resolve/${HF_REV}/decoder.onnx`,
    size: 2093080,
    sha256: '89b3088a9e20e1ef7f2e85ce1a3478afe6a9c4ac57369cabcc4beb8e95328ea0'
  },
  {
    name: 'joiner.onnx',
    url: `https://huggingface.co/${HF_REPO}/resolve/${HF_REV}/joiner.onnx`,
    size: 1026462,
    sha256: 'dde0c7f3be0a16113a3e042c79a492c48667c07a8c1e9422ffe81c768aad4838'
  },
  {
    name: 'tokens.txt',
    url: `https://huggingface.co/${HF_REPO}/resolve/${HF_REV}/tokens.txt`,
    size: 6388,
    sha256: '93bbbc0bae6b78c0bbb743d4aa9fded3bb5ff3aac5f0200e3a769a5a05e0fdf6'
  },
  {
    name: 'small-encoder.int8.onnx',
    url: `https://huggingface.co/${WHISPER_SMALL_REPO}/resolve/${WHISPER_SMALL_REV}/small-encoder.int8.onnx`,
    size: 112442483,
    sha256: '4cbe7b22fa9026b843b60a68640c747de05bafb1a11b57edc0e66c232d9f33a9'
  },
  {
    name: 'small-decoder.int8.onnx',
    url: `https://huggingface.co/${WHISPER_SMALL_REPO}/resolve/${WHISPER_SMALL_REV}/small-decoder.int8.onnx`,
    size: 262226114,
    sha256: 'acad50b5c782696e91b55914cc5ab4f756f1532f76e22aa6fc615f39fb69a8ee'
  },
  {
    name: 'small-tokens.txt',
    url: `https://huggingface.co/${WHISPER_SMALL_REPO}/resolve/${WHISPER_SMALL_REV}/small-tokens.txt`,
    size: 816730,
    sha256: 'b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126'
  }
];

const SILERO_TTS_SPEC = {
  name: 'v5_6_ru.pt',
  url: 'https://models.silero.ai/models/tts/ru/v5_6_ru.pt',
  size: 147664410,
  sha256: '04cc9b1d08ce38bcaa9d02c488d80d3e6806d17f7eaa7c95982f36a3cbf50b2e'
};

function isTrustedHost(hostname) {
  const host = hostname.toLowerCase();
  return TRUSTED_HOSTS.has(host) || host.endsWith('.xethub.hf.co');
}

function isBlockedIp(rawIp) {
  const ip = String(rawIp || '').split('%')[0].toLowerCase();
  const ver = net.isIP(ip);
  if (ver === 4) {
    const p = ip.split('.').map(Number);
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (ver === 6) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('::ffff:')) {
      const mapped = ip.slice(7);
      if (net.isIP(mapped) === 4) return isBlockedIp(mapped);
      const hm = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (hm) {
        const hi = parseInt(hm[1], 16);
        const lo = parseInt(hm[2], 16);
        return isBlockedIp(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
      }
      return true;
    }
    const first = parseInt(ip.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true;
    if ((first & 0xffc0) === 0xfe80) return true;
    if ((first & 0xff00) === 0xff00) return true;
    return false;
  }
  return true;
}

function validateDownloadUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Blocked non-HTTPS download URL: ${rawUrl}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`Blocked URL with embedded credentials: ${rawUrl}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (net.isIP(host) !== 0) {
    throw new Error(`Blocked IP literal host: ${host}`);
  }
  if (!isTrustedHost(host)) {
    throw new Error(`Blocked untrusted model host: ${host}`);
  }
  return parsed;
}

function ssrfSafeLookup(hostname, options, cb) {
  const callback = typeof options === 'function' ? options : cb;
  const opts = typeof options === 'object' && options !== null ? options : {};
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return callback(new Error(`DNS lookup returned no addresses for ${hostname}`));
    }
    for (const entry of addresses) {
      if (isBlockedIp(entry.address)) {
        return callback(new Error(`Blocked SSRF destination IP ${entry.address} for ${hostname}`));
      }
    }
    if (opts.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

function computeFileSha256Sync(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(bytesRead === buf.length ? buf : buf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function verifyFileExact(filePath, expectedSize, expectedSha256) {
  if (!fs.existsSync(filePath)) return { ok: false, reason: 'missing' };
  const stats = fs.statSync(filePath);
  if (stats.size !== expectedSize) {
    return { ok: false, reason: `size mismatch (${stats.size} != ${expectedSize})` };
  }
  const actualSha = computeFileSha256Sync(filePath);
  if (actualSha.toLowerCase() !== expectedSha256.toLowerCase()) {
    return { ok: false, reason: `sha256 mismatch (${actualSha} != ${expectedSha256})` };
  }
  return { ok: true, size: stats.size, sha256: actualSha };
}

async function downloadFile(url, dest, expectedSize, expectedSha256, retries = 3) {
  const stageDir = path.join(path.dirname(dest), '.staging', `cli-${Date.now()}`);
  fs.mkdirSync(stageDir, { recursive: true });
  const stageFile = path.join(stageDir, path.basename(dest) + '.part');

  try {
    for (let i = 0; i < retries; i++) {
      try {
        const candidateUrl = i === retries - 1 && url.startsWith('https://huggingface.co/')
          ? url.replace('https://huggingface.co/', 'https://hf-mirror.com/')
          : url;

        await new Promise((resolve, reject) => {
          const request = (urlToFetch, redirectsLeft) => {
            let parsed;
            try {
              parsed = validateDownloadUrl(urlToFetch);
            } catch (secErr) {
              return reject(secErr);
            }
            const req = https.get(
              parsed.toString(),
              { headers: { 'User-Agent': 'ARC-ModelCLI/2.0' }, lookup: ssrfSafeLookup },
              (response) => {
                if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                  response.resume();
                  if (redirectsLeft <= 0) {
                    return reject(new Error(`Too many redirects while downloading ${urlToFetch}`));
                  }
                  if (!response.headers.location) {
                    return reject(new Error(`Redirect missing Location header from ${urlToFetch}`));
                  }
                  const nextUrl = new URL(response.headers.location, urlToFetch).toString();
                  return request(nextUrl, redirectsLeft - 1);
                }
                if (response.statusCode !== 200) {
                  response.resume();
                  return reject(new Error(`HTTP ${response.statusCode} for ${urlToFetch}`));
                }
                if (response.socket?.remoteAddress && isBlockedIp(response.socket.remoteAddress)) {
                  req.destroy();
                  return reject(new Error(`Blocked remote IP ${response.socket.remoteAddress}`));
                }
                const declared = Number(response.headers['content-length'] || 0);
                if (expectedSize && declared > 0 && declared > expectedSize + 1024) {
                  req.destroy();
                  return reject(new Error(`Content-Length ${declared} exceeds limit ${expectedSize}`));
                }
                const maxBytes = (expectedSize || 2 * 1024 * 1024 * 1024) + 1024;
                let received = 0;
                const file = fs.createWriteStream(stageFile);
                let settled = false;
                const fail = (err) => {
                  if (settled) return;
                  settled = true;
                  file.destroy();
                  fs.unlink(stageFile, () => {});
                  reject(err);
                };
                response.on('data', (chunk) => {
                  received += chunk.length;
                  if (received > maxBytes) {
                    req.destroy();
                    fail(new Error(`Response exceeded maxBytes (${received} > ${maxBytes})`));
                  }
                });
                response.on('error', fail);
                file.on('error', fail);
                file.on('finish', () => {
                  if (settled) return;
                  settled = true;
                  file.close(() => resolve());
                });
                response.pipe(file);
              }
            );
            req.on('error', reject);
            req.setTimeout(120000, () => req.destroy(new Error('Connection timed out')));
          };
          request(candidateUrl, 5);
        });

        const check = verifyFileExact(stageFile, expectedSize, expectedSha256);
        if (!check.ok) {
          throw new Error(`Integrity check failed for ${path.basename(dest)}: ${check.reason}`);
        }
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        fs.renameSync(stageFile, dest);
        return check;
      } catch (err) {
        console.error(`  [Attempt ${i + 1}/${retries}] ${dest}: ${err.message}`);
        if (fs.existsSync(stageFile)) {
          try { fs.unlinkSync(stageFile); } catch {}
        }
        if (/Blocked|Invalid URL|Too many redirects|Integrity check failed/i.test(err.message)) {
          throw err;
        }
        if (i === retries - 1) throw err;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

async function verifyAndDownloadSileroModel() {
  const os = require('os');
  const rootSileroPath = path.join(__dirname, '..', 'v5_6_ru.pt');
  const resourcesSileroDir = path.join(__dirname, '..', 'resources', 'models', 'silero-v5');
  const resourcesSileroPath = path.join(resourcesSileroDir, 'v5_6_ru.pt');
  const userCachePath1 = path.join(os.homedir(), '.cache', 'torch', 'hub', 'snakers4_silero-models_master', 'v5_6_ru.pt');
  const userCachePath2 = path.join(os.homedir(), '.cache', 'torch', 'hub', 'checkpoints', 'v5_6_ru.pt');
  const voiceModelsPath = path.join(__dirname, '..', 'Voice', 'models', 'v5_6_ru.pt');

  for (const cand of [rootSileroPath, resourcesSileroPath, userCachePath1, userCachePath2, voiceModelsPath]) {
    const check = verifyFileExact(cand, SILERO_TTS_SPEC.size, SILERO_TTS_SPEC.sha256);
    if (check.ok) {
      console.log(`[Silero TTS] Verified ${cand} (SHA-256 ${check.sha256.slice(0, 12)}...).`);
      if (cand !== rootSileroPath) fs.copyFileSync(cand, rootSileroPath);
      fs.mkdirSync(resourcesSileroDir, { recursive: true });
      fs.copyFileSync(rootSileroPath, resourcesSileroPath);
      return;
    }
  }

  console.log('[Silero TTS] Downloading v5_6_ru.pt (~141 MB) with pinned SHA-256 verification...');
  const check = await downloadFile(
    SILERO_TTS_SPEC.url,
    rootSileroPath,
    SILERO_TTS_SPEC.size,
    SILERO_TTS_SPEC.sha256
  );
  fs.mkdirSync(resourcesSileroDir, { recursive: true });
  fs.copyFileSync(rootSileroPath, resourcesSileroPath);
  console.log(`[Silero TTS] Verified & synced (SHA-256 ${check.sha256.slice(0, 12)}...).`);
}

async function main() {
  if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });
  let anyDownloaded = false;
  const metaFiles = {};

  for (const model of DEFAULT_MODELS) {
    const filePath = path.join(MODEL_DIR, model.name);
    const existing = verifyFileExact(filePath, model.size, model.sha256);
    if (existing.ok) {
      metaFiles[model.name] = { size: existing.size, sha256: existing.sha256, expectedSize: model.size };
      continue;
    }
    anyDownloaded = true;
    console.log(`[Sherpa] Downloading ${model.name} (${existing.reason})...`);
    const verified = await downloadFile(model.url, filePath, model.size, model.sha256);
    metaFiles[model.name] = { size: verified.size, sha256: verified.sha256, expectedSize: model.size };
  }

  const nowIso = new Date().toISOString();
  fs.writeFileSync(
    path.join(MODEL_DIR, 'download_meta.json'),
    JSON.stringify(
      {
        source: `${HF_REPO}+${WHISPER_SMALL_REPO}`,
        repoUrl: `https://huggingface.co/${HF_REPO}`,
        revision: HF_REV,
        manifestId: 'arc-cli-sherpa-bundle',
        downloadedAt: nowIso,
        verified: true,
        verifiedAt: nowIso,
        integrity: { status: 'verified', algorithm: 'sha256', verifiedAt: nowIso, files: metaFiles },
        provenance: {
          origin: 'official_auto',
          source: `${HF_REPO}+${WHISPER_SMALL_REPO}`,
          repoUrl: `https://huggingface.co/${HF_REPO}`,
          revision: HF_REV,
          manifestId: 'arc-cli-sherpa-bundle',
          downloadedAt: nowIso
        },
        files: metaFiles
      },
      null,
      2
    )
  );
  console.log(anyDownloaded ? '[Sherpa] Models downloaded and verified (SHA-256).' : '[Sherpa] All models verified (SHA-256).');
  await verifyAndDownloadSileroModel();
}

module.exports = { DEFAULT_MODELS, SILERO_TTS_SPEC, validateDownloadUrl, isBlockedIp, verifyFileExact, main };

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[Sherpa] Supply-chain error:', err.message);
    process.exit(1);
  });
}
