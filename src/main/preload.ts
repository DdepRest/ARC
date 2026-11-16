import { contextBridge, ipcRenderer } from 'electron';
import type { VkCommandAction, VkConnectionStatusPayload, VkStatusPayload, VkControlPayload } from '../shared/types/ipc';
import { createTtsPreloadApi } from './preload-tts';
import { createDialogPreloadApi } from './preload-dialog';

const plain = <T>(v: T): T => {
  if (!v || typeof v !== 'object') return v;
  try { return JSON.parse(JSON.stringify(v)); } catch { return v; }
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  ...createTtsPreloadApi(ipcRenderer),
  ...createDialogPreloadApi(ipcRenderer, plain),
  dialogCreateSession: (name?: string) => ipcRenderer.invoke('dialog:create-session', name),
  dialogGetSession: (id: number) => ipcRenderer.invoke('dialog:get-session', id),
  dialogGetMessages: (id: number) => ipcRenderer.invoke('dialog:get-messages', id),
  dialogListSessions: (limit?: number, offset?: number, filter?: any) => ipcRenderer.invoke('dialog:list-sessions', limit, offset, plain(filter)),
  dialogAddMessage: (sessionId: number, role: string, content: string, metadata?: any) => ipcRenderer.invoke('dialog:add-message', sessionId, role, content, plain(metadata)),
  dialogUpdateSession: (id: number, data: any) => ipcRenderer.invoke('dialog:update-session', id, plain(data)),
  dialogDeleteSession: (id: number) => ipcRenderer.invoke('dialog:delete-session', id),
  dialogDeleteMessage: (id: number) => ipcRenderer.invoke('dialog:delete-message', id),
  dialogGenerateSummary: (sessionId: number) => ipcRenderer.invoke('dialog:generate-summary', sessionId),
  dialogExportSession: (sessionId: number) => ipcRenderer.invoke('dialog:export-session', sessionId),

  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getSystemMetrics: () => ipcRenderer.invoke('system:metrics'),
  setEcoState: (state: string, reason?: string) => ipcRenderer.send('eco:set-state', state, reason),
  listFiles: () => ipcRenderer.invoke('system:files'),
  getModulesStatus: () => ipcRenderer.invoke('system:modules'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  isWindowFocused: () => ipcRenderer.invoke('window:is-focused'),
  onFocusChanged: (callback: (focused: boolean) => void) => {
    const subscription = (_event: any, focused: boolean) => callback(focused);
    ipcRenderer.on('window:focus-changed', subscription);
    return () => ipcRenderer.removeListener('window:focus-changed', subscription);
  },

  toggleFocus: () => ipcRenderer.invoke('app:toggleFocus'),
  startListening: (modelName?: string) => ipcRenderer.invoke('voice:start-listening', modelName),
  stopListening: () => ipcRenderer.invoke('voice:stop-listening'),
  setVoiceBusy: (busy: boolean) => ipcRenderer.send('voice:set-busy', busy),
  duckSystemAudio: (factor: number, enable: boolean) => ipcRenderer.invoke('media:duck-system', { factor, enable }),
  speak: (text: string, style?: string, speed?: number, pitch?: number, xttsUrl?: string, sampleRate?: number, putAccent?: boolean, putYo?: boolean, speaker?: string, autoClearCache?: boolean, force?: boolean, queryId?: string) => ipcRenderer.invoke('voice:speak', plain({ text, style, speed, pitch, xttsUrl, sampleRate, putAccent, putYo, speaker, autoClearCache, force, queryId })),
  onWake: (callback: any) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('voice:wake', subscription);
    return () => ipcRenderer.removeListener('voice:wake', subscription);
  },
  aiRequest: (text: string, context: any[], reqId: string, settings?: any) => {
    const defaultFromStorage = typeof localStorage !== 'undefined' ? localStorage.getItem('arc_smart_cache_enabled') === 'true' : false;
    return ipcRenderer.invoke('ai:request', plain({ text, context, reqId, settings: { smartCacheEnabled: defaultFromStorage, ...(settings || {}) } }));
  },
  abortAiRequest: () => ipcRenderer.invoke('ai:abort-request'),
  aiPrefillPartial: (payload: { partialText: string; context?: any[]; settings?: any; utteranceId?: string }) => ipcRenderer.invoke('ai:prefill-partial', plain(payload)),
  aiCancelPrefill: (reason?: string) => ipcRenderer.invoke('ai:cancel-prefill', reason),
  getAiPrefillStats: () => ipcRenderer.invoke('ai:prefill-stats'),
  getLlmCacheStats: () => ipcRenderer.invoke('ai:cache-stats'),
  clearLlmCache: () => ipcRenderer.invoke('ai:cache-clear'),
  onAiChunk: (callback: any) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('ai:chunk', subscription);
    return () => ipcRenderer.removeListener('ai:chunk', subscription);
  },
  onAiRouteInfo: (callback: any) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('ai:route-info', subscription);
    return () => ipcRenderer.removeListener('ai:route-info', subscription);
  },
  onAiTextCorrected: (callback: any) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('ai:text-corrected', subscription);
    return () => ipcRenderer.removeListener('ai:text-corrected', subscription);
  },
  getAiProviders: () => ipcRenderer.invoke('ai:get-providers'),
  getQuarantinedAiProviders: () => ipcRenderer.invoke('ai:get-quarantined-providers'),
  resetAiProviderHealth: (id: string) => ipcRenderer.invoke('ai:reset-provider-health', id),
  saveAiProvider: (provider: any) => ipcRenderer.invoke('ai:save-provider', provider),
  deleteAiProvider: (id: string) => ipcRenderer.invoke('ai:delete-provider', id),
  testAiConnection: (provider: any) => ipcRenderer.invoke('ai:test-connection', provider),
  getAvailableModels: (provider: any) => ipcRenderer.invoke('ai:get-available-models', provider),
  scanFreeLlm: (host?: string) => ipcRenderer.invoke('ai:scan-freellm', host),
  checkBuiltinModel: (modelName?: string) => ipcRenderer.invoke('ai:check-builtin-model', modelName),
  downloadBuiltinModel: (modelName?: string, force?: boolean) => ipcRenderer.invoke('ai:download-builtin-model', modelName, force),
  cancelBuiltinModelDownload: () => ipcRenderer.invoke('ai:cancel-builtin-download'),
  initializeBuiltinModel: (modelName?: string, settings?: any) => ipcRenderer.invoke('ai:initialize-builtin-model', modelName, settings),
  forceUnloadAiModel: () => ipcRenderer.invoke('ai:force-unload'),
  testBuiltinModel: (modelName?: string, promptText?: string, maxTokens?: number) => ipcRenderer.invoke('ai:test-builtin-model', modelName, promptText, maxTokens),
  checkOllamaOnline: () => ipcRenderer.invoke('ai:check-ollama-online'),
  logDialog: (userText: string, arcResponse: string, details?: any) => ipcRenderer.invoke('ai:log-dialog', { userText, arcResponse, details }),
  analyzeScreenVision: () => ipcRenderer.invoke('ai:analyze-vision'),
  memoryGetAll: () => ipcRenderer.invoke('memory:getAll'),
  memorySearch: (query: string, category?: string) => ipcRenderer.invoke('memory:search', query, category),
  memoryGetByKey: (key: string) => ipcRenderer.invoke('memory:getByKey', key),
  memoryDelete: (id: string) => ipcRenderer.invoke('memory:delete', id),
  memoryUpdate: (id: string, updates: any) => ipcRenderer.invoke('memory:update', id, updates),
  memoryCreate: (entry: any) => ipcRenderer.invoke('memory:create', entry),
  memoryImport: (items: any[]) => ipcRenderer.invoke('memory:import', plain(items)),
  memoryClearAll: () => ipcRenderer.invoke('memory:clearAll'),
  memoryGetStats: () => ipcRenderer.invoke('memory:getStats'),
  toolsList: () => ipcRenderer.invoke('tools:list'),
  toolsExecute: (name: string, params: any) => ipcRenderer.invoke('tools:execute', { name, params }),
  skillsList: () => ipcRenderer.invoke('skills:list'),
  skillsToggle: (id: string) => ipcRenderer.invoke('skills:toggle', id),
  skillsUpdateTriggers: (id: string, triggers: string[]) => ipcRenderer.invoke('skills:updateTriggers', { id, triggers }),
  skillsAddTrigger: (id: string, phrase: string) => ipcRenderer.invoke('skills:addTrigger', { id, phrase }),
  skillsRemoveTrigger: (id: string, phrase: string) => ipcRenderer.invoke('skills:removeTrigger', { id, phrase }),
  skillsReset: (id: string) => ipcRenderer.invoke('skills:reset', id),
  skillsClone: (id: string) => ipcRenderer.invoke('skills:clone', id),
  skillsCreate: () => ipcRenderer.invoke('skills:create'),
  launcherGetFolders: () => ipcRenderer.invoke('launcher:getFolders'),
  launcherAddFolder: () => ipcRenderer.invoke('launcher:addFolder'),
  launcherRemoveFolder: (path: string) => ipcRenderer.invoke('launcher:removeFolder', path),
  launcherRefreshIndex: () => ipcRenderer.invoke('launcher:refreshIndex'),
  launcherSearch: (payload: { query: string; limit?: number }) => ipcRenderer.invoke('launcher:search', payload),
  launcherLaunch: (targetPath: string) => ipcRenderer.invoke('launcher:launch', targetPath),
  macrosList: () => ipcRenderer.invoke('macros:list'),
  macrosSave: (id: string, data: any) => ipcRenderer.invoke('macros:save', { id, data }),
  macrosLoad: (id: string) => ipcRenderer.invoke('macros:load', id),
  macrosDelete: (id: string) => ipcRenderer.invoke('macros:delete', id),
  macrosExecute: (id: string) => ipcRenderer.invoke('macros:execute', id),
  onApprovalRequest: (callback: any) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('ui:approval-request', subscription);
    return () => ipcRenderer.removeListener('ui:approval-request', subscription);
  },
  respondApproval: (idOrPayload: any, maybeApproved?: boolean) => {
    const payload = typeof idOrPayload === 'object' && idOrPayload !== null
      ? idOrPayload
      : { id: idOrPayload, approved: !!maybeApproved };
    return ipcRenderer.invoke('ui:approval-response', payload);
  },
  // Objective-First Engine Preload Methods
  objectiveGetAll: () => ipcRenderer.invoke('objective:getAll'),
  objectiveGetEntropyState: () => ipcRenderer.invoke('objective:getEntropyState'),
  objectiveSetAutoApprove: (data: { autoApprove: boolean }) => ipcRenderer.invoke('objective:setAutoApprove', data),
  objectiveCreate: (data: { title: string, description: string, owner: string, priority: number, deadline?: string }) => ipcRenderer.invoke('objective:create', data),
  objectiveAddOutcome: (data: { objectiveId: string, title: string, metricName: string, metricSource: any, baseline: number, target: number }) => ipcRenderer.invoke('objective:addOutcome', data),
  objectiveGetGraph: () => ipcRenderer.invoke('objective:getGraph'),
  objectiveDecompose: (data: { objectiveId: string, taskDescriptionText: string }) => ipcRenderer.invoke('objective:decompose', data),
  objectiveDecomposeDraft: (data: { objectiveId: string, taskDescriptionText?: string }) => ipcRenderer.invoke('objective:decompose-draft', data),
  objectiveGetPendingDraft: (data: { objectiveId: string }) => ipcRenderer.invoke('objective:get-pending-draft', data),
  objectiveApproveDraft: (data: { objectiveId: string, draft?: any }) => ipcRenderer.invoke('objective:approve-draft', data),
  objectiveUpdateOutcomeValue: (data: { outcomeId: string, currentValue: number }) => ipcRenderer.invoke('objective:updateOutcomeValue', data),
  objectiveAddDependency: (data: { parentId: string, childId: string, weight: number }) => ipcRenderer.invoke('objective:addDependency', data),
  objectiveEvaluateHealth: (objectiveId: string) => ipcRenderer.invoke('objective:evaluateHealth', { objectiveId }),
  objectiveGenerateRouteMap: (objectiveId: string) => ipcRenderer.invoke('objective:generateRouteMap', objectiveId),
  objectiveApproveRoute: (data: { objectiveId: string, changes?: any }) => ipcRenderer.invoke('objective:approveRoute', data),
  objectiveModifyRoute: (data: { objectiveId: string, changes: any }) => ipcRenderer.invoke('objective:modifyRoute', data),
  objectiveDeclineRoute: (data: { objectiveId: string }) => ipcRenderer.invoke('objective:declineRoute', data),
  objectiveRollback: (data: { objectiveId: string }) => ipcRenderer.invoke('objective:rollback', data),
  objectiveSaveLayout: (data: { objectiveId: string, layout: any }) => ipcRenderer.invoke('objective:saveLayout', data),
  onRollbackProgress: (callback: any) => { const sub = (_event: any, val: any) => callback(val); ipcRenderer.on('objective:rollback-progress', sub); return () => ipcRenderer.removeListener('objective:rollback-progress', sub); },
  decisionGetAll: () => ipcRenderer.invoke('decision:getAll'),
  decisionCreate: (data: { objectiveId: string | null, title: string, rationale: string }) => ipcRenderer.invoke('decision:create', data),
  decisionUpdateStatus: (data: { id: string, status: string }) => ipcRenderer.invoke('decision:updateStatus', data),
  decisionGetArtifacts: () => ipcRenderer.invoke('decision:getArtifacts'),
  decisionGetPredictionNodes: () => ipcRenderer.invoke('decision:getPredictionNodes'),
  decisionGetCoherenceHistory: (limit?: number) => ipcRenderer.invoke('decision:getCoherenceHistory', limit),
  onPlayAudio: (callback: any) => { const s = (_e: any, v: string) => callback(v); ipcRenderer.on('voice:play-audio', s); return () => ipcRenderer.removeListener('voice:play-audio', s); },
  onPlayAudioStop: (callback: any) => { const s = () => callback(); ipcRenderer.on('voice:play-audio-stop', s); return () => ipcRenderer.removeListener('voice:play-audio-stop', s); },
  audioDone: () => ipcRenderer.send('voice:play-audio-done'),
  stopSpeak: () => ipcRenderer.invoke('voice:stop-speak'),
  classifyCommand: (text: string, settings?: any) => ipcRenderer.invoke('ai:classify-command', { text, settings }),
  onUiNavigate: (callback: any) => {
    const subscription = (_event: any, data: any) => callback(data.tab);
    ipcRenderer.on('ui:navigate', subscription);
    return () => ipcRenderer.removeListener('ui:navigate', subscription);
  },
  onUiStopAudio: (callback: any) => {
    const subscription = (_event: any) => callback();
    ipcRenderer.on('ui:stop-audio', subscription);
    return () => ipcRenderer.removeListener('ui:stop-audio', subscription);
  },
  onUiTimerAction: (callback: any) => {
    const subscription = (_event: any, data: any) => callback(data.action, data.minutes);
    ipcRenderer.on('ui:timer-action', subscription);
    return () => ipcRenderer.removeListener('ui:timer-action', subscription);
  },
  savePerfConfig: (config: { targetFps: string, disableVsync: boolean }) => ipcRenderer.invoke('system:save-perf-config', config),
  loadPerfConfig: () => ipcRenderer.invoke('system:load-perf-config'),
  writeClipboard: (text: string) => ipcRenderer.invoke('system:write-clipboard', text),
  clipboard: { writeText: (text: string) => ipcRenderer.invoke('system:write-clipboard', text) },
  // Sherpa STT
  streamAudioChunk: (samples: Float32Array) => ipcRenderer.send('voice:stream-chunk', samples),
  streamAudioEnd: () => ipcRenderer.send('voice:stream-end'),
  resetSttBuffer: () => ipcRenderer.send('voice:reset-buffer'),
  onSttPartial: (cb: (text: string) => void) => {
    const sub = (_e: any, text: string) => cb(text);
    ipcRenderer.on('stt:partial', sub);
    return () => ipcRenderer.removeListener('stt:partial', sub);
  },
  onSttFinal: (cb: (text: string) => void) => {
    const sub = (_e: any, text: string) => cb(text);
    ipcRenderer.on('stt:final', sub);
    return () => ipcRenderer.removeListener('stt:final', sub);
  },
  getSttStatus: () => ipcRenderer.invoke('stt:status'),
  setSttEngine: (engine: 'gigaam' | 'legacy') => ipcRenderer.invoke('stt:set-engine', engine),
  reloadStt: (modelName?: string) => ipcRenderer.invoke('stt:reload', modelName),
  switchSttModel: (modelId: string) => ipcRenderer.invoke('stt:switch-model', modelId),
  listSttModels: () => ipcRenderer.invoke('stt:list-models'),
  downloadSttModel: (params: { modelId: string; provider: string }) => ipcRenderer.invoke('stt:download-model', params),
  cancelSttDownload: () => ipcRenderer.invoke('stt:cancel-download'),
  onSttDownloadProgress: (cb: (data: any) => void) => {
    const sub = (_e: any, data: any) => cb(data);
    ipcRenderer.on('stt:download-progress', sub);
    return () => ipcRenderer.removeListener('stt:download-progress', sub);
  },
  getTtsServerStatus: () => ipcRenderer.invoke('tts:server-status'),
  restartTtsServer: () => ipcRenderer.invoke('tts:restart-server'),
  onSttModelDownloadProgress: (cb: (p: {bytes:number,total:number}) => void) => {
    const sub = (_e: any, p: any) => cb(p);
    ipcRenderer.on('stt:model-download-progress', sub);
    return () => ipcRenderer.removeListener('stt:model-download-progress', sub);
  },
  onSttModelsUpdated: (cb: (data: any) => void) => {
    const sub = (_e: any, data: any) => cb(data);
    ipcRenderer.on('stt:models-updated', sub);
    return () => ipcRenderer.removeListener('stt:models-updated', sub);
  },
  onSttFallback: (cb: (data: any) => void) => {
    const sub = (_e: any, data: any) => cb(data);
    ipcRenderer.on('stt:fallback', sub);
    return () => ipcRenderer.removeListener('stt:fallback', sub);
  },
  onSttReady: (cb: (data: any) => void) => {
    const sub = (_e: any, data: any) => cb(data);
    ipcRenderer.on('stt:ready', sub);
    return () => ipcRenderer.removeListener('stt:ready', sub);
  },
  onSttEngineReady: (cb: (data: { engine: string }) => void) => {
    const sub = (_e: any, data: any) => cb(data);
    ipcRenderer.on('stt:engine-ready', sub);
    return () => ipcRenderer.removeListener('stt:engine-ready', sub);
  },

  // Adaptive Voice & Cache
  getAdaptiveState: () => ipcRenderer.invoke('adaptive:get-state'),
  forceTier: (tierName: string) => ipcRenderer.invoke('adaptive:force-tier', tierName),
  addProcess: (name: string, path?: string) => ipcRenderer.invoke('adaptive:add-process', name),
  getCacheStats: () => ipcRenderer.invoke('voice:get-cache-stats'),
  clearAudioCache: () => ipcRenderer.invoke('voice:clear-cache'),
  clearCache: () => ipcRenderer.invoke('voice:clear-cache'),
  getTtsPresets: () => ipcRenderer.invoke('tts:get-presets'),
  getTtsTier: () => ipcRenderer.invoke('tts:get-tier'),
  onAppLoadingProgress: (callback: any) => {
    const subscription = (_event: any, msg: string) => callback(msg);
    ipcRenderer.on('app:loading-progress', subscription);
    return () => ipcRenderer.removeListener('app:loading-progress', subscription);
  },
  onAppToast: (callback: any) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('app:toast', subscription);
    return () => ipcRenderer.removeListener('app:toast', subscription);
  },
  showToast: (message: string, type?: 'info' | 'success' | 'error', duration?: number) =>
    ipcRenderer.invoke('ui:show-toast', { message, type, duration }),
  onShowToast: (callback: (data: { message: string; type?: 'info' | 'success' | 'error'; duration?: number }) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('ui:show-toast', subscription);
    return () => ipcRenderer.removeListener('ui:show-toast', subscription);
  },
  onModelDownloadProgress: (callback: any) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('model:download-progress', subscription);
    return () => ipcRenderer.removeListener('model:download-progress', subscription);
  },
  onLlmFallbackRequired: (callback: (data: { modelName: string; sizeBytes: number; reason: string; timeoutMs: number }) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('llm:fallback-required', subscription);
    return () => ipcRenderer.removeListener('llm:fallback-required', subscription);
  },
  approveLlmFallback: () => ipcRenderer.invoke('llm:approve-fallback'),
  rejectLlmFallback: () => ipcRenderer.invoke('llm:reject-fallback'),
  getActiveModelDownload: () => ipcRenderer.invoke('ai:get-active-download'),
  cancelBuiltinDownload: () => ipcRenderer.invoke('ai:cancel-builtin-download'),
  resetHfCooldown: () => ipcRenderer.invoke('hf:reset-cooldown'),
  onHfCooldownTick: (callback: (data: { remainingSeconds: number }) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('hf:cooldown-tick', subscription);
    return () => ipcRenderer.removeListener('hf:cooldown-tick', subscription);
  },
  onAiModelLoading: (callback: (data: { modelName: string; status: 'loading' | 'ready' | 'error' }) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('ai:model-loading', subscription);
    return () => ipcRenderer.removeListener('ai:model-loading', subscription);
  },
  onAppModulesLoaded: (callback: any) => {
    const subscription = (_event: any) => callback();
    ipcRenderer.on('app:modules-loaded', subscription);
    return () => ipcRenderer.removeListener('app:modules-loaded', subscription);
  },
  
  // Voice Calibration
  startCalibration: () => ipcRenderer.invoke('voice:calibration-start'),
  finishCalibration: (audioBuffer: any) => ipcRenderer.invoke('voice:calibration-done', audioBuffer),
  resetCalibration: () => ipcRenderer.invoke('voice:calibration-reset'),

  // Media Playback Listeners
  onMediaPlay: (callback: any) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('media:play', subscription);
    return () => ipcRenderer.removeListener('media:play', subscription);
  },
  onMediaPause: (callback: any) => {
    const subscription = (_event: any) => callback();
    ipcRenderer.on('media:pause', subscription);
    return () => ipcRenderer.removeListener('media:pause', subscription);
  },
  onMediaVolume: (callback: any) => {
    const subscription = (_event: any, value: number) => callback(value);
    ipcRenderer.on('media:volume', subscription);
    return () => ipcRenderer.removeListener('media:volume', subscription);
  },
  onMediaQuieter: (callback: any) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('media:quieter', subscription);
    return () => ipcRenderer.removeListener('media:quieter', subscription);
  },
  onMediaLouder: (callback: any) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('media:louder', subscription);
    return () => ipcRenderer.removeListener('media:louder', subscription);
  },
  onMediaVkStatus: (callback: (data: VkStatusPayload) => void) => {
    const subscription = (_event: any, value: VkStatusPayload) => callback(value);
    ipcRenderer.on('media:vk-status', subscription);
    return () => ipcRenderer.removeListener('media:vk-status', subscription);
  },
  getVkConnectionStatus: () => ipcRenderer.invoke('vk:get-connection-status'),
  onMediaVkConnectionStatus: (callback: (status: VkConnectionStatusPayload) => void) => {
    const subscription = (_event: any, value: VkConnectionStatusPayload) => callback(value);
    ipcRenderer.on('media:vk-connection-status', subscription);
    return () => ipcRenderer.removeListener('media:vk-connection-status', subscription);
  },
  vkControl: (action: VkCommandAction, data?: VkControlPayload) => ipcRenderer.invoke('vk:control', action, data),

  // Transcription/STT Audio-to-Text APIs
  transcriptionCheckModel: (modelName: string) => ipcRenderer.invoke('transcription:check-whisper-model', { modelName }),
  transcriptionDownloadModel: (modelName: string, device?: string) => ipcRenderer.invoke('transcription:download-whisper-model', { modelName, device }),
  transcriptionTranscribeWhisper: (modelName: string, samples: Float32Array, device?: string) => ipcRenderer.invoke('transcription:transcribe-whisper', { modelName, samples, device }),
  transcriptionSendAudioChunk: (sessionId: string, chunk: ArrayBuffer, offset: number, totalSize: number) => ipcRenderer.invoke('transcription:send-audio-chunk', { sessionId, chunk, offset, totalSize }),
  transcriptionTranscribeWhisperChunked: (modelName: string, sessionId: string, device?: string) => ipcRenderer.invoke('transcription:transcribe-whisper-chunked', { modelName, sessionId, device }),
  transcriptionTranscribeGemini: (base64Data: string, mimeType: string) => ipcRenderer.invoke('transcription:transcribe-gemini', { base64Data, mimeType }),
  transcriptionCancel: () => ipcRenderer.invoke('transcription:cancel'),
  onTranscriptionDownloadProgress: (callback: any) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('transcription:download-progress', subscription);
    return () => ipcRenderer.removeListener('transcription:download-progress', subscription);
  },
  onTranscriptionChunk: (callback: any) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('transcription:chunk', subscription);
    return () => ipcRenderer.removeListener('transcription:chunk', subscription);
  },
  
  // File System (Read-Only Viewer)
  filesList: (dirPath?: string) => ipcRenderer.invoke('files:list', dirPath),
  filesRead: (filePath: string) => ipcRenderer.invoke('files:read', filePath),

  // Operational Tasks SQLite APIs
  tasksList: () => ipcRenderer.invoke('tasks:list'),
  tasksSaveAll: (tasks: any[]) => ipcRenderer.invoke('tasks:saveAll', tasks),
  tasksCreate: (data: any) => ipcRenderer.invoke('tasks:create', data),
  tasksComplete: (id: string) => ipcRenderer.invoke('tasks:complete', id),
  tasksDelete: (id: string) => ipcRenderer.invoke('tasks:delete', id),
  tasksUpsert: (task: any) => ipcRenderer.invoke('tasks:upsert', task),
  tasksBatchUpsert: (tasks: any[], source?: 'renderer' | 'ai_tool' | 'system') => ipcRenderer.invoke('tasks:batch-upsert', { tasks, source }),
  tasksClearAll: () => ipcRenderer.invoke('tasks:clear-all'),
  tasksAiDecompose: (data: { taskId: string; taskText: string }) => ipcRenderer.invoke('tasks:ai-decompose', data),
  onTasksChanged: (callback: (payload: any) => void) => { const sub = (_e: any, payload: any) => callback(payload); ipcRenderer.on('tasks:changed', sub); return () => ipcRenderer.removeListener('tasks:changed', sub); },
  getMultimodalModel: () => ipcRenderer.invoke('ai:get-multimodal-model'),
  // Secure Settings & safeStorage API keys
  settingsGetKey: (keyName: string) => ipcRenderer.invoke('settings:get-key', keyName),
  settingsSetKey: (keyName: string, value: string) => ipcRenderer.invoke('settings:set-key', keyName, value),
  settingsIsSafeStorageAvailable: () => ipcRenderer.invoke('settings:is-safe-storage-available'),
  // Storage & Reset System APIs
  getStorageInfo: () => ipcRenderer.invoke('system:get-storage-info'),
  getDbStatus: () => ipcRenderer.invoke('system:get-db-status'),
  openDataFolder: () => ipcRenderer.invoke('system:open-data-folder'),
  resetSystem: (options?: { clearModels?: boolean }) => ipcRenderer.invoke('system:reset-data', options),
  exportDiagnostics: () => ipcRenderer.invoke('system:export-diagnostics'),
  exportDataArchive: () => ipcRenderer.invoke('system:export-archive'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates')
});
