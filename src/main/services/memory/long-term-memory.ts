import { DatabaseService } from '../database';
import { LongTermMemoryEntry, MemoryCategory } from '../../../shared/types/memory';
import { Worker } from 'worker_threads';
import path from 'path';

export class LongTermMemory {
  private db = DatabaseService.db;
  private isDbAvailable: boolean = false;
  private worker: Worker | null = null;
  private isWorkerInitializing: boolean = false;
  private embeddingDisabled: boolean = false;
  private hasLoggedEmbeddingDisabled: boolean = false;
  private pendingResolves: Map<string, (val: any) => void> = new Map();
  private pendingRejects: Map<string, (err: any) => void> = new Map();
  private messageIdCounter = 0;

  constructor() {
    this.isDbAvailable = !!this.db;
    // Defer worker initialization until after startup first paint
    setTimeout(() => {
      this.initWorker();
    }, 2000);
  }

  private initWorker() {
    if (this.worker || this.isWorkerInitializing) return;
    this.isWorkerInitializing = true;
    console.log('[LongTermMemory] Initializing background Worker Thread for embeddings...');
    
    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      const { createRequire } = require('module');
      const path = require('path');
      
      if (workerData && workerData.paths) {
        module.paths = workerData.paths.concat(module.paths);
      }
      
      try {
        const Module = require('module');
        const origLoad = Module._load;
        Module._load = function(request, parent, isMain) {
          if (request === 'sharp' || (typeof request === 'string' && request.includes('sharp'))) {
            const dummy = function() { throw new Error('Sharp is disabled in worker fallback'); };
            dummy.format = { jpeg: { id: 'jpeg' }, png: { id: 'png' }, webp: { id: 'webp' } };
            return dummy;
          }
          return origLoad.apply(this, arguments);
        };
      } catch (e) {
        console.log('[Embeddings] Failed to mock Module._load:', e);
      }
      
      let pipeline, env;
      let embedder = null;

      async function getEmbedder() {
        if (!embedder) {
          if (!pipeline) {
             try {
                const baseDir = (workerData && workerData.cwd) || process.cwd();
                const customRequire = createRequire(path.join(baseDir, 'dummy-worker.js'));
                let trans;
                try {
                  trans = customRequire('@xenova/transformers');
                } catch (reqErr) {
                  trans = await import('@xenova/transformers');
                }
                pipeline = trans.pipeline || (trans.default && trans.default.pipeline);
                env = trans.env || (trans.default && trans.default.env);
                
                env.allowLocalModels = true;
                if (env.backends && env.backends.onnx) {
                  env.backends.onnx.node = false;
                  if (env.backends.onnx.wasm) {
                    try {
                      const transformersMainPath = (customRequire.resolve && customRequire.resolve('@xenova/transformers')) || require.resolve('@xenova/transformers');
                      const transformersDistDir = path.dirname(transformersMainPath);
                      env.backends.onnx.wasm.wasmPaths = transformersDistDir + path.sep;
                    } catch (wasmErr) {
                      console.warn('[Embedder-Worker] Could not configure local WASM paths:', wasmErr.message);
                    }
                  }
                }
             } catch(e) {
                throw new Error('Failed to load @xenova/transformers: ' + e.message);
             }
          }
          if (typeof pipeline !== 'function') {
             throw new Error('pipeline is not a function. trans object: ' + typeof pipeline);
          }
          embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            quantized: true,
          });
        }
        return embedder;
      }

      parentPort.on('message', async (message) => {
        const { action, text, id } = message;
        
        if (action === 'embed') {
          try {
            const fn = await getEmbedder();
            const result = await fn(text, { pooling: 'mean', normalize: true });
            parentPort.postMessage({ type: 'result', id, data: Array.from(result.data) });
          } catch (e) {
            parentPort.postMessage({ type: 'error', id, error: e.message || e });
          }
        }
      });
    `;

    this.worker = new Worker(workerCode, {
      eval: true,
      workerData: {
        paths: module.paths,
        cwd: process.cwd()
      }
    });

    this.worker.on('message', (msg: any) => {
      const { type, id, data, error } = msg;
      if (type === 'result') {
        const resolve = this.pendingResolves.get(id);
        if (resolve) resolve(data);
      } else if (type === 'error') {
        const reject = this.pendingRejects.get(id);
        if (reject) reject(new Error(error));
      }
      this.pendingResolves.delete(id);
      this.pendingRejects.delete(id);
    });

    this.worker.on('error', (err) => {
      console.error('[Embedder-Worker] Error:', err);
    });
  }

  async generateEmbedding(text: string): Promise<number[] | null> {
    if (this.embeddingDisabled) {
      return null;
    }
    if (!this.worker) {
      this.initWorker();
      // Brief pause if initializing
      await new Promise(r => setTimeout(r, 200));
      if (!this.worker) return null;
    }
    try {
      const id = (this.messageIdCounter++).toString();
      return await new Promise<number[]>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.pendingResolves.delete(id);
          this.pendingRejects.delete(id);
          reject(new Error('Embedding generation timed out'));
        }, 3000); // 3 seconds timeout

        this.pendingResolves.set(id, (data) => {
          clearTimeout(timeoutId);
          resolve(data);
        });
        this.pendingRejects.set(id, (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
        this.worker!.postMessage({ action: 'embed', text, id });
      });
    } catch (e: any) {
      if (!this.hasLoggedEmbeddingDisabled) {
        this.hasLoggedEmbeddingDisabled = true;
        this.embeddingDisabled = true;
        console.warn(`[LTM] Embedding generation disabled (vector search unavailable, text search active): ${e?.message || e}`);
      }
      return null;
    }
  }

  async upsert(entry: LongTermMemoryEntry): Promise<void> {
    if (!this.isDbAvailable) return;
    const existing = this.getByKey(entry.key);
    const now = Date.now();

    if (!entry.embedding) {
      // Try to generate
      entry.embedding = await this.generateEmbedding(
        typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)
      );
    }

    const embeddingStr = entry.embedding ? JSON.stringify(entry.embedding) : null;
    const valueStr = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
    const valueType = typeof entry.value === 'string' ? 'string' : 'json';

    try {
      if (existing) {
        const stmt = this.db.prepare(`
          UPDATE ltm 
          SET value = ?, value_type = ?, embedding = ?, confidence = ?, source = ?, updated_at = ?, last_accessed_at = ?, access_count = access_count + 1
          WHERE id = ?
        `);
        stmt.run(valueStr, valueType, embeddingStr, entry.confidence, entry.source, now, now, existing.id);
      } else {
        const stmt = this.db.prepare(`
          INSERT INTO ltm (id, category, key, value, value_type, embedding, confidence, source, created_at, updated_at, last_accessed_at, access_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          entry.id, entry.category, entry.key, valueStr, valueType, embeddingStr,
          entry.confidence, entry.source, now, now, now, 1
        );
      }
    } catch (e) {
      console.error("LTM: Upsert failed", e);
    }
  }

  getAll(): LongTermMemoryEntry[] {
    if (!this.isDbAvailable) return [];
    try {
      const stmt = this.db.prepare('SELECT * FROM ltm');
      const rows = stmt.all();
      return rows.map((row: unknown) => this.mapRow(row));
    } catch (e) {
      return [];
    }
  }

  importBatch(rawItems: unknown): { success: boolean; importedCount: number; error?: string } {
    if (!this.isDbAvailable) {
      return { success: false, importedCount: 0, error: 'Database unavailable' };
    }
    const { importMemoryBatchAtomic } = require('./memory-batch-import');
    return importMemoryBatchAtomic(this.db, rawItems);
  }

  getByKey(key: string): LongTermMemoryEntry | null {
    if (!this.isDbAvailable) return null;
    try {
      const stmt = this.db.prepare('SELECT * FROM ltm WHERE key = ?');
      const row = (stmt.get(key) as any);
      return row ? this.mapRow(row) : null;
    } catch(e) {
      return null;
    }
  }

  getById(id: string): LongTermMemoryEntry | null {
    if (!this.isDbAvailable) return null;
    try {
      const stmt = this.db.prepare('SELECT * FROM ltm WHERE id = ?');
      const row = (stmt.get(id) as any);
      return row ? this.mapRow(row) : null;
    } catch (e) {
      return null;
    }
  }

  getByCategory(category: MemoryCategory): LongTermMemoryEntry[] {
    if (!this.isDbAvailable) return [];
    try {
      const stmt = this.db.prepare('SELECT * FROM ltm WHERE category = ? ORDER BY confidence DESC');
      const rows = stmt.all(category);
      return rows.map((row: unknown) => this.mapRow(row));
    } catch (e) {
      return [];
    }
  }

  delete(id: string): void {
    if (!this.isDbAvailable) return;
    try {
      this.db.prepare('DELETE FROM ltm WHERE id = ?').run(id);
    } catch (e) {
      // Ignored
    
        console.warn('[A.R.C] Handled silent error:', e);
    }
  }

  async search(query: string, filters?: { category?: MemoryCategory }): Promise<LongTermMemoryEntry[]> {
    const entries = filters?.category 
      ? this.getByCategory(filters.category) 
      : this.getAll();
    
    if (entries.length === 0) return [];

    const queryEmbedding = await this.generateEmbedding(query);
    const lowerQuery = query.toLowerCase();
    
    // Calculate relevance with semantic vector scoring
    const withScores = entries.map(e => {
      let score = 0;
      let cosineSim = 0;
      const strValue = typeof e.value === 'string' ? e.value.toLowerCase() : JSON.stringify(e.value).toLowerCase();
      const strKey = e.key.toLowerCase();
      
      // 1. Text keyword match (Fast)
      if (strValue.includes(lowerQuery)) score += 2.0;
      if (strKey.includes(lowerQuery)) score += 1.0;
      
      const words = lowerQuery.split(/\s+/).filter(w => w.length > 2);
      for (const w of words) {
        if (strValue.includes(w)) score += 0.5;
        if (strKey.includes(w)) score += 0.3;
      }

      // 2. Vector similarity (Semantic)
      if (queryEmbedding && e.embedding && Array.isArray(e.embedding)) {
        const similarity = this.cosineSimilarity(queryEmbedding, e.embedding);
        cosineSim = similarity;
        if (similarity > 0.75) {
          score += similarity * 5.0; // Heavy weight for strict semantic match
        }
      }
      
      let matchPercent = 0;
      if (cosineSim > 0) {
        matchPercent = Math.min(99, Math.max(1, Math.round(cosineSim * 100)));
      } else if (score > 0) {
        matchPercent = Math.min(95, Math.max(1, Math.round(Math.min(1, score / 4.0) * 100)));
      }

      const enrichedEntry: LongTermMemoryEntry = {
        ...e,
        similarity: matchPercent > 0 ? matchPercent : undefined
      };

      return { entry: enrichedEntry, score: score * e.confidence };
    });

    return withScores.filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.entry);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  private mapRow(row: any): LongTermMemoryEntry {
    let value = row.value;
    if (!row.value_type) {
      value = row.value;
    } else if (row.value_type === 'json' || row.value_type === 'object') {
      try {
        if (typeof row.value === 'string') {
          value = JSON.parse(row.value);
        } else {
          value = row.value;
        }
      } catch {
        value = row.value;
      }
    } else {
      value = row.value;
    }

    let embedding = null;
    if (row.embedding) {
      try {
        embedding = JSON.parse(row.embedding);
      } catch (e: any) {
        console.warn(`[LTM] Warning: Failed to parse embedding for id ${row.id}. Error: ${e.message}`);
      }
    }

  return {
      id: row.id,
      category: row.category as MemoryCategory,
      key: row.key,
      value: value,
      embedding: embedding,
      confidence: row.confidence,
      source: row.source,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_accessed_at: row.last_accessed_at,
      access_count: row.access_count,
    };
  }
}
