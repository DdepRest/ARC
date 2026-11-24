/// <reference types="vite/client" />

declare const __BUILD_COMMIT__: string;
declare const __BUILD_COMMIT_FULL__: string;
declare const __BUILD_COMMIT_SOURCE__: string;
declare const __APP_VERSION__: string;

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'better-sqlite3';

interface Window {
  api: {
    getSystemInfo: () => Promise<any>;
    getSystemMetrics: () => Promise<any>;
    listFiles: () => Promise<string[]>;
    getModulesStatus: (options?: import('./shared/config/modules-capability.registry').ModulesStatusRequestOptions) => Promise<import('./shared/config/modules-capability.registry').ModulesCapabilitySnapshot>;
    quitApp: () => Promise<void>;
    writeClipboard: (text: string) => Promise<boolean>;
    dialogDeleteMessage: (id: number) => Promise<boolean>;
    toggleFocus: () => Promise<void>;
    startListening: () => Promise<{ success: boolean }>;
    stopListening: () => Promise<{ text: string }>;
    setVoiceBusy?: (busy: boolean) => void;
    speak: (text: string, style?: string) => Promise<{ success: boolean }>;
    onWake: (callback: () => void) => void;
    aiRequest: (text: string, context: any[], reqId: string, settings?: any) => Promise<string>;
    onAiChunk: (callback: (data: { chunk: string, done: boolean, reqId: string }) => void) => () => void;
    onAiRouteInfo: (callback: (data: { reqId: string, modelName: string, target: 'local' | 'cloud', cause: string }) => void) => () => void;
    onAiTextCorrected: (callback: (data: { originalText: string, correctedText: string }) => void) => () => void;
    getAiProviders: () => Promise<any[]>;
    getQuarantinedAiProviders: () => Promise<{id: string, name: string, quarantineUntil: number}[]>;
    saveAiProvider: (provider: any) => Promise<{ success: boolean; error?: string }>;
    deleteAiProvider: (id: string) => Promise<{ success: boolean; error?: string }>;
    testAiConnection: (provider: any) => Promise<{ success: boolean; error?: string }>;
    getAvailableModels: (provider: any) => Promise<{ models: string[] }>;
    scanFreeLlm: (host?: string) => Promise<{ found: boolean; host?: string; port?: number; baseUrl?: string; endpoint?: string; models?: string[]; latencyMs?: number; error?: string }>;
    checkBuiltinModel: (modelName?: string) => Promise<boolean>;
    downloadBuiltinModel: (modelName?: string, force?: boolean) => Promise<{ success: boolean; error?: string }>;
    initializeBuiltinModel: (modelName?: string, settings?: any) => Promise<boolean>;
    forceUnloadAiModel: () => Promise<{ success: boolean }>;
    testBuiltinModel: (modelName?: string, promptText?: string, maxTokens?: number) => Promise<string>;
    checkOllamaOnline: () => Promise<{ online: boolean }>;
    onAiModelLoading: (callback: (data: { modelName: string; status: 'loading' | 'ready' | 'error' }) => void) => () => void;
    onAiModelTelemetry: (callback: (data: any) => void) => () => void;
    onAiModelUnloaded: (callback: () => void) => () => void;
    onAiOomWarning: (callback: (data: any) => void) => () => void;
    memoryGetAll: () => Promise<any[]>;
    memorySearch: (query: string, category?: string) => Promise<any[]>;
    memoryGetByKey: (key: string) => Promise<any | null>;
    memoryDelete: (id: string) => Promise<{ success: boolean }>;
    memoryUpdate: (id: string, updates: any) => Promise<{ success: boolean, error?: string }>;
    memoryCreate: (entry: any) => Promise<{ success: boolean, entry?: any }>;
    memoryClearAll: () => Promise<{ success: boolean }>;
    memoryGetStats: () => Promise<{totalEntries: number, vectorCount: number, categories: Record<string, number>, recentBehaviorCount: number}>;
    toolsList: () => Promise<any[]>;
    toolsExecute: (name: string, params: any) => Promise<any>;
    skillsList: () => Promise<any[]>;
    skillsToggle: (id: string) => Promise<boolean>;
    skillsUpdateTriggers: (id: string, triggers: string[]) => Promise<boolean>;
    skillsAddTrigger: (id: string, phrase: string) => Promise<boolean>;
    skillsRemoveTrigger: (id: string, phrase: string) => Promise<boolean>;
    skillsReset: (id: string) => Promise<boolean>;
    skillsClone: (id: string) => Promise<boolean>;
    skillsCreate: () => Promise<string>;
    launcherGetFolders: () => Promise<string[]>;
    launcherAddFolder: () => Promise<string | null>;
    launcherRemoveFolder: (path: string) => Promise<boolean>;
    launcherRefreshIndex: () => Promise<{
      success: boolean;
      indexed?: number;
      folders?: number;
      elapsedMs?: number;
      note?: 'no_folders';
      error?: string;
    }>;
    launcherSearch: (payload: { query: string; limit?: number }) => Promise<{
      results: Array<{ name: string; path: string; type: 'exe' | 'lnk' | 'bat' | 'cmd'; folder: string }>;
    }>;
    launcherLaunch: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
    macrosList: () => Promise<any[]>;
    macrosSave: (id: string, data: any) => Promise<boolean>;
    macrosLoad: (id: string) => Promise<any>;
    macrosDelete: (id: string) => Promise<boolean>;
    macrosExecute: (id: string) => Promise<boolean>;
    analyzeScreenVision?: () => Promise<string | { success: boolean; text?: string; error?: string }>;
    analyzeVision?: (payload?: { imageBase64?: string; mimeType?: string; prompt?: string }) => Promise<
      string | { success: boolean; text?: string; model?: string; error?: string }
    >;
    
    // Objective-First Engine API Declarations
    objectiveGetAll: () => Promise<any[]>;
    objectiveGetEntropyState: () => Promise<{ entropy: number, state: string, autoApprove: boolean }>;
    objectiveSetAutoApprove: (data: { autoApprove: boolean }) => Promise<boolean>;
    objectiveCreate: (data: { title: string, description: string, owner: string, priority: number, deadline?: string }) => Promise<any>;
    objectiveAddOutcome: (data: { objectiveId: string, title: string, metricName: string, metricSource: any, baseline: number, target: number }) => Promise<any>;
    objectiveGetGraph: () => Promise<{ nodes: any[], links: any[] }>;
    objectiveDecompose: (data: { objectiveId: string, taskDescriptionText: string }) => Promise<any>;
    objectiveDecomposeDraft?: (data: { objectiveId: string, taskDescriptionText?: string }) => Promise<any>;
    objectiveGetPendingDraft?: (data: { objectiveId: string }) => Promise<{ success: boolean; draft: any | null }>;
    objectiveApproveDraft?: (data: { objectiveId: string, draft?: any }) => Promise<any>;
    tasksAiDecompose?: (data: { taskId: string; taskText: string }) => Promise<{
      success: boolean;
      taskId: string;
      steps: string[];
      source?: 'llm' | 'local_template';
      fallbackReason?: import('./shared/types/models/task').TaskDecompositionFallbackReason;
      error?: string;
    }>;
    objectiveUpdateOutcomeValue: (data: { outcomeId: string, currentValue: number }) => Promise<boolean>;
    objectiveAddDependency: (data: { parentId: string, childId: string, weight: number }) => Promise<boolean>;
    objectiveEvaluateHealth: (objectiveId: string) => Promise<{ confidence: number, is_off_trajectory: boolean }>;
    objectiveGenerateRouteMap: (objectiveId: string) => Promise<any>;
    objectiveApproveRoute: (data: { objectiveId: string, changes?: any }) => Promise<any>;
    objectiveModifyRoute: (data: { objectiveId: string, changes: any }) => Promise<any>;
    objectiveDeclineRoute: (data: { objectiveId: string }) => Promise<any>;
    objectiveRollback: (data: { objectiveId: string }) => Promise<{ success: boolean; rolledBackActions: number; skippedActions: number; errors: string[] }>;
    objectiveSaveLayout: (data: { objectiveId: string, layout: any }) => Promise<any>;
    decisionGetAll: () => Promise<any[]>;
    decisionCreate: (data: { objectiveId: string | null, title: string, rationale: string }) => Promise<any>;
    decisionUpdateStatus: (data: { id: string, status: string }) => Promise<boolean>;
    decisionGetArtifacts: () => Promise<any[]>;
    decisionGetPredictionNodes: () => Promise<any[]>;
    decisionGetCoherenceHistory: (limit?: number) => Promise<any[]>;

    onPlayAudio: (callback: (dataUri: string) => void) => () => void;
    audioDone: () => void;
    classifyCommand: (text: string, settings?: any) => Promise<string | null>;
    onUiNavigate: (callback: (tab: string) => void) => () => void;
    showToast: (message: string, type?: 'info' | 'success' | 'error', duration?: number) => Promise<{ success: boolean }>;
    onShowToast: (callback: (data: { message: string; type?: 'info' | 'success' | 'error'; duration?: number }) => void) => () => void;
    onUiStopAudio: (callback: () => void) => () => void;
    onUiTimerAction: (callback: (action: string, minutes?: number) => void) => () => void;
    onMediaPlay: (callback: (data: { url: string; title: string }) => void) => () => void;
    onMediaPause: (callback: () => void) => () => void;
    onMediaVolume: (callback: (volume: number) => void) => () => void;
    onMediaQuieter: (callback: () => void) => () => void;
    onMediaLouder: (callback: () => void) => () => void;
    duckSystemAudio: (factor: number, enable: boolean) => Promise<{ success: boolean; error?: string }>;

    // VK Media APIs
    vkControl: (action: import('./shared/types/ipc').VkCommandAction, data?: import('./shared/types/ipc').VkControlPayload) => Promise<import('./shared/types/ipc').VkSendResult>;
    getVkConnectionStatus: () => Promise<import('./shared/types/ipc').VkConnectionStatusPayload>;
    onMediaVkConnectionStatus: (callback: (status: import('./shared/types/ipc').VkConnectionStatusPayload) => void) => () => void;
    onMediaVkStatus: (callback: (data: import('./shared/types/ipc').VkStatusPayload) => void) => () => void;

    // STT Model Management
    listSttModels: () => Promise<
      | Array<{
          id: string;
          name: string;
          provider: string;
          downloaded: boolean;
          expectedSize: string;
          sizeBytes: number;
          source?: string;
          integrity?: import('./shared/types/model-integrity').ModelIntegrityRecord;
          provenance?: import('./shared/types/model-integrity').ModelProvenanceRecord;
        }>
      | {
          sherpaAvailable: boolean;
          isPending?: boolean;
          models: Array<{
            id: string;
            name: string;
            provider: string;
            downloaded: boolean;
            expectedSize: string;
            sizeBytes: number;
            source?: string;
            integrity?: import('./shared/types/model-integrity').ModelIntegrityRecord;
            provenance?: import('./shared/types/model-integrity').ModelProvenanceRecord;
          }>;
        }
    >;
    downloadSttModel: (params: { modelId: string; provider: string }) => Promise<{ success: boolean; cancelled?: boolean; status?: string; error?: string }>;
    cancelSttDownload: (modelId?: string) => Promise<{ success: boolean; cancelled?: boolean; modelId?: string }>;
    reloadStt: (modelName?: string) => Promise<{ success: boolean; ready?: boolean; error?: string }>;
    switchSttModel: (modelId: string) => Promise<{ success?: boolean; ready: boolean; error?: string }>;
    onSttDownloadProgress: (callback: (data: { modelId: string; percent: number; status: string; error?: string; bytes_done?: number; total_bytes?: number }) => void) => () => void;
    onSttFallback: (callback: (info: { model: string; message: string }) => void) => () => void;
    onSttReady: (callback: (data: { model: string }) => void) => () => void;
    onSttEngineReady: (callback: (data: { engine: string }) => void) => () => void;
    getTtsServerStatus?: () => Promise<{
      status: string;
      port?: number | null;
      online?: boolean;
      integrity?: import('./shared/types/model-integrity').PythonBundleIntegrityReport | null;
      dependencies?: any;
      dictionaries?: any;
    }>;

    // Transcription APIs
    transcriptionCheckModel: (modelName: string) => Promise<boolean>;
    transcriptionDownloadModel: (modelName: string, device?: string) => Promise<{ success: boolean; error?: string }>;
    transcriptionTranscribeWhisper: (modelName: string, samples: Float32Array, device?: string) => Promise<{ success: boolean; result?: any; error?: string }>;
    transcriptionSendAudioChunk: (sessionId: string, chunk: ArrayBuffer, offset: number, totalSize: number) => Promise<{ success: boolean; error?: string }>;
    transcriptionTranscribeWhisperChunked: (modelName: string, sessionId: string, device?: string) => Promise<{ success: boolean; result?: any; error?: string }>;
    transcriptionTranscribeGemini: (base64Data: string, mimeType: string) => Promise<{ success: boolean; text?: string; error?: string }>;
    getMultimodalModel: () => Promise<{ model: string; hasKey: boolean }>;
    transcriptionCancel: () => Promise<{ success: boolean }>;
    onTranscriptionDownloadProgress: (callback: (data: { modelName: string; bytes_done: number; total_bytes: number; filename: string }) => void) => () => void;
    onTranscriptionChunk: (callback: (data: { text: string; timestamp: [number, number]; index: number }) => void) => () => void;
    
    // File Manager
    filesList: (dirPath?: string) => Promise<{ success: boolean; currentPath?: string; files?: Array<{ name: string; isDirectory: boolean; path: string }>; error?: string }>;
    filesRead: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    onApprovalRequest: (callback: (data: { id: string; actionType: string; target: string; reason?: string; metadata?: any }) => void) => () => void;
    respondApproval: (idOrPayload: string | { id: string; approved: boolean }, approved?: boolean) => Promise<{ success: boolean }>;

    // Storage Management & Reset
    getStorageInfo: () => Promise<{ dataDir: string; isPortable: boolean; folders: Record<string, { path: string; sizeBytes: number; exists: boolean }>; appDataLegacyPath: string }>;
    getDbStatus: () => Promise<{
      mode?: string;
      engine?: string;
      storageStatus?: string;
      isSafeMode?: boolean;
      readOnly?: boolean;
      schemaVersion?: number;
      userNotice?: string;
      lastRecovery?: { quarantined?: boolean; reason?: string; quarantineDir?: string; timestamp?: string } | null;
      capabilities?: {
        persistent: boolean;
        supportsTransactions: boolean;
        supportsRollback: boolean;
        supportsFts5: boolean;
        supportsForeignKeys: boolean;
        supportsSqlIndexes: boolean;
      };
      limitations?: string[];
      security?: { available?: boolean; backend?: string; secretsStorageMode?: string; unreadableKeysCount?: number };
    }>;
    openDataFolder: () => Promise<{ success: boolean; error?: string }>;
    resetSystem: (options?: { clearModels?: boolean }) => Promise<{
      success: boolean;
      mode?: 'app_data_and_config';
      clearModels?: boolean;
      removedTargets?: string[];
      preservedAssets?: string[];
      failedTargets?: Array<{ target: string; error: string }>;
      relaunched?: boolean;
      error?: string;
    }>;
    exportDiagnostics: () => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
    exportDataArchive: () => Promise<{ success: boolean; filePath?: string; sizeBytes?: number; entriesCount?: number; canceled?: boolean; error?: string }>;
    getAppVersion: () => Promise<string>;
    checkForUpdates: () => Promise<{
      success: boolean;
      hasUpdate?: boolean;
      currentVersion?: string;
      latestVersion?: string;
      changelog?: string;
      downloadUrl?: string;
      error?: string;
    }>;
    getTtsActiveEngine: () => Promise<{
      provider: 'auto' | 'silero' | 'edge' | 'native';
      activeEngine: 'silero' | 'edge' | 'system' | 'unavailable' | null;
      allowCloudTtsFallback?: boolean;
      forcedOfflineMode?: boolean;
      fallbackPolicy?: 'local-only' | 'cloud-allowed' | 'offline-locked';
      lastErrorReason?: string | null;
    }>;
    setTtsProvider: (provider: string) => Promise<{
      provider: 'auto' | 'silero' | 'edge' | 'native';
      activeEngine: 'silero' | 'edge' | 'system' | 'unavailable' | null;
      allowCloudTtsFallback?: boolean;
      forcedOfflineMode?: boolean;
      fallbackPolicy?: 'local-only' | 'cloud-allowed' | 'offline-locked';
      lastErrorReason?: string | null;
    }>;
    setTtsPolicy: (policy: {
      provider?: string;
      allowCloudTtsFallback?: boolean;
      forcedOfflineMode?: boolean;
    }) => Promise<{
      provider: 'auto' | 'silero' | 'edge' | 'native';
      activeEngine: 'silero' | 'edge' | 'system' | 'unavailable' | null;
      allowCloudTtsFallback?: boolean;
      forcedOfflineMode?: boolean;
      fallbackPolicy?: 'local-only' | 'cloud-allowed' | 'offline-locked';
      lastErrorReason?: string | null;
    }>;
    onTtsEngineChanged: (
      callback: (data: {
        provider: 'auto' | 'silero' | 'edge' | 'native';
        activeEngine: 'silero' | 'edge' | 'system' | 'unavailable' | null;
        allowCloudTtsFallback?: boolean;
        forcedOfflineMode?: boolean;
        fallbackPolicy?: 'local-only' | 'cloud-allowed' | 'offline-locked';
        lastErrorReason?: string | null;
      }) => void
    ) => () => void;
    onTtsMeta?: (
      callback: (data: {
        engine: 'silero' | 'edge' | 'sapi';
        isCached: boolean;
        queryId?: string;
        textHash?: string;
      }) => void
    ) => () => void;
    getVoiceSetupStatus?: (options?: { includeWhisper?: boolean; includeGigaam?: boolean; includeTts?: boolean }) => Promise<any>;
    setVoiceSetupMode?: (mode: 'setup_now' | 'later' | 'system_fallback') => Promise<any>;
    startVoiceSetup?: (options?: { includeWhisper?: boolean; includeGigaam?: boolean; includeTts?: boolean }) => Promise<any>;
    pauseVoiceSetup?: () => Promise<any>;
    cancelVoiceSetup?: () => Promise<any>;
    onVoiceSetupProgress?: (callback: (data: any) => void) => () => void;
  }
}
