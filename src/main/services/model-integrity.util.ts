import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  DownloadMetaFile,
  ModelArtifactManifest,
  ModelIntegrityRecord,
  ModelProvenanceRecord,
  ModelVerificationSummary
} from '../../shared/types/model-integrity';
import { GIGAAM_SOURCE_MANIFESTS, MODEL_SUPPLY_CHAIN_MANIFESTS } from './model-supply-chain.manifest';

const hasFs = (fn: keyof typeof fs): boolean =>
  Object.prototype.hasOwnProperty.call(fs, fn) && typeof (fs as any)[fn] === 'function';

const shaCache = new Map<string, { size: number; mtimeMs: number; sha256: string }>();

export function clearIntegrityCache(): void {
  shaCache.clear();
}

export function computeFileSha256Sync(filePath: string, bypassCache = false): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stats = fs.statSync(filePath);
    if (!stats || !Number.isFinite(stats.size)) return null;
    const mtimeMs = typeof stats.mtimeMs === 'number' ? stats.mtimeMs : 0;

    if (!bypassCache && mtimeMs > 0) {
      const cached = shaCache.get(filePath);
      if (cached && cached.size === stats.size && cached.mtimeMs === mtimeMs) {
        return cached.sha256;
      }
    }

    const hash = crypto.createHash('sha256');
    if (hasFs('openSync') && hasFs('readSync') && hasFs('closeSync')) {
      const chunkSize = 256 * 1024;
      const buf = Buffer.allocUnsafe(Math.min(chunkSize, Math.max(1, stats.size)));
      const fd = fs.openSync(filePath, 'r');
      try {
        let offset = 0;
        while (offset < stats.size) {
          const toRead = Math.min(buf.length, stats.size - offset);
          const bytesRead = fs.readSync(fd, buf, 0, toRead, offset);
          if (bytesRead <= 0) break;
          hash.update(bytesRead === buf.length ? buf : buf.subarray(0, bytesRead));
          offset += bytesRead;
        }
      } finally {
        fs.closeSync(fd);
      }
    } else if (hasFs('readFileSync')) {
      hash.update(fs.readFileSync(filePath));
    } else {
      return null;
    }

    const digest = hash.digest('hex');
    if (mtimeMs > 0) {
      shaCache.set(filePath, { size: stats.size, mtimeMs, sha256: digest });
    }
    return digest;
  } catch {
    return null;
  }
}

export interface StagedDigestCheckResult {
  ok: boolean;
  actualSize: number;
  actualSha256: string | null;
  reason?: string;
}

export function verifyStagedFileDigest(
  filePath: string,
  expectedSize: number,
  expectedSha256: string
): StagedDigestCheckResult {
  if (!expectedSha256 || !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    return { ok: false, actualSize: 0, actualSha256: null, reason: 'Missing or invalid expected SHA-256 in manifest' };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, actualSize: 0, actualSha256: null, reason: `File missing: ${path.basename(filePath)}` };
  }
  const stats = fs.statSync(filePath);
  const actualSize = stats?.size ?? 0;
  if (actualSize <= 0 || (expectedSize > 0 && actualSize !== expectedSize)) {
    return {
      ok: false,
      actualSize,
      actualSha256: null,
      reason: `Size mismatch for ${path.basename(filePath)}: expected ${expectedSize}, got ${actualSize}`
    };
  }
  const actualSha256 = computeFileSha256Sync(filePath, true);
  if (!actualSha256) {
    return { ok: false, actualSize, actualSha256: null, reason: `Failed reading ${path.basename(filePath)} for SHA-256` };
  }
  if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    return {
      ok: false,
      actualSize,
      actualSha256,
      reason: `SHA-256 mismatch for ${path.basename(filePath)}: expected ${expectedSha256.slice(0, 12)}..., got ${actualSha256.slice(0, 12)}...`
    };
  }
  return { ok: true, actualSize, actualSha256 };
}

