import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CacheService } from './cache.service';

describe('CacheService — P0/P1 Stability, Security & Telemetry', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-cache-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      if (fs.existsSync(tmpRoot)) {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    } catch {}
  });

  it('1. instantiating CacheService or importing cache.service does NOT perform filesystem operations', () => {
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync');
    const readSpy = vi.spyOn(fs, 'readFileSync');
    const nonExistentDir = path.join(tmpRoot, 'should-not-be-created-on-construct');

    const svc = new CacheService(nonExistentDir);
    expect(svc).toBeDefined();
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(readSpy).not.toHaveBeenCalled();
    expect(fs.existsSync(nonExistentDir)).toBe(false);
  });

  it('2. works properly with a valid temporary directory on lazy initialization', () => {
    const cacheDir = path.join(tmpRoot, 'audio-cache');
    const svc = new CacheService(cacheDir);
    const sampleWav = path.join(tmpRoot, 'sample.wav');
    fs.writeFileSync(sampleWav, Buffer.alloc(1024, 0x41));

    const key = svc.generateKey(553, 'base', 'Привет, мир', 1.0, 0);
    expect(svc.get(key)).toBeNull();
    expect(svc.getStats().misses).toBe(1);

    svc.put(key, sampleWav, false);
    const cachedPath = svc.get(key);
    expect(cachedPath).toBeTruthy();
    expect(fs.existsSync(cachedPath!)).toBe(true);

    const stats = svc.getStats();
    expect(stats.entries).toBe(1);
    expect(stats.sizeBytes).toBe(1024);
    expect(stats.hits).toBe(2); // 1 initial on put + 1 on get
    expect(stats.misses).toBe(1);
  });

  it('3. degrades gracefully without throwing when mkdirSync fails (e.g. EACCES) and recovers once accessible', () => {
    const cacheDir = path.join(tmpRoot, 'restricted-cache');
    const svc = new CacheService(cacheDir);
    const sampleWav = path.join(tmpRoot, 'sample.wav');
    fs.writeFileSync(sampleWav, Buffer.alloc(512, 0x42));

    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      const err: any = new Error("EACCES: permission denied, mkdir '/mock/app/userdata/audio-cache'");
      err.code = 'EACCES';
      throw err;
    });

    const key = svc.generateKey(553, 'base', 'Тест отказа ФС', 1.0, 0);
    expect(() => svc.get(key)).not.toThrow();
    expect(svc.get(key)).toBeNull();
    expect(svc.isAvailable()).toBe(false);

    // Restore mkdirSync so directory becomes accessible
    mkdirSpy.mockRestore();

    expect(() => svc.put(key, sampleWav, false)).not.toThrow();
    expect(svc.isAvailable()).toBe(true);
    expect(svc.get(key)).toBeTruthy();
  });

  it('4. does not crash when saveIndex fails to write to disk', () => {
    const cacheDir = path.join(tmpRoot, 'save-fail-cache');
    const svc = new CacheService(cacheDir);
    const sampleWav = path.join(tmpRoot, 'sample.wav');
    fs.writeFileSync(sampleWav, Buffer.alloc(256, 0x43));

    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('EROFS: read-only file system');
    });

    const key = svc.generateKey(553, 'base', 'Проверка ошибки записи индекса', 1.0, 0);
    expect(() => svc.put(key, sampleWav, false)).not.toThrow();
  });

  it('5. blocks path traversal in poisoned index.json and never deletes external files on evict or loadIndex', () => {
    const cacheDir = path.join(tmpRoot, 'secure-cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    const externalImportantFile = path.join(tmpRoot, 'important-user-data.wav');
    fs.writeFileSync(externalImportantFile, 'DO_NOT_DELETE_ME', 'utf8');

    const validInternalFile = path.join(cacheDir, 'sha256-valid123.wav');
    fs.writeFileSync(validInternalFile, Buffer.alloc(128, 0x55));

    // Poison index.json with path traversal entries
    const poisonedIndex = {
      poisonedAbsolute: {
        path: externalImportantFile,
        hitCount: 1,
        lastAccessMs: 1, // expired so TTL would try to evict it
        sizeBytes: 16,
        isSpeedTier: false
      },
      poisonedRelative: {
        path: path.join(cacheDir, '..', 'important-user-data.wav'),
        hitCount: 1,
        lastAccessMs: 1,
        sizeBytes: 16,
        isSpeedTier: false
      },
      malformedEntry: {
        path: 12345,
        hitCount: 'invalid',
        lastAccessMs: null,
        sizeBytes: -100,
        isSpeedTier: 'yes'
      },
      validKey: {
        path: validInternalFile,
        hitCount: 3,
        lastAccessMs: Date.now(),
        sizeBytes: 128,
        isSpeedTier: false
      }
    };

    fs.writeFileSync(path.join(cacheDir, 'index.json'), JSON.stringify(poisonedIndex), 'utf8');

    const svc = new CacheService(cacheDir);
    const stats = svc.getStats();

    // External file MUST still exist untouched
    expect(fs.existsSync(externalImportantFile)).toBe(true);
    expect(fs.readFileSync(externalImportantFile, 'utf8')).toBe('DO_NOT_DELETE_ME');

    // Only the 1 valid internal entry remains in index
    expect(stats.entries).toBe(1);
    expect(svc.get('poisonedAbsolute')).toBeNull();
    expect(svc.get('poisonedRelative')).toBeNull();
    expect(svc.get('validKey')).toBe(validInternalFile);
  });

  it('6. classifies only whitelisted system phrases as Speed Tier and enforces Speed Tier reserve & total cap on bulk short phrases', () => {
    const cacheDir = path.join(tmpRoot, 'speed-tier-cache');
    const svc = new CacheService({
      cacheDir,
      maxBytes: 10 * 1024, // 10 KB total cap
      maxSpeedTierBytes: 3 * 1024, // 3 KB speed tier reserve
      maxRamEntries: 8,
      maxSpeedTierEntries: 3
    });

    // Whitelisted system phrases are Speed Tier
    expect(svc.isSpeedTier('Слушаю.')).toBe(true);
    expect(svc.isSpeedTier('Жду указаний.')).toBe(true);

    // Arbitrary short user phrases (< 40 chars) are NOT Speed Tier
    expect(svc.isSpeedTier('Какая погода завтра?')).toBe(false);
    expect(svc.isSpeedTier('Короткая фраза 123')).toBe(false);

    const sampleWav = path.join(tmpRoot, 'chunk.wav');
    fs.writeFileSync(sampleWav, Buffer.alloc(1024, 0x33)); // 1 KB each

    // Insert 25 arbitrary short phrases — must not bypass eviction
    for (let i = 0; i < 25; i++) {
      const phrase = `Короткий текст #${i}`;
      const isSpeed = svc.isSpeedTier(phrase);
      expect(isSpeed).toBe(false);
      svc.put(`short_${i}`, sampleWav, isSpeed);
    }

    // Also insert 6 forced speed-tier entries (6 KB > 3 KB speed reserve)
    for (let i = 0; i < 6; i++) {
      svc.put(`speed_${i}`, sampleWav, true);
    }

    const stats = svc.getStats();
    expect(stats.sizeBytes).toBeLessThanOrEqual(10 * 1024);
    expect(stats.entries).toBeLessThanOrEqual(8 + 3);
    expect(stats.evictions).toBeGreaterThan(15);
  });

  it('7. tracks accurate hits, misses, evictions, sizeBytes, and resets cleanly on clear()', () => {
    const cacheDir = path.join(tmpRoot, 'telemetry-cache');
    const svc = new CacheService({
      cacheDir,
      maxBytes: 2048,
      maxRamEntries: 2
    });

    const sampleWav = path.join(tmpRoot, 'audio.wav');
    fs.writeFileSync(sampleWav, Buffer.alloc(600, 0x77));

    expect(svc.get('missing_1')).toBeNull();
    expect(svc.get('missing_2')).toBeNull();
    expect(svc.getStats().misses).toBe(2);

    svc.put('k1', sampleWav, false);
    svc.put('k2', sampleWav, false);
    expect(svc.get('k1')).toBeTruthy(); // hitCount becomes 2

    // Adding k3 exceeds maxRamEntries=2 -> evicts 1 entry (k2 since k1 has higher hitCount)
    svc.put('k3', sampleWav, false);

    const statsBeforeClear = svc.getStats();
    expect(statsBeforeClear.entries).toBe(2);
    expect(statsBeforeClear.sizeBytes).toBe(1200);
    expect(statsBeforeClear.evictions).toBe(1);
    expect(statsBeforeClear.misses).toBe(2);
    expect(statsBeforeClear.hits).toBe(3); // k1 (2) + k3 (1)

    const cleared = svc.clear();
    expect(cleared.clearedFiles).toBe(2);
    expect(cleared.freedBytes).toBe(1200);

    const statsAfterClear = svc.getStats();
    expect(statsAfterClear).toEqual({
      entries: 0,
      sizeBytes: 0,
      hits: 0,
      misses: 0,
      evictions: 0
    });
  });

  it('8. rejects symbolic links inside cacheDir pointing to external files and recovers cleanly from corrupted index.json', () => {
    const cacheDir = path.join(tmpRoot, 'symlink-and-recovery-cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    const externalTarget = path.join(tmpRoot, 'external-secret-audio.wav');
    fs.writeFileSync(externalTarget, 'EXTERNAL_SECRET_DATA', 'utf8');

    const symlinkInCache = path.join(cacheDir, 'sha256-evil-symlink.wav');
    fs.symlinkSync(externalTarget, symlinkInCache);

    // Poison index.json with the symlink path inside cacheDir
    const symlinkIndex = {
      symlinkKey: {
        path: symlinkInCache,
        hitCount: 1,
        lastAccessMs: 1, // expired to trigger eviction attempt
        sizeBytes: 20,
        isSpeedTier: false
      }
    };
    fs.writeFileSync(path.join(cacheDir, 'index.json'), JSON.stringify(symlinkIndex), 'utf8');

    const svc = new CacheService(cacheDir);
    expect(svc.isSafeCacheFilePath(symlinkInCache)).toBe(false);
    expect(svc.get('symlinkKey')).toBeNull();
    expect(svc.getStats().entries).toBe(0);

    // External target file must NOT be deleted or modified
    expect(fs.existsSync(externalTarget)).toBe(true);
    expect(fs.readFileSync(externalTarget, 'utf8')).toBe('EXTERNAL_SECRET_DATA');

    // Attempt to put() using a symlink as source must be rejected
    svc.put('attemptSymlinkPut', symlinkInCache, false);
    expect(svc.get('attemptSymlinkPut')).toBeNull();

    // Now corrupt index.json with truncated invalid JSON and verify automatic recovery
    fs.writeFileSync(path.join(cacheDir, 'index.json'), '{ "broken": [1, 2', 'utf8');
    const recoveredSvc = new CacheService(cacheDir);
    expect(() => recoveredSvc.getStats()).not.toThrow();
    expect(recoveredSvc.getStats().entries).toBe(0);

    const validWav = path.join(tmpRoot, 'valid-recovery.wav');
    fs.writeFileSync(validWav, Buffer.alloc(512, 0x99));
    recoveredSvc.put('recoveredKey', validWav, false);
    expect(recoveredSvc.get('recoveredKey')).toBeTruthy();
    expect(recoveredSvc.getStats().entries).toBe(1);
  });
});
