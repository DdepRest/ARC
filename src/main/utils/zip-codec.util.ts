import * as zlib from 'zlib';

export interface ZipInputEntry {
  name: string;
  data: Buffer;
  mtime?: Date;
}

export interface ZipArchiveLimits {
  format: 'zip32';
  maxEntries: number;
  maxSingleFileBytes: number;
  maxTotalUncompressedBytes: number;
  maxArchiveBytes: number;
}

/**
 * Explicit resource bounds for A.R.C.'s built-in bounded ZIP32 backup writer & reader.
 * Streaming ZIP64 / a new external ZIP dependency is intentionally omitted because
 * backups exclude `models/` and `cache/` and contain only DB snapshots, configs, and macros.
 * Enforcing pre-read `lstat` bounds, entry caps, and CRC-32 validation prevents OOM
 * and silent ZIP32 overflow without adding third-party supply-chain dependencies.
 */
export const ZIP_ARCHIVE_LIMITS: Readonly<ZipArchiveLimits> = Object.freeze({
  format: 'zip32',
  maxEntries: 2000,
  maxSingleFileBytes: 256 * 1024 * 1024,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  maxArchiveBytes: 512 * 1024 * 1024
});

const ZIP32_MAX_UINT32 = 0xffffffff;
const ZIP32_MAX_UINT16 = 0xffff;

export function resolveZipLimits(overrides?: Partial<ZipArchiveLimits>): ZipArchiveLimits {
  if (!overrides) return { ...ZIP_ARCHIVE_LIMITS };
  return {
    format: 'zip32',
    maxEntries:
      typeof overrides.maxEntries === 'number' && overrides.maxEntries > 0
        ? Math.min(Math.floor(overrides.maxEntries), ZIP32_MAX_UINT16)
        : ZIP_ARCHIVE_LIMITS.maxEntries,
    maxSingleFileBytes:
      typeof overrides.maxSingleFileBytes === 'number' && overrides.maxSingleFileBytes > 0
        ? Math.min(Math.floor(overrides.maxSingleFileBytes), ZIP32_MAX_UINT32)
        : ZIP_ARCHIVE_LIMITS.maxSingleFileBytes,
    maxTotalUncompressedBytes:
      typeof overrides.maxTotalUncompressedBytes === 'number' && overrides.maxTotalUncompressedBytes > 0
        ? Math.min(Math.floor(overrides.maxTotalUncompressedBytes), ZIP32_MAX_UINT32)
        : ZIP_ARCHIVE_LIMITS.maxTotalUncompressedBytes,
    maxArchiveBytes:
      typeof overrides.maxArchiveBytes === 'number' && overrides.maxArchiveBytes > 0
        ? Math.min(Math.floor(overrides.maxArchiveBytes), ZIP32_MAX_UINT32)
        : ZIP_ARCHIVE_LIMITS.maxArchiveBytes
  };
}

export function assertEntryWithinLimits(
  entryName: string,
  fileSizeBytes: number,
  currentEntryCount: number,
  currentTotalBytes: number,
  limits: ZipArchiveLimits
): void {
  if (currentEntryCount + 1 > limits.maxEntries) {
    throw new Error(
      `Backup entry limit exceeded at "${entryName}" (limit: ${limits.maxEntries} entries)`
    );
  }
  if (fileSizeBytes > limits.maxSingleFileBytes) {
    throw new Error(
      `Backup file "${entryName}" exceeds single-file limit (${fileSizeBytes} > ${limits.maxSingleFileBytes} bytes)`
    );
  }
  if (currentTotalBytes + fileSizeBytes > limits.maxTotalUncompressedBytes) {
    throw new Error(
      `Backup total size limit exceeded at "${entryName}" (${currentTotalBytes + fileSizeBytes} > ${limits.maxTotalUncompressedBytes} bytes)`
    );
  }
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

export function createZipArchiveBuffer(
  entries: ZipInputEntry[],
  limitOverrides?: Partial<ZipArchiveLimits>
): Buffer {
  const limits = resolveZipLimits(limitOverrides);
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;
  let totalUncompressedBytes = 0;
  let writtenEntries = 0;

  for (const entry of entries) {
    const cleanName = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleanName) continue;

    if (writtenEntries + 1 > limits.maxEntries || writtenEntries + 1 > ZIP32_MAX_UINT16) {
      throw new Error(`ZIP entry limit exceeded (max: ${limits.maxEntries})`);
    }

    const nameBuf = Buffer.from(cleanName, 'utf8');
    if (nameBuf.length > ZIP32_MAX_UINT16) {
      throw new Error(`ZIP entry name exceeds 16-bit length limit: "${cleanName.slice(0, 64)}"`);
    }

    const rawData = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    if (rawData.length > limits.maxSingleFileBytes || rawData.length > ZIP32_MAX_UINT32) {
      throw new Error(
        `ZIP entry "${cleanName}" exceeds single-file limit (${rawData.length} > ${limits.maxSingleFileBytes} bytes)`
      );
    }
    if (
      totalUncompressedBytes + rawData.length > limits.maxTotalUncompressedBytes ||
      totalUncompressedBytes + rawData.length > ZIP32_MAX_UINT32
    ) {
      throw new Error(
        `ZIP total uncompressed size exceeds limit (${totalUncompressedBytes + rawData.length} > ${limits.maxTotalUncompressedBytes} bytes)`
      );
    }

    const crc = computeCrc32(rawData);
    const deflated = rawData.length > 0 ? zlib.deflateRawSync(rawData, { level: 6 }) : rawData;
    const useDeflate = deflated.length < rawData.length;
    const payload = useDeflate ? deflated : rawData;
    const method = useDeflate ? 8 : 0;
    const { dosTime, dosDate } = toDosTimeDate(entry.mtime);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const nextOffset = offset + localHeader.length + nameBuf.length + payload.length;
    if (nextOffset > ZIP32_MAX_UINT32 || nextOffset > limits.maxArchiveBytes) {
      throw new Error(`ZIP archive size limit exceeded (max: ${limits.maxArchiveBytes} bytes)`);
    }

    localChunks.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);
    offset = nextOffset;
    totalUncompressedBytes += rawData.length;
    writtenEntries += 1;
  }

  const centralDirBuf = Buffer.concat(centralChunks);
  const finalSize = offset + centralDirBuf.length + 22;
  if (finalSize > ZIP32_MAX_UINT32 || finalSize > limits.maxArchiveBytes) {
    throw new Error(`ZIP archive size limit exceeded (${finalSize} > ${limits.maxArchiveBytes} bytes)`);
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(writtenEntries, 8);
  eocd.writeUInt16LE(writtenEntries, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirBuf, eocd]);
}

