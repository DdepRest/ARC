export type ChangeType = 'feature' | 'improvement' | 'fix';

export interface ReleaseChangeItem {
  id: string;
  type: ChangeType;
  subsystem: string;
  titleRu: string;
  titleEn: string;
  detailsRu: string;
  detailsEn: string;
}

export interface ArcReleaseEntry {
  version: string;
  buildHash: string;
  dateRu: string;
  dateEn: string;
  channel: 'stable' | 'hotfix' | 'milestone';
  titleRu: string;
  titleEn: string;
  summaryRu: string;
  summaryEn: string;
  highlightsRu: string[];
  highlightsEn: string[];
  changes: ReleaseChangeItem[];
}

export const CURRENT_ARC_VERSION = '1.0.12';
export const CURRENT_ARC_BUILD = '9048f71';

export const ARC_RELEASES: ArcReleaseEntry[] = [
  {
    version: '1.0.12',
    buildHash: '9048f71',
    dateRu: 'Ноябрь 2026',
    dateEn: 'November 2026',
    channel: 'stable',
    titleRu: 'Непрерывный голосовой диалог, стабильность STT/LLM и История обновлений',
    titleEn: 'Continuous Voice Dialogue, STT/LLM Stability & Updates History',
    summaryRu: 'Восстановлено автоматическое 15-секундное окно продолжения диалога после ответа ассистента без повторения слова «АРК», устранены обрывы длинных ответов нейросети и добавлен системный журнал обновлений.',
    summaryEn: 'Restored automatic 15-second follow-up dialogue window after assistant responses without repeating the wake word, resolved long-response stream cutoffs, and introduced the Updates History workspace.',
    highlightsRu: [
      'Авто-продление окна диалога на 15 секунд строго после завершения озвучки ответа любой длительности',
      'Передача точного системного локального времени и даты операционной системы в контекст ИИ',
      'Пакетная буферизация AudioWorklet (2048 сэмплов) и сброс индикатора VAD без зависаний интерфейса',
      'Полноценный раздел «История обновлений» в Настройках и панели «Разделы»'
    ],
    highlightsEn: [
      'Automatic 15-second dialogue window renewal after TTS playback finishes regardless of response duration',
      'Direct injection of OS local time and date into assistant system context',
      '2048-sample AudioWorklet frame buffering and accurate VAD state reset without UI stalls',
      'Dedicated Updates History section in Settings and Workspaces bar'
    ],
    changes: [
      {
        id: '1.0.12-voice-window',
        type: 'fix',
        subsystem: 'VOICE FSM',
        titleRu: 'Удержание и перезапуск 15-секундного окна диалога после ответа',
        titleEn: 'Hold and restart 15-second dialogue window after assistant reply',
        detailsRu: 'Таймер обратного отсчёта диалога теперь приостанавливается на всё время генерации ответа LLM и озвучки Silero TTS, открывая полные 15 секунд для ответа пользователя сразу после сигнала завершения речи.',
        detailsEn: 'Dialogue countdown timer now holds while LLM inference and Silero TTS playback are active, granting a full 15-second follow-up window once speech completes.'
      },
      {
        id: '1.0.12-system-time',
        type: 'fix',
        subsystem: 'LLM CONTEXT',
        titleRu: 'Синхронизация локального времени и даты операционной системы',
        titleEn: 'OS local time and date synchronization in LLM prompt',
        detailsRu: 'В системный контекст провайдеров добавлена динамическая метка текущего системного времени и даты компьютера оператора, а запросы о текущем времени обходят устаревший кэш.',
        detailsEn: 'Added dynamic local system time and date context to LLM system prompts and bypassed stale response caching for time queries.'
      },
      {
        id: '1.0.12-long-stream',
        type: 'fix',
        subsystem: 'AI ROUTER',
        titleRu: 'Защита длинных потоковых ответов от обрыва по таймауту',
        titleEn: 'Long streaming response protection against premature timeouts',
        detailsRu: 'Таймаут потоковой генерации для шлюзов увеличен с 12 до 45 секунд, устранена 10-секундная задержка препроцессинга на прямых вопросах кириллицей и добавлено сохранение уже полученного текста.',
        detailsEn: 'Increased streaming gateway timeout from 12s to 45s, fixed Cyrillic regex boundaries in fast-path preprocessing, and preserved streamed chunks.'
      },
      {
        id: '1.0.12-vad-worklet',
        type: 'improvement',
        subsystem: 'AUDIO ENGINE',
        titleRu: 'Разгрузка потока микрофона и точный сброс статуса «Голос зафиксирован»',
        titleEn: 'Microphone AudioWorklet batching and accurate VAD status reset',
        detailsRu: 'AudioCaptureProcessor агрегирует фреймы по 2048 сэмплов перед отправкой в главный поток (снижение нагрузки на MessagePort в 16 раз), а индикатор активности речи корректно гаснет после паузы.',
        detailsEn: 'AudioCaptureProcessor batches 2048-sample frames before posting to the UI thread (16x reduction in MessagePort traffic), and VAD speech badge resets cleanly on silence.'
      },
      {
        id: '1.0.12-changelog-ui',
        type: 'feature',
        subsystem: 'INTERFACE',
        titleRu: 'Полноценный раздел «История обновлений»',
        titleEn: 'Comprehensive Updates History section',
        detailsRu: 'Добавлен интерактивный журнал версий A.R.C. с фильтрацией по категориям изменений, поиском по подсистемам и быстрым доступом из Настроек и меню «Разделы».',
        detailsEn: 'Added an interactive release changelog with category filters, subsystem search, and direct navigation from Settings and Workspaces.'
      }
    ]
  },
  {
    version: '1.0.11',
    buildHash: 'c4a910e',
    dateRu: 'Ноябрь 2026',
    dateEn: 'November 2026',
    channel: 'hotfix',
    titleRu: 'Дедупликация инициализации STT-воркера и декодирование аудиопотока',
    titleEn: 'STT Worker Initialization Deduplication & Audio Stream Decoding',
    summaryRu: 'Исключено повторное пересоздание дочернего процесса распознавания речи при старте приложения и устранены ошибки CSP при воспроизведении синтезированного голоса.',
    summaryEn: 'Prevented duplicate child process spawning during STT initialization at startup and resolved CSP audio playback errors.',
    highlightsRu: [
      'Единый промис инициализации STT-воркера без ложного срабатывания 30-секундного таймаута',
      'Прямое декодирование Base64 WAV в памяти в useAudioManager без сетевого вызова fetch',
      'Синхронизация идентификаторов озвучки между основным процессом и рендерером'
    ],
    highlightsEn: [
      'Single shared initialization promise for STT worker preventing stale 30s timeout kills',
      'Direct in-memory Base64 WAV decoding in useAudioManager without network fetch calls',
      'Synchronized speech playback IDs between main process and renderer'
    ],
    changes: [
      {
        id: '1.0.11-stt-dedup',
        type: 'fix',
        subsystem: 'STT SERVICE',
        titleRu: 'Защита процесса GigaAM / Sherpa от ложного перезапуска при старте',
        titleEn: 'GigaAM / Sherpa worker protection against duplicate startup restarts',
        detailsRu: 'Параллельные вызовы initializeModels объединены в единую очередь, а обработчики завершения привязаны строго к текущему экземпляру процесса.',
        detailsEn: 'Concurrent initializeModels calls now share a single active promise and process exit handlers are scoped strictly to the spawned child instance.'
      },
      {
        id: '1.0.11-tts-csp',
        type: 'fix',
        subsystem: 'TTS AUDIO',
        titleRu: 'Безошибочное воспроизведение WAV-буферов Silero v5.5',
        titleEn: 'Zero-error Silero v5.5 WAV buffer playback',
        detailsRu: 'Добавлена поддержка data: и blob: в политику безопасности и реализована прямая конвертация аудиопотока в Blob для мгновенного старта озвучки.',
        detailsEn: 'Added data: and blob: directives to CSP and implemented direct binary buffer conversion for instant TTS playback.'
      }
    ]
  },
  {
    version: '1.0.10',
    buildHash: '8f21d04',
    dateRu: 'Октябрь 2026',
    dateEn: 'October 2026',
    channel: 'milestone',
    titleRu: 'Визуальная конституция v3.4 и интеграция GigaAM CTC 220M',
    titleEn: 'Visual Constitution v3.4 & GigaAM CTC 220M Integration',
    summaryRu: 'Переход интерфейса на непрозрачную лестницу поверхностей v3.0, внедрение единой шкалы приборов дока и запуск русской нейросетевой модели распознавания речи GigaAM.',
    summaryEn: 'Transitioned UI to the v3.0 opaque surface ladder, standardized HUD dock instrument scales, and integrated the Russian GigaAM speech recognition model.',
    highlightsRu: [
      'Движок распознавания речи GigaAM RU CTC 220M с фоновой докачкой и горячей заменой',
      'Непрозрачная лестница поверхностей (--arc-frame, --arc-plane, --arc-block, --arc-rail)',
      'Единая шкала Hero-метрик (26px mono) для приборов ЯДРО и МАРШРУТ'
    ],
    highlightsEn: [
      'GigaAM RU CTC 220M speech recognition engine with background download and hot-swap',
      'Opaque surface token ladder (--arc-frame, --arc-plane, --arc-block, --arc-rail)',
      'Standardized Hero metric scale (26px mono) for CORE and ROUTE instruments'
    ],
    changes: [
      {
        id: '1.0.10-gigaam',
        type: 'feature',
        subsystem: 'STT ENGINE',
        titleRu: 'Поддержка модели GigaAM CTC 220M и автоматический Circuit Breaker',
        titleEn: 'GigaAM CTC 220M model support and automatic Circuit Breaker',
        detailsRu: 'Реализовано распознавание русской речи с низкой задержкой (~180–300 мс) и автоматическим резервированием на Whisper Small при сбоях.',
        detailsEn: 'Implemented low-latency Russian speech recognition (~180–300ms) with automatic fallback to Whisper Small on worker fault.'
      },
      {
        id: '1.0.10-surfaces',
        type: 'improvement',
        subsystem: 'VISUAL CORE',
        titleRu: 'Конституционная защёлка токенов поверхностей и акцента',
        titleEn: 'Constitutional surface and accent token latch',
        detailsRu: 'Устранены полупрозрачные наложения над 3D-сценой в плоскостях чтения и введён автоматический контроль соблюдения визуальной конституции при сборке.',
        detailsEn: 'Eliminated translucent blurs over the 3D canvas in reading planes and introduced automated visual constitution verification.'
      }
    ]
  },
  {
    version: '1.0.8',
    buildHash: '4d91a2b',
    dateRu: 'Сентябрь 2026',
    dateEn: 'September 2026',
    channel: 'stable',
    titleRu: 'Голосовой движок Silero TTS v5.5 с серверной DSP-обработкой',
    titleEn: 'Silero TTS v5.5 Voice Engine with Server-Side DSP Pipeline',
    summaryRu: 'Автоматический мониторинг локального Python-сервера синтеза речи, расстановка ударений и букв «ё», словари ИТ-терминов и омографов.',
    summaryEn: 'Automated monitoring of the local Python TTS server, Russian stress and yo placement, IT terminology dictionaries, and homograph disambiguation.',
    highlightsRu: [
      'Модель Silero v5.5 (v5_5_ru.pt) с автоматической расстановкой ударений',
      'Встроенный словарь из 190+ ИТ-терминов и 84 аббревиатур для естественного произношения',
      'Многоуровневая маршрутизация AI Router с поддержкой локальных GGUF/Ollama и облачных шлюзов'
    ],
    highlightsEn: [
      'Silero v5.5 (v5_5_ru.pt) synthesis with automatic stress placement',
      'Built-in dictionary of 190+ IT terms and 84 abbreviations for natural Russian pronunciation',
      'Multi-model AI Router supporting local GGUF/Ollama and cloud gateways'
    ],
    changes: [
      {
        id: '1.0.8-silero-dsp',
        type: 'feature',
        subsystem: 'TTS SERVER',
        titleRu: 'Эталонный серверный конвейер звука Silero v5.5 + DSP v2',
        titleEn: 'Reference server-side audio pipeline Silero v5.5 + DSP v2',
        detailsRu: 'Запуск и контроль здоровья Python-сервера через PythonServerService, предзагрузка фонетических словарей и кэширование аудиофрагментов.',
        detailsEn: 'Automated lifecycle and healthcheck management via PythonServerService with phonetic dictionary preloading and audio caching.'
      },
      {
        id: '1.0.8-reactor-3d',
        type: 'improvement',
        subsystem: '3D REACTOR',
        titleRu: 'Адаптивная телеметрия 3D-Ядра и синхронизация с аудиопотоком',
        titleEn: 'Adaptive 3D Core telemetry and audio stream synchronization',
        detailsRu: 'Реактор плавно переходит между режимами ожидания, прослушивания микрофона, когнитивной обработки и голосовой отдачи с целевой частотой 60+ FPS.',
        detailsEn: 'Reactor transitions smoothly across idle, mic listening, cognitive processing, and voice playback states at 60+ FPS.'
      }
    ]
  }
];
