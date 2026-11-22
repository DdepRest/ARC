import * as fs from 'fs';
import * as path from 'path';
import {
  sanitizeExportConfigBuffer,
  type ConfigRedactionOutcome,
  type RedactionWarning
} from './backup-redaction.util';
import {
  ZIP_ARCHIVE_LIMITS,
  assertEntryWithinLimits,
  computeCrc32,
  createZipArchiveBuffer,
  readZipArchiveEntries,
  resolveZipLimits,
  type ZipArchiveLimits,
  type ZipInputEntry
} from './zip-codec.util';

export {
  ZIP_ARCHIVE_LIMITS,
  computeCrc32,
  createZipArchiveBuffer,
  readZipArchiveEntries,
  resolveZipLimits,
  type ZipArchiveLimits,
  type ZipInputEntry
};

const EXCLUDED_SECRET_FILES = new Set([
  'secrets.json',
  'secure-keys.json'
]);

export const SECRETS_EXCLUDED_REASON =
  'Secret Vault (secrets.json, secure-keys.json) and API keys encrypted via OS DPAPI/safeStorage are excluded for security and cross-device portability; re-enter API keys after restore.';

export function isExcludedBackupEntry(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/').toLowerCase();
  const baseName = path.posix.basename(normalized);
  if (EXCLUDED_SECRET_FILES.has(baseName)) return true;
  if (
    baseName.endsWith('.tmp') ||
    baseName.includes('.quarantine-staging') ||
    baseName === '.env' ||
    baseName.startsWith('.env.') ||
    baseName.endsWith('.key') ||
    baseName.endsWith('.pem') ||
    baseName.endsWith('.p12') ||
    baseName.endsWith('.pfx')
  ) {
    return true;
  }
  return false;
}

export interface CollectDirectoryZipOptions {
  limits?: Partial<ZipArchiveLimits>;
  baseEntryCount?: number;
  baseTotalBytes?: number;
  onRedaction?: (entryName: string, outcome: ConfigRedactionOutcome) => void;
}

export async function collectDirectoryZipEntries(
  rootDir: string,
  zipPrefix: string,
  out: ZipInputEntry[] = [],
  options?: CollectDirectoryZipOptions
): Promise<ZipInputEntry[]> {
  if (!fs.existsSync(rootDir)) return out;
  const rootStat = await fs.promises.lstat(rootDir);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return out;

  const limits = resolveZipLimits(options?.limits);
  const baseEntryCount = options?.baseEntryCount ?? 0;
  const baseTotalBytes = options?.baseTotalBytes ?? 0;
  const items = await fs.promises.readdir(rootDir, { withFileTypes: true });

  for (const item of items) {
    if (item.isSymbolicLink()) continue;
    const fullPath = path.join(rootDir, item.name);
    const entryName = zipPrefix ? `${zipPrefix}/${item.name}` : item.name;
    if (isExcludedBackupEntry(entryName)) continue;

    const stat = await fs.promises.lstat(fullPath);
    if (stat.isSymbolicLink()) continue;

    if (stat.isDirectory()) {
      await collectDirectoryZipEntries(fullPath, entryName, out, options);
    } else if (stat.isFile()) {
      const currentBytes = baseTotalBytes + out.reduce((sum, entry) => sum + entry.data.length, 0);
      assertEntryWithinLimits(
        entryName,
        stat.size,
        baseEntryCount + out.length,
        currentBytes,
        limits
      );

      const rawData = await fs.promises.readFile(fullPath);
      const redaction = sanitizeExportConfigBuffer(entryName, rawData);
      options?.onRedaction?.(entryName, redaction);

      assertEntryWithinLimits(
        entryName,
        redaction.buffer.length,
        baseEntryCount + out.length,
        currentBytes,
        limits
      );
      out.push({ name: entryName, data: redaction.buffer, mtime: stat.mtime });
    }
  }
  return out;
}

export interface BackupDatabaseManifestMeta {
  engine: string;
  mode: string;
  storageStatus: string;
  isSafeMode: boolean;
  format: 'sqlite' | 'json';
  snapshotEntry: string;
  integrityVerified: boolean;
}

