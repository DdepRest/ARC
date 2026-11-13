import type { IpcRenderer } from 'electron';

export interface TtsEngineStatePayload {
  provider: 'auto' | 'silero' | 'edge' | 'native';
  activeEngine: 'silero' | 'edge' | 'system' | null;
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
  };
}
