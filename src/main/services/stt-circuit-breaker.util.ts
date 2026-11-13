import * as fs from 'fs';
import * as path from 'path';

export class SttCircuitBreaker {
  private static instance: SttCircuitBreaker;
  private consecutiveCrashes: Map<string, number> = new Map();
  private sessionBlockedSources: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): SttCircuitBreaker {
    if (!SttCircuitBreaker.instance) {
      SttCircuitBreaker.instance = new SttCircuitBreaker();
    }
    return SttCircuitBreaker.instance;
  }

  public isSourceBlocked(sourceId: string, targetDir: string): boolean {
    if (this.sessionBlockedSources.has(sourceId)) {
      return true;
    }

    const metaPath = path.join(targetDir, 'download_meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta && meta.incompatible === true && (meta.sourceId === sourceId || meta.source === sourceId)) {
          this.sessionBlockedSources.add(sourceId);
          return true;
        }
      } catch {}
    }
    return false;
  }

  public recordWorkerCrash(
    code: number | null,
    signal: string | null,
    sourceId: string,
    targetDir: string
  ): boolean {
    const isFatalExit = code === -1 || code === 4294967295 || signal === 'SIGSEGV' || signal === 'SIGABRT' || code === null;
    if (!isFatalExit) {
      return false;
    }

    const currentCount = (this.consecutiveCrashes.get(sourceId) || 0) + 1;
    this.consecutiveCrashes.set(sourceId, currentCount);
    console.warn(`[STT CircuitBreaker] Fatal worker crash recorded for source '${sourceId}' (count=${currentCount}, code=${code}, signal=${signal})`);

    if (currentCount >= 2) {
      this.sessionBlockedSources.add(sourceId);
      console.error(`[STT CircuitBreaker] Circuit breaker tripped for '${sourceId}'! Marking incompatible.`);
      try {
        const metaPath = path.join(targetDir, 'download_meta.json');
        let existingMeta: any = {};
        if (fs.existsSync(metaPath)) {
          try { existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
        }
        const updatedMeta = {
          ...existingMeta,
          sourceId,
          incompatible: true,
          verified: false,
          circuitBreakerTripped: true,
          lastCrashCode: code,
          lastCrashSignal: signal,
          blockedAt: new Date().toISOString()
        };
        fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));
      } catch (err) {
        console.warn('[STT CircuitBreaker] Failed to write incompatible status to download_meta.json:', err);
      }
      return true;
    }

    return false;
  }

  public resetCrashes(sourceId: string): void {
    this.consecutiveCrashes.set(sourceId, 0);
  }
}

export const sttCircuitBreaker = SttCircuitBreaker.getInstance();