export async function buildDataBackupZipBuffer(params: {
  dataDir: string;
  appVersion: string;
  dbSnapshot: {
    snapshotFilePath: string;
    zipEntryName: string;
    metadata: BackupDatabaseManifestMeta;
  };
  limits?: Partial<ZipArchiveLimits>;
}): Promise<{ buffer: Buffer; entriesCount: number }> {
  const { dataDir, appVersion, dbSnapshot, limits: limitOverrides } = params;
  const limits = resolveZipLimits(limitOverrides);
  const entries: ZipInputEntry[] = [];
  const seenNames = new Set<string>();
  const sanitizedEntries: string[] = [];
  const placeholderEntries: string[] = [];
  const redactionWarnings: RedactionWarning[] = [];
  let totalUncompressedBytes = 0;

  const pushUnique = (entry: ZipInputEntry) => {
    if (isExcludedBackupEntry(entry.name)) return;
    if (!seenNames.has(entry.name)) {
      assertEntryWithinLimits(
        entry.name,
        entry.data.length,
        entries.length,
        totalUncompressedBytes,
        limits
      );
      seenNames.add(entry.name);
      entries.push(entry);
      totalUncompressedBytes += entry.data.length;
    }
  };

  const trackRedaction = (entryName: string, outcome: ConfigRedactionOutcome) => {
    if (outcome.status === 'sanitized') {
      sanitizedEntries.push(entryName);
    } else if (outcome.status === 'replaced_with_placeholder') {
      placeholderEntries.push(entryName);
      if (outcome.warning) redactionWarnings.push(outcome.warning);
    }
  };

  const snapStat = await fs.promises.lstat(dbSnapshot.snapshotFilePath);
  if (snapStat.isSymbolicLink() || !snapStat.isFile()) {
    throw new Error('Database snapshot path must be a regular file');
  }
  assertEntryWithinLimits(
    dbSnapshot.zipEntryName,
    snapStat.size,
    entries.length,
    totalUncompressedBytes,
    limits
  );
  const snapData = await fs.promises.readFile(dbSnapshot.snapshotFilePath);
  pushUnique({ name: dbSnapshot.zipEntryName, data: snapData, mtime: snapStat.mtime });

  for (const folder of ['config', 'macros'] as const) {
    const collected = await collectDirectoryZipEntries(path.join(dataDir, folder), folder, [], {
      limits,
      baseEntryCount: entries.length,
      baseTotalBytes: totalUncompressedBytes,
      onRedaction: trackRedaction
    });
    collected.forEach(pushUnique);
  }

  const perfCfgPath = path.join(dataDir, 'arc-performance-settings.json');
  if (fs.existsSync(perfCfgPath)) {
    const stat = await fs.promises.lstat(perfCfgPath);
    if (!stat.isSymbolicLink() && stat.isFile()) {
      assertEntryWithinLimits(
        'config/arc-performance-settings.json',
        stat.size,
        entries.length,
        totalUncompressedBytes,
        limits
      );
      const data = await fs.promises.readFile(perfCfgPath);
      pushUnique({ name: 'config/arc-performance-settings.json', data, mtime: stat.mtime });
    }
  }

  const manifestData = Buffer.from(
    JSON.stringify(
      {
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        appVersion,
        database: dbSnapshot.metadata,
        secretsIncluded: false,
        secretsExcludedReason: SECRETS_EXCLUDED_REASON,
        redaction: {
          mode: 'fail_closed',
          sanitizedEntries,
          placeholderEntries,
          warnings: redactionWarnings
        },
        limits: {
          format: limits.format,
          maxEntries: limits.maxEntries,
          maxSingleFileBytes: limits.maxSingleFileBytes,
          maxTotalUncompressedBytes: limits.maxTotalUncompressedBytes,
          maxArchiveBytes: limits.maxArchiveBytes,
          actualEntries: entries.length + 1,
          actualUncompressedBytes: totalUncompressedBytes
        },
        includedEntries: entries.map((e) => e.name)
      },
      null,
      2
    ),
    'utf8'
  );
  pushUnique({ name: 'manifest.json', data: manifestData });

  return {
    buffer: createZipArchiveBuffer(entries, limits),
    entriesCount: entries.length
  };
}