export function buildVerifiedMetaRecord(
  manifest: Pick<ModelArtifactManifest, 'manifestId' | 'source' | 'sourceUrl' | 'revision' | 'licenseUrl'>,
  fileDigests: Record<string, { size: number; sha256: string }>,
  extra?: Partial<DownloadMetaFile>
): DownloadMetaFile {
  const now = new Date().toISOString();
  const primaryEntry = Object.values(fileDigests)[0];
  const digestPrefix = primaryEntry?.sha256?.slice(0, 16) || undefined;

  const filesMap: Record<string, { size: number; sha256: string; expectedSize: number; downloadedAt: string }> = {};
  for (const [name, info] of Object.entries(fileDigests)) {
    filesMap[name] = {
      size: info.size,
      sha256: info.sha256,
      expectedSize: info.size,
      downloadedAt: now
    };
  }

  const integrity: ModelIntegrityRecord = {
    status: 'verified',
    algorithm: 'sha256',
    verifiedAt: now,
    files: fileDigests
  };

  const provenance: ModelProvenanceRecord = {
    origin: 'official_auto',
    source: manifest.source,
    repoUrl: manifest.sourceUrl,
    revision: manifest.revision,
    manifestId: manifest.manifestId,
    licenseUrl: manifest.licenseUrl,
    downloadedAt: now,
    digestPrefix
  };

  return {
    ...extra,
    source: manifest.source,
    repoUrl: manifest.sourceUrl,
    revision: manifest.revision,
    manifestId: manifest.manifestId,
    licenseUrl: manifest.licenseUrl,
    downloadedAt: now,
    verifiedAt: now,
    status: 'verified',
    verified: true,
    incompatible: false,
    integrity,
    provenance,
    files: filesMap
  };
}

export function readDownloadMeta(dir: string): DownloadMetaFile | null {
  const metaPath = path.join(dir, 'download_meta.json');
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as DownloadMetaFile;
  } catch {
    return null;
  }
}

export function resolveExpectedManifestForMeta(modelId: string, meta: DownloadMetaFile | null): ModelArtifactManifest | null {
  if (modelId === 'gigaam-ctc') {
    if (meta?.manifestId) {
      const byId = GIGAAM_SOURCE_MANIFESTS.find((m) => m.manifestId === meta.manifestId);
      if (byId) return byId;
    }
    if (meta?.source) {
      const bySource = GIGAAM_SOURCE_MANIFESTS.find((m) => m.source === meta.source);
      if (bySource) return bySource;
    }
    return null;
  }
  return MODEL_SUPPLY_CHAIN_MANIFESTS[modelId] || null;
}

