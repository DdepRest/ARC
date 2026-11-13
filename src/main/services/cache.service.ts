import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { app } from 'electron';

export interface CacheEntry {
  path: string;
  hitCount: number;
  lastAccessMs: number;
  sizeBytes: number;
  isSpeedTier: boolean;
}

export interface CacheServiceOptions {
  cacheDir?: string;
  maxBytes?: number;
  maxSpeedTierBytes?: number;
  maxRamEntries?: number;
  maxSpeedTierEntries?: number;
  ttlMs?: number;
}

const DEFAULT_SPEED_TIER_PHRASES: ReadonlyArray<string> = [
  'слушаю.', 'слушаю', 'да.', 'да', 'я здесь.', 'я здесь',
  'жду указаний.', 'жду указаний', 'голосовой модуль не доступен.',
  'голосовой модуль не доступен', 'микрофон не обнаружен.',
  'микрофон не обнаружен', 'остановлено.', 'остановлено', 'выполнено.', 'выполнено'
];

export class CacheService {
  private configuredCacheDir?: string;
  private resolvedCacheDir: string | null = null;
  private indexFile: string | null = null;
  private index: Record<string, CacheEntry> = {};
  private initialized = false;
  private available = false;
  private hasLoggedFsWarning = false;
  private missesCount = 0;
  private evictionsCount = 0;

  public readonly maxBytes: number;
  public readonly maxSpeedTierBytes: number;
  private readonly MAX_RAM_ENTRIES: number;
  private readonly MAX_SPEED_TIER_ENTRIES: number;
  private readonly TTL_MS: number;
  private readonly speedTierPhraseSet = new Set(DEFAULT_SPEED_TIER_PHRASES);

  constructor(options?: string | CacheServiceOptions) {
    const opts = typeof options === 'string' ? { cacheDir: options } : (options ?? {});
    this.configuredCacheDir = opts.cacheDir;
    this.maxBytes = opts.maxBytes ?? 100 * 1024 * 1024;
    this.maxSpeedTierBytes = opts.maxSpeedTierBytes ?? Math.min(20 * 1024 * 1024, this.maxBytes);
    this.MAX_RAM_ENTRIES = opts.maxRamEntries ?? 100;
    this.MAX_SPEED_TIER_ENTRIES = opts.maxSpeedTierEntries ?? 50;
    this.TTL_MS = opts.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
  }

  private resolveTargetCacheDir(): string {
    if (this.configuredCacheDir) return path.resolve(this.configuredCacheDir);
    try {
      const baseDir = app && typeof app.getPath === 'function' ? app.getPath('userData') : os.tmpdir();
      return path.resolve(baseDir || os.tmpdir(), 'audio-cache');
    } catch {
      return path.resolve(os.tmpdir(), 'audio-cache');
    }
  }

  public getCacheDir(): string {
    if (!this.resolvedCacheDir) {
      this.resolvedCacheDir = this.resolveTargetCacheDir();
      this.indexFile = path.join(this.resolvedCacheDir, 'index.json');
    }
    return this.resolvedCacheDir;
  }

  public isAvailable(): boolean {
    return this.available;
  }

