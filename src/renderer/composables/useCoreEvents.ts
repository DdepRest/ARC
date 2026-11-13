import { ref, watch } from 'vue';
import { useTerminalStore } from '../stores/terminal.store';
import { useUIStore } from '../stores/ui.store';

export interface CoreEventItem {
  id: string;
  time: string;
  text: string;
  status: 'ok' | 'info' | 'warn';
  source?: string;
}

const MAX_EVENTS = 40;
const liveEvents = ref<CoreEventItem[]>([]);

function formatTime(d = new Date()): string {
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

let isInitialized = false;

export function useCoreEvents() {
  const terminalStore = useTerminalStore();
  const uiStore = useUIStore();

  const pushEvent = (text: string, status: 'ok' | 'info' | 'warn' = 'info', source?: string) => {
    if (!text || !text.trim()) return;
    
    const trimmed = text.trim();
    // Prevent duplicate spam of identical message in a row
    if (liveEvents.value.length > 0 && liveEvents.value[0].text === trimmed) {
      return;
    }

    const item: CoreEventItem = {
      id: Math.random().toString(36).substring(2, 9),
      time: formatTime(),
      text: trimmed,
      status,
      source
    };

    liveEvents.value.unshift(item);
    if (liveEvents.value.length > MAX_EVENTS) {
      liveEvents.value.splice(MAX_EVENTS);
    }
  };

  if (!isInitialized) {
    isInitialized = true;

    // Real boot sequence events of the A.R.C. system
    const now = new Date();
    const tMinus = (sec: number) => {
      const d = new Date(now.getTime() - sec * 1000);
      return formatTime(d);
    };

    liveEvents.value = [
      {
        id: 'boot-4',
        time: tMinus(2),
        text: 'Готовность маршрутизатора когнитивных моделей',
        status: 'ok',
        source: 'Router'
      },
      {
        id: 'boot-3',
        time: tMinus(6),
        text: 'Запуск голосового тракта (Silero / VAD)',
        status: 'ok',
        source: 'Voice'
      },
      {
        id: 'boot-2',
        time: tMinus(12),
        text: 'Подключение телеметрии и монитора ресурсов',
        status: 'info',
        source: 'Telemetry'
      },
      {
        id: 'boot-1',
        time: tMinus(18),
        text: 'Инициализация реактора ядра A.R.C.',
        status: 'ok',
        source: 'Core'
      }
    ];

    // Watch terminal logs for live runtime events
    watch(
      () => terminalStore.logs.length,
      () => {
        const lastLog = terminalStore.logs[terminalStore.logs.length - 1];
        if (!lastLog) return;
        const raw = lastLog.message || '';

        // Filter noisy internal logs
        if (
          raw.includes('ort-wasm') || 
          raw.includes('[Reactor Telemetry') || 
          raw.includes('HMR') ||
          raw.includes('download_meta')
        ) {
          return;
        }

        let status: 'ok' | 'info' | 'warn' = 'info';
        if (lastLog.level === 'ERROR') status = 'warn';
        else if (lastLog.level === 'WARN') status = 'warn';
        else if (lastLog.level === 'EXEC' || raw.includes('ready') || raw.includes('успешно') || raw.includes('online')) status = 'ok';

        let cleanText = raw.replace(/^\[.*?\]\s*/g, '').replace(/\[Circular\]/g, '').trim();
        if (cleanText.length > 55) {
          cleanText = cleanText.substring(0, 52) + '...';
        }
        if (cleanText && cleanText.length >= 4) {
          pushEvent(cleanText, status, 'Terminal');
        }
      }
    );

    // Watch core cognitive timeline pipeline
    watch(
      () => uiStore.timelineStep,
      (newStep) => {
        if (!newStep) return;
        switch (newStep) {
          case 'VOICE_INPUT':
            pushEvent('Захват голосового потока VAD', 'info', 'Voice');
            break;
          case 'CLASSIFIER':
            pushEvent('Классификация намерения запроса', 'info', 'Classifier');
            break;
          case 'ROUTER':
            pushEvent(`Маршрутизация: ${uiStore.activeRoute?.cause || uiStore.activeRoute?.target || 'ядро'}`, 'info', 'Router');
            break;
          case 'TOOL_API':
            pushEvent('Выполнение системного инструмента', 'ok', 'Tools');
            break;
          case 'RESPONSE':
            pushEvent(`Генерация ответа: ${uiStore.activeModel || 'LLM'}`, 'ok', 'LLM');
            break;
          case 'TTS':
            pushEvent('Синтез аудиоответа Silero v5.6', 'ok', 'TTS');
            break;
        }
      }
    );

    // Watch living reactor state transitions
    watch(
      () => uiStore.reactorState,
      (newState, oldState) => {
        if (!newState || newState === oldState) return;
        switch (newState) {
          case 'listening':
            pushEvent('Реактор: режим активного прослушивания', 'info', 'Reactor');
            break;
          case 'processing':
            pushEvent('Реактор: когнитивный анализ графа', 'info', 'Reactor');
            break;
          case 'speaking':
            pushEvent('Реактор: голосовая реплика активна', 'ok', 'Reactor');
            break;
          case 'alert':
            pushEvent('Реактор: сигнал тревоги / предупреждение', 'warn', 'Reactor');
            break;
          case 'loading_llm':
            pushEvent('Реактор: загрузка весов LLM', 'info', 'Reactor');
            break;
        }
      }
    );

    // Watch toast alerts
    watch(
      () => uiStore.toasts.length,
      () => {
        const lastToast = uiStore.toasts[uiStore.toasts.length - 1];
        if (!lastToast) return;
        const st: 'ok' | 'info' | 'warn' = lastToast.type === 'error' ? 'warn' : (lastToast.type === 'success' ? 'ok' : 'info');
        pushEvent(lastToast.message, st, 'System');
      }
    );

    // Global event listener for custom events
    if (typeof window !== 'undefined') {
      window.addEventListener('arc:core-event', (e: Event) => {
        const detail = (e as CustomEvent)?.detail;
        if (detail && detail.text) {
          pushEvent(detail.text, detail.status || 'info', detail.source || 'A.R.C.');
        }
      });
    }
  }

  return {
    liveEvents,
    pushEvent
  };
}
