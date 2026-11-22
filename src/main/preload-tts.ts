import type { IpcRenderer } from 'electron';

export interface TtsEngineStatePayload {
  provider: 'auto' | 'silero' | 'edge' | 'native';
  activeEngine: 'silero' | 'edge' | 'system' | 'unavailable' | null;
  allowCloudTtsFallback?: boolean;
  forcedOfflineMode?: boolean;
  fallbackPolicy?: 'local-only' | 'cloud-allowed' | 'offline-locked';
  lastErrorReason?: string | null;
}

export interface TtsPolicyUpdatePayload {
  provider?: string;
  allowCloudTtsFallback?: boolean;
  forcedOfflineMode?: boolean;
}

export interface TtsMetaPayload {
  engine: 'silero' | 'edge' | 'sapi';
  isCached: boolean;
  queryId?: string;
  textHash?: string;
}

export function createTtsPreloadApi(ipcRenderer: IpcRenderer) {
  return {
    getTtsActiveEngine: (): Promise<TtsEngineStatePayload> =>
      ipcRenderer.invoke('tts:get-active-engine'),
    setTtsProvider: (provider: string): Promise<TtsEngineStatePayload> =>
      ipcRenderer.invoke('tts:set-provider', provider),
    setTtsPolicy: (policy: TtsPolicyUpdatePayload): Promise<TtsEngineStatePayload> =>
      ipcRenderer.invoke('tts:set-policy', policy),
    onTtsEngineChanged: (callback: (data: TtsEngineStatePayload) => void) => {
      const sub = (_event: unknown, data: TtsEngineStatePayload) => callback(data);
      ipcRenderer.on('tts:engine-changed', sub);
      return () => ipcRenderer.removeListener('tts:engine-changed', sub);
    },
    onTtsMeta: (callback: (data: TtsMetaPayload) => void) => {
      const sub = (_event: unknown, data: TtsMetaPayload) => callback(data);
      ipcRenderer.on('tts:meta', sub);
      return () => ipcRenderer.removeListener('tts:meta', sub);
    },
    getVoiceSetupStatus: (options?: { includeWhisper?: boolean; includeGigaam?: boolean; includeTts?: boolean }) =>
      ipcRenderer.invoke('voice:setup-status', options),
    setVoiceSetupMode: (mode: 'setup_now' | 'later' | 'system_fallback') =>
      ipcRenderer.invoke('voice:setup-mode', mode),
    startVoiceSetup: (options?: { includeWhisper?: boolean; includeGigaam?: boolean; includeTts?: boolean }) =>
      ipcRenderer.invoke('voice:setup-start', options),
    pauseVoiceSetup: () =>
      ipcRenderer.invoke('voice:setup-pause'),
    cancelVoiceSetup: () =>
      ipcRenderer.invoke('voice:setup-cancel'),
    onVoiceSetupProgress: (callback: (data: any) => void) => {
      const sub = (_event: unknown, data: any) => callback(data);
      ipcRenderer.on('voice:setup-progress', sub);
      return () => ipcRenderer.removeListener('voice:setup-progress', sub);
    },
  };
}