export function inspectDirectorySupplyChain(
  dir: string,
  modelId: string,
  requiredFiles: Array<{ name: string; minBytes?: number; expectedSha256?: string; expectedSize?: number }>,
  opts?: { forceRehash?: boolean }
): ModelVerificationSummary & { isComplete: boolean; missingFiles: string[]; totalSize: number } {
  const meta = readDownloadMeta(dir);
  const bypassCache = Boolean(opts?.forceRehash);

  if (!fs.existsSync(dir)) {
    return {
      isComplete: false,
      missingFiles: requiredFiles.map((f) => f.name),
      totalSize: 0,
      integrity: { status: 'missing', algorithm: 'sha256', reason: 'Model directory missing' },
      provenance: { origin: 'manual_local' }
    };
  }

  const missingFiles: string[] = [];
  let totalSize = 0;
  for (const spec of requiredFiles) {
    const fp = path.join(dir, spec.name);
    if (!fs.existsSync(fp)) {
      missingFiles.push(spec.name);
      continue;
    }
    try {
      const st = fs.statSync(fp);
      const minB = spec.minBytes ?? 1;
      const metaExpected = meta?.files?.[spec.name]?.expectedSize || meta?.files?.[spec.name]?.size;
      const refSize = metaExpected && metaExpected > 0 ? metaExpected : spec.expectedSize;
      if (!st || st.size < minB) {
        missingFiles.push(`Invalid size for ${spec.name}`);
      } else if (refSize && refSize > 0 && Math.abs(st.size - refSize) > 500) {
        missingFiles.push(`Invalid file size for ${spec.name} (${st.size} vs ${refSize})`);
      } else {
        totalSize += st.size;
      }
    } catch {
      missingFiles.push(spec.name);
    }
  }

  if (missingFiles.length > 0) {
    return {
      isComplete: false,
      missingFiles,
      totalSize: 0,
      integrity: { status: 'missing', algorithm: 'sha256', reason: missingFiles.join(', ') },
      provenance: meta?.provenance || { origin: meta ? 'official_auto' : 'manual_local', source: meta?.source }
    };
  }

  // Determine if directory claims verified/official auto-download provenance
  const claimsOfficial = Boolean(
    meta?.provenance?.origin === 'official_auto' ||
    meta?.integrity?.status === 'verified' ||
    (meta?.verified === true && meta?.manifestId && meta?.integrity?.files)
  );

  if (!claimsOfficial) {
    // Manual or legacy pre-manifest directory: allow usage, mark strictly UNVERIFIED_MANUAL, never promote to verified!
    return {
      isComplete: true,
      missingFiles: [],
      totalSize,
      integrity: {
        status: 'unverified_manual',
        algorithm: 'sha256',
        runtimeValidated: meta?.integrity?.runtimeValidated,
        reason: 'Модель добавлена вручную или без криптографического манифеста SHA-256'
      },
      provenance: {
        origin: 'manual_local',
        source: meta?.source || 'local_manual',
        revision: meta?.revision,
        licenseUrl: meta?.licenseUrl,
        downloadedAt: meta?.downloadedAt
      }
    };
  }

  // Claims official_auto -> verify SHA-256 & exact sizes against meta/manifest
  const expectedFilesMap = meta?.integrity?.files || {};
  const manifest = resolveExpectedManifestForMeta(modelId, meta);
  const actualDigests: Record<string, { size: number; sha256: string }> = {};

  for (const spec of requiredFiles) {
    const fp = path.join(dir, spec.name);
    const manifestFile = manifest?.files.find((mf) => mf.name === spec.name);
    const expectedSha = spec.expectedSha256 || expectedFilesMap[spec.name]?.sha256 || manifestFile?.sha256;
    const expectedSize = spec.expectedSize || expectedFilesMap[spec.name]?.size || manifestFile?.size || 0;

    if (!expectedSha || !/^[a-f0-9]{64}$/i.test(expectedSha)) {
      return {
        isComplete: false,
        missingFiles: [`Missing SHA-256 digest in manifest for ${spec.name}`],
        totalSize: 0,
        integrity: {
          status: 'tampered',
          algorithm: 'sha256',
          reason: `Отсутствует эталонный SHA-256 для ${spec.name}`
        },
        provenance: meta?.provenance || { origin: 'official_auto', source: meta?.source }
      };
    }

    const st = fs.statSync(fp);
    if (expectedSize > 0 && st.size !== expectedSize) {
      return {
        isComplete: false,
        missingFiles: [`Size mismatch for ${spec.name} (${st.size} vs ${expectedSize})`],
        totalSize: 0,
        integrity: {
          status: 'tampered',
          algorithm: 'sha256',
          reason: `Нарушен размер файла ${spec.name} (${st.size} != ${expectedSize})`
        },
        provenance: meta?.provenance || { origin: 'official_auto', source: meta?.source }
      };
    }

    const actualSha = computeFileSha256Sync(fp, bypassCache);
    if (!actualSha || actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
      return {
        isComplete: false,
        missingFiles: [`SHA-256 mismatch for ${spec.name}`],
        totalSize: 0,
        integrity: {
          status: 'tampered',
          algorithm: 'sha256',
          reason: `Нарушена контрольная сумма SHA-256 для ${spec.name}`
        },
        provenance: meta?.provenance || { origin: 'official_auto', source: meta?.source }
      };
    }

    actualDigests[spec.name] = { size: st.size, sha256: actualSha };
  }

  const primaryDigest = Object.values(actualDigests)[0]?.sha256?.slice(0, 16);
  return {
    isComplete: true,
    missingFiles: [],
    totalSize,
    integrity: {
      status: 'verified',
      algorithm: 'sha256',
      verifiedAt: meta?.integrity?.verifiedAt || meta?.verifiedAt,
      runtimeValidated: meta?.integrity?.runtimeValidated,
      files: actualDigests
    },
    provenance: {
      origin: 'official_auto',
      source: meta?.provenance?.source || meta?.source || manifest?.source,
      repoUrl: meta?.provenance?.repoUrl || meta?.repoUrl || manifest?.sourceUrl,
      revision: meta?.provenance?.revision || meta?.revision || manifest?.revision,
      manifestId: meta?.provenance?.manifestId || meta?.manifestId || manifest?.manifestId,
      licenseUrl: meta?.provenance?.licenseUrl || meta?.licenseUrl || manifest?.licenseUrl,
      downloadedAt: meta?.provenance?.downloadedAt || meta?.downloadedAt,
      digestPrefix: meta?.provenance?.digestPrefix || primaryDigest
    }
  };
}
