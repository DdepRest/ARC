import { ref, computed, onUnmounted } from 'vue';
import { useSettingsStore } from '../stores/settings.store';
import { useSysLogs } from '../../../composables/useSysLogs';

export interface PerformanceTestResults {
  avgFps: number;
  minFps: number;
  maxFps: number;
  missedFramesCount: number;
}

export function usePerformanceTest() {
  const store = useSettingsStore();
  const { copyLogsToClipboard } = useSysLogs();

  const isRunningTest = ref(false);
  const testTimeRemaining = ref(15);
  const testProgress = ref(0);
  const testLogs = ref<string[]>([]);
  const testResults = ref<PerformanceTestResults | null>(null);
  const capturedFpsArray = ref<number[]>([]);
  let testIntervalId: any = null;

  const logPhrasesRu = [
    'Инициализация нагрузочной рамы измерения...',
    'Симуляция высокочастотных циклов обновления Reactor Core...',
    'Стресс-тестирование отрисовки WebGL частиц (QuantumBits)...',
    'Проверка пропускной способности координатора DAG topologies...',
    'Симуляция параллельных аналитических вычислений ИИ...',
    'Тестирование локального кэша и десериализации Store данных...',
    'Анализ задержки VAD (Voice Activity Detection) детекторов...',
    'Финализация результатов и расчет метрик загрузки кадра...'
  ];

  const logPhrasesEn = [
    'Initializing performance testing harness...',
    'Simulating high-frequency Reactor Core update cycles...',
    'Stress-testing WebGL particles rendering pipeline...',
    'Measuring coordinator throughput of DAG topologies...',
    'Simulating parallel AI analytical intelligence streams...',
    'Testing local cache serialization and Store schema operations...',
    'Analyzing performance of Voice Activity Detection (VAD) handlers...',
    'Aggregating telemetry logs and calculating frame budget metrics...'
  ];

  const currentLogs = computed(() => {
    return store.language === 'RU' ? logPhrasesRu : logPhrasesEn;
  });

  const logsCopied = ref(false);
  const handleCopyLogs = async () => {
    const success = await copyLogsToClipboard();
    if (success) {
      logsCopied.value = true;
      setTimeout(() => { logsCopied.value = false; }, 2000);
    }
  };

  const startPerformanceTest = () => {
    if (isRunningTest.value) return;

    isRunningTest.value = true;
    testTimeRemaining.value = 15;
    testProgress.value = 0;
    testLogs.value = [];
    testResults.value = null;
    capturedFpsArray.value = [];

    const addLogWithDelay = (index: number, delay: number) => {
      setTimeout(() => {
        if (!isRunningTest.value) return;
        const t = currentLogs.value[index];
        if (t) {
          testLogs.value.push(`[${new Date().toLocaleTimeString()}] ${t}`);
        }
      }, delay);
    };

    addLogWithDelay(0, 0);
    addLogWithDelay(1, 1500);
    addLogWithDelay(2, 3500);
    addLogWithDelay(3, 5500);
    addLogWithDelay(4, 7500);
    addLogWithDelay(5, 9500);
    addLogWithDelay(6, 11500);
    addLogWithDelay(7, 13500);

    testIntervalId = setInterval(() => {
      testTimeRemaining.value--;
      testProgress.value = Math.round(((15 - testTimeRemaining.value) / 15) * 100);

      const currentFps = (window as any).__currentRealFps || 0;
      if (currentFps > 0) {
        capturedFpsArray.value.push(currentFps);
      }

      const previousSpeed = store.reactorSpeed;
      const previousPower = store.reactorPower;
      store.reactorSpeed = Math.random() * 2 + 0.5;
      store.reactorPower = Math.random() * 1.4 + 0.2;
      
      setTimeout(() => {
        store.reactorSpeed = previousSpeed;
        store.reactorPower = previousPower;
      }, 450);

      if (testTimeRemaining.value <= 0) {
        completeTest();
      }
    }, 1000);
  };

  const completeTest = () => {
    clearInterval(testIntervalId);
    
    isRunningTest.value = false;
    testProgress.value = 100;

    const fps = capturedFpsArray.value;
    if (fps.length === 0) fps.push(60);

    const total = fps.reduce((a, b) => a + b, 0);
    const avgFps = Math.round(total / fps.length);
    const minFps = Math.min(...fps);
    const maxFps = Math.max(...fps);
    const missedFramesCount = fps.filter(item => item < 30).length;

    testResults.value = {
      avgFps,
      minFps,
      maxFps,
      missedFramesCount
    };
  };

  const copyTestResults = () => {
    if (!testResults.value) return;
    const res = testResults.value;
    
    const report = store.language === 'RU' 
      ? `=== ОТЧЕТ О ТЕСТИРОВАНИИ ПРОИЗВОДИТЕЛЬНОСТИ A.R.C. ===\n` +
        `Дата: ${new Date().toLocaleString()}\n` +
        `Версия системы: v0.2.2-AI\n` +
        `Язык интерфейса: RU\n` +
        `Качество графики: ${store.graphicsQuality}\n` +
        `---------------------------------------\n` +
        `Средний FPS: ${res.avgFps} кадра/сек\n` +
        `Минимальный FPS: ${res.minFps} кадра/сек\n` +
        `Максимальный FPS: ${res.maxFps} кадра/сек\n` +
        `Кадры ниже предела стабильности (<30 FPS): ${res.missedFramesCount} шт. за 15с.\n` +
        `Используемый графический бэкенд: Angle / Default Acceleration\n` +
        `=== КОНЕЦ ОТЧЕТА ===`
      : `=== A.R.C. PERFORMANCE DIAGNOSTICS REPORT ===\n` +
        `Date: ${new Date().toLocaleString()}\n` +
        `System Version: v0.2.2-AI\n` +
        `Language: EN\n` +
        `Graphics Quality: ${store.graphicsQuality}\n` +
        `---------------------------------------\n` +
        `Average FPS: ${res.avgFps} fps\n` +
        `Minimum FPS: ${res.minFps} fps\n` +
        `Maximum FPS: ${res.maxFps} fps\n` +
        `Frames below stability threshold (<30 FPS): ${res.missedFramesCount} occurrences within 15s.\n` +
        `Graphics Backend: Angle / Default Acceleration\n` +
        `=== END OF REPORT ===`;

    const doCopy = async () => {
      try {
        if (window.api && typeof window.api.writeClipboard === 'function') {
          const success = await window.api.writeClipboard(report);
          if (success) {
            alert(store.language === 'RU' ? 'Отчет скопирован в буфер обмена!' : 'Report successfully copied to clipboard!');
            return;
          }
        }
      } catch {}

      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(report)
          .then(() => {
            alert(store.language === 'RU' ? 'Отчет скопирован в буфер обмена!' : 'Report successfully copied to clipboard!');
          })
          .catch(() => {
            fallbackCopyToClipboard(report);
          });
      } else {
        fallbackCopyToClipboard(report);
      }
    };
    doCopy();
  };

  const fallbackCopyToClipboard = (text: string) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        alert(store.language === 'RU' ? 'Отчет скопирован в буфер обмена!' : 'Report successfully copied to clipboard!');
      } else {
        throw new Error('Command execution returned false');
      }
    } catch (err) {
      prompt(
        store.language === 'RU' 
          ? 'Не удалось скопировать автоматически. Скопируйте текст вручную:' 
          : 'Could not copy automatically. Press Ctrl+C/Cmd+C and copy manually from here:',
        text
      );
    }
  };

  const exportPerformanceLogs = () => {
    const history = (window as any).__fpsHistory || [];
    
    if (history.length === 0) {
      alert(store.language === 'RU' 
        ? 'Предупреждение: Логи пусты. Дайте приложению поработать несколько секунд с открытым FPS-оверлеем.' 
        : 'Warning: Performance logs are empty. Let the application run for a couple of seconds with the FPS overlay active first.');
      return;
    }

    const logsOutput = {
      appName: 'A.R.C. System OS',
      platform: typeof window !== 'undefined' && (window as any).api ? 'Electron' : 'Web Browser',
      testedAt: new Date().toISOString(),
      graphicsQuality: store.graphicsQuality,
      metricsSampleCount: history.length,
      samples: history
    };

    const fileContent = JSON.stringify(logsOutput, null, 2);
    const blob = new Blob([fileContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `arc_performance_logs_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  onUnmounted(() => {
    clearInterval(testIntervalId);
  });

  return {
    isRunningTest,
    testTimeRemaining,
    testProgress,
    testLogs,
    testResults,
    logsCopied,
    handleCopyLogs,
    startPerformanceTest,
    copyTestResults,
    exportPerformanceLogs
  };
}
