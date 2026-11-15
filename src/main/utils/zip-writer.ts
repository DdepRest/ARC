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
    if (item.isDirectory()) {
      await collectDirectoryZipEntries(fullPath, entryName, out);
    } else if (item.isFile()) {
      if (item.name.endsWith('.tmp')) continue;
      const stat = await fs.promises.stat(fullPath);
      const data = await fs.promises.readFile(fullPath);
      out.push({ name: entryName, data, mtime: stat.mtime });
    }
  }
  return out;
}

export async function buildDataBackupZipBuffer(params: {
  dataDir: string;
  externalDbPaths: string[];
  appVersion: string;
}): Promise<{ buffer: Buffer; entriesCount: number }> {
  const { dataDir, externalDbPaths, appVersion } = params;
  const entries: ZipInputEntry[] = [];
  const seenNames = new Set<string>();
  const pushUnique = (entry: ZipInputEntry) => {
    if (!seenNames.has(entry.name)) {
      seenNames.add(entry.name);
      entries.push(entry);
    }
  };

  for (const folder of ['database', 'config', 'macros'] as const) {
    const collected = await collectDirectoryZipEntries(path.join(dataDir, folder), folder);
    collected.forEach(pushUnique);
  }

  for (const extraPath of externalDbPaths) {
    try {
      const stat = await fs.promises.stat(extraPath);
      const data = await fs.promises.readFile(extraPath);
      pushUnique({ name: `database/root/${path.basename(extraPath)}`, data, mtime: stat.mtime });
    } catch {
      // ignore unreadable optional file
    }
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
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          appVersion,
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

