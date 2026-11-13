import { logger } from '../utils/logger';
import { ref, watch } from 'vue';
import { useSettingsStore } from '../features/settings/stores/settings.store';
import { useUIStore } from '../stores/ui.store';
import { useModelDownloadStore } from '../features/modelDownload/stores/modelDownload.store';
import { restorePunctuation } from '../../shared/utils/russian-punctuator';
import { isStopCommand, isGratitudeCommand } from '../../shared/utils/stop-command';
import { generateGratitudeResponse } from '../features/commands/commands.utils';
import { audioManager } from './useAudioManager';
import { audioDuckingManager } from '../audio/audio-ducking-manager';
import { useChatStore } from '../features/chat/stores/chat.store';
import { useSessionsStore } from '../features/chat/stores/sessions.store';
import { sanitizeRawContent } from '../features/chat/utils/markdown';

export type VoiceFSMState = 'IDLE' | 'TRIGGERED' | 'PROCESSING';
const voiceState = ref<VoiceFSMState>('IDLE');

export function getVoiceState(): VoiceFSMState {
  return voiceState.value;
}

export function transitionVoiceState(newState: VoiceFSMState) {
  if (voiceState.value === newState) return;
  const oldState = voiceState.value;
  voiceState.value = newState;
  if (newState === 'PROCESSING') {
    processingStartedAt = Date.now();
  } else if (newState === 'IDLE') {
    processingStartedAt = 0;
  }
  logger.info(`[VoiceFSM] Transition: ${oldState} -> ${newState}`);

  const isBusy = newState !== 'IDLE';
  if (typeof window !== 'undefined') {
    if ((window as any).api && typeof (window as any).api.setVoiceBusy === 'function') {
      (window as any).api.setVoiceBusy(isBusy);
    }
    try {
      const downloadStore = useModelDownloadStore();
      downloadStore.setPausedForVoice(isBusy);
    } catch {}
  }
}

const isListening = ref(false);
const isModelLoaded = ref(false);
const isTranscribing = ref(false);
const transcribeProgress = ref(0);
const transcript = ref('');
const partialTranscript = ref('');
const dictationTranscript = ref('');
const modelProgress = ref(0);
export const isWakeWordSuspended = ref(false);
export const isWorkletPaused = ref(false);
let wasListeningBeforeSuspend = false;
let isStartingListening = false;

const isSpeakingVAD = ref(false);
const rmsLevel = ref(0);
const lastActiveDialogueTime = ref<number>(0);
const dialogueWindowOpenedAt = ref<number>(0);
const lastVadSpeechTime = ref<number>(0);
const ACTIVE_DIALOGUE_DURATION_MS = 15000;
let countdownInterval: number | null = null;
let lastStopWordTime = 0;
let monologueTimeout: ReturnType<typeof setTimeout> | null = null;
let isGratitudeClosing = false;
let pendingVoiceReply = false;
let processingStartedAt = 0;

export type VoiceMode = 'WAKE_WORD_ONLY' | 'ACTIVE_DIALOGUE';
export const voiceMode = ref<VoiceMode>('WAKE_WORD_ONLY');

export function canOpenDialogueWindow(): boolean {
  if (isGratitudeClosing) {
    return false;
  }
  return voiceMode.value === 'ACTIVE_DIALOGUE' || pendingVoiceReply;
}

function clearMonologueTimeout() {
  if (monologueTimeout !== null) {
    clearTimeout(monologueTimeout);
    monologueTimeout = null;
  }
}

function stopCountdownTimer() {
  if (countdownInterval !== null) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

let currentPrefillUtteranceId = '';

function cancelVoiceKvPrefill(reason: string = 'voice_cancel'): void {
  currentPrefillUtteranceId = '';
  if (typeof window !== 'undefined' && typeof (window as any).api?.aiCancelPrefill === 'function') {
    Promise.resolve((window as any).api.aiCancelPrefill(reason)).catch(() => {});
  }
}

function handleStopWordAction(sourceText: string, contextTag: string = ''): void {
  const now = Date.now();
  if (now - lastStopWordTime < 1000) {
    // Debounce duplicate stop-word detections within 1000ms window
    return;
  }
  lastStopWordTime = now;

  console.log(`[Voice] Stop word detected: "${sourceText}"`);
  logger.info(`Voice: Stop word detected${contextTag ? ` (${contextTag})` : ''}: "${sourceText}". Silencing dialogue.`);
  
  cancelVoiceKvPrefill('stop_word');
  clearActiveDialogueWindow();
  wakeWordLockUntil = Date.now() + 5000;
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('arc:stop-audio'));
  }
  const uiStore = useUIStore();
  uiStore.setSoftPaused(false);
  uiStore.setReactorState('idle');
}

export function applyAudioDucking(enable: boolean) {
  if (enable) {
    audioDuckingManager.duck();
  } else {
    audioDuckingManager.restore();
  }
}

function updateCountdownUI() {
  const uiStore = useUIStore();
  if (lastActiveDialogueTime.value <= 0) {
    uiStore.setConversationCountdown(0);
    stopCountdownTimer();
    return;
  }
  const now = Date.now();
  const isTtsSpeaking =
    uiStore.reactorState === 'speaking' ||
    Boolean(typeof window !== 'undefined' && (window as any).audioManager?.isTtsPlaying?.());
  const isProcessingActive =
    voiceState.value === 'PROCESSING' &&
    processingStartedAt > 0 &&
    now - processingStartedAt < 75000;

  if (isTtsSpeaking || isProcessingActive) {
    lastActiveDialogueTime.value = now;
    dialogueWindowOpenedAt.value = now;
    uiStore.setConversationCountdown(15);
    return;
  }

  const elapsedSec = (now - lastActiveDialogueTime.value) / 1000;
  const remainingSec = Math.max(0, 15 - Math.floor(elapsedSec));
  uiStore.setConversationCountdown(remainingSec);
  if (remainingSec <= 0) {
    lastActiveDialogueTime.value = 0;
    dialogueWindowOpenedAt.value = 0;
    stopCountdownTimer();
    applyAudioDucking(false);
    if (voiceState.value !== 'IDLE') {
      transitionVoiceState('IDLE');
      logger.info('[VoiceFSM] Auto-reset to IDLE on dialogue window timeout');
    }
    if (voiceMode.value === 'ACTIVE_DIALOGUE' && !pendingVoiceReply) {
      voiceMode.value = 'WAKE_WORD_ONLY';
    }
  }
}

function refreshActiveDialogueWindow() {
  voiceMode.value = 'ACTIVE_DIALOGUE';
  const now = Date.now();
  dialogueWindowOpenedAt.value = now;
  lastActiveDialogueTime.value = now;
  stopCountdownTimer();
  updateCountdownUI();
  countdownInterval = globalThis.setInterval(updateCountdownUI, 500) as unknown as number;
  applyAudioDucking(true);
  logger.info('Voice: Active dialogue window refreshed (15s active window).');
}

function clearActiveDialogueWindow() {
  pendingVoiceReply = false;
  cancelVoiceKvPrefill('clear_dialogue_window');
  applyAudioDucking(false);
  // Guard: if window is already inactive, return immediately to prevent duplicate clears or logs
  const isActive = lastActiveDialogueTime.value > 0 || dialogueWindowOpenedAt.value > 0;
  if (!isActive) {
    return;
  }
  lastActiveDialogueTime.value = 0;
  dialogueWindowOpenedAt.value = 0;
  stopCountdownTimer();
  updateCountdownUI();
  transitionVoiceState('IDLE');
  logger.info('Voice: Active dialogue window cleared.');
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('arc:clear-dialogue-window', () => {
    clearActiveDialogueWindow();
  });
  window.addEventListener('arc:tts-finish', () => {
    transitionVoiceState('IDLE');
    try {
      const uiStore = useUIStore();
      if (uiStore.reactorState === 'speaking') uiStore.setReactorState('idle');
    } catch (_) {}
    if (typeof (window as any)?.api?.resetSttBuffer === 'function') {
      (window as any).api.resetSttBuffer();
    }
    audioBuffer = [];
    if (isGratitudeClosing) {
      isGratitudeClosing = false;
      pendingVoiceReply = false;
      clearActiveDialogueWindow();
      logger.info('Voice: Suppressed dialogue window reopening due to gratitude closing.');
    } else if (canOpenDialogueWindow()) {
      pendingVoiceReply = false;
      refreshActiveDialogueWindow();
    } else {
      logger.info('Voice: Suppressed dialogue window refresh on tts-finish (canOpenDialogueWindow is false).');
    }
  });
  window.addEventListener('arc:stop-audio', () => {
    transitionVoiceState('IDLE');
    try {
      const uiStore = useUIStore();
      if (uiStore.reactorState === 'speaking') uiStore.setReactorState('idle');
    } catch (_) {}
    if (typeof (window as any)?.api?.resetSttBuffer === 'function') {
      (window as any).api.resetSttBuffer();
    }
    audioBuffer = [];
    clearActiveDialogueWindow();
  });
}

let worker: Worker | null = null;
let currentLoadedModel: string | null = null;
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;

export function safeCloseAudioContext(ctx: AudioContext | null | undefined): void {
  if (!ctx) return;
  try {
    if ((ctx as any).__arcClosed || (ctx as any).state === 'closed') return;
    (ctx as any).__arcClosed = true;
    try {
      if ((ctx as any).state !== 'closed') {
        const p = ctx.close();
        if (p && typeof p.then === 'function') {
          p.then(() => {}).catch(() => {});
        } else if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
    } catch (_) {
      // Suppress InvalidStateError if context is already closed or closing
    }
  } catch (_) {
    // Suppress any errors when accessing closed audio contexts
  }
}

let workletNode: any = null; // Can hold AudioWorkletNode dynamically
let gainNode: GainNode | null = null;
let nativeRecognition: any = null;

let audioBuffer: Float32Array[] = [];
let silenceStart: number | null = null;
let isSpeaking = false;

let lastPartialEvalTime = 0;
const PARTIAL_EVAL_THROTTLE_MS = 250; // 4 times per second maximum

let wakeWordLockUntil = 0;
const WAKE_WORD_COOLDOWN_MS = 3000;

let lastWakeLogText = '';
let lastWakeLogTime = 0;

function shouldLogWakeMiss(raw: string, clean: string): boolean {
  const key = `${raw}|${clean}`;
  const now = Date.now();
  if (key === lastWakeLogText && now - lastWakeLogTime < 1500) {
    return false;
  }
  lastWakeLogText = key;
  lastWakeLogTime = now;
  return true;
}

const BARGE_IN_STOP_WORDS = [
  'стоп',
  'хватит',
  'отмена',
  'замолчи',
  'тихо',
  'выключи',
  'прекрати',
  'заткнись',
  'молчи',
  'пауза',
  'заглуши',
  'stop',
  'cancel',
  'cnjg'
];

export const isMediaPauseCommand = (text: string): boolean => {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;
  return /(?:поставь\s+(?:музыку|трек|песню)?\s*на\s*паузу|музыку\s*на\s*паузу|останови\s+музыку|выключи\s+музыку|выруби\s+музыку|выключи\s+трек|пауза\s+музык[а-я]|останови\s+воспроизведение)/i.test(lower);
};

const checkBargeInStop = (text: string): boolean => {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;

  // Never hijack media pause/stop commands as pure speech silence commands
  if (isMediaPauseCommand(lower) || /(?:музык|трек|песн|плеер|вк\b|vk\b)/i.test(lower)) {
    return false;
  }

  let withoutWake = lower;
  const wakeWords = ['арк', 'arc', 'а.р.к.', 'a.r.c.'];
  for (const w of wakeWords) {
    if (withoutWake.startsWith(w + ' ')) {
      withoutWake = withoutWake.substring(w.length + 1).trim();
      break;
    } else if (withoutWake === w) {
      withoutWake = '';
      break;
    }
  }

  return BARGE_IN_STOP_WORDS.some(word => {
    if (withoutWake === word) return true;
    const regex = new RegExp(`^${word}(?=[^а-яёА-ЯЁa-zA-Z0-9]|$)`, 'i');
    return regex.test(withoutWake);
  });
};

// AudioWorklet processor worker code encoded inline as a string


const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,    // deletion
          matrix[i][j - 1] + 1,    // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }
  return matrix[a.length][b.length];
};

