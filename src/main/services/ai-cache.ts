import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export class AiCache {
  private cachePath: string;
  private cache: Record<string, { response: string, timestamp: number }> = {};
  private TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  public readonly maxBytes = 100 * 1024 * 1024; // 100 MB

  constructor() {
    try {
      if (typeof app === 'undefined' || typeof app.getPath !== 'function') throw new Error('Not in electron env');
      this.cachePath = path.join(app.getPath('userData'), 'cache', 'ai-responses.json');
    } catch {
      // Fallback for test environments where app.getPath is not available
      this.cachePath = path.join(process.cwd(), '.test-cache', 'ai-responses.json');
    }
    this.loadCache();
  }

  private loadCache() {
    const dir = path.dirname(this.cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    if (fs.existsSync(this.cachePath)) {
      try {
        this.cache = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
        this.cleanOldEntries();
      } catch (e) {
        this.cache = {};
      }
    }
  }

  private cleanOldEntries() {
    const now = Date.now();
    let changed = false;
    for (const key in this.cache) {
      if (now - this.cache[key].timestamp > this.TTL) {
        delete this.cache[key];
        changed = true;
      }
    }
    if (this.enforceMaxBytes()) {
      changed = true;
    }
    if (changed) this.saveCache();
  }

  private enforceMaxBytes(): boolean {
    const entries = Object.entries(this.cache);
    let totalBytes = entries.reduce(
      (sum, [k, v]) => sum + Buffer.byteLength(k, 'utf8') + Buffer.byteLength(v.response || '', 'utf8') + 32,
      0
    );
    if (totalBytes <= this.maxBytes) return false;

    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (const [k, v] of entries) {
      if (totalBytes <= this.maxBytes) break;
      const entryBytes = Buffer.byteLength(k, 'utf8') + Buffer.byteLength(v.response || '', 'utf8') + 32;
      delete this.cache[k];
      totalBytes -= entryBytes;
    }
    return true;
  }

  private saveCache() {
    fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
  }

  public get(query: string): string | null {
    const key = query.toLowerCase().trim();
    const entry = this.cache[key];
    if (entry) {
      if (Date.now() - entry.timestamp > this.TTL) {
        delete this.cache[key];
        this.saveCache();
        return null;
      }
      entry.timestamp = Date.now(); // Renew TTL
      this.saveCache();
      return entry.response;
    }
    return null;
  }

  public set(query: string, response: string) {
    this.cache[query.toLowerCase().trim()] = {
      response,
      timestamp: Date.now()
    };
    this.cleanOldEntries();
    this.saveCache();
  }

  public clear() {
    this.cache = {};
    if (fs.existsSync(this.cachePath)) {
      try {
        fs.unlinkSync(this.cachePath);
      } catch (e) {
        // ignore
      }
    }
  }
}

export const aiCache = new AiCache();
