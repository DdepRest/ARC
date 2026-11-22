import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DEFAULT_TTS_POLICY,
  loadTtsPolicy,
  resolveTtsExecutionPlan,
  resolveTtsFallbackPolicy,
  saveTtsPolicy,
  validateTtsProvider,
} from './tts-policy.util';

describe('tts-policy.util (S2-05)', () => {
  const tempDirs: string[] = [];

  const createTempPolicyPath = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-tts-policy-'));
    tempDirs.push(dir);
    return path.join(dir, 'tts-policy.json');
  };

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it('defaults allowCloudTtsFallback and forcedOfflineMode to false when policy file is absent or corrupt', () => {
    const missingPath = path.join(os.tmpdir(), `nonexistent-${Date.now()}`, 'tts-policy.json');
    expect(loadTtsPolicy(missingPath)).toEqual(DEFAULT_TTS_POLICY);

    const corruptPath = createTempPolicyPath();
    fs.writeFileSync(corruptPath, '{not valid json', 'utf8');
    expect(loadTtsPolicy(corruptPath)).toEqual(DEFAULT_TTS_POLICY);
  });

  it('keeps allowCloudTtsFallback false on migration when legacy file lacks boolean true', () => {
    const legacyPath = createTempPolicyPath();
    fs.writeFileSync(legacyPath, JSON.stringify({ provider: 'silero', allowCloudTtsFallback: 'true' }), 'utf8');

    expect(loadTtsPolicy(legacyPath)).toEqual({
      provider: 'silero',
      allowCloudTtsFallback: false,
      forcedOfflineMode: false,
    });
  });

  it('persists and reloads TTS policy across restarts', () => {
    const policyPath = createTempPolicyPath();
    saveTtsPolicy(
      { provider: 'silero', allowCloudTtsFallback: true, forcedOfflineMode: false },
      policyPath
    );

    expect(loadTtsPolicy(policyPath)).toEqual({
      provider: 'silero',
      allowCloudTtsFallback: true,
      forcedOfflineMode: false,
    });
  });

  it('computes local-only, cloud-allowed, and offline-locked execution plans accurately', () => {
    const localOnly = resolveTtsExecutionPlan({ provider: 'auto', allowCloudTtsFallback: false, forcedOfflineMode: false });
    expect(localOnly.steps).toEqual(['silero', 'system']);
    expect(localOnly.cloudAllowed).toBe(false);
    expect(resolveTtsFallbackPolicy({ provider: 'auto', allowCloudTtsFallback: false, forcedOfflineMode: false })).toBe('local-only');

    const optInCloud = resolveTtsExecutionPlan({ provider: 'silero', allowCloudTtsFallback: true, forcedOfflineMode: false });
    expect(optInCloud.steps).toEqual(['silero', 'edge', 'system']);
    expect(optInCloud.cloudAllowed).toBe(true);
    expect(resolveTtsFallbackPolicy({ provider: 'silero', allowCloudTtsFallback: true, forcedOfflineMode: false })).toBe('cloud-allowed');

    const offlineLockedAuto = resolveTtsExecutionPlan({ provider: 'auto', allowCloudTtsFallback: true, forcedOfflineMode: true });
    expect(offlineLockedAuto.steps).toEqual(['silero', 'system']);
    expect(offlineLockedAuto.cloudAllowed).toBe(false);

    const offlineLockedEdge = resolveTtsExecutionPlan({ provider: 'edge', allowCloudTtsFallback: true, forcedOfflineMode: true });
    expect(offlineLockedEdge.steps).toEqual(['system']);
    expect(offlineLockedEdge.cloudAllowed).toBe(false);
    expect(offlineLockedEdge.cloudBlockedReason).toContain('офлайн');
    expect(resolveTtsFallbackPolicy({ provider: 'edge', allowCloudTtsFallback: true, forcedOfflineMode: true })).toBe('offline-locked');
  });

  it('validates provider names cleanly', () => {
    expect(validateTtsProvider('auto')).toBe('auto');
    expect(() => validateTtsProvider('piper')).toThrow('TTS provider not implemented in v1.0');
    expect(() => validateTtsProvider('bogus')).toThrow('Unknown TTS provider: bogus');
  });
});
