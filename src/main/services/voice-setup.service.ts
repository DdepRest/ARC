import { BrowserWindow } from 'electron';
import { MODEL_SUPPLY_CHAIN_MANIFESTS, SILERO_TTS_MODEL_MANIFEST } from './model-supply-chain.manifest';
import { sherpaDownloaderService } from './sherpa-downloader.service';
import { resolveSherpaModelDir } from './sherpa-paths.util';
import { PythonServerService } from './python_server.service';
import { cancelSileroModelDownload, isSileroModelDownloading } from './python_sync.util';
import { SILERO_V56_EXPECTED_SIZE } from './python_integrity.util';
import {
  mapVoiceHealthToSetupState,
  type VoiceModelSetupState,
  type ResourceReadinessLayer
} from '../../shared/utils/voice-model-state-machine';

export type VoiceHealthState =
  | 'runtime_missing'
  | 'dependencies_missing'
  | 'model_missing'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'degraded'
  | 'failed'
  | 'cancelled';

export type VoiceSetupChoiceMode = 'setup_now' | 'later' | 'system_fallback';

export interface VoiceSetupComponentInfo {
  id: 'silero-vad' | 'zipformer-ru' | 'silero-tts-v5' | 'python-env' | 'whisper-small' | 'gigaam-ctc';
  title: string;
  tier: 'baseline' | 'optional';
  source: string;
  exactBytes: number | null;
  sizeLabel: string;
  diskRequiredBytes: number | null;
  networkRequired: boolean;
  installed: boolean;
  state: VoiceHealthState;
  setupState: VoiceModelSetupState;
  readinessLayer: ResourceReadinessLayer;
}

export interface VoiceSetupStatusSnapshot {
  overallState: VoiceHealthState;
  overallSetupState: VoiceModelSetupState;
  mode: VoiceSetupChoiceMode;
  inProgress: boolean;
  isPaused: boolean;
  activeComponentId: string | null;
  bytesDone: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number | null;
  error: string | null;
  totalKnownDownloadBytes: number;
  totalKnownDiskRequiredBytes: number;
  hasUnknownSizeComponent: boolean;
  components: VoiceSetupComponentInfo[];
}

export interface VoiceSetupStartOptions {
  includeWhisper?: boolean;
  includeGigaam?: boolean;
  includeTts?: boolean;
}

function sumManifestBytes(manifestId: string): number {
  const m = MODEL_SUPPLY_CHAIN_MANIFESTS[manifestId];
  if (!m) return 0;
  return m.files.reduce((acc, f) => acc + f.size, 0);
}

