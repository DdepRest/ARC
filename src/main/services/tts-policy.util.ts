import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export type TtsProviderSetting = 'auto' | 'silero' | 'edge' | 'native' | 'piper' | 'kokoro';
export type TtsProviderMode = 'auto' | 'silero' | 'edge' | 'native';
export type TtsActiveEngine = 'silero' | 'edge' | 'system' | 'unavailable';
export type TtsFallbackPolicy = 'local-only' | 'cloud-allowed' | 'offline-locked';
export type TtsExecutionStep = 'silero' | 'edge' | 'system';

export interface TtsPolicyConfig {
  provider: TtsProviderMode;
  allowCloudTtsFallback: boolean;
  forcedOfflineMode: boolean;
}

export interface TtsPolicyPatch {
  provider?: string;
  allowCloudTtsFallback?: boolean;
  forcedOfflineMode?: boolean;
}

export interface TtsEngineState {
  provider: TtsProviderMode;
  activeEngine: TtsActiveEngine | null;
  allowCloudTtsFallback: boolean;
  forcedOfflineMode: boolean;
  fallbackPolicy: TtsFallbackPolicy;
  lastErrorReason: string | null;
}

export interface TtsExecutionPlan {
  steps: TtsExecutionStep[];
  cloudAllowed: boolean;
  cloudBlockedReason: string | null;
}

export const DEFAULT_TTS_POLICY: Readonly<TtsPolicyConfig> = {
  provider: 'auto',
  allowCloudTtsFallback: false,
  forcedOfflineMode: false,
};

export function validateTtsProvider(provider: string): TtsProviderMode {
  if (provider === 'piper' || provider === 'kokoro') {
    throw new Error('TTS provider not implemented in v1.0');
  }
  if (provider !== 'auto' && provider !== 'silero' && provider !== 'edge' && provider !== 'native') {
    throw new Error('Unknown TTS provider: ' + provider);
  }
  return provider;
}

export function resolveTtsFallbackPolicy(policy: TtsPolicyConfig): TtsFallbackPolicy {
  if (policy.forcedOfflineMode) return 'offline-locked';
  if (policy.allowCloudTtsFallback) return 'cloud-allowed';
  return 'local-only';
}

export function applyTtsPolicyPatch(
  current: TtsPolicyConfig,
  patch: TtsPolicyPatch,
  lastActiveEngine: TtsActiveEngine | null,
  lastErrorReason: string | null
): { policy: TtsPolicyConfig; providerChanged: boolean; activeEngine: TtsActiveEngine | null; lastErrorReason: string | null } {
  const next: TtsPolicyConfig = { ...current };
  let providerChanged = false;
  let nextEngine = lastActiveEngine;
  let nextReason = lastErrorReason;
  if (patch.provider !== undefined) {
    const valid = validateTtsProvider(patch.provider);
    if (valid !== next.provider) {
      next.provider = valid;
      providerChanged = true;
      nextEngine = null;
      nextReason = null;
    }
  }
  if (typeof patch.allowCloudTtsFallback === 'boolean') next.allowCloudTtsFallback = patch.allowCloudTtsFallback;
  if (typeof patch.forcedOfflineMode === 'boolean') next.forcedOfflineMode = patch.forcedOfflineMode;
  if (next.provider === 'edge' && next.forcedOfflineMode) {
    nextReason = 'Edge TTS заблокирован принудительным офлайн-режимом';
  } else if (nextEngine !== 'unavailable') {
    nextReason = null;
  }
  return { policy: next, providerChanged, activeEngine: nextEngine, lastErrorReason: nextReason };
}

export function resolveTtsExecutionPlan(policy: TtsPolicyConfig): TtsExecutionPlan {
  if (policy.provider === 'native') {
    return {
      steps: ['system'],
      cloudAllowed: false,
      cloudBlockedReason: null,
    };
  }

  if (policy.provider === 'edge') {
    if (policy.forcedOfflineMode) {
      return {
        steps: ['system'],
        cloudAllowed: false,
        cloudBlockedReason: 'Edge TTS заблокирован принудительным офлайн-режимом',
      };
    }
    return {
      steps: ['edge', 'system'],
      cloudAllowed: true,
      cloudBlockedReason: null,
    };
  }

  // 'auto' or 'silero'
  if (policy.forcedOfflineMode) {
    return {
      steps: ['silero', 'system'],
      cloudAllowed: false,
      cloudBlockedReason: 'Облачный резерв Edge TTS заблокирован принудительным офлайн-режимом',
    };
  }

  if (policy.allowCloudTtsFallback) {
    return {
      steps: ['silero', 'edge', 'system'],
      cloudAllowed: true,
      cloudBlockedReason: null,
    };
  }

  return {
    steps: ['silero', 'system'],
    cloudAllowed: false,
    cloudBlockedReason: 'Облачный резерв Edge TTS отключён (нет явного согласия)',
  };
}

export function getTtsPolicyFilePath(userDataDir?: string): string {
  const baseDir = userDataDir || app.getPath('userData');
  return path.join(baseDir, 'tts-policy.json');
}

export function loadTtsPolicy(filePath?: string): TtsPolicyConfig {
  try {
    const targetPath = filePath || getTtsPolicyFilePath();
    if (!fs.existsSync(targetPath)) {
      return { ...DEFAULT_TTS_POLICY };
    }
    const raw = fs.readFileSync(targetPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<TtsPolicyConfig> | null;
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_TTS_POLICY };
    }
    const provider: TtsProviderMode =
      parsed.provider === 'auto' ||
      parsed.provider === 'silero' ||
      parsed.provider === 'edge' ||
      parsed.provider === 'native'
        ? parsed.provider
        : 'auto';
    return {
      provider,
      allowCloudTtsFallback: parsed.allowCloudTtsFallback === true,
      forcedOfflineMode: parsed.forcedOfflineMode === true,
    };
  } catch {
    return { ...DEFAULT_TTS_POLICY };
  }
}

export function saveTtsPolicy(policy: TtsPolicyConfig, filePath?: string): void {
  try {
    const targetPath = filePath || getTtsPolicyFilePath();
    const dir = path.dirname(targetPath);
    if (typeof fs.mkdirSync === 'function' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const serialized = JSON.stringify(
      {
        provider: policy.provider,
        allowCloudTtsFallback: Boolean(policy.allowCloudTtsFallback),
        forcedOfflineMode: Boolean(policy.forcedOfflineMode),
      },
      null,
      2
    );
    if (typeof fs.renameSync === 'function') {
      const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpPath, serialized, 'utf8');
      fs.renameSync(tmpPath, targetPath);
    } else {
      fs.writeFileSync(targetPath, serialized, 'utf8');
    }
  } catch {
    // Non-fatal in restricted or mocked fs environments
  }
}
