import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

export interface ZipInputEntry {
  name: string;
  data: Buffer;
  mtime?: Date;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeDate(date: Date = new Date()): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

export function createZipArchiveBuffer(entries: ZipInputEntry[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const cleanName = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleanName) continue;

    const nameBuf = Buffer.from(cleanName, 'utf8');
    const rawData = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = computeCrc32(rawData);
    const deflated = rawData.length > 0 ? zlib.deflateRawSync(rawData, { level: 6 }) : rawData;
    const useDeflate = deflated.length < rawData.length;
    const payload = useDeflate ? deflated : rawData;
    const method = useDeflate ? 8 : 0;
    const { dosTime, dosDate } = toDosTimeDate(entry.mtime);

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // Extra field length

    localChunks.push(localHeader, nameBuf, payload);

    // Central Directory File Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra length
    centralHeader.writeUInt16LE(0, 32); // Comment length
    centralHeader.writeUInt16LE(0, 34); // Disk start
    centralHeader.writeUInt16LE(0, 36); // Internal attrs
    centralHeader.writeUInt32LE(0, 38); // External attrs
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDirBuf = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirBuf, eocd]);
}

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

function sanitizeExportConfigBuffer(entryName: string, data: Buffer): Buffer {
  if (entryName.replace(/\\/g, '/').toLowerCase() !== 'config/ai-providers.json') {
    return data;
  }
  try {
    const parsed = JSON.parse(data.toString('utf8'));
    const scrubProvider = (item: any) => {
      if (!item || typeof item !== 'object') return item;
      const copy = { ...item };
      if ('apiKey' in copy) copy.apiKey = '';
      if ('secret' in copy) delete copy.secret;
      if ('token' in copy) delete copy.token;
      return copy;
    };
    const sanitized = Array.isArray(parsed) ? parsed.map(scrubProvider) : scrubProvider(parsed);
    return Buffer.from(JSON.stringify(sanitized, null, 2), 'utf8');
  } catch {
    return data;
  }
}

export async function collectDirectoryZipEntries(
  rootDir: string,
  zipPrefix: string,
  out: ZipInputEntry[] = []
): Promise<ZipInputEntry[]> {
  if (!fs.existsSync(rootDir)) return out;
  const items = await fs.promises.readdir(rootDir, { withFileTypes: true });
  for (const item of items) {
    if (item.isSymbolicLink()) continue;
    const fullPath = path.join(rootDir, item.name);
    const entryName = zipPrefix ? `${zipPrefix}/${item.name}` : item.name;
    if (isExcludedBackupEntry(entryName)) continue;
    if (item.isDirectory()) {
      await collectDirectoryZipEntries(fullPath, entryName, out);
    } else if (item.isFile()) {
      const stat = await fs.promises.stat(fullPath);
      const rawData = await fs.promises.readFile(fullPath);
      const data = sanitizeExportConfigBuffer(entryName, rawData);
      out.push({ name: entryName, data, mtime: stat.mtime });
    }
  }
  return out;
}

export function readZipArchiveEntries(zipBuffer: Buffer): Record<string, Buffer> {
  const result: Record<string, Buffer> = {};
  let offset = 0;
  while (offset + 30 <= zipBuffer.length) {
    const sig = zipBuffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = zipBuffer.readUInt16LE(offset + 8);
    const compSize = zipBuffer.readUInt32LE(offset + 18);
    const nameLen = zipBuffer.readUInt16LE(offset + 26);
    const extraLen = zipBuffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > zipBuffer.length) break;
    const fileName = zipBuffer.subarray(nameStart, nameStart + nameLen).toString('utf8');
    const payload = zipBuffer.subarray(dataStart, dataEnd);
    result[fileName] = method === 8 ? zlib.inflateRawSync(payload) : Buffer.from(payload);
    offset = dataEnd;
  }
  return result;
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
}): Promise<{ buffer: Buffer; entriesCount: number }> {
  const { dataDir, appVersion, dbSnapshot } = params;
  const entries: ZipInputEntry[] = [];
  const seenNames = new Set<string>();
  const pushUnique = (entry: ZipInputEntry) => {
    if (isExcludedBackupEntry(entry.name)) return;
    if (!seenNames.has(entry.name)) {
      seenNames.add(entry.name);
      entries.push(entry);
    }
  };

  // Add verified consistent database snapshot (never live open .db/-wal/-shm files)
  const snapStat = await fs.promises.stat(dbSnapshot.snapshotFilePath);
  const snapData = await fs.promises.readFile(dbSnapshot.snapshotFilePath);
  pushUnique({ name: dbSnapshot.zipEntryName, data: snapData, mtime: snapStat.mtime });

  for (const folder of ['config', 'macros'] as const) {
    const collected = await collectDirectoryZipEntries(path.join(dataDir, folder), folder);
    collected.forEach(pushUnique);
  }

  const perfCfgPath = path.join(dataDir, 'arc-performance-settings.json');
  if (fs.existsSync(perfCfgPath)) {
    try {
      const stat = await fs.promises.stat(perfCfgPath);
      const data = await fs.promises.readFile(perfCfgPath);
      pushUnique({ name: 'config/arc-performance-settings.json', data, mtime: stat.mtime });
    } catch {
      // ignore
    }
  }

  pushUnique({
    name: 'manifest.json',
    data: Buffer.from(
      JSON.stringify(
        {
          schemaVersion: 2,
          exportedAt: new Date().toISOString(),
          appVersion,
          database: dbSnapshot.metadata,
          secretsIncluded: false,
          secretsExcludedReason: SECRETS_EXCLUDED_REASON,
          includedEntries: entries.map((e) => e.name)
        },
        null,
        2
      ),
      'utf8'
    )
  });

  return {
    buffer: createZipArchiveBuffer(entries),
    entriesCount: entries.length
  };
}