export function readZipArchiveEntries(
  zipBuffer: Buffer,
  limitOverrides?: Partial<ZipArchiveLimits>
): Record<string, Buffer> {
  const limits = resolveZipLimits(limitOverrides);
  if (zipBuffer.length > limits.maxArchiveBytes) {
    throw new Error(
      `ZIP archive exceeds maximum allowed size (${zipBuffer.length} > ${limits.maxArchiveBytes} bytes)`
    );
  }

  const result: Record<string, Buffer> = {};
  let offset = 0;
  let entryCount = 0;
  let totalExpandedBytes = 0;

  while (offset + 4 <= zipBuffer.length) {
    const sig = zipBuffer.readUInt32LE(offset);
    if (sig === 0x02014b50 || sig === 0x06054b50) break;
    if (sig !== 0x04034b50) {
      throw new Error(`Invalid ZIP local header signature at offset ${offset}`);
    }
    if (offset + 30 > zipBuffer.length) {
      throw new Error(`Truncated ZIP local header at offset ${offset}`);
    }

    const flags = zipBuffer.readUInt16LE(offset + 6);
    if ((flags & 0x0008) !== 0) {
      throw new Error('ZIP entries with trailing data descriptors are not supported');
    }

    const method = zipBuffer.readUInt16LE(offset + 8);
    if (method !== 0 && method !== 8) {
      throw new Error(`Unsupported ZIP compression method: ${method}`);
    }

    const expectedCrc = zipBuffer.readUInt32LE(offset + 14);
    const compSize = zipBuffer.readUInt32LE(offset + 18);
    const uncompSize = zipBuffer.readUInt32LE(offset + 22);
    const nameLen = zipBuffer.readUInt16LE(offset + 26);
    const extraLen = zipBuffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compSize;

    if (nameStart + nameLen > zipBuffer.length || dataEnd > zipBuffer.length) {
      throw new Error(`Truncated ZIP entry payload at offset ${offset}`);
    }

    entryCount += 1;
    if (entryCount > limits.maxEntries) {
      throw new Error(`ZIP entry limit exceeded (max: ${limits.maxEntries})`);
    }
    if (uncompSize > limits.maxSingleFileBytes) {
      throw new Error(
        `ZIP entry uncompressed size exceeds limit (${uncompSize} > ${limits.maxSingleFileBytes} bytes)`
      );
    }
    if (totalExpandedBytes + uncompSize > limits.maxTotalUncompressedBytes) {
      throw new Error(
        `ZIP total expanded size exceeds limit (${totalExpandedBytes + uncompSize} > ${limits.maxTotalUncompressedBytes} bytes)`
      );
    }

    const fileName = zipBuffer.subarray(nameStart, nameStart + nameLen).toString('utf8');
    const payload = zipBuffer.subarray(dataStart, dataEnd);
    const extracted =
      method === 8
        ? zlib.inflateRawSync(payload, {
            maxOutputLength: Math.min(limits.maxSingleFileBytes, Math.max(uncompSize, 1))
          })
        : Buffer.from(payload);

    if (extracted.length !== uncompSize) {
      throw new Error(
        `ZIP entry "${fileName}" size mismatch (expected ${uncompSize}, got ${extracted.length})`
      );
    }
    const actualCrc = computeCrc32(extracted);
    if (actualCrc !== expectedCrc) {
      throw new Error(
        `ZIP entry "${fileName}" CRC-32 mismatch (expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)})`
      );
    }

    totalExpandedBytes += extracted.length;
    if (totalExpandedBytes > limits.maxTotalUncompressedBytes) {
      throw new Error(`ZIP total expanded size exceeds limit (${limits.maxTotalUncompressedBytes} bytes)`);
    }

    result[fileName] = extracted;
    offset = dataEnd;
  }

  return result;
}