function formatBytesLabel(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes <= 0) return 'неизвестен';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} МБ (${bytes.toLocaleString('ru-RU')} Б)` : `${(bytes / 1024).toFixed(0)} КБ (${bytes.toLocaleString('ru-RU')} Б)`;
}

class VoiceSetupService {
  private mode: VoiceSetupChoiceMode = 'later';
  private activePromise: Promise<VoiceSetupStatusSnapshot> | null = null;
  private isPaused = false;
  private wasCancelled = false;
  private lastError: string | null = null;
  private activeComponentId: string | null = null;
  private bytesDone = 0;
  private totalBytes = 0;
  private speedBps = 0;
  private speedSampleCount = 0;
  private firstSampleTime = 0;
  private lastSampleTime = 0;
  private lastSampleBytes = 0;

  private isSileroTtsInstalled(): boolean {
    try {
      return !!PythonServerService.resolveSileroModelPath();
    } catch {
      return false;
    }
  }

  private checkPythonRuntimeAndDeps(): { hasPython: boolean; hasDeps: boolean } {
    try {
      const py = PythonServerService.resolvePythonExe();
      if (!py) return { hasPython: false, hasDeps: false };
      const deps = PythonServerService.getLastDependencyReadiness();
      return { hasPython: true, hasDeps: Boolean(deps?.coreReady) };
    } catch {
      return { hasPython: false, hasDeps: false };
    }
  }

  public getStatus(options?: VoiceSetupStartOptions): VoiceSetupStatusSnapshot {
    const vadInstalled = resolveSherpaModelDir('silero-vad').isComplete;
    const zipInstalled = resolveSherpaModelDir('zipformer-ru').isComplete;
    const whisperInstalled = resolveSherpaModelDir('whisper-small').isComplete;
    const gigaInstalled = resolveSherpaModelDir('gigaam-ctc').isComplete;
    const sileroInstalled = this.isSileroTtsInstalled();
    const { hasPython, hasDeps } = this.checkPythonRuntimeAndDeps();

    const vadBytes = sumManifestBytes('silero-vad');
    const zipBytes = sumManifestBytes('zipformer-ru');
    const whisperBytes = sumManifestBytes('whisper-small');
    const gigaBytes = sumManifestBytes('gigaam-ctc');
    const sileroBytes = SILERO_V56_EXPECTED_SIZE;

    const resolveCompState = (id: string, installed: boolean, isPy = false): VoiceHealthState => {
      if (this.activeComponentId === id && this.activePromise) return 'downloading';
      if (installed) return 'ready';
      if (this.wasCancelled) return 'cancelled';
      if (this.lastError && this.activeComponentId === id) return 'failed';
      if (isPy) return !hasPython ? 'runtime_missing' : 'dependencies_missing';
      return 'model_missing';
    };

    const mkModelComp = (
      id: VoiceSetupComponentInfo['id'],
      title: string,
      tier: 'baseline' | 'optional',
      source: string,
      bytes: number,
      installed: boolean
    ): VoiceSetupComponentInfo => {
      const state = resolveCompState(id, installed);
      return {
        id,
        title,
        tier,
        source,
        exactBytes: bytes,
        sizeLabel: formatBytesLabel(bytes),
        diskRequiredBytes: bytes * 2,
        networkRequired: !installed,
        installed,
        state,
        setupState: mapVoiceHealthToSetupState(state, this.mode),
        readinessLayer: state === 'verifying' ? 'downloaded' : installed ? 'verified' : 'none'
      };
    };

    const pyState = resolveCompState('python-env', hasPython && hasDeps, true);
    const components: VoiceSetupComponentInfo[] = [
      mkModelComp('silero-vad', 'Silero VAD (детектор голосовой активности)', 'baseline', 'github.com/k2-fsa/sherpa-onnx', vadBytes, vadInstalled),
      mkModelComp('zipformer-ru', 'Zipformer Small RU (базовый потоковый STT)', 'baseline', MODEL_SUPPLY_CHAIN_MANIFESTS['zipformer-ru'].source, zipBytes, zipInstalled),
      mkModelComp('silero-tts-v5', 'Silero TTS v5.6 RU (локальный синтез речи)', 'baseline', SILERO_TTS_MODEL_MANIFEST.source, sileroBytes, sileroInstalled),
      {
        id: 'python-env',
        title: 'Python 3.10–3.12 venv + PyTorch/Silero пакеты',
        tier: 'baseline',
        source: 'PyPI (torch, torchaudio, flask, edge-tts)',
        exactBytes: null,
        sizeLabel: 'неизвестен (зависит от кэша pip/платформы)',
        diskRequiredBytes: null,
        networkRequired: !hasDeps,
        installed: hasPython && hasDeps,
        state: pyState,
        setupState: mapVoiceHealthToSetupState(pyState, this.mode),
        readinessLayer: hasPython && hasDeps ? 'verified' : 'none'
      },
      mkModelComp('whisper-small', 'Whisper Small (опциональный точный STT)', 'optional', MODEL_SUPPLY_CHAIN_MANIFESTS['whisper-small'].source, whisperBytes, whisperInstalled),
      mkModelComp('gigaam-ctc', 'GigaAM v3 CTC RU (опциональный нейро-STT)', 'optional', MODEL_SUPPLY_CHAIN_MANIFESTS['gigaam-ctc'].source, gigaBytes, gigaInstalled)
    ];

    const selectedIds = new Set<string>(['silero-vad', 'zipformer-ru', 'silero-tts-v5', 'python-env']);
    if (options?.includeWhisper) selectedIds.add('whisper-small');
    if (options?.includeGigaam) selectedIds.add('gigaam-ctc');

    let totalKnownDownloadBytes = 0;
    let totalKnownDiskRequiredBytes = 0;
    let hasUnknownSizeComponent = false;
    for (const c of components) {
      if (!selectedIds.has(c.id) || c.installed) continue;
      if (c.exactBytes !== null) {
        totalKnownDownloadBytes += c.exactBytes;
        totalKnownDiskRequiredBytes += c.diskRequiredBytes || c.exactBytes;
      } else {
        hasUnknownSizeComponent = true;
      }
    }

    let overallState: VoiceHealthState = 'ready';
    if (this.activePromise) {
      overallState = 'downloading';
    } else if (this.mode === 'system_fallback') {
      overallState = vadInstalled && zipInstalled && sileroInstalled && hasDeps ? 'ready' : 'degraded';
    } else if (this.wasCancelled) {
      overallState = 'cancelled';
    } else if (this.lastError) {
      overallState = 'failed';
    } else if (!hasPython) {
      overallState = zipInstalled ? 'degraded' : 'runtime_missing';
    } else if (!hasDeps) {
      overallState = zipInstalled ? 'degraded' : 'dependencies_missing';
    } else if (!vadInstalled || !zipInstalled || !sileroInstalled) {
      overallState = zipInstalled || sileroInstalled ? 'degraded' : 'model_missing';
    }

    const etaSeconds =
      this.speedSampleCount >= 2 &&
      this.lastSampleTime - this.firstSampleTime >= 800 &&
      this.speedBps > 0 &&
      this.totalBytes > this.bytesDone
        ? Math.round((this.totalBytes - this.bytesDone) / this.speedBps)
        : null;

    return {
      overallState,
      overallSetupState: mapVoiceHealthToSetupState(overallState, this.mode),
      mode: this.mode,
      inProgress: !!this.activePromise,
      isPaused: this.isPaused,
      activeComponentId: this.activeComponentId,
      bytesDone: this.bytesDone,
      totalBytes: this.totalBytes,
      speedBps: this.speedBps,
      etaSeconds,
      error: this.lastError,
      totalKnownDownloadBytes,
      totalKnownDiskRequiredBytes,
      hasUnknownSizeComponent,
      components
    };
  }

  private recordProgress(componentId: string, done: number, total: number, mainWindow?: BrowserWindow | null) {
    const now = Date.now();
    if (this.activeComponentId !== componentId) {
      this.activeComponentId = componentId;
      this.firstSampleTime = now;
      this.lastSampleTime = now;
      this.lastSampleBytes = done;
      this.speedBps = 0;
      this.speedSampleCount = 0;
    } else {
      const dt = now - this.lastSampleTime;
      const db = done - this.lastSampleBytes;
      if (dt >= 400 && db > 0) {
        const inst = (db / dt) * 1000;
        this.speedBps = this.speedBps === 0 ? inst : Math.round(this.speedBps * 0.35 + inst * 0.65);
        this.speedSampleCount += 1;
        this.lastSampleTime = now;
        this.lastSampleBytes = done;
      }
    }
    this.bytesDone = done;
    this.totalBytes = total;
    this.emitSnapshot(mainWindow);
  }

  private emitSnapshot(mainWindow?: BrowserWindow | null) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('voice:setup-progress', this.getStatus());
    }
  }

  public setMode(mode: VoiceSetupChoiceMode, mainWindow?: BrowserWindow | null): VoiceSetupStatusSnapshot {
    this.mode = mode;
    if (mode === 'system_fallback' || mode === 'later') {
      if (this.activePromise) {
        void this.cancelSetup(mainWindow);
      }
    }
    const snap = this.getStatus();
    this.emitSnapshot(mainWindow);
    return snap;
  }

  public async startSetup(options: VoiceSetupStartOptions = {}, mainWindow?: BrowserWindow | null): Promise<VoiceSetupStatusSnapshot> {
    if (this.activePromise) {
      return this.activePromise;
    }

    this.mode = 'setup_now';
    this.isPaused = false;
    this.wasCancelled = false;
    this.lastError = null;
    this.bytesDone = 0;
    this.totalBytes = 0;
    this.speedBps = 0;
    this.speedSampleCount = 0;

    this.activePromise = (async () => {
      try {
        this.emitSnapshot(mainWindow);

        const sttModels: Array<'silero-vad' | 'zipformer-ru' | 'whisper-small' | 'gigaam-ctc'> = ['silero-vad', 'zipformer-ru'];
        if (options.includeWhisper) sttModels.push('whisper-small');
        if (options.includeGigaam) sttModels.push('gigaam-ctc');

        for (const modelId of sttModels) {
          if (this.wasCancelled) break;
          if (resolveSherpaModelDir(modelId).isComplete) continue;
          this.activeComponentId = modelId;
          this.emitSnapshot(mainWindow);
          const res = await sherpaDownloaderService.downloadModel(modelId, (data: any) => {
            this.recordProgress(modelId, data.bytes_done || 0, data.total_bytes || 0, mainWindow);
          });
          if (res.status === 'cancelled' || this.wasCancelled) {
            this.wasCancelled = true;
            break;
          }
          if (!res.success) {
            this.lastError = res.error || `Не удалось скачать ${modelId}`;
            break;
          }
        }

        if (!this.wasCancelled && !this.lastError && options.includeTts !== false) {
          this.activeComponentId = 'silero-tts-v5';
          this.emitSnapshot(mainWindow);
          await PythonServerService.start(mainWindow || null, {
            allowProvisioning: true,
            onModelProgress: (p) => {
              if (p.status === 'cancelled') this.wasCancelled = true;
              if (p.status === 'error' && p.error) this.lastError = p.error;
              this.recordProgress('silero-tts-v5', p.bytesDone, p.totalBytes, mainWindow);
            }
          });
        }
      } catch (err: any) {
        if (!this.wasCancelled) {
          this.lastError = err?.message || String(err);
        }
      } finally {
        this.activeComponentId = null;
        this.activePromise = null;
        this.speedBps = 0;
        this.emitSnapshot(mainWindow);
      }
      return this.getStatus(options);
    })();

    return this.activePromise;
  }

  public async pauseSetup(mainWindow?: BrowserWindow | null): Promise<VoiceSetupStatusSnapshot> {
    this.isPaused = true;
    return this.cancelSetup(mainWindow, true);
  }

  public async cancelSetup(mainWindow?: BrowserWindow | null, keepPausedFlag = false): Promise<VoiceSetupStatusSnapshot> {
    this.wasCancelled = true;
    this.isPaused = keepPausedFlag;
    cancelSileroModelDownload();
    await sherpaDownloaderService.cancelAllDownloads();
    if (this.activePromise) {
      try { await this.activePromise; } catch {}
    }
    const snap = this.getStatus();
    this.emitSnapshot(mainWindow);
    return snap;
  }

  public isBusy(): boolean {
    return !!this.activePromise || isSileroModelDownloading() || sherpaDownloaderService.getActiveModelIds().length > 0;
  }
}

export const voiceSetupService = new VoiceSetupService();