  private logFsFailureOnce(context: string, err: unknown): void {
    if (!this.hasLoggedFsWarning) {
      this.hasLoggedFsWarning = true;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[CacheService] Cache unavailable (${context}): ${msg}. Operating in pass-through mode.`);
    }
  }

  private ensureInitialized(): boolean {
    const dir = this.getCacheDir();
    if (this.initialized && this.available) {
      if (fs.existsSync(dir)) return true;
      this.available = false;
    }
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const wasUnavailable = !this.available;
      this.available = true;
      this.hasLoggedFsWarning = false;
      if (!this.initialized || wasUnavailable) {
        this.initialized = true;
        this.loadIndex();
      }
      return true;
    } catch (err) {
      this.initialized = true;
      this.available = false;
      this.logFsFailureOnce('mkdirSync', err);
      return false;
    }
  }

  public isSafeCacheFilePath(candidatePath: unknown): candidatePath is string {
    if (typeof candidatePath !== 'string' || !candidatePath.trim()) return false;
    const resolvedDir = path.resolve(this.getCacheDir());
    const resolvedTarget = path.resolve(candidatePath);
    const relative = path.relative(resolvedDir, resolvedTarget);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || path.dirname(resolvedTarget) !== resolvedDir) {
      return false;
    }
    const base = path.basename(resolvedTarget);
    if (base === 'index.json' || base === 'index.json.tmp' || !/\.(wav|mp3)$/i.test(base)) return false;
    try {
      const lstat = fs.lstatSync(resolvedTarget);
      if (lstat.isSymbolicLink() || !lstat.isFile()) return false;
      const realDir = fs.realpathSync(resolvedDir);
      const realTarget = fs.realpathSync(resolvedTarget);
      const realRel = path.relative(realDir, realTarget);
      if (!realRel || realRel.startsWith('..') || path.isAbsolute(realRel) || path.dirname(realTarget) !== realDir) {
        return false;
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') return false;
    }
    return true;
  }

  private sanitizeEntry(raw: unknown): CacheEntry | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const c = raw as Record<string, unknown>;
    if (!this.isSafeCacheFilePath(c.path)) return null;
    const hitCount = Number(c.hitCount);
    const lastAccessMs = Number(c.lastAccessMs);
    const sizeBytes = Number(c.sizeBytes);
    if (!Number.isFinite(hitCount) || hitCount < 0 || !Number.isFinite(lastAccessMs) || lastAccessMs < 0 || !Number.isFinite(sizeBytes) || sizeBytes < 0 || typeof c.isSpeedTier !== 'boolean') {
      return null;
    }
    return { path: path.resolve(c.path), hitCount: Math.floor(hitCount), lastAccessMs, sizeBytes: Math.floor(sizeBytes), isSpeedTier: Boolean(c.isSpeedTier) };
  }

  private loadIndex(): void {
    if (!this.indexFile || !fs.existsSync(this.indexFile)) return;
    try {
      const content = fs.readFileSync(this.indexFile, 'utf8');
      if (!content || !content.trim()) {
        this.index = {};
        this.saveIndex();
        return;
      }
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.index = {};
        this.saveIndex();
        return;
      }
      const sanitized: Record<string, CacheEntry> = {};
      let droppedInvalid = 0;
      for (const [key, rawEntry] of Object.entries(parsed)) {
        if (!key) continue;
        const valid = this.sanitizeEntry(rawEntry);
        if (valid) sanitized[key] = valid;
        else droppedInvalid++;
      }
      if (droppedInvalid > 0) console.warn(`[CacheService] Dropped ${droppedInvalid} invalid or out-of-bounds index entries.`);
      this.index = sanitized;
      this.enforceLimits();
      if (droppedInvalid > 0) this.saveIndex();
    } catch (e) {
      console.warn('[CacheService] Failed to load cache index (corrupted JSON). Recreating index.', e);
      this.index = {};
      this.saveIndex();
    }
  }

  private saveIndex(): void {
    if (!this.available || !this.indexFile) return;
    try {
      const tempFile = this.indexFile + '.tmp';
      fs.writeFileSync(tempFile, JSON.stringify(this.index, null, 2), 'utf8');
      fs.renameSync(tempFile, this.indexFile);
    } catch (e) {
      this.logFsFailureOnce('saveIndex', e);
    }
  }

  generateKey(
    voicePresetVersion: number, activeModelId: string, normalizedText: string,
    speed: number, pitch: number, sampleRate: number = 48000,
    putAccent: boolean = true, putYo: boolean = true, speaker: string = 'eugene'
  ): string {
    const speedQuantized = Math.round(speed / 0.04) * 0.04;
    const pitchQuantized = Math.round(pitch * 2) / 2;
    const rawKey = `${voicePresetVersion}|${activeModelId}|${speaker}|${normalizedText}|${speedQuantized}|${pitchQuantized}|${sampleRate}|${putAccent}|${putYo}`;
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  isSpeedTier(normalizedText: string): boolean {
    if (typeof normalizedText !== 'string') return false;
    const cleaned = normalizedText.trim().toLowerCase();
    return cleaned.length > 0 && this.speedTierPhraseSet.has(cleaned);
  }

  get(key: string): string | null {
    if (!this.ensureInitialized()) {
      this.missesCount++;
      return null;
    }
    const entry = this.index[key];
    if (!entry) {
      this.missesCount++;
      return null;
    }
    if (!this.isSafeCacheFilePath(entry.path)) {
      delete this.index[key];
      this.saveIndex();
      this.missesCount++;
      return null;
    }
    if (Date.now() - entry.lastAccessMs > this.TTL_MS && !entry.isSpeedTier) {
      this.evict(key, entry);
      this.saveIndex();
      this.missesCount++;
      return null;
    }
    try {
      if (fs.existsSync(entry.path) && this.isSafeCacheFilePath(entry.path)) {
        entry.hitCount++;
        entry.lastAccessMs = Date.now();
        this.saveIndex();
        return entry.path;
      }
      delete this.index[key];
      this.saveIndex();
      this.missesCount++;
      return null;
    } catch (e) {
      this.logFsFailureOnce('get', e);
      this.missesCount++;
      return null;
    }
  }

  put(key: string, filePath: string, isSpeedTier: boolean): void {
    if (!this.ensureInitialized()) return;
    let stagingPath = '';
    try {
      const safeKey = String(key).replace(/[^a-fA-F0-9_-]/g, '');
      if (!safeKey) return;
      const stats = fs.lstatSync(filePath);
      if (stats.isSymbolicLink() || !stats.isFile() || stats.size > this.maxBytes) return;
      const destPath = path.resolve(this.getCacheDir(), `sha256-${safeKey}.wav`);
      if (!this.isSafeCacheFilePath(destPath)) return;
      if (path.resolve(filePath) !== destPath) {
        stagingPath = path.resolve(this.getCacheDir(), `sha256-${safeKey}-tmp-${process.pid}-${Date.now()}.wav`);
        if (!this.isSafeCacheFilePath(stagingPath)) return;
        fs.copyFileSync(filePath, stagingPath);
        const stagingStats = fs.lstatSync(stagingPath);
        if (stagingStats.isSymbolicLink() || !stagingStats.isFile()) {
          try { fs.unlinkSync(stagingPath); } catch {}
          return;
        }
        fs.renameSync(stagingPath, destPath);
        stagingPath = '';
      }
      if (!this.isSafeCacheFilePath(destPath)) return;
      this.index[key] = { path: destPath, hitCount: 1, lastAccessMs: Date.now(), sizeBytes: stats.size, isSpeedTier: Boolean(isSpeedTier) };
      this.enforceLimits();
      this.saveIndex();
    } catch (e) {
      if (stagingPath) { try { if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath); } catch {} }
      this.logFsFailureOnce('put', e);
    }
  }

  private sortByLfuLru(entries: [string, CacheEntry][], now: number): [string, CacheEntry][] {
    return entries.sort((a, b) => {
      const ratioA = a[1].hitCount / Math.max(1, (now - a[1].lastAccessMs) / 3600000);
      const ratioB = b[1].hitCount / Math.max(1, (now - b[1].lastAccessMs) / 3600000);
      return ratioA === ratioB ? a[1].lastAccessMs - b[1].lastAccessMs : ratioA - ratioB;
    });
  }

  private enforceLimits(): void {
    const now = Date.now();
    for (const [k, v] of Object.entries(this.index)) {
      if (!this.isSafeCacheFilePath(v.path)) delete this.index[k];
      else if (!v.isSpeedTier && now - v.lastAccessMs > this.TTL_MS) this.evict(k, v);
    }
    const speedEntries = this.sortByLfuLru(Object.entries(this.index).filter(([_, e]) => e.isSpeedTier), now);
    let speedBytes = speedEntries.reduce((acc, [_, e]) => acc + e.sizeBytes, 0);
    let speedCount = speedEntries.length;
    for (const [k, v] of speedEntries) {
      if (speedBytes <= this.maxSpeedTierBytes && speedCount <= this.MAX_SPEED_TIER_ENTRIES) break;
      this.evict(k, v);
      speedBytes -= v.sizeBytes;
      speedCount--;
    }
    let totalSize = Object.values(this.index).reduce((acc, e) => acc + e.sizeBytes, 0);
    if (totalSize > this.maxBytes) {
      const evictByLru = (isSpeed: boolean) => {
        const list = Object.entries(this.index).filter(([_, e]) => e.isSpeedTier === isSpeed).sort((a, b) => a[1].lastAccessMs - b[1].lastAccessMs);
        for (const [k, v] of list) {
          if (totalSize <= this.maxBytes) break;
          this.evict(k, v);
          totalSize -= v.sizeBytes;
        }
      };
      evictByLru(false);
      if (totalSize > this.maxBytes) evictByLru(true);
    }
    const regularEntries = this.sortByLfuLru(Object.entries(this.index).filter(([_, e]) => !e.isSpeedTier), now);
    for (let i = 0; i < regularEntries.length - this.MAX_RAM_ENTRIES; i++) {
      this.evict(regularEntries[i][0], regularEntries[i][1]);
    }
  }

  private evict(key: string, entry: CacheEntry): void {
    try {
      if (this.isSafeCacheFilePath(entry.path) && fs.existsSync(entry.path)) fs.unlinkSync(entry.path);
      delete this.index[key];
      this.evictionsCount++;
    } catch (e) {
      delete this.index[key];
      this.logFsFailureOnce('evict', e);
    }
  }

  getStats(): { entries: number; sizeBytes: number; hits: number; misses: number; evictions: number } {
    this.ensureInitialized();
    const validEntries: CacheEntry[] = [];
    let staleRemoved = false;
    for (const [key, entry] of Object.entries(this.index)) {
      if (this.isSafeCacheFilePath(entry.path) && fs.existsSync(entry.path)) validEntries.push(entry);
      else {
        delete this.index[key];
        staleRemoved = true;
      }
    }
    if (staleRemoved) this.saveIndex();
    return {
      entries: validEntries.length,
      sizeBytes: validEntries.reduce((sum, e) => sum + (e.sizeBytes || 0), 0),
      hits: validEntries.reduce((sum, e) => sum + (e.hitCount || 0), 0),
      misses: this.missesCount,
      evictions: this.evictionsCount
    };
  }

  clear(): { freedBytes: number; clearedFiles: number } {
    let clearedFiles = 0;
    let freedBytes = 0;
    this.index = {};
    this.missesCount = 0;
    this.evictionsCount = 0;
    if (!this.ensureInitialized()) return { freedBytes, clearedFiles };
    try {
      const dir = this.getCacheDir();
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir)) {
          if (file === 'index.json' || file === 'index.json.tmp') continue;
          const filePath = path.join(dir, file);
          if (!this.isSafeCacheFilePath(filePath)) continue;
          try {
            const stats = fs.lstatSync(filePath);
            if (!stats.isSymbolicLink() && stats.isFile()) {
              freedBytes += stats.size;
              fs.unlinkSync(filePath);
              clearedFiles++;
            }
          } catch (e) {
            this.logFsFailureOnce('clear-file', e);
          }
        }
      }
      this.saveIndex();
    } catch (e) {
      this.logFsFailureOnce('clear', e);
    }
    return { freedBytes, clearedFiles };
  }
}

export const cacheService = new CacheService();
