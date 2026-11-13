import { ref, computed, watch, onMounted } from 'vue';
import { useSettingsStore } from '../stores/settings.store';
import { useModelDownloadStore } from '../../modelDownload/stores/modelDownload.store';
import { useModelHubSession } from './useModelHubSession';

export interface VerifiedLocalInference {
  engine: 'builtin' | 'ollama';
  model: string;
  checkedAt: number;
}

// Module-level persistent session telemetry (survives AiSettings v-if unmounts)
const isOllamaOnline = ref(false);
const checkingOllama = ref(false);
const isBuiltinDownloaded = ref(false);
const checkingBuiltin = ref(false);
const builtinCheckError = ref<string | null>(null);
const downloadingBuiltin = ref(false);
const verifiedInference = ref<VerifiedLocalInference | null>(null);

export function getLocalEngineSessionState() {
  return {
    isOllamaOnline,
    checkingOllama,
    isBuiltinDownloaded,
    checkingBuiltin,
    builtinCheckError,
    downloadingBuiltin,
    verifiedInference
  };
}

export function useLocalAIEngine() {
  const settingsStore = useSettingsStore();
  const downloadStore = useModelDownloadStore();
  const hubSession = useModelHubSession();

  const lastOllamaModel = ref(
    settingsStore.localLLMModel && settingsStore.localLLMModel !== 'builtin'
      ? settingsStore.localLLMModel
      : 'llama3.2'
  );

  const isRunningTestInference = ref(false);
  const testInferenceOutput = ref('');
  const testInferenceError = ref('');

  watch(
    () => settingsStore.localLLMModel,
    (newVal) => {
      if (newVal && newVal !== 'builtin') {
        lastOllamaModel.value = newVal;
      }
    }
  );

  const activeTarget = computed<{ engine: 'builtin' | 'ollama'; model: string }>(() => {
    const isBuiltin = settingsStore.localLLMModel === 'builtin';
    return {
      engine: isBuiltin ? 'builtin' : 'ollama',
      model: isBuiltin
        ? settingsStore.builtinLLMModel
        : lastOllamaModel.value || settingsStore.localLLMModel || 'llama3.2'
    };
  });

  const isTargetVerified = (engine: 'builtin' | 'ollama', model?: string) => {
    if (!verifiedInference.value) return false;
    if (engine === 'builtin' && (!isBuiltinDownloaded.value || Boolean(builtinCheckError.value))) {
      return false;
    }
    if (engine === 'ollama' && !isOllamaOnline.value) {
      return false;
    }
    const expectedModel =
      model ?? (engine === 'builtin' ? settingsStore.builtinLLMModel : lastOllamaModel.value);
    return (
      verifiedInference.value.engine === engine &&
      verifiedInference.value.model === expectedModel
    );
  };

  const isCurrentTargetVerified = computed(() =>
    isTargetVerified(activeTarget.value.engine, activeTarget.value.model)
  );

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const checkOllama = async () => {
    checkingOllama.value = true;
    try {
      if (typeof window !== 'undefined' && window.api && (window.api as any).checkOllamaOnline) {
        const status = await (window.api as any).checkOllamaOnline();
        isOllamaOnline.value = status ? Boolean(status.online) : false;
      } else {
        const res = await fetch('http://localhost:11434/api/tags');
        isOllamaOnline.value = res.ok;
      }
    } catch {
      isOllamaOnline.value = false;
    } finally {
      if (!isOllamaOnline.value && verifiedInference.value?.engine === 'ollama') {
        verifiedInference.value = null;
      }
      checkingOllama.value = false;
    }
  };

  const checkBuiltin = async () => {
    builtinCheckError.value = null;
    if (typeof window !== 'undefined' && window.api && (window.api as any).checkBuiltinModel) {
      checkingBuiltin.value = true;
      isBuiltinDownloaded.value = false;
      try {
        isBuiltinDownloaded.value = Boolean(
          await (window.api as any).checkBuiltinModel(settingsStore.builtinLLMModel)
        );
      } catch (e: any) {
        console.error('Failed to check builtin model:', e);
        builtinCheckError.value = e?.message || 'Ошибка проверки файлов GGUF';
        isBuiltinDownloaded.value = false;
      } finally {
        if ((!isBuiltinDownloaded.value || builtinCheckError.value) && verifiedInference.value?.engine === 'builtin') {
          verifiedInference.value = null;
        }
        checkingBuiltin.value = false;
      }
    } else {
      isBuiltinDownloaded.value = false;
      builtinCheckError.value = 'Проверка файлов недоступна вне Electron';
      if (verifiedInference.value?.engine === 'builtin') {
        verifiedInference.value = null;
      }
    }
  };

  const downloadBuiltin = async () => {
    testInferenceError.value = '';
    testInferenceOutput.value = '';

    hubSession.ensureGlobalListeners();
    downloadStore.updateProgress(0, computedModelSizeEstimate.value, settingsStore.builtinLLMModel);

    if (typeof window !== 'undefined' && window.api && (window.api as any).downloadBuiltinModel) {
      downloadingBuiltin.value = true;
      try {
        const res = await (window.api as any).downloadBuiltinModel(settingsStore.builtinLLMModel, true);
        if (res && res.success) {
          isBuiltinDownloaded.value = true;
        } else if (res && res.error) {
          console.error('Builtin model download failed:', res.error);
          testInferenceError.value = res.error;
        }
      } catch (e: any) {
        console.error('Failed to download builtin model:', e);
        testInferenceError.value = e?.message || String(e);
      } finally {
        downloadingBuiltin.value = false;
        checkBuiltin();
      }
    } else {
      testInferenceError.value =
        settingsStore.language === 'EN'
          ? 'Model downloading is available in the Desktop Electron application.'
          : 'Скачивание GGUF моделей доступно в десктопном приложении A.R.C.';
    }
  };

  const runTestInference = async (targetEngine: 'builtin' | 'ollama' = 'builtin') => {
    if (isRunningTestInference.value) return;

    isRunningTestInference.value = true;
    testInferenceOutput.value = '';
    testInferenceError.value = '';

    const testedModel =
      targetEngine === 'builtin'
        ? settingsStore.builtinLLMModel
        : lastOllamaModel.value || settingsStore.localLLMModel || 'llama3.2';

    try {
      const isEn = settingsStore.language === 'EN';
      const prompt = isEn
        ? 'Say hello and say "I am ready to help, " very briefly!'
        : 'Поздоровайся и скажи "Я готов к работе, " очень кратко!';

      if (targetEngine === 'builtin' && window.api && (window.api as any).testBuiltinModel) {
        const res = await (window.api as any).testBuiltinModel(settingsStore.builtinLLMModel, prompt, 60);
        testInferenceOutput.value = typeof res === 'string' ? res : res?.text || '';
      } else if (window.api && (window.api as any).aiRequest) {
        const testReqId = 'local-test-' + Math.random().toString(36).substring(2, 11);
        let unsub: any = null;
        if ((window.api as any).onAiChunk) {
          unsub = (window.api as any).onAiChunk((data: any) => {
            if (data.reqId === testReqId) {
              testInferenceOutput.value += data.chunk;
            }
          });
        }
        try {
          await (window.api as any).aiRequest(prompt, [], testReqId, {
            useLocalLLM: true,
            localLLMModel: targetEngine === 'builtin' ? 'builtin' : testedModel,
            builtinLLMModel: settingsStore.builtinLLMModel,
            language: settingsStore.language
          });
        } finally {
          if (unsub) unsub();
        }
      } else {
        testInferenceError.value = 'Интерфейс инференса недоступен в текущем окружении';
      }
    } catch (err: any) {
      console.error('Test inference failed:', err);
      testInferenceError.value = err?.message || String(err);
    } finally {
      if (
        !testInferenceError.value &&
        testInferenceOutput.value &&
        (testInferenceOutput.value.includes('ошибка встроенной локальной') ||
          testInferenceOutput.value.includes('недоступна для запуска'))
      ) {
        testInferenceError.value = testInferenceOutput.value;
        testInferenceOutput.value = '';
      }

      if (!testInferenceError.value && testInferenceOutput.value.trim().length > 0) {
        verifiedInference.value = {
          engine: targetEngine,
          model: testedModel,
          checkedAt: Date.now()
        };
      } else if (verifiedInference.value?.engine === targetEngine && verifiedInference.value?.model === testedModel) {
        verifiedInference.value = null;
      }

      isRunningTestInference.value = false;
    }
  };

  watch(
    () => settingsStore.builtinLLMModel,
    () => {
      checkBuiltin();
      testInferenceOutput.value = '';
      testInferenceError.value = '';
    }
  );

  const computedBuiltinDesc = computed(() => {
    const isEn = settingsStore.language === 'EN';
    if (settingsStore.builtinLLMModel === 'LFM3-1.7B-Q4_K_M.gguf') {
      return isEn
        ? 'Priority ultra-efficient Liquid AI model LFM 3 (1.7B). Super-fast inference, high accuracy, minimal RAM footprint (~1.1 GB).'
        : 'Приоритетная ультра-эффективная модель Liquid AI LFM 3 (1.7B). Сверхбыстрый отклик, высокое качество и минимальное потребление ОЗУ (~1.1 ГБ).';
    }
    if (settingsStore.builtinLLMModel === 'qwen2.5-1.5b-instruct-q4_k_m.gguf') {
      return isEn
        ? 'Optimal balanced model Qwen2.5 (1.5B) running locally. Excellent reasoning speed and coherent natural dialogue.'
        : 'Сбалансированная модель Qwen2.5 (1.5B) для локального использования. Отличная скорость, связная речь и корректное понимание русского языка.';
    }
    if (settingsStore.builtinLLMModel === 'qwen2.5-3b-instruct-q4_k_m.gguf') {
      return isEn
        ? 'A powerful Qwen2.5-3B parameter model running locally in memory. Provides highly advanced reasoning and deep offline dialogues.'
        : 'Мощная модель Qwen2.5 (3B параметров), запускаемая в оперативной памяти. Обеспечивает продвинутую логику и глубокий автономный диалог.';
    }
    if (settingsStore.builtinLLMModel === 'qwen2.5-0.5b-instruct-q4_k_m.gguf') {
      return isEn
        ? 'Ultra-lightweight Qwen2.5-0.5B model. Fast execution and minimal RAM usage (~398 MB).'
        : 'Ультра-легкая модель Qwen2.5 (0.5B). Высокая скорость работы и минимальные требования к ОЗУ (~398 МБ).';
    }
    return isEn
      ? 'A legacy lightweight Qwen1.5-0.5B model running inside your memory.'
      : 'Устаревшая легкая модель Qwen1.5-0.5B.';
  });

  const computedDownloadBtnText = computed(() => {
    const isEn = settingsStore.language === 'EN';
    if (settingsStore.builtinLLMModel === 'LFM3-1.7B-Q4_K_M.gguf') {
      return isEn ? 'DOWNLOAD LFM 3 (1.7B) MODEL (~1.1 GB)' : 'СКАЧАТЬ МОДЕЛЬ LFM 3 (1.7Б) (~1.1 ГБ)';
    }
    if (settingsStore.builtinLLMModel === 'qwen2.5-1.5b-instruct-q4_k_m.gguf') {
      return isEn ? 'DOWNLOAD QWEN2.5 (1.5B) MODEL (~1.1 GB)' : 'СКАЧАТЬ МОДЕЛЬ QWEN2.5 (1.5Б) (~1.1 ГБ)';
    }
    if (settingsStore.builtinLLMModel === 'qwen2.5-3b-instruct-q4_k_m.gguf') {
      return isEn ? 'DOWNLOAD QWEN2.5 (3B) MODEL (~2.1 GB)' : 'СКАЧАТЬ МОДЕЛЬ QWEN2.5 (3Б) (~2.1 ГБ)';
    }
    if (settingsStore.builtinLLMModel === 'qwen2.5-0.5b-instruct-q4_k_m.gguf') {
      return isEn ? 'DOWNLOAD QWEN2.5 (0.5B) MODEL (398 MB)' : 'СКАЧАТЬ МОДЕЛЬ QWEN2.5 (0.5Б) (398 МБ)';
    }
    return isEn ? 'DOWNLOAD BUILT-IN MODEL (350 MB)' : 'СКАЧАТЬ ВСТРОЕННУЮ МОДЕЛЬ (350 МБ)';
  });

  const computedModelSizeEstimate = computed(() => {
    if (settingsStore.builtinLLMModel === 'LFM3-1.7B-Q4_K_M.gguf') return 1100000000;
    if (settingsStore.builtinLLMModel === 'qwen2.5-1.5b-instruct-q4_k_m.gguf') return 1120000000;
    if (settingsStore.builtinLLMModel === 'qwen2.5-3b-instruct-q4_k_m.gguf') return 2150000000;
    if (settingsStore.builtinLLMModel === 'qwen2.5-0.5b-instruct-q4_k_m.gguf') return 398000000;
    return 367000000;
  });

  const translations = computed(() => {
    const isEn = settingsStore.language === 'EN';
    return {
      title: isEn ? 'LOCAL AI ORCHESTRATION' : 'ЛОКАЛЬНЫЙ ИНФЕРЕНС ИИ',
      subtitle: isEn ? 'Run autonomous language models on your CPU/GPU' : 'Запуск автономных моделей на процессоре/GPU',
      offlineTitle: isEn ? 'OFFLINE MODE (FORCE OFFLINE)' : 'АВТОНОМНЫЙ РЕЖИМ (FORCE OFFLINE)',
      offlineSubtitle: isEn ? 'Route all queries to local models instead of cloud APIs' : 'Направлять все запросы к локальным моделям вместо облачных',
      builtinEngine: isEn ? 'BUILT-IN ENGINE (Transformers.js)' : 'ВСТРОЕННЫЙ ДВИЖОК',
      builtinDesc: computedBuiltinDesc.value,
      ollamaEngine: isEn ? 'EXTERNAL OLLAMA ENGINE' : 'ВНЕШНИЙ ДВИЖОК OLLAMA',
      ollamaDesc: isEn
        ? 'High performance execution for Llama 3.2, DeepSeek-R1, Gemma.'
        : 'Высокая производительность для Llama 3.2, DeepSeek-R1, Gemma.',
      modelStatus: isEn ? 'CACHE STATUS' : 'СТАТУС КЭША',
      notInstalled: isEn ? 'NOT INSTALLED' : 'НЕ УСТАНОВЛЕНА',
      readyActive: isEn ? 'CACHED & READY' : 'КЭШИРОВАНА И АКТИВНА',
      readyStandby: isEn ? 'CACHED (STANDBY)' : 'КЭШИРОВАНА (ОЖИДАНИЕ)',
      downloadBtn: computedDownloadBtnText.value,
      notDownloadedAlert: isEn
        ? 'Built-in model is not downloaded. It will not work offline without it unless Ollama is active.'
        : 'Встроенная модель не скачана. Без нее автономный режим работать не будет (если не активна Ollama).',
      ollamaStatusTitle: isEn ? 'OLLAMA SERVICE' : 'СЛУЖБА OLLAMA',
      ollamaOnline: isEn ? 'ONLINE' : 'ОНЛАЙН',
      ollamaOffline: isEn ? 'OFFLINE' : 'ОФЛАЙН',
      selectModel: isEn ? 'ACTIVE OLLAMA MODEL' : 'ВЫБРАННАЯ МОДЕЛЬ OLLAMA',
      ollamaWarning: isEn
        ? 'Verify model is installed via: ollama run <model>'
        : 'Убедитесь, что модель установлена через консоль: ollama run <model>',
      useThisEngine: isEn ? 'ACTIVATE THIS ENGINE' : 'АКТИВИРОВАТЬ ЭТОТ ДВИЖОК',
      activeEngine: isEn ? 'ACTIVE ENGINE' : 'АКТИВНЫЙ ДВИЖОК',
      downloading: isEn ? 'DOWNLOADING...' : 'СКАЧИВАНИЕ...',
      fileLabel: isEn ? 'File' : 'Файл',
      initializing: isEn ? 'Initializing...' : 'Инициализация...',
      checkStatus: isEn ? 'Check connection' : 'Проверить соединение',
      testRunning: isEn ? 'RUNNING TEST...' : 'ТЕСТИРОВАНИЕ...',
      testRun: isEn ? '⚡ RUN INFERENCE TEST' : '⚡ ЗАПУСТИТЬ ТЕСТ',
      testTitle: isEn ? 'TEST BUILT-IN MODEL' : 'ТЕСТ ИНФЕРЕНСА',
      testResponse: isEn ? 'TEST RESPONSE' : 'ОТВЕТ МОДЕЛИ',
      generating: isEn ? 'GENERATING...' : 'ГЕНЕРАЦИЯ...',
      error: isEn ? 'ERROR' : 'ОШИБКА',
      completed: isEn ? 'COMPLETED' : 'УСПЕШНО',
      testOutputLoading: isEn ? 'Loading model and compiling... (can take up to 30 seconds for the first load)' : 'Загрузка модели в память... (до 30 сек при первом запуске)',
      chooseModel: isEn ? 'CHOOSE OFFLINE MODEL' : 'ВЫБОР АВТОНОМНОЙ МОДЕЛИ'
    };
  });

  onMounted(() => {
    if (settingsStore.builtinLLMModel === 'onnx-community/Qwen2.5-1.5B-Instruct') {
      settingsStore.builtinLLMModel = 'qwen1.5-0.5b-chat-q4_k_m.gguf';
    }
    hubSession.ensureGlobalListeners();
    checkOllama();
    checkBuiltin();
  });

  return {
    settingsStore,
    downloadStore,
    isOllamaOnline,
    checkingOllama,
    isBuiltinDownloaded,
    checkingBuiltin,
    builtinCheckError,
    downloadingBuiltin,
    lastOllamaModel,
    verifiedInference,
    isCurrentTargetVerified,
    isTargetVerified,
    isRunningTestInference,
    testInferenceOutput,
    testInferenceError,
    translations,
    computedModelSizeEstimate,
    formatBytes,
    checkOllama,
    checkBuiltin,
    downloadBuiltin,
    runTestInference
  };
}
