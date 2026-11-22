import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import BetterSqlite3 from 'better-sqlite3';

import { sanitizeExportConfigBuffer } from './backup-redaction.util';
import {
  ZIP_ARCHIVE_LIMITS,
  buildDataBackupZipBuffer,
  collectDirectoryZipEntries,
  createZipArchiveBuffer,
  readZipArchiveEntries
} from './zip-writer';

describe('S3-07: Fail-Closed Backup Config Redaction & Bounded ZIP Writer/Reader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-zip-s307-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1. Sanitizes valid provider JSON array while keeping non-secret provider metadata intact', () => {
    const rawKey = 'sk-proj-VALID-PROVIDER-KEY-123456';
    const input = JSON.stringify([
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'cloud',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        apiKey: rawKey,
        hasApiKey: true,
        noAuthHeader: false,
        maxTokens: 4096,
        temperature: 0.5,
        enabled: true
      }
    ]);

    const outcome = sanitizeExportConfigBuffer('config/ai-providers.json', Buffer.from(input, 'utf8'));
    expect(outcome.status).toBe('sanitized');
    expect(outcome.warning).toBeUndefined();
    expect(outcome.buffer.toString('utf8')).not.toContain(rawKey);

    const parsed = JSON.parse(outcome.buffer.toString('utf8'));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: 'openai',
      name: 'OpenAI',
      apiKey: '',
      hasApiKey: false,
      noAuthHeader: false,
      maxTokens: 4096,
      temperature: 0.5,
      enabled: true
    });
  });

  it('2. Fails closed with redacted placeholder on malformed/truncated provider JSON containing raw API keys', async () => {
    const leakedKey = 'sk-proj-TRUNCATED-RAW-KEY-987654321';
    const truncatedJson = `[{"id":"openai","apiKey":"${leakedKey}","endpoint":"https://api.openai.com"`;

    const outcome = sanitizeExportConfigBuffer(
      'config/ai-providers.json',
      Buffer.from(truncatedJson, 'utf8')
    );
    expect(outcome.status).toBe('replaced_with_placeholder');
    expect(outcome.warning).toMatchObject({
      entry: 'config/ai-providers.json',
      code: 'INVALID_JSON',
      originalSizeBytes: Buffer.byteLength(truncatedJson, 'utf8')
    });

    const placeholder = JSON.parse(outcome.buffer.toString('utf8'));
    expect(placeholder).toMatchObject({
      redacted: true,
      failClosed: true,
      entry: 'config/ai-providers.json',
      reasonCode: 'INVALID_JSON'
    });
    expect(outcome.buffer.toString('utf8')).not.toContain(leakedKey);
    expect(outcome.buffer.toString('utf8')).not.toContain('api.openai.com');

    // End-to-end backup build with SQLite snapshot + malformed ai-providers.json
    const dataDir = path.join(tmpDir, 'data');
    const cfgDir = path.join(dataDir, 'config');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'ai-providers.json'), truncatedJson, 'utf8');

    const dbPath = path.join(tmpDir, 'snap.db');
    const db = new BetterSqlite3(dbPath);
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, val TEXT); INSERT INTO t VALUES ('1', 'ok');");
    db.close();

    const { buffer } = await buildDataBackupZipBuffer({
      dataDir,
      appVersion: '1.0.12-test',
      dbSnapshot: {
        snapshotFilePath: dbPath,
        zipEntryName: 'database/arc.db',
        metadata: {
          engine: 'sqlite',
          mode: 'NORMAL',
          storageStatus: 'PERSISTENT_SQLITE',
          isSafeMode: false,
          format: 'sqlite',
          snapshotEntry: 'database/arc.db',
          integrityVerified: true
        }
      }
    });

    const entries = readZipArchiveEntries(buffer);
    for (const [entryName, entryBuf] of Object.entries(entries)) {
      expect(entryBuf.toString('utf8'), `Leaked into ${entryName}`).not.toContain(leakedKey);
    }

    const exportedConfig = JSON.parse(entries['config/ai-providers.json'].toString('utf8'));
    expect(exportedConfig.redacted).toBe(true);
    expect(exportedConfig.failClosed).toBe(true);

    const manifest = JSON.parse(entries['manifest.json'].toString('utf8'));
    expect(manifest.redaction.mode).toBe('fail_closed');
    expect(manifest.redaction.placeholderEntries).toContain('config/ai-providers.json');
    expect(manifest.redaction.warnings[0]).toMatchObject({
      entry: 'config/ai-providers.json',
      code: 'INVALID_JSON'
    });
    expect(manifest.limits.format).toBe('zip32');
    expect(entries['database/arc.db']).toBeDefined();

    // Extracted SQLite snapshot remains valid
    const restoredDbPath = path.join(tmpDir, 'restored.db');
    fs.writeFileSync(restoredDbPath, entries['database/arc.db']);
    const restoredDb = new BetterSqlite3(restoredDbPath, { readonly: true });
    try {
      expect(restoredDb.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      expect(restoredDb.prepare('SELECT val FROM t WHERE id = ?').get('1')).toEqual({ val: 'ok' });
    } finally {
      restoredDb.close();
    }
  });

  it('3. Scrubs alternate secret fields, nested objects, arrays, headers, URL credentials, and deep-nesting bombs', () => {
    const nestedSecrets = [
      'SECRET_A',
      'TOKEN_B',
      'ACCESS_C',
      'REFRESH_D',
      'CLIENT_SEC_E',
      'X_API_KEY_F',
      'BEARER_G',
      'PRIVATE_KEY_H',
      'PASS_I',
      'URL_PASS_J',
      'QUERY_KEY_K',
      'ARRAY_SECRET_L'
    ];

    const payload = {
      profiles: [
        {
          id: 'custom',
          maxTokens: 8192,
          apiKey: nestedSecrets[0],
          secret: nestedSecrets[1],
          token: nestedSecrets[2],
          credentials: {
            accessToken: nestedSecrets[3],
            refresh_token: nestedSecrets[4],
            clientSecret: nestedSecrets[5],
            password: nestedSecrets[8],
            privateKey: nestedSecrets[7]
          },
          headers: {
            'X-Api-Key': nestedSecrets[6],
            Authorization: `Bearer ${nestedSecrets[6]}`,
            'Content-Type': 'application/json'
          },
          endpoint: `https://user:${nestedSecrets[9]}@proxy.internal/v1?api_key=${nestedSecrets[10]}&model=gpt`,
          backupKeys: [`sk-proj-${nestedSecrets[11]}`, `enc:${nestedSecrets[11]}`]
        }
      ]
    };

    const outcome = sanitizeExportConfigBuffer(
      'config/ai-providers.json',
      Buffer.from(JSON.stringify(payload), 'utf8')
    );
    expect(outcome.status).toBe('sanitized');

    const text = outcome.buffer.toString('utf8');
    for (const secret of nestedSecrets) {
      expect(text, `Nested secret "${secret}" leaked`).not.toContain(secret);
    }

    const sanitized = JSON.parse(text);
    expect(sanitized.profiles[0].maxTokens).toBe(8192);
    expect(sanitized.profiles[0].apiKey).toBe('');
    expect(sanitized.profiles[0].headers['Content-Type']).toBe('application/json');
    expect(sanitized.profiles[0].headers.Authorization).toBeUndefined();
    expect(sanitized.profiles[0].endpoint).toContain('https://proxy.internal/v1');
    expect(sanitized.profiles[0].endpoint).toContain('api_key=REDACTED');

    // Top-level primitive or excessive depth (> 32) also fails closed
    const primitiveOutcome = sanitizeExportConfigBuffer(
      'config/ai-providers.json',
      Buffer.from('"sk-proj-primitive-leak-123456"', 'utf8')
    );
    expect(primitiveOutcome.status).toBe('replaced_with_placeholder');
    expect(primitiveOutcome.warning?.code).toBe('INVALID_STRUCTURE');

    let deepObj: any = { apiKey: 'sk-deep-secret' };
    for (let i = 0; i < 40; i++) {
      deepObj = { nested: deepObj };
    }
    const deepOutcome = sanitizeExportConfigBuffer(
      'config/ai-providers.json',
      Buffer.from(JSON.stringify(deepObj), 'utf8')
    );
    expect(deepOutcome.status).toBe('replaced_with_placeholder');
    expect(deepOutcome.warning?.code).toBe('DEPTH_LIMIT_EXCEEDED');
    expect(deepOutcome.buffer.toString('utf8')).not.toContain('sk-deep-secret');
  });

  it('4. Rejects huge files pre-read (without allocating buffer into RAM) and rejects oversized archive writes/reads', async () => {
    const cfgDir = path.join(tmpDir, 'config');
    fs.mkdirSync(cfgDir, { recursive: true });
    const hugePath = path.join(cfgDir, 'large.json');
    fs.writeFileSync(hugePath, Buffer.alloc(2048, 0x41));

    const readSpy = vi.spyOn(fs.promises, 'readFile');
    await expect(
      collectDirectoryZipEntries(cfgDir, 'config', [], {
        limits: { maxSingleFileBytes: 1024 }
      })
    ).rejects.toThrow(/exceeds single-file limit/i);
    expect(readSpy).not.toHaveBeenCalled();

    expect(() =>
      createZipArchiveBuffer(
        [{ name: 'config/big.bin', data: Buffer.alloc(1024, 0x42) }],
        { maxSingleFileBytes: 512 }
      )
    ).toThrow(/exceeds single-file limit/i);

    const validArchive = createZipArchiveBuffer([
      { name: 'config/item.bin', data: Buffer.alloc(512, 0x43) }
    ]);
    expect(() =>
      readZipArchiveEntries(validArchive, { maxSingleFileBytes: 256 })
    ).toThrow(/exceeds limit/i);
  });

  it('5. Rejects archives exceeding maxEntries limit in directory collection, writer, and reader', async () => {
    const cfgDir = path.join(tmpDir, 'config');
    fs.mkdirSync(cfgDir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(cfgDir, `f-${i}.json`), `{"i":${i}}`);
    }

    await expect(
      collectDirectoryZipEntries(cfgDir, 'config', [], {
        limits: { maxEntries: 3 }
      })
    ).rejects.toThrow(/entry limit exceeded/i);

    const manyEntries = Array.from({ length: 4 }, (_, i) => ({
      name: `config/${i}.txt`,
      data: Buffer.from(`item-${i}`)
    }));
    expect(() => createZipArchiveBuffer(manyEntries, { maxEntries: 3 })).toThrow(/entry limit exceeded/i);

    const archive = createZipArchiveBuffer(manyEntries);
    expect(() => readZipArchiveEntries(archive, { maxEntries: 3 })).toThrow(/entry limit exceeded/i);
  });

  it('6. Skips symlinks to files, directories, and root performance config during backup assembly', async () => {
    const dataDir = path.join(tmpDir, 'data-sym');
    const cfgDir = path.join(dataDir, 'config');
    const externalDir = path.join(tmpDir, 'outside');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.mkdirSync(externalDir, { recursive: true });

    const outsideSecretFile = path.join(externalDir, 'secret-target.txt');
    fs.writeFileSync(outsideSecretFile, 'SYMLINK_ESCAPE_SECRET', 'utf8');
    fs.writeFileSync(path.join(cfgDir, 'normal.json'), '{"ok":true}', 'utf8');

    const dbPath = path.join(tmpDir, 'sym-snap.db');
    const db = new BetterSqlite3(dbPath);
    db.exec('CREATE TABLE t (id TEXT);');
    db.close();

    try {
      fs.symlinkSync(outsideSecretFile, path.join(cfgDir, 'escaped-file.json'));
      fs.symlinkSync(externalDir, path.join(cfgDir, 'escaped-dir'));
      fs.symlinkSync(outsideSecretFile, path.join(dataDir, 'arc-performance-settings.json'));
    } catch {
      // If environment forbids creating symlinks, skip symlink assertions gracefully
      return;
    }

    const { buffer } = await buildDataBackupZipBuffer({
      dataDir,
      appVersion: '1.0.12-test',
      dbSnapshot: {
        snapshotFilePath: dbPath,
        zipEntryName: 'database/arc.db',
        metadata: {
          engine: 'sqlite',
          mode: 'NORMAL',
          storageStatus: 'PERSISTENT_SQLITE',
          isSafeMode: false,
          format: 'sqlite',
          snapshotEntry: 'database/arc.db',
          integrityVerified: true
        }
      }
    });

    const entries = readZipArchiveEntries(buffer);
    expect(entries['config/normal.json']).toBeDefined();
    expect(entries['config/escaped-file.json']).toBeUndefined();
    expect(entries['config/escaped-dir/secret-target.txt']).toBeUndefined();
    expect(entries['config/arc-performance-settings.json']).toBeUndefined();
  });

  it('7. Verifies CRC-32 on ZIP read, rejects tampered payload, and documents default limits', () => {
    expect(ZIP_ARCHIVE_LIMITS).toMatchObject({
      format: 'zip32',
      maxEntries: 2000,
      maxSingleFileBytes: 256 * 1024 * 1024,
      maxTotalUncompressedBytes: 512 * 1024 * 1024,
      maxArchiveBytes: 512 * 1024 * 1024
    });

    // Use store-friendly incompressible 4-byte payload and flip a byte after creation
    const archive = createZipArchiveBuffer([{ name: 'config/plain.txt', data: Buffer.from('ABCD') }]);
    const tampered = Buffer.from(archive);
    const abcdIdx = tampered.indexOf(Buffer.from('ABCD'));
    expect(abcdIdx).toBeGreaterThan(0);
    tampered[abcdIdx] = 'X'.charCodeAt(0);

    expect(() => readZipArchiveEntries(tampered)).toThrow(/CRC-32 mismatch/i);

    // ZIP-bomb guard: deflated payload expands beyond header-declared uncompSize
    const bombArchive = createZipArchiveBuffer([
      { name: 'config/bomb.txt', data: Buffer.alloc(4096, 0x41) }
    ]);
    const forgedBomb = Buffer.from(bombArchive);
    forgedBomb.writeUInt32LE(16, 22); // Forge header uncompSize to 16 bytes
    expect(() => readZipArchiveEntries(forgedBomb)).toThrow(/buffer|size|limit|ERR_BUFFER_TOO_LARGE/i);
  });
});