let partialUnsub: any = null;
let finalUnsub: any = null;
let readyUnsub: any = null;
let wasListeningBeforeBlur = false;
let resumeListeningTimer: any = null;
let focusListenersAttached = false;


const getEffectiveSttProvider = (store: any) => {
  const isElectron = typeof window !== 'undefined' && Boolean((window as any).api);
  if (isElectron) {
    return 'sherpa';
  }
  return store?.sttProvider || 'native';
};
export function useVoice() {
  const uiStore = useUIStore();
  const settingsStore = useSettingsStore();

  if (typeof window !== 'undefined' && (window as any).api?.onSttReady && !readyUnsub) {
    readyUnsub = (window as any).api.onSttReady((data: any) => {
      console.log('[STT] Worker ready, clearing error banner:', data?.model);
      uiStore.sttErrorText = null;
    });
  }

  const SILENCE_DURATION_MS = 300; // Ultra-fast 300ms silence cutoff for rapid command isolation
  const SAMPLE_RATE = 16000; // Whisper expects 16kHz
  
  const initModel = async () => {
    const uiStore = useUIStore();
    const settingsStore = useSettingsStore();
    let requestedModel = settingsStore.sttModel || 'tiny';
    if (requestedModel.includes('zipformer')) {
        requestedModel = 'tiny';
        settingsStore.sttModel = 'tiny';
    }

    if (worker) {
      if (currentLoadedModel !== requestedModel) {
        logger.info(`[Whisper] Model changed from ${currentLoadedModel} to ${requestedModel}, reloading...`);
        worker.postMessage({ type: 'unload' });
        worker.terminate(); // Terminate old worker to prevent memory leak
        worker = null;
        isTranscribing.value = false;
        isModelLoaded.value = false;
      } else {
        return;
      }
    }
    
    currentLoadedModel = requestedModel;
    
    // STRICT: Do not initialize Whisper if Native provider is active
    const isRealElectron = typeof window !== 'undefined' && Boolean((window as any).api);
    
    if (isRealElectron) {
      // В Electron используем только Sherpa через IPC
      // Worker не создаём вообще, независимо от sttProvider
      logger.info('Voice: Electron mode detected. Using Sherpa via IPC, skipping Web Worker.');
      return;
    }
    
    // Web Worker только для web-preview
    if (getEffectiveSttProvider(settingsStore) !== 'whisper') return;

    uiStore.setSttLoading(0, settingsStore.sttModel || 'tiny');

    return new Promise<void>((resolve, reject) => {
      try {
        logger.info('Voice: Loading Whisper worker...');
        worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
        
        worker.addEventListener('message', (e) => {
          const { type, payload } = e.data;
          
          if (type === 'progress') {
            if (payload.status === 'progress') {
              const prog = Math.round(payload.progress);
              modelProgress.value = prog;
              uiStore.setSttLoading(prog, settingsStore.sttModel || 'tiny');
            }
          }
          
          if (type === 'loaded') {
            logger.info('Voice: Whisper model loaded successfully in worker.');
            isModelLoaded.value = true;
            uiStore.setSttLoading(100, settingsStore.sttModel || 'tiny');
            resolve();
          }
          
          if (type === 'error_cache_corrupted') {
            logger.info('Voice: Corrupted cache detected via worker. Clearing transformers-cache and retrying...');
            if (worker) {
              worker.postMessage({ type: 'clear_cache' });
            }
          }
          
          if (type === 'cache_cleared') {
            const settingsStore = useSettingsStore();
            const modelName = settingsStore.sttModel || 'tiny';
            worker?.postMessage({ type: 'load', payload: { sttModel: modelName } }); // Retry loading
          }
          
          if (type === 'error') {
            const errMsg = String(payload || '');
            if (
              (errMsg.includes('Removing initializer') && errMsg.includes('not used by any node')) ||
              errMsg.includes('Unable to determine content-length')
            ) {
              return;
            }
            console.error('Voice: Worker Error:', payload);
            uiStore.setSttLoading(null);
            reject(new Error(payload));
          }
          
          if (type === 'result') {
            logger.info('Voice: Transcriber result:', payload);
            transcribeProgress.value = 100;
            if (payload && payload.text) {
              const rawText = String(payload.text);
              let text = rawText.toLowerCase().trim();
              text = cleanText(text);
              text = postProcessTranscription(text);
              if (text) {
                handleTranscriptionResult(text, rawText);
              }
            }
            isTranscribing.value = false;
          }
        });
        
        // Start loading the model inside the worker
        const settingsStore = useSettingsStore();
        const modelName = settingsStore.sttModel || 'tiny';
        worker.postMessage({ type: 'load', payload: { sttModel: modelName } });
      } catch (err) {
        console.error('Voice: Failed to init worker', err);
        uiStore.setSttLoading(null);
        reject(err);
      }
    });
  };

  /**
   * Post-processing dictionary for common Whisper/STT speech errors and synonyms
   */
  const postProcessTranscription = (text: string): string => {
    let result = text.trim();
    if (!result) return '';

    const settingsStore = useSettingsStore();

    // 1. Apply user-defined custom dictionary corrections first
    if (settingsStore.sttCorrections && Object.keys(settingsStore.sttCorrections).length > 0) {
      for (const [wrong, correct] of Object.entries(settingsStore.sttCorrections)) {
        if (wrong.trim()) {
          // Escape wrong key to prevent RegExp parsing error
          const escapedWrong = wrong.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          result = result.replace(new RegExp(escapedWrong, 'gi'), correct);
        }
      }
    }

    // Helper to create a RegExp with strict Russian/English word boundaries.
    const wb = (pattern: string) => new RegExp(`(?<=^|[^а-яёА-ЯЁa-zA-Z0-9_.-])${pattern}(?=[^а-яёА-ЯЁa-zA-Z0-9_.-]|$)`, 'gi');

    // 2. Built-in standard corrections
    const corrections: [RegExp, string][] = [
      [wb('как\\s+джон'), 'как дела'],
      [wb('как\\s+дон'), 'как дела'],
      [wb('побела'), 'как дела'],
      [wb('а,?\\s*вообще,?\\s*музыку'), 'a.r.c. включи музыку'],
      [wb('а,?\\s*вообще'), 'a.r.c. включи'],
      [wb('а,?\\s*в общем,?\\s*музыку'), 'a.r.c. включи музыку'],
      [wb('а,?\\s*в общем'), 'a.r.c. включи'],
      [wb('в,?\\s*общем,?\\s*музыку'), 'a.r.c. включи музыку'],
      [wb('в,?\\s*общем'), 'a.r.c. включи'],
      [wb('а,?\\s*общем,?\\s*музыку'), 'a.r.c. включи музыку'],
      [wb('а,?\\s*общем'), 'a.r.c. включи'],
      [wb('харфклищем'), 'включи'],
      [wb('включим'), 'включи'],
      [wb('ключим'), 'включи'],
      [wb('мы запомнили'), 'музыку'],
      [wb('youyoutube'), 'youtube'],
      [wb('youyube'), 'ютуб'],
      [wb('ютубе'), 'ютуб'],
      [wb('ютюбе'), 'ютуб'],
      [wb('ютюб'), 'ютуб'],
      [wb('воцап'), 'whatsapp'],
      [wb('вацап'), 'whatsapp'],
      [wb('вацапп'), 'whatsapp'],
      [wb('телеграм'), 'telegram'],
      [wb('телега'), 'telegram'],
      [wb('гугл'), 'google'],
      [wb('яндекс'), 'yandex'],
      [wb('открый'), 'открой'], 
      [wb('одкрой'), 'открой'],
      [wb('адкрой'), 'открой'],
      [wb('окрои'), 'открой'],
      [wb('закрои'), 'закрой'],
      [wb('запуст'), 'запусти'],
      [wb('плэй'), 'плей'],
      [wb('вопроизвед'), 'воспроизведи'],
      [wb('представьте'), 'представься'],
      [wb('представьтесь'), 'представься'],
      [wb('представся'), 'представься'],
      [wb('представьсе'), 'представься'],
      [wb('арк'), 'a.r.c.'],
      [wb('включи музыку'), 'включи музыку'],
      [wb('включи музу'), 'включи музыку'],
      [wb('включи что-нибудь'), 'включи музыку'],
      [wb('следующий трек'), 'следующий'],
      [wb('предыдущий трек'), 'предыдущий'],
      [wb('паузу'), 'пауза'],
      [wb('питон'), 'python'],
      [wb('джава'), 'java'],
      
      // Russian phonetic/acoustic corrections for common mishearings
      [wb('(?:в\\s*)?глузу\\s*кулака'), 'музыку вк'],
      [wb('глузу\\s*кулака'), 'музыку вк'],
      [wb('глузу'), 'музыку'],
      [wb('музыку\\s*лка'), 'музыку вк'],
      [wb('музыка\\s*лка'), 'музыка вк'],
      [wb('музыку\\s*кулака'), 'музыку вк'],
      [wb('музыка\\s*кулака'), 'музыка вк'],
      [wb('музыку\\s*века'), 'музыку вк'],
      [wb('музыку\\s*бка'), 'музыку вк'],
      [wb('музыку\\s*фк'), 'музыку вк'],
      [wb('музыку\\s*вка'), 'музыку вк'],
      [wb('музыку\\s*в\\s*ка'), 'музыку вк'],
      [wb('музыку\\s*ка'), 'музыку вк'],
      [wb('громче\\s*музыку\\s*лка'), 'громче музыку вк'],
      [wb('громче\\s*в\\s*глузу\\s*кулака'), 'громче музыку вк'],
      [wb('кулака'), 'вк'],
      [wb('лка'), 'вк'],
      [wb('каком я дела'), 'как у меня дела'],
      [wb('как оменя дела'), 'как у меня дела'],
      [wb('как уменя дела'), 'как у меня дела'],
      [wb('как отеля дела'), 'как у тебя дела'],
      [wb('чем снимаешься'), 'чем занимаешься'],
      [wb('снимаешься'), 'занимаешься'],
      [wb('ешься'), 'занимаешься'],
      
      // League of Legends & general gaming phonetic correction rules
      [wb('натальи против'), 'на Дрейвене против Самиры'],
      [wb('наталье против'), 'на Дрейвене против Самиры'],
      [wb('на талии против'), 'на Дрейвене против Самиры'],
      [wb('на первом игреенд'), 'собрать первым в игре'],
      [wb('на первом игре'), 'собрать первым в игре'],
      [wb('на первом в игре'), 'собрать первым в игре'],
      [wb('первом игреенд'), 'первым в игре'],
      [wb('игреенд'), 'в игре'],
      [wb('игруенд'), 'в игре']
    ];

    for (const [regex, replacement] of corrections) {
      result = result.replace(regex, replacement);
    }

    // 2.5 Contextual "привет" -> "предмет" replacements (Russian grammatical cases)
    // Replace "привет" with "предмет" if preceded by query, action, or adjective words
    result = result.replace(
      /\b(какой|какие|каким|какого|какому|каком|который|первый|первым|активный|активным|сборка|собрать|купить|собирать|новый|новым)\s+привет(а|ом|ы|ов|е)?\b/gi,
      (match, p1, p2) => {
        const suffix = p2 || '';
        let itemWord = 'предмет';
        if (suffix === 'а') itemWord = 'предмета';
        else if (suffix === 'ом') itemWord = 'предметом';
        else if (suffix === 'ы') itemWord = 'предметы';
        else if (suffix === 'ов') itemWord = 'предметов';
        else if (suffix === 'е') itemWord = 'предмете';
        return `${p1} ${itemWord}`;
      }
    );

    // Replace "привет" with "предмет" if followed by item action words
    result = result.replace(
      /\bпривет(а|ом|ы|ов|е)?\s+(собрать|купить|собирать|первым|первый|активировать|выбросить|продать)\b/gi,
      (match, p1, p2) => {
        const suffix = p1 || '';
        let itemWord = 'предмет';
        if (suffix === 'а') itemWord = 'предмета';
        else if (suffix === 'ом') itemWord = 'предметом';
        else if (suffix === 'ы') itemWord = 'предметы';
        else if (suffix === 'ов') itemWord = 'предметов';
        else if (suffix === 'е') itemWord = 'предмете';
        return `${itemWord} ${p2}`;
      }
    );

    // 3. Intelligent token-by-token Fuzzy Vocabulary Alignment (Auto-Understander)
    // Build a map of potential voice command targets -> their correct forms
    const vocabMap: Record<string, string> = {
      'youtube': 'youtube',
      'ютуб': 'ютуб',
      'whatsapp': 'whatsapp',
      'telegram': 'telegram',
      'google': 'google',
      'yandex': 'yandex',
      'открой': 'открой',
      'закрой': 'закрой',
      'запусти': 'запусти',
      'плей': 'плей',
      'воспроизведи': 'воспроизведи',
      'пауза': 'пауза',
      'python': 'python',
      'java': 'java',
      'погода': 'погода',
      'время': 'время',
      'настройки': 'настройки',
      'покажи': 'покажи',
      'очисти': 'очисти',
      'создай': 'создай',
      'найди': 'найди',
      'чат': 'чат',
      'консоль': 'консоль',
      'черновик': 'черновик',
      'реактор': 'реактор',
      'макросы': 'макросы',
      'помоги': 'помоги',
      'удали': 'удали',
      'выключи': 'выключи',
      'включи': 'включи',
      'привет': 'привет',
      'представься': 'представься',
      'представьте': 'представься',
      'представьтесь': 'представься',
      'представся': 'представься',
      'арк': 'a.r.c.',
      'arc': 'a.r.c.',
      'а.р.к.': 'a.r.c.',
      'a.r.c.': 'a.r.c.'
    };

    // Inject custom dictionary mappings dynamically
    if (settingsStore.sttCorrections && Object.keys(settingsStore.sttCorrections).length > 0) {
      for (const [wrong, correct] of Object.entries(settingsStore.sttCorrections)) {
        const wLower = wrong.trim().toLowerCase();
        const cLower = correct.trim().toLowerCase();
        if (wLower) {
          vocabMap[wLower] = cLower;
        }
      }
    }

    const words = result.split(/\s+/);
    const correctedWords = words.map(word => {
      // Isolate leading and trailing punctuation (retaining Russian/English layout structures)
      const match = word.match(/^([^\w\dа-яёА-ЯЁa-z]*)(.*?)([^\w\dа-яёА-ЯЁa-z]*)$/i);
      if (!match) return word;

      const prefix = match[1];
      const cleanWord = match[2];
      const suffix = match[3];

      if (!cleanWord) return word;

      const cleanLower = cleanWord.toLowerCase();

      // Direct exact match
      if (vocabMap[cleanLower] !== undefined) {
        return prefix + vocabMap[cleanLower] + suffix;
      }

      return word;
    });

    result = correctedWords.join(' ');
    
    return result;
  };

  const cleanText = (text: string) => {
    let t = text.replace(/(ээ+|мм+|аа+)/gi, "");
    t = t.replace(/\[.*?\]|\(.*?\)|<.*?>|\*.*?\*/g, ""); // remove [Music], (Silence), *MUSIC*
    t = t.replace(/(subtitles|субтитры|thanks for watching|спасибо за просмотр|продолжение следует|amara\.org)/gi, "");
    return t.replace(/\s+/g, " ").trim();
  };

  const isDialogueWindowActive = () => {
    if (voiceMode.value === 'WAKE_WORD_ONLY' || lastActiveDialogueTime.value <= 0) return false;
    const now = Date.now();
    const isActive = now - lastActiveDialogueTime.value < ACTIVE_DIALOGUE_DURATION_MS;
    if (!isActive && lastActiveDialogueTime.value > 0) {
      lastActiveDialogueTime.value = 0;
      updateCountdownUI();
    }
    return isActive;
  };

  const getCanonicalWakeWords = (): string[] => {
    const settingsStore = useSettingsStore();
    const storeWords = (settingsStore.wakeWords || [])
      .map((w: string) => w.toLowerCase().trim())
      .filter((w: string) => w.length >= 3 || w === 'arc' || w === 'арк');

    if (storeWords.length === 0) {
      const fallbackWord = settingsStore.sttKeyword?.toLowerCase().trim() || 'a.r.c.';
      storeWords.push(fallbackWord);
    }

    // Strictly canonical wake-words: eliminated false-positive phonetic collisions ("арок", "арка", "рык")
    return [...new Set([...storeWords, 'a.r.c.', 'а.р.к.', 'алекс', 'джарвис', 'компьютер', 'арк', 'arc', 'ark'])];
  };

  /**
   * Evaluates text for wake words and dialogue window status.
   * Returns whether it should be processed and the cleaned command text.
   */
  const evaluateVoiceTrigger = (text: string, rawText?: string): {
    shouldProcess: boolean;
    wakeWordFound: boolean;
    bareWakeWordHit?: boolean;
    dialogueActive: boolean;
    cleanedCommand: string;
  } => {
    if (isWakeWordSuspended.value) {
      return {
        shouldProcess: false,
        wakeWordFound: false,
        bareWakeWordHit: false,
        dialogueActive: false,
        cleanedCommand: text
      };
    }
    const dialogueActive = isDialogueWindowActive();
    const now = Date.now();

    // Check if the input itself is a gratitude closer
    const rawLower = (rawText || text).toLowerCase().trim();
    const cleanLower = text.toLowerCase().trim();
    if (isGratitudeCommand(cleanLower) || isGratitudeCommand(rawLower) || isGratitudeCommand(text)) {
      clearActiveDialogueWindow();
      transitionVoiceState('IDLE');
      const uiStore = useUIStore();
      uiStore.stopTTS();
      isGratitudeClosing = true;
      voiceMode.value = 'WAKE_WORD_ONLY';
      const isEn = useSettingsStore().language === 'EN';
      const phrase = generateGratitudeResponse(isEn);
      logger.info(`Gratitude response: "${phrase}"`);
      uiStore.speak(phrase);
      uiStore.setReactorState('idle');
      logger.info('[VoiceFSM] Closed by gratitude closer in evaluateVoiceTrigger');
      return {
        shouldProcess: false,
        wakeWordFound: false,
        bareWakeWordHit: false,
        dialogueActive: false,
        cleanedCommand: text
      };
    }

    // Anti-bounce & State Machine: If cooldown is active or state is not IDLE,
    // wake-word triggers are strictly blocked and cannot return hit: true.
    if (now < wakeWordLockUntil || voiceState.value !== 'IDLE') {
      return {
        shouldProcess: dialogueActive,
        wakeWordFound: false,
        bareWakeWordHit: false,
        dialogueActive,
        cleanedCommand: text
      };
    }

    const settingsStore = useSettingsStore();
    let command = text;
    let wakeWordFound = false;
    let bareWakeWordHit = false;
    let matchedWakeWord: string | null = null;
    let matchedSource: 'raw' | 'clean' | null = null;
    let isAliasMatch = false;
    
    const coreWakeWords = getCanonicalWakeWords();
    const aliases = ['арк', 'a.r.c.', 'arc', 'ark', 'a r c', 'орг', 'харк', 'орк'];
    const wakeWords = Array.from(new Set([...coreWakeWords, ...aliases].map(w => w.toLowerCase().trim())));

    // Unified tokenization: normalize 'a.r.c.' / 'а.р.к.' to unified token 'arc' / 'арк'
    // so multi-dot acronyms do not get split into separate single letters
    const normalizeTokens = (str: string): string[] => {
      return str
        .toLowerCase()
        .replace(/a\.r\.c\./gi, 'arc')
        .replace(/а\.р\.к\./gi, 'арк')
        .replace(/\ba\s+r\s+c\b/gi, 'arc')
        .replace(/(?:^|\s)[аa]\s*[-–—]?\s*[рr]\s*[-–—]?\s*[кk]?(?=\s|$)/giu, ' арк ')
        .replace(/[.,!?;:«»"'()—–\-_/]/g, ' ')
        .split(/\s+/)
        .map(w => w.trim())
        .filter(Boolean);
    };

    const cleanTokens = normalizeTokens(cleanLower);
    const rawTokens = normalizeTokens(rawLower);

    const validWakeTokens = new Set([
      'арк', 'arc', 'ark', 'арок', 'орг', 'харк', 'орк',
      ...coreWakeWords.map(w => w.toLowerCase().replace(/a\.r\.c\./gi, 'arc').replace(/а\.р\.к\./gi, 'арк'))
    ]);

    let wakeWordIndex = -1;
    let matchedToken = '';

    // Position Filter Constraint: Wake-word ideally within the first 3 words (indices 0, 1, 2)
    const maxCleanScan = Math.min(3, cleanTokens.length);
    for (let i = 0; i < maxCleanScan; i++) {
      if (validWakeTokens.has(cleanTokens[i])) {
        wakeWordIndex = i;
        matchedToken = cleanTokens[i];
        matchedSource = 'clean';
        break;
      }
    }

    if (wakeWordIndex === -1) {
      const maxRawScan = Math.min(3, rawTokens.length);
      for (let i = 0; i < maxRawScan; i++) {
        if (validWakeTokens.has(rawTokens[i])) {
          wakeWordIndex = i;
          matchedToken = rawTokens[i];
          matchedSource = 'raw';
          break;
        }
      }
    }

    // Background Audio Noise Recovery:
    // If background music or speech captured words before "Арк", check if wake word appears later
    // AND has a valid command after it (e.g. "...играет музыка... a.r.c. выключи музыку")
    if (wakeWordIndex === -1) {
      for (let i = 3; i < cleanTokens.length; i++) {
        if (validWakeTokens.has(cleanTokens[i])) {
          // Check that there is at least one meaningful token after the wake word
          if (i + 1 < cleanTokens.length) {
            wakeWordIndex = i;
            matchedToken = cleanTokens[i];
            matchedSource = 'clean';
            break;
          }
        }
      }
      if (wakeWordIndex === -1) {
        for (let i = 3; i < rawTokens.length; i++) {
          if (validWakeTokens.has(rawTokens[i])) {
            if (i + 1 < rawTokens.length) {
              wakeWordIndex = i;
              matchedToken = rawTokens[i];
              matchedSource = 'raw';
              break;
            }
          }
        }
      }
    }

    if (wakeWordIndex !== -1) {
      wakeWordFound = true;
      matchedWakeWord = matchedToken;
      isAliasMatch = aliases.includes(matchedToken) || matchedToken === 'arc' || matchedToken === 'ark';
    }

    if (wakeWordFound && matchedWakeWord) {
      // Filter 1: Negation Filter ('не', 'нет', 'без', 'это', 'ни', 'без слова' preceding wake-word)
      const tokens = matchedSource === 'raw' ? rawTokens : cleanTokens;
      const negationWords = ['не', 'нет', 'без', 'это', 'ни', 'нельзя'];
      let isNegated = false;

      if (wakeWordIndex > 0 && negationWords.includes(tokens[wakeWordIndex - 1])) {
        isNegated = true;
      } else if (wakeWordIndex >= 2 && negationWords.includes(tokens[wakeWordIndex - 2])) {
        // e.g. "без слова arc", "без вейкворда арк", "не говори арк"
        isNegated = true;
      }

      // Context scan for leading negation phrases
      const lowerBeforeWake = text.toLowerCase().substring(0, text.toLowerCase().indexOf(matchedWakeWord));
      if (/\b(?:без\s+(?:слова|вейкворда|триггера|команды)|не\s+(?:говори|называй|используй)|без|не)\b/i.test(lowerBeforeWake)) {
        isNegated = true;
      }

      if (isNegated) {
        console.log(`[WakeWord] Rejected by context filter: "${text}" (reason: negation)`);
        logger.info(`[WakeWord] Rejected by context filter: "${text}" (reason: negation)`);
        
        clearActiveDialogueWindow();
        wakeWordLockUntil = Date.now() + 5000;
        transitionVoiceState('IDLE');
        wakeWordFound = false;
        
        return {
          shouldProcess: false,
          wakeWordFound: false,
          dialogueActive: false,
          cleanedCommand: text
        };
      }

      // Filter 2: Position Filter (Wake-word index ideally 0, 1, or 2; allow index >= 3 ONLY if followed by a command)
      if (wakeWordIndex >= 3) {
        // Strip everything up to the wake word to inspect remainder command
        const escapedToken = matchedWakeWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const afterWakeMatch = text.match(new RegExp(`\\b${escapedToken}\\b[\\s,:!—–\\-]+(.+)$`, 'i'));
        const remainderAfterWake = afterWakeMatch ? afterWakeMatch[1].trim() : '';
        const meaningfulWords = remainderAfterWake.split(/\s+/).filter(w => /[a-zA-Zа-яёА-ЯЁ0-9]/.test(w));
        // If no meaningful command follows (e.g. monologue ending or mid-story mention), reject by position
        if (meaningfulWords.length < 1 || remainderAfterWake.length < 2) {
          logger.info(`[WakeWord] Rejected by position filter: "${text}" (reason: position >= 3 without command, index=${wakeWordIndex})`);
          wakeWordFound = false;
        }
      }

      // If wake word is confirmed valid: strip ONLY the leading trigger address (first wake word and greeting prefix).
      if (wakeWordFound) {
        const leadingWakeRegex = /^(?:(?:привет|здравствуй|здравствуйте|добрый\s+(?:день|вечер|утро)|слушай|эй|ок|hello|hi)[,\s]+)*(?:a\.r\.c\.|арк|arc|ark|арок|орг|харк|орк)(?=[^а-яёА-ЯЁa-zA-Z0-9]|$)[,\s:!—–\-]*/i;
        if (wakeWordIndex < 3 && leadingWakeRegex.test(command)) {
          command = command.replace(leadingWakeRegex, '').trim();
        } else if (matchedWakeWord) {
          const escaped = matchedWakeWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const hitRegex = new RegExp(`^(?:.*?\\s+)?${escaped}(?=[^а-яёА-ЯЁa-zA-Z0-9]|$)[,\\s:!—–\\-]*`, 'i');
          command = command.replace(hitRegex, '').trim();
        }

        // Normalize subsequent assistant name aliases in the command body to standard "АРК"
        command = command.replace(/(?<=^|[^а-яёА-ЯЁa-zA-Z0-9])(?:a\.r\.c\.|a\s+r\s+c|arc)(?=[^а-яёА-ЯЁa-zA-Z0-9]|$)/gi, 'АРК');

        // Clean leading/trailing punctuation left after removing the leading trigger
        command = command.replace(/^[\s.,!?'"–—:\-]+/, '').trim();
        command = command.replace(/[.,!?;:«»"']+$/, '').trim();
      }

      // Filter 3: Empty Remainder Filter (Cleaned command must have at least 2 meaningful characters)
      const remainderLetters = command.replace(/[^\w\dа-яёА-ЯЁ]/gi, '').trim();
      if (wakeWordFound && remainderLetters.length < 2) {
        bareWakeWordHit = wakeWordIndex >= 0 && wakeWordIndex < 3;
        console.log(`[WakeWord] Rejected by context filter: "${text}" (reason: empty remainder)`);
        logger.info(`[WakeWord] Rejected by context filter: "${text}" (reason: empty remainder)`);
        wakeWordFound = false;
      }
    }

    const logMiss = !wakeWordFound ? shouldLogWakeMiss(rawText || '', text) : false;

    if (wakeWordFound) {
      isGratitudeClosing = false;
      voiceMode.value = 'ACTIVE_DIALOGUE';
      wakeWordLockUntil = Date.now() + WAKE_WORD_COOLDOWN_MS;
      transitionVoiceState('TRIGGERED');
      logger.info(`[WakeWord] hit: true | word: "${matchedWakeWord}" | source: ${matchedSource} | isAlias: ${isAliasMatch}`);
      console.log(`[WakeWord] hit: true | word: "${matchedWakeWord}" | source: ${matchedSource} | isAlias: ${isAliasMatch}`);
    } else {
      if (logMiss) {
        logger.info(`[WakeWord] hit: false | raw: "${rawText || ''}" | clean: "${text}"`);
      }
    }
    if (wakeWordFound || logMiss) {
      logger.info(`[Voice:evaluateVoiceTrigger] raw="${rawText || ''}" clean="${text}" -> hit=${wakeWordFound} (word="${matchedWakeWord || 'none'}", src=${matchedSource || 'none'}, isAlias=${isAliasMatch})`);
    }

    let shouldProcess = true;
    if (settingsStore.sttKeywordsEnabled) {
      shouldProcess = wakeWordFound || dialogueActive;
    }

    return {
      shouldProcess,
      wakeWordFound,
      bareWakeWordHit,
      dialogueActive,
      cleanedCommand: command
    };
  };

  const hasLeadingWakeWordInPartial = (text: string): boolean => {
    if (!text || isWakeWordSuspended.value || voiceState.value !== 'IDLE' || Date.now() < wakeWordLockUntil) {
      return false;
    }
    const tokens = text
      .toLowerCase()
      .replace(/a\.r\.c\./gi, 'arc')
      .replace(/а\.р\.к\./gi, 'арк')
      .replace(/\ba\s+r\s+c\b/gi, 'arc')
      .replace(/[.,!?;:«»"'()—–\-_/]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(Boolean);
    if (tokens.length === 0) return false;
    const validWake = new Set([
      'арк', 'arc', 'ark', 'арок', 'орг', 'харк', 'орк',
      ...getCanonicalWakeWords().map(w => w.toLowerCase().replace(/a\.r\.c\./gi, 'arc').replace(/а\.р\.к\./gi, 'арк'))
    ]);
    const negations = new Set(['не', 'нет', 'без', 'это', 'ни', 'нельзя']);
    const maxScan = Math.min(3, tokens.length);
    for (let i = 0; i < maxScan; i++) {
      if (validWake.has(tokens[i])) {
        if (i > 0 && negations.has(tokens[i - 1])) return false;
        if (i >= 2 && negations.has(tokens[i - 2])) return false;
        return true;
      }
    }
    return false;
  };

  const isTriggeredByText = (text: string, rawText?: string): boolean => {
    return evaluateVoiceTrigger(text, rawText).shouldProcess;
  };

  const scheduleVoiceKvPrefill = (rawPartialText: string) => {
    if (
      !rawPartialText ||
      rawPartialText === 'СЛУШАЮ...' ||
      isWakeWordSuspended.value ||
      typeof window === 'undefined' ||
      typeof (window as any).api?.aiPrefillPartial !== 'function'
    ) {
      return;
    }

    const cleaned = cleanText(rawPartialText);
    if (!cleaned) return;
    const processed = postProcessTranscription(cleaned);
    const lower = processed.toLowerCase().trim();
    if (!lower) return;

    if (checkBargeInStop(lower) || isStopCommand(lower) || isGratitudeCommand(lower)) {
      cancelVoiceKvPrefill('stop_or_closer_partial');
      return;
    }

    const wakeHit = hasLeadingWakeWordInPartial(processed) || hasLeadingWakeWordInPartial(rawPartialText);
    const dialogueActive = isDialogueWindowActive();
    const shouldPrefill = !settingsStore.sttKeywordsEnabled || wakeHit || dialogueActive;
    if (!shouldPrefill) {
      return;
    }

    if (!currentPrefillUtteranceId) {
      currentPrefillUtteranceId = `utt_${Date.now()}`;
    }

    let context: Array<{ role: string; content: string }> = [];
    try {
      const chatStore = useChatStore();
      const sessionsStore = useSessionsStore();
      context = (chatStore.messages || []).slice(-9).map((m: any) => ({
        role: m.role,
        content: sanitizeRawContent(m.content || '')
      }));
      const currentSession = (sessionsStore.sessions || []).find((s: any) => s.id === sessionsStore.activeSessionId);
      if (currentSession && currentSession.summary) {
        context.unshift({
          role: 'system',
          content: `Краткое содержание предыдущего диалога: ${currentSession.summary}`
        });
      }
    } catch {}

    const prefillSettings = {
      useLocalLLM: settingsStore.useLocalLLM,
      localLLMModel: settingsStore.localLLMModel,
      localLLMPriority: (settingsStore as any).localLLMPriority,
      builtinLLMModel: settingsStore.builtinLLMModel,
      language: settingsStore.language,
      forcedOfflineMode: settingsStore.forcedOfflineMode,
      systemPrompt: (settingsStore as any).systemPrompt,
      wakeWords: getCanonicalWakeWords()
    };

    Promise.resolve(
      (window as any).api.aiPrefillPartial({
        partialText: processed,
        context,
        settings: prefillSettings,
        utteranceId: currentPrefillUtteranceId
      })
    ).catch(() => {});
  };

  let lastTranscriptionText = '';
  let lastTranscriptionTime = 0;

  const handleTranscriptionResult = (text: string, rawText?: string) => {
    if (!text || !text.trim()) return;
    if (isWakeWordSuspended.value) {
      const formatted = restorePunctuation(text.trim());
      if (formatted) {
        dictationTranscript.value = dictationTranscript.value
          ? `${dictationTranscript.value} ${formatted}`
          : formatted;
      }
      return;
    }
    const now = Date.now();
    const cleanLower = text.toLowerCase().trim().replace(/[.,!?]/g, '').trim();
    if (cleanLower === lastTranscriptionText && now - lastTranscriptionTime < 1500) {
      console.warn('Voice: Suppressed rapid duplicate transcription result:', text);
      return;
    }
    lastTranscriptionText = cleanLower;
    lastTranscriptionTime = now;

    logger.info('Voice: Cleaned transcript:', text);
    const settingsStore = useSettingsStore();
    const uiStore = useUIStore();

    // 1. Gratitude Closer check AT THE VERY TOP:
    // "спасибо", "спасибо большое", "благодарю", "всё спасибо" must close immediately,
    // transition FSM to IDLE, and return before barge-in, evaluation, or phantom filters.
    if (isGratitudeCommand(cleanLower) || isGratitudeCommand(text) || (rawText && isGratitudeCommand(rawText))) {
      uiStore.stopTTS();
      isGratitudeClosing = true;
      voiceMode.value = 'WAKE_WORD_ONLY';
      const phrase = generateGratitudeResponse(useSettingsStore().language === 'EN');
      logger.info(`Gratitude response: "${phrase}"`);
      uiStore.speak(phrase);
      clearActiveDialogueWindow();
      transitionVoiceState('IDLE');
      uiStore.setReactorState('idle');
      logger.info('Voice: Closed by gratitude closer');
      logger.info('[VoiceFSM] Closed by gratitude closer');
      return;
    }

    // Smart Barge-in (Task 3): while TTS is speaking, process ONLY stop commands, ignore all other noise/echo
    if (uiStore.reactorState === 'speaking') {
      const isTtsActuallyActive =
        Boolean((window as any).audioManager?.isTtsPlaying?.()) ||
        (Date.now() - (uiStore.lastSpokenTime || 0) < 1500);
      if (!isTtsActuallyActive) {
        logger.warn('Voice: Auto-recovered stale speaking state (isTtsPlaying=false)');
        uiStore.setReactorState('idle');
      } else {
        if (checkBargeInStop(cleanLower) || isStopCommand(cleanLower)) {
          handleStopWordAction(cleanLower, 'TTS Barge-in');
        } else {
          logger.info('Voice: Smart Barge-in (Final): Ignored final chunk during TTS playback (no stop word):', text);
        }
        return;
      }
    }

    // Check for hard STOP command before anything else
    const wordsToClean = ['арк', 'arc', 'а.р.к.', 'a.r.c.'];
    let commandWithoutWakeWord = cleanLower;
    for (const w of wordsToClean) {
      if (commandWithoutWakeWord.startsWith(w + ' ')) {
        commandWithoutWakeWord = commandWithoutWakeWord.substring(w.length + 1).trim();
      } else if (commandWithoutWakeWord.endsWith(' ' + w)) {
        commandWithoutWakeWord = commandWithoutWakeWord.substring(0, commandWithoutWakeWord.length - (w.length + 1)).trim();
      }
    }

    const isHardStop = checkBargeInStop(cleanLower) || checkBargeInStop(commandWithoutWakeWord) || isStopCommand(cleanLower) || isStopCommand(commandWithoutWakeWord);
    if (isHardStop) {
      handleStopWordAction(cleanLower, 'Final Transcript');
      return;
    }

    // Block 1: Gratitude closer check BEFORE evaluateVoiceTrigger and phantom filter!
    // CLOSERS: спасибо, благодарю, благодарствую, спасибки, «спасибо большое/огромное», «всё, спасибо», «от души»
    const isCloser = isGratitudeCommand(cleanLower) || isGratitudeCommand(commandWithoutWakeWord) || isGratitudeCommand(text);
    if (isCloser) {
      uiStore.stopTTS();
      isGratitudeClosing = true;
      voiceMode.value = 'WAKE_WORD_ONLY';
      const phrase = generateGratitudeResponse(useSettingsStore().language === 'EN');
      logger.info(`Gratitude response: "${phrase}"`);
      uiStore.speak(phrase);
      clearActiveDialogueWindow();
      transitionVoiceState('IDLE');
      uiStore.setReactorState('idle');
      logger.info('Voice: Closed by gratitude closer');
      logger.info('[VoiceFSM] Closed by gratitude closer');
      return;
    }

    if (uiStore.isSoftPaused) {
      const resumePhrases = ['продолжи', 'дальше', 'читай', 'говори', 'продолжай', 'resume', 'continue'];
      if (resumePhrases.includes(commandWithoutWakeWord)) {
        logger.info('Voice: Resume phrase detected. Resuming audio.');
        window.dispatchEvent(new CustomEvent('arc:resume-audio'));
        uiStore.setSoftPaused(false);
        return; // Don't process as a regular command
      } else {
        logger.info('Voice: Query does not match resume phrase during soft pause. Stopping audio and processing new command.');
        window.dispatchEvent(new CustomEvent('arc:stop-audio'));
      }
    }

    const { shouldProcess, wakeWordFound, bareWakeWordHit, dialogueActive, cleanedCommand: initialCleanedCommand } = evaluateVoiceTrigger(text, rawText);

    if (bareWakeWordHit) {
      isGratitudeClosing = false;
      refreshActiveDialogueWindow();
      logger.info('Voice: Bare wake word ("АРК") detected. Active dialogue window opened and background audio ducked.');
      return;
    }

    if (shouldProcess) {
      let cleanedCommand = initialCleanedCommand;

      // Block 1: CLOSERS checked BEFORE the single-word / phantom filter!
      // 1. Pure closer check (спасибо, благодарю, благодарствую, спасибки, «спасибо большое/огромное», «всё, спасибо»)
      if (isGratitudeCommand(cleanedCommand) || isGratitudeCommand(cleanLower)) {
        clearActiveDialogueWindow();
        transitionVoiceState('IDLE');
        uiStore.setReactorState('idle');
        logger.info('Voice: Closed by gratitude closer');
        logger.info('[VoiceFSM] Closed by gratitude closer');
        return;
      }

      // 2. Closer + remainder check: if starts with closer, extract remainder as actual command
      const cleanPunct = cleanedCommand.replace(/^[.,!?:;—–\s]+/, '');
      const closerMatch = cleanPunct.match(/^(?:(?:все[,.\s]+)?(?:спасибо(?:чки)?|благодарю|благодарствую|спасибки|пасиб(?:о)?|от\s+души|thanks|thank\s+you|thx|cgfcbf)(?:\s+(?:большое|огромное))?|(?:большое|огромное)\s+спасибо(?:чки)?|спасибо(?:\s+большое)?\s+все)(?:[,\s]+)(.+)$/i);
      if (closerMatch && closerMatch[1]) {
        cleanedCommand = closerMatch[1].trim();
        logger.info(`[VoiceFSM] Stripped leading closer, processing remainder: "${cleanedCommand}"`);
      }

      // 3. Stop-word check on cleanedCommand
      if (checkBargeInStop(cleanedCommand) || isStopCommand(cleanedCommand)) {
        handleStopWordAction(cleanedCommand, 'CleanedCommand');
        return;
      }

      // Block D. Filter phantom commands from background audio in active dialogue window:
      // Accepts transcript as a command ONLY if VAD registered speech after the window opened AND word length >= 2.
      // Phantom artifacts like "Command: А." and YouTube noise are strictly ignored.
      if (dialogueActive && !wakeWordFound) {
        if (isGratitudeCommand(cleanedCommand) || isGratitudeCommand(cleanLower)) {
          clearActiveDialogueWindow();
          transitionVoiceState('IDLE');
          uiStore.setReactorState('idle');
          logger.info('Voice: Closed by gratitude closer');
          logger.info('[VoiceFSM] Closed by gratitude closer');
          return;
        }
        const words = cleanedCommand.trim().split(/\s+/).filter(w => /[a-zA-Zа-яА-ЯёЁ0-9]/.test(w));
        const isValidFollowUpLen = words.length >= 2 || (words.length === 1 && words[0].length >= 4);
        const vadConfirmedAfterOpen = lastVadSpeechTime.value >= (dialogueWindowOpenedAt.value - 500);
        if (!vadConfirmedAfterOpen || !isValidFollowUpLen) {
          logger.info(`[Voice:DialogueWindow] Ignored phantom command: "${cleanedCommand}" (words: ${words.length}, postOpenVAD: ${vadConfirmedAfterOpen}).`);
          return;
        }
      }

      // Remove punctuation to check if there is an actual command word
      const cleanCommand = cleanedCommand.replace(/[^\w\dа-яёА-ЯЁ]/gi, '');
      if (cleanCommand.length > 0) {
        pendingVoiceReply = true;
        refreshActiveDialogueWindow();
        transitionVoiceState('PROCESSING');
        const formattedCommand = restorePunctuation(cleanedCommand);
        logger.info(`Voice: ${wakeWordFound ? 'Wake word' : dialogueActive ? 'Active dialogue window (15s)' : 'Direct mic'} triggered. Command:`, formattedCommand);
        transcript.value = formattedCommand;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('arc:voice-command', { detail: { text: formattedCommand } }));
        }
      } else if (wakeWordFound) {
        pendingVoiceReply = true;
        refreshActiveDialogueWindow();
        if (dialogueActive) {
          logger.info('Voice: Repeated wake word during active dialogue window. Window extended, no command emitted.');
        } else if (settingsStore.sttKeywordsEnabled) {
          logger.info('Voice: Wake word triggered without command. Responding...');
          transitionVoiceState('PROCESSING');
          const wakeWordResponses = [
            'Слушаю.',
            'Да.',
            'На связи.',
            'Я здесь.'
          ];
          const response = wakeWordResponses[Math.floor(Math.random() * wakeWordResponses.length)];
          uiStore.speak(response);
        }
      }
    } else {
      // logger.info('Voice: No wake word hit or dialogue window expired. Ignored input.');
    }
  };

  const startListening = async () => {
    if (isListening.value || isStartingListening) return; // Prevent concurrent starts
    isStartingListening = true;
    try {
    stopCountdownTimer();
    
    // DEBUG: Check SpeechRecognition availability
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.warn('Voice: SpeechRecognition API is NOT available in this environment.');
    } else {
      logger.info('Voice: SpeechRecognition API is available.');
    }
    
    // Initialize provider if empty: in Electron default to 'sherpa', in web browser default to 'native'
    if (!settingsStore.sttProvider) {
      settingsStore.sttProvider = (window as any).api ? 'sherpa' : 'native';
    }
    
    const provider = getEffectiveSttProvider(settingsStore);

    if (provider === 'native' || provider === 'sherpa') {
      isModelLoaded.value = true;
    }
    
    if (provider === 'sherpa' && (window as any).api) {
        if (typeof (window as any).api.startListening === 'function') {
            try {
              const res = await (window as any).api.startListening(settingsStore.sttModel);
              if (res === false || (res && res.success === false)) {
                console.warn('Voice: Sherpa STT backend unavailable. Falling back to built-in Whisper.');
                const isSherpa = getEffectiveSttProvider(settingsStore) === 'sherpa' || /sherpa|zipformer|turbo/i.test(settingsStore.sttModel || '');
                const errorMessage = isSherpa
                  ? `Модель ${settingsStore.sttModel || 'Sherpa'} не загружена. Перейдите в Model Hub для загрузки файлов модели.`
                  : `STT модель недоступна. Переключение на Whisper.`;
                try {
                  const uiStore = useUIStore();
                  uiStore.setSttError(errorMessage);
                } catch {}
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                  window.dispatchEvent(new CustomEvent('show-notification', {
                    detail: { type: 'warning', message: errorMessage, duration: 5000 }
                  }));
                } else if (typeof alert !== 'undefined') {
                  alert(errorMessage);
                }
                
                if (typeof window !== 'undefined' && Boolean((window as any).api)) {
                  // In Electron, we do not fallback to Whisper Web Worker!
                  isListening.value = false;
                  return;
                }
                settingsStore.sttProvider = 'whisper';
                isStartingListening = false;
                return startListening();

              }
            } catch (err) {
              console.error('Voice: Failed calling startListening on backend:', err);
              const isSherpa = getEffectiveSttProvider(settingsStore) === 'sherpa' || /sherpa|zipformer|turbo/i.test(settingsStore.sttModel || '');
              const errorMessage = isSherpa
                ? `Модель ${settingsStore.sttModel || 'Sherpa'} не загружена. Перейдите в Model Hub для загрузки файлов модели.`
                : `STT модель недоступна. Переключение на Whisper.`;
              try {
                const uiStore = useUIStore();
                uiStore.setSttError(errorMessage);
              } catch {}
              if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('show-notification', {
                  detail: { type: 'warning', message: errorMessage, duration: 5000 }
                }));
              } else if (typeof alert !== 'undefined') {
                alert(errorMessage);
              }
              
                if (typeof window !== 'undefined' && Boolean((window as any).api)) {
                  // In Electron, we do not fallback to Whisper Web Worker!
                  isListening.value = false;
                  return;
                }
                settingsStore.sttProvider = 'whisper';
                isStartingListening = false;
                return startListening();

            }
        }
        if (partialUnsub) partialUnsub();
        if (typeof (window as any).api.onSttPartial === 'function') {
          partialUnsub = (window as any).api.onSttPartial((text: string) => {
              const now = Date.now();
              if (now - lastPartialEvalTime < PARTIAL_EVAL_THROTTLE_MS) {
                return; // Throttle: skip this chunk
              }
              lastPartialEvalTime = now;

              const cleanedPartial = text.replace(/\*MUSIC\*/gi, '').trim();
              partialTranscript.value = cleanedPartial;
              
              // Emergency Stop Word Check (skip when WakeWord is suspended for dictation)
              if (!isWakeWordSuspended.value) {
                const hasStopWord = checkBargeInStop(cleanedPartial);
                if (hasStopWord) {
                  handleStopWordAction(cleanedPartial, 'Partial');
                  return;
                }
              }

              // Smart Barge-in: While TTS is speaking, ignore non-stop words
              const uiStore = useUIStore();
              if (uiStore.reactorState === 'speaking') {
                const isTtsActuallyActive =
                  Boolean((window as any).audioManager?.isTtsPlaying?.()) ||
                  (Date.now() - (uiStore.lastSpokenTime || 0) < 1500);
                if (!isTtsActuallyActive) {
                  uiStore.setReactorState('idle');
                } else {
                  return; // Do not process or trigger wake-word while speaking
                }
              }

              // Instant Audio Ducking on Partial Wake Word ("АРК"):
              if (hasLeadingWakeWordInPartial(cleanedPartial)) {
                lastVadSpeechTime.value = now;
                if (!isDialogueWindowActive() || !audioDuckingManager.isAudioDucked) {
                  isGratitudeClosing = false;
                  refreshActiveDialogueWindow();
                  logger.info('Voice (Partial): Wake word detected in stream — immediately ducking background audio.');
                }
              }

              // Incremental KV-cache prefill while user speaks (after wake-word or in active dialogue window)
              scheduleVoiceKvPrefill(cleanedPartial);
          });
        }

        if (finalUnsub) finalUnsub();
        if (typeof (window as any).api.onSttFinal === 'function') {
          finalUnsub = (window as any).api.onSttFinal((text: string) => {
              partialTranscript.value = '';
              currentPrefillUtteranceId = '';
              if (text.trim()) {
                  lastVadSpeechTime.value = Date.now();
                  const cleaned = cleanText(text);
                  const processed = postProcessTranscription(cleaned);
                  
                  // Emergency Stop Word Check (skip when WakeWord is suspended for dictation)
                  if (!isWakeWordSuspended.value) {
                    const hasStopWord = checkBargeInStop(processed) || checkBargeInStop(text);
                    if (hasStopWord) {
                      handleStopWordAction(processed || text, 'Final');
                      return;
                    }
                  }

                  const raw = String(text);
                  handleTranscriptionResult(processed, raw);
              }
          });
        }
    }

    if (provider === 'native') {
      // Attempt to use Native Web Speech API for extreme speed
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        logger.info('Voice: Using Native Web Speech API (Edge Transcription) for maximum speed.');
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = 'ru-RU';
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onstart = () => {
            isListening.value = true;
            uiStore.setListening(true);
            uiStore.setReactorState('listening');
          };

          recognition.onresult = (event: any) => {
            lastVadSpeechTime.value = Date.now();
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                const text = event.results[i][0].transcript;
                logger.info('Voice (Native Final):', text);
                partialTranscript.value = '';
                const cleaned = cleanText(text);
                const processed = postProcessTranscription(cleaned);
                handleTranscriptionResult(processed, text);
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }
            if (interimTranscript) {
              partialTranscript.value = interimTranscript;
              if (!isWakeWordSuspended.value && checkBargeInStop(interimTranscript)) {
                handleStopWordAction(interimTranscript, 'Native');
                return;
              }
              if (hasLeadingWakeWordInPartial(interimTranscript)) {
                if (!isDialogueWindowActive() || !audioDuckingManager.isAudioDucked) {
                  isGratitudeClosing = false;
                  refreshActiveDialogueWindow();
                  logger.info('Voice (Native Interim): Wake word detected — immediately ducking background audio.');
                }
              }
              scheduleVoiceKvPrefill(interimTranscript);
            }
          };

          recognition.onerror = (event: any) => {
            console.error('Voice (Native) Error:', event.error);
            
            // If network error, native engine failed. Fallback to Sherpa.
            if (event.error === 'network') {
              console.warn('Voice: Network error in Native STT. Falling back to next available engine.');
              isListening.value = false;
              uiStore.setListening(false);
              uiStore.setReactorState('idle');
              nativeRecognition = null;
              
              if (settingsStore.sttProvider === 'native') {
                if ((window as any).api) {
                  settingsStore.sttProvider = 'sherpa';
                  uiStore.speak('Сетевая ошибка нативного распознавания. Переключаюсь на быстрый движок Sherpa.');
                } else {
                  settingsStore.sttProvider = 'whisper';
                  uiStore.speak('Сетевая ошибка нативного распознавания. Переключаюсь на локальную модель Whisper.');
                }
                setTimeout(() => {
                  startListening();
                }, 500);
              }
              return;
            }

            // Treat non-fatal transient browser STT errors gracefully without stopping listening
            const transientErrors = ['no-speech', 'aborted', 'audio-capture', 'bad-grammar'];
            if (transientErrors.includes(event.error)) {
              logger.info(`Voice (Native): Transient error '${event.error}', keeping recognition session alive.`);
              return;
            }

            // Only fatal errors (like permission denied) stop listening
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                uiStore.speak('Доступ к микрофону запрещен или не поддерживается.');
            }
            isListening.value = false;
            uiStore.setListening(false);
            uiStore.setReactorState('idle');
          };

          recognition.onend = () => {
            if (isListening.value && nativeRecognition) {
              setTimeout(() => {
                if (isListening.value && nativeRecognition) {
                  try {
                    nativeRecognition.start(); // Keep alive safely
                  } catch (e) {
                    console.warn('Voice (Native): Keep-alive restart handled:', e);
                  }
                }
              }, 150);
            }
          };

          recognition.start();
          nativeRecognition = recognition;
          return;
        } catch (e) {
          console.error('Failed to start native recognition:', e);
          // Don't fallback automatically to Whisper unless user wants to
          return;
        }
      } else {
        console.warn('Voice: Native Speech Recognition not supported in this browser/environment.');
        if ((window as any).api) {
          console.warn('Voice: Native STT not supported in Electron. Switching to local Sherpa STT engine.');
          settingsStore.sttProvider = 'sherpa';
          isStartingListening = false;
          return startListening();
        }
        // Fallback to Whisper ONLY if explicitly enabled or as a last resort with notification
        if (confirm('Нативное распознавание недоступно. Использовать локальную модель Whisper? (Требует загрузки ~100MB)')) {
          settingsStore.sttProvider = 'whisper';
          // continue execution below to Whisper logic
        } else {
          return;
        }
      }
    }

    // Whisper Logic
    if (getEffectiveSttProvider(settingsStore) === 'whisper') {
      if (!isModelLoaded.value) {
        // Start loading/downloading STT model in background for instant mic launch & visual feedback
        initModel().catch(err => {
          console.error('Voice: STT model init failed during startup:', err);
        });
      }
      
      // Safety check if worker failed to load
      if (!worker) {
        // Fallback: instantiate first
        try {
          await initModel();
        } catch (err) {
          console.error('Voice: Fallback worker init failed:', err);
          return;
        }
      }
    }
    
    try {
      // Clean up any stale audio nodes/streams before starting
      if (workletNode) {
        try { workletNode.disconnect(); } catch (_) {}
        workletNode = null;
      }
      if (gainNode) {
        try { gainNode.disconnect(); } catch (_) {}
        gainNode = null;
      }
      if (mediaStream) {
        try { mediaStream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); } catch (_) {}
        mediaStream = null;
      }
      if (audioContext) {
        if (audioContext.state !== 'closed') {
          try { audioContext.close().catch(() => {}); } catch (_) {}
        }
        audioContext = null;
      }
      stopCountdownTimer();
      clearMonologueTimeout();

      const micConstraint = settingsStore.sttSelectedMic 
        ? { deviceId: { exact: settingsStore.sttSelectedMic } } 
        : true;

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          audio: typeof micConstraint === 'object' ? {
            ...micConstraint,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: SAMPLE_RATE
          } : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: SAMPLE_RATE
          } 
        });
      } catch (micErr) {
        console.warn('Voice: Selected mic failed, falling back to default mic:', micErr);
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: SAMPLE_RATE
          } 
        });
      }
      
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      }
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
        } catch (resumeErr) {
          console.warn('Voice: AudioContext resume failed:', resumeErr);
        }
      }

      if (!audioContext) {
        throw new Error('AudioContext failed to initialize');
      }

      const source = audioContext.createMediaStreamSource(mediaStream);
      
      gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      gainNode.connect(audioContext.destination);
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(gainNode); // Ensure dead-end is not optimized out
      (window as any).sysAudioCtx = audioContext;
      // Immediately register with AudioManager before start of listening
      audioManager.registerSttResources(mediaStream, audioContext, analyser);

      let preSpeechBuffer: Float32Array[] = [];
      let electronAudioBuffer: Float32Array[] = [];
      let electronAudioSampleCount = 0;
      let soundDetectedSince: number | null = null;
      let lastSoundDetectedTime: number | null = null;
      let speechConfirmedInUtterance = false;
      let monologueTimerStartedAt: number | null = null;

      const handleAudioChunk = (inputData: Float32Array) => {
        if (isWorkletPaused.value) return;
        const chunk = new Float32Array(inputData);
        
        // VAD implementation via Volume Threshold
        let sum = 0;
        for (let i = 0; i < chunk.length; i++) {
          sum += chunk[i] * chunk[i];
        }
        const rms = Math.sqrt(sum / chunk.length);
        
        const currentThreshold = settingsStore.sttVolumeThreshold || 0.003;
        const now = Date.now();
        
        // A3: Throttle rmsLevel updates to ~15fps (every 66ms)
        if (now - (window as any)._lastRmsUpdate > 66 || !(window as any)._lastRmsUpdate) {
            rmsLevel.value = rms;
            (window as any)._lastRmsUpdate = now;
        }
        
        // A2: Hysteresis for sound detection
        const upperThreshold = currentThreshold;
        const lowerThreshold = currentThreshold * 0.6;
        
        // Maintain a stable boolean for isSoundNow based on hysteresis
        let isSoundNow = (window as any)._isSoundNowStable || false;
        if (!isSoundNow && rms > upperThreshold) {
            isSoundNow = true;
        } else if (isSoundNow && rms < lowerThreshold) {
            isSoundNow = false;
        }
        (window as any)._isSoundNowStable = isSoundNow;

        if (isSoundNow) {
          lastSoundDetectedTime = now;
          if (soundDetectedSince === null) {
            soundDetectedSince = now;
          }
        } else {
          // Reset speech start candidate after 200ms of silence
          if (lastSoundDetectedTime === null || now - lastSoundDetectedTime > 200) {
            soundDetectedSince = null;
          }
        }

        // In Electron mode with Sherpa/GigaAM backend: stream audio in 512-sample frames (~32ms / 31.25Hz)
        // Matches Silero VAD's native 512-sample window for rapid segmentation and wake-word isolation
        const isElectronSherpa = getEffectiveSttProvider(settingsStore) === 'sherpa' && (window as any).api && typeof (window as any).api.streamAudioChunk === 'function';
        if (isElectronSherpa) {
          electronAudioBuffer.push(chunk);
          electronAudioSampleCount += chunk.length;
          if (electronAudioSampleCount >= 512) {
            const merged = new Float32Array(electronAudioSampleCount);
            let offset = 0;
            for (const b of electronAudioBuffer) {
              merged.set(b, offset);
              offset += b.length;
            }
            electronAudioBuffer = [];
            electronAudioSampleCount = 0;
            (window as any).api.streamAudioChunk(merged);
          }
          if (isSoundNow) {
            isSpeakingVAD.value = true;
            lastVadSpeechTime.value = now;
            (window as any)._vadMinDisplayTime = now;
          } else if (isSpeakingVAD.value) {
            const minDisplayPassed = !(window as any)._vadMinDisplayTime || (now - (window as any)._vadMinDisplayTime > 300);
            if (minDisplayPassed) {
              isSpeakingVAD.value = false;
            }
          }
          return;
        }

        const maxPreSpeechChunks = chunk.length <= 256 ? 40 : 8;

        if (!isSpeaking) {
          if (soundDetectedSince !== null && now - soundDetectedSince >= 90) {
            // Confirmed sound exceeded 90 ms fast sensitivity window
            isSpeaking = true;
            isSpeakingVAD.value = true;
            lastVadSpeechTime.value = now;
            silenceStart = null;
            audioBuffer = [...preSpeechBuffer];
            audioBuffer.push(chunk);
          } else {
            // Roll pre-speech buffer
            preSpeechBuffer.push(chunk);
            if (preSpeechBuffer.length > maxPreSpeechChunks) {
              preSpeechBuffer.shift();
            }
          }
        } else {
          // Already in active audio capture
          audioBuffer.push(chunk);

          // Check if VAD + STT partial text confirms real speech (VAD active AND text length > 0)
          const textCandidate = partialTranscript.value?.trim() || '';
          const hasVADConfirmedSpeech = isSpeakingVAD.value && textCandidate.length > 0;
          if (!speechConfirmedInUtterance && hasVADConfirmedSpeech) {
            speechConfirmedInUtterance = true;
            if (monologueTimeout === null) {
              monologueTimeout = setTimeout(() => {
                const currentPartial = (partialTranscript.value || '').trim();
                if (isSpeakingVAD.value === true && currentPartial.length > 0) {
                  logger.info('Voice: Reached maximum speech command duration of 15.0s. Forcing transcription.');
                  if (getEffectiveSttProvider(settingsStore) === 'sherpa' && (window as any).api && typeof (window as any).api.streamAudioEnd === 'function') {
                    (window as any).api.streamAudioEnd();
                  } else {
                    processChunk([...audioBuffer]);
                  }
                } else {
                  // Buffer reached 15s without confirmed speech (silence / ambient noise / music) -> Silent Reset WITHOUT log
                  if (getEffectiveSttProvider(settingsStore) === 'sherpa' && (window as any).api && typeof (window as any).api.streamAudioEnd === 'function') {
                    (window as any).api.streamAudioEnd();
                  }
                }
                isSpeaking = false;
                speechConfirmedInUtterance = false;
                silenceStart = null;
                soundDetectedSince = null;
                lastSoundDetectedTime = null;
                audioBuffer = []; // Reset queue
                preSpeechBuffer = [];
                clearMonologueTimeout();
              }, 15000);
            }
          }
          
          if (isSoundNow) {
            silenceStart = null;
            if (!(window as any)._vadDebounceStart) {
                (window as any)._vadDebounceStart = now;
            } else if (now - (window as any)._vadDebounceStart > 200) { // 200ms debounce for voice
                isSpeakingVAD.value = true;
                lastVadSpeechTime.value = now;
                (window as any)._vadMinDisplayTime = now;
            }
          } else {
            (window as any)._vadDebounceStart = null;
            
            // Only turn off if min display time (500ms) has passed
            const minDisplayPassed = !(window as any)._vadMinDisplayTime || (now - (window as any)._vadMinDisplayTime > 500);
            if (minDisplayPassed) {
                isSpeakingVAD.value = false;
            }

            if (!silenceStart) {
              silenceStart = now;
            } else if (now - silenceStart > SILENCE_DURATION_MS) {
              // End of speech chunk (silence threshold reached)
              isSpeaking = false;
              speechConfirmedInUtterance = false;
              monologueTimerStartedAt = null;
              silenceStart = null;
              soundDetectedSince = null;
              lastSoundDetectedTime = null;
              if (getEffectiveSttProvider(settingsStore) === 'sherpa' && (window as any).api && typeof (window as any).api.streamAudioEnd === 'function') {
                  (window as any).api.streamAudioEnd();
              } else {
                  processChunk(audioBuffer);
              }
              audioBuffer = []; // Reset queue
              preSpeechBuffer = [];
            }
          }
        }
      };

      const CAPTURE_WORKLET_CODE = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(512);
    this._pos = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const ch = input[0];
      let i = 0;
      while (i < ch.length) {
        const rem = 512 - this._pos;
        const copyLen = Math.min(rem, ch.length - i);
        this._buf.set(ch.subarray(i, i + copyLen), this._pos);
        this._pos += copyLen;
        i += copyLen;
        if (this._pos >= 512) {
          const out = this._buf.slice(0);
          this.port.postMessage(out, [out.buffer]);
          this._pos = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('audio-capture-processor', AudioCaptureProcessor);
`;

      try {
        if (!audioContext) throw new Error('AudioContext is null');

        let workletLoaded = false;
        if (audioContext.audioWorklet) {
          try {
            let blob: Blob | null = new Blob([CAPTURE_WORKLET_CODE], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            try {
              await audioContext.audioWorklet.addModule(blobUrl);
            } finally {
              URL.revokeObjectURL(blobUrl);
              blob = null;
            }

            workletNode = new AudioWorkletNode(audioContext, 'audio-capture-processor');
            workletNode.port.onmessage = (event: MessageEvent) => {
              handleAudioChunk(event.data);
            };
            source.connect(workletNode);
            workletNode.connect(gainNode);
            workletLoaded = true;
            logger.info('Voice: STT AudioWorkletNode successfully registered and active.');
          } catch (workletErr) {
            console.warn('Voice: AudioWorklet load failed, falling back to ScriptProcessor:', workletErr);
          }
        }

        if (!workletLoaded) {
          // Fallback for environments where AudioWorklet is not fully supported or restricted
          const scriptProcessor = audioContext.createScriptProcessor(1024, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            handleAudioChunk(new Float32Array(inputData));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(gainNode);
          workletNode = scriptProcessor;
          logger.info('Voice: STT ScriptProcessor fallback successfully registered and active.');
        }
      } catch (err) {
        console.error('Voice: Failed to initialize audio processing node.', err);
      }

      
      logger.info('Voice: STT Listening started.');
      isListening.value = true;
      const uiStore = useUIStore();
      uiStore.setListening(true);
      uiStore.setReactorState('listening');
    } catch (e: any) {
      console.warn('Voice: Microphone access failed or denied:', e?.message || e);
      isListening.value = false;
      const uiStore = useUIStore();
      uiStore.setListening(false);
      uiStore.setReactorState('idle');
      uiStore.speak('Доступ к микрофону запрещен или произошла ошибка инициализации. Убедитесь, что микрофон разрешен в настройках сайта.');
      if (mediaStream) {
        try {
          mediaStream.getTracks().forEach(track => track.stop());
        } catch (_) { logger.warn('Ignored error in catch', _); }
        mediaStream = null;
      }
      if (audioContext) {
        if (audioContext.state !== 'closed') {
          try { audioContext.close().catch(() => {}); } catch (_) {}
        }
        audioContext = null;
      }
    }
    } finally {
      isStartingListening = false;
    }
  };

  const suspendWakeWord = (pauseWorklet: boolean = false) => {
    wasListeningBeforeSuspend = isListening.value;
    isWakeWordSuspended.value = true;
    isWorkletPaused.value = pauseWorklet;
    dictationTranscript.value = '';
    partialTranscript.value = '';
    clearActiveDialogueWindow();
    audioBuffer = [];
    if (typeof window !== 'undefined' && (window as any).api && typeof (window as any).api.resetSttBuffer === 'function') {
      (window as any).api.resetSttBuffer();
    }
    logger.info(`Voice: WakeWord suspended for isolated dictation (pauseWorklet=${pauseWorklet}).`);
  };

  const resumeWakeWord = async () => {
    isWakeWordSuspended.value = false;
    isWorkletPaused.value = false;
    dictationTranscript.value = '';
    partialTranscript.value = '';
    audioBuffer = [];
    if (typeof window !== 'undefined' && (window as any).api && typeof (window as any).api.resetSttBuffer === 'function') {
      (window as any).api.resetSttBuffer();
    }
    if (audioContext && audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (_) {}
    }
    if (wasListeningBeforeSuspend && !isListening.value) {
      await startListening();
    }
    logger.info('Voice: WakeWord resumed after dictation.');
  };

  const stopListening = () => {
    isStartingListening = false;
    stopCountdownTimer();
    clearMonologueTimeout();
    clearActiveDialogueWindow();
    const uiStore = useUIStore();
    const settingsStore = useSettingsStore();
    
    if (getEffectiveSttProvider(settingsStore) === 'sherpa' && (window as any).api && typeof (window as any).api.stopListening === 'function') {
        (window as any).api.stopListening();
    }
    
    if (nativeRecognition) {
      try {
        nativeRecognition.stop();
      } catch (e) { logger.warn('Ignored error in catch', e); }
      nativeRecognition = null;
    }
    
    if (workletNode) {
      try {
        if ('port' in workletNode && workletNode.port) {
          workletNode.port.onmessage = null;
        }
        workletNode.disconnect();
      } catch (_) {}
      workletNode = null;
    }
    if (gainNode) {
      try {
        gainNode.disconnect();
      } catch (_) {}
      gainNode = null;
    }
    try {
      audioManager.stopMicrophone();
    } catch (_) {}
    if (mediaStream) {
      try { mediaStream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); } catch (e) { logger.warn('Ignored error in catch', e); }
      mediaStream = null;
    }
    if (audioContext) {
      if (audioContext.state !== 'closed') {
        try { audioContext.close().catch(() => {}); } catch (_) {}
      }
      audioContext = null;
    }
    
    if (partialUnsub) {
        partialUnsub();
        partialUnsub = null;
    }
    if (finalUnsub) {
        finalUnsub();
        finalUnsub = null;
    }
    audioBuffer.length = 0;
    partialTranscript.value = '';

    logger.info('Voice: STT Listening stopped.');
    isListening.value = false;
    uiStore.setListening(false);
    uiStore.setReactorState('idle');
  };

  const processChunk = async (buffers: Float32Array[]) => {
    if (buffers.length === 0 || isTranscribing.value) return;
    
    isTranscribing.value = true;
    transcribeProgress.value = 0;
    
    const intervalId = setInterval(() => {
      if (!isTranscribing.value) {
        clearInterval(intervalId);
        return;
      }
      if (transcribeProgress.value < 90) {
        transcribeProgress.value += Math.floor(Math.random() * 12) + 6;
        if (transcribeProgress.value > 90) transcribeProgress.value = 90;
      }
    }, 120);

    logger.info('Voice: Processing audio chunk of length', buffers.length);

    // If total audio is less than ~0.4 seconds (2 chunks), it's probably noise
    if (buffers.length < 2) {
      logger.info('Voice: Chunk too short, discarding.');
      isTranscribing.value = false;
      return;
    }

    const settingsStore = useSettingsStore();

    // Trim silence: Find first and last active chunks
    let firstActiveIndex = -1;
    let lastActiveIndex = -1;
    const currentThreshold = settingsStore.sttVolumeThreshold || 0.003;

    for (let i = 0; i < buffers.length; i++) {
      const buf = buffers[i];
      let sum = 0;
      for (let j = 0; j < buf.length; j++) {
        sum += buf[j] * buf[j];
      }
      const rms = Math.sqrt(sum / buf.length);
      if (rms > currentThreshold) {
        if (firstActiveIndex === -1) {
          firstActiveIndex = i;
        }
        lastActiveIndex = i;
      }
    }

    let trimmedBuffers = buffers;
    if (firstActiveIndex !== -1) {
      // Include 2 chunks of pre/post safety padding
      const start = Math.max(0, firstActiveIndex - 2);
      const end = Math.min(buffers.length - 1, lastActiveIndex + 2);
      trimmedBuffers = buffers.slice(start, end + 1);
      logger.info(`Voice VAD: Trimmed silence. Original chunks: ${buffers.length}, Active chunks: ${trimmedBuffers.length}`);
    }

    // If total trimmed audio is less than 2 chunks, it's a short click
    if (trimmedBuffers.length < 2) {
      logger.info('Voice: Chunk too short after trimming, discarding.');
      isTranscribing.value = false;
      return;
    }

    // Noise Reduction: Discard low average/max RMS recordings to isolate voice
    if (settingsStore.sttNoiseReduction) {
      let maxRms = 0;
      for (const buf of trimmedBuffers) {
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          sum += buf[i] * buf[i];
        }
        const rms = Math.sqrt(sum / buf.length);
        if (rms > maxRms) maxRms = rms;
      }
      const limit = settingsStore.sttVolumeThreshold || 0.015;
      if (maxRms < limit * 0.7) {
        logger.info(`Voice: Segment discarded as noise floor (Max RMS: ${maxRms.toFixed(5)} < limit: ${(limit * 0.7).toFixed(5)})`);
        isTranscribing.value = false;
        return;
      }
    }

    // Flatten buffers
    let totalLength = 0;
    for (const b of trimmedBuffers) totalLength += b.length;
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const b of trimmedBuffers) {
      merged.set(b, offset);
      offset += b.length;
    }

    // Normalize audio volume for maximum STT transcription accuracy
    let maxVal = 0;
    for (let i = 0; i < merged.length; i++) {
      const val = Math.abs(merged[i]);
      if (val > maxVal) maxVal = val;
    }
    if (maxVal > 0.005) {
      const scale = 0.9 / maxVal;
      for (let i = 0; i < merged.length; i++) {
        merged[i] *= scale;
      }
      logger.info(`Voice: Normalized audio from max peak ${maxVal.toFixed(4)} to 0.9 for higher quality STT`);
    }

    if (getEffectiveSttProvider(settingsStore) !== 'whisper') {
      logger.info(`Voice: processChunk called but provider is ${settingsStore.sttProvider}. Skipping Whisper transcription.`);
      isTranscribing.value = false;
      return;
    }

    try {
      // Whisper needs Float32Array
      logger.info('Voice: Calling transcriber...');
      if (!worker) {
        console.error('Voice: Whisper worker not initialized!');
        isTranscribing.value = false;
        return;
      }
      worker.postMessage({
        type: 'transcribe',
        payload: {
          audio: merged,
          language: 'russian'
        }
      });
      // The result will be handled in the worker's message listener and it sets isTranscribing to false there
    } catch (error) {
      console.error('Voice: Transcription error:', error);
      isTranscribing.value = false;
    }
  };

  const calibrateNoiseLevel = async (): Promise<number> => {
    const settingsStore = useSettingsStore();
    const uiStore = useUIStore();
    settingsStore.voiceCalibrationStatus = 'in_progress';
    
    let tempMediaStream: MediaStream | null = null;
    let tempAudioContext: AudioContext | null = null;
    let analyserNode: AnalyserNode | null = null;
    let tempGain: GainNode | null = null;
    const rmsValues: number[] = [];
    
    try {
      const micConstraint = settingsStore.sttSelectedMic 
        ? { deviceId: { exact: settingsStore.sttSelectedMic } } 
        : null;

      try {
        tempMediaStream = await navigator.mediaDevices.getUserMedia({ 
          audio: micConstraint ? {
            ...micConstraint,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: SAMPLE_RATE
          } : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: SAMPLE_RATE
          } 
        });
      } catch (micErr) {
        console.warn('[Calibration] Selected microphone failed, falling back to default device:', micErr);
        try {
          tempMediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
              sampleRate: SAMPLE_RATE
            }
          });
        } catch (errFallback) {
          throw new Error('Не удалось получить доступ к микрофону. Проверьте разрешения.');
        }
      }

      try {
        tempAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      } catch (ctxErr) {
        console.warn('[Calibration] AudioContext with sampleRate failed, falling back to default:', ctxErr);
        tempAudioContext = new AudioContext();
      }

      const source = tempAudioContext.createMediaStreamSource(tempMediaStream);
      analyserNode = tempAudioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      
      tempGain = tempAudioContext.createGain();
      tempGain.gain.setValueAtTime(0, tempAudioContext.currentTime);
      
      source.connect(analyserNode);
      analyserNode.connect(tempGain);
      // NOTE: Intentionally avoiding gain.connect(audioContext.destination) to prevent echo.
      
      const bufferLength = analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      // Wait for 2.5 seconds of measurements
      const startTime = Date.now();
      while (Date.now() - startTime < 2500) {
        analyserNode.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const floatVal = (dataArray[i] - 128) / 128.0;
          sum += floatVal * floatVal;
        }
        const rms = Math.sqrt(sum / bufferLength);
        if (!isNaN(rms)) {
          rmsValues.push(rms);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
    } catch (err: any) {
      console.error('Calibration failed completely:', err);
      settingsStore.voiceCalibrationStatus = 'absent';
      settingsStore.triggerSyncToast('Ошибка калибровки: ' + (err.message || 'Сбой микрофона'), () => {}, true);
      throw err;
    } finally {
      // Clean up temp streams
      if (analyserNode) {
        try { analyserNode.disconnect(); } catch (_) { logger.warn('Ignored error in catch', _); }
      }
      if (tempGain) {
        try { tempGain.disconnect(); } catch (_) { logger.warn('Ignored error in catch', _); }
      }
      if (tempMediaStream) {
        try {
          tempMediaStream.getTracks().forEach(track => track.stop());
        } catch (_) { logger.warn('Ignored error in catch', _); }
      }
      if (tempAudioContext) {
        if (tempAudioContext.state !== 'closed') {
          try { tempAudioContext.close().catch(() => {}); } catch (_) {}
        }
        tempAudioContext = null;
      }
    }
    
    let recommendedThreshold = 0.003; // Safe default fallback
    
    if (rmsValues.length > 0) {
      rmsValues.sort((a, b) => a - b);
      // Use the 40th percentile as the stable ambient noise floor value (filters out speech/clicks)
      const idx = Math.floor(rmsValues.length * 0.4);
      const noiseFloor = rmsValues[idx];
      
      recommendedThreshold = Math.max(0.0015, Math.min(0.025, noiseFloor * 1.5 + 0.0005));
      logger.info(`[VAD Calibration] Finished. RMS Sample Count: ${rmsValues.length}. Noise Floor (40th pct): ${noiseFloor.toFixed(5)}. Configured Threshold: ${recommendedThreshold}`);
    } else {
      console.warn('[VAD Calibration] No RMS readings collected. Falling back to default threshold: 0.003');
    }

    settingsStore.sttVolumeThreshold = parseFloat(recommendedThreshold.toFixed(5));
    settingsStore.voiceCalibrationStatus = 'ready';
    
    return settingsStore.sttVolumeThreshold;
  };


  // Auto-reload Whisper model if changed in settings
  watch(() => settingsStore.sttModel, async (newModel, oldModel) => {
    if (newModel !== oldModel && settingsStore.sttProvider === 'whisper') {
      logger.info(`[Whisper] Model changed from ${oldModel} to ${newModel}, reloading...`);
      if (worker) {
        worker.postMessage({ type: 'unload' });
        worker.terminate();
        worker = null;
      }
      isTranscribing.value = false;
      isModelLoaded.value = false;
      // Start reloading in background immediately
      await initModel();
    }
  });

  if (typeof window !== 'undefined' && !focusListenersAttached) {
    focusListenersAttached = true;
    let lastFocusState: boolean | null = null;
    let lastFocusTransitionAt = 0;

    const handleVoiceBlur = () => {
      if (lastFocusState === false) return;
      const now = Date.now();
      if (now - lastFocusTransitionAt < 1500) return;
      lastFocusState = false;
      lastFocusTransitionAt = now;
    };

    const handleVoiceFocus = () => {
      if (lastFocusState === true) return;
      const now = Date.now();
      lastFocusState = true;
      lastFocusTransitionAt = now;
      if (audioContext && audioContext.state === 'suspended') {
        try { audioContext.resume().catch(() => {}); } catch (_) {}
      }
    };

    if ((window as any).api?.onFocusChanged) {
      (window as any).api.onFocusChanged((focused: boolean) => {
        if (focused) handleVoiceFocus();
        else handleVoiceBlur();
      });
    } else {
      window.addEventListener('blur', handleVoiceBlur);
      window.addEventListener('focus', handleVoiceFocus);
    }
  }

  return {
    isListening,
    isModelLoaded,
    isTranscribing,
    transcribeProgress,
    transcript,
    partialTranscript,
    dictationTranscript,
    isWakeWordSuspended,
    isWorkletPaused,
    suspendWakeWord,
    resumeWakeWord,
    modelProgress,
    isSpeakingVAD,
    rmsLevel,
    isDialogueWindowActive,
    refreshActiveDialogueWindow,
    clearActiveDialogueWindow,
    lastActiveDialogueTime,
    startListening,
    stopListening,
    calibrateNoiseLevel,
    isTriggeredByText,
    evaluateVoiceTrigger,
    resetWakeWordLock: () => {
      wakeWordLockUntil = 0;
      transitionVoiceState('IDLE');
    },
    getWakeWordLockUntil: () => wakeWordLockUntil,
    voiceState,
    voiceMode,
    canOpenDialogueWindow,
    getVoiceState,
    setVoiceState: transitionVoiceState,
    checkBargeInStop,
    handleStopWordAction,
    handleTranscriptionResult,
    postProcessTranscription // Exported for unit-testing purposes
  };
}
