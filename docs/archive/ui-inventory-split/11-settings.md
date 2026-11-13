# Инвентаризация пространства: SETTINGS (НАСТРОЙКИ) (11-settings.md)

> **Пространство:** `settings`  
> **Лейбл:** `НАСТРОЙКИ`  
> **Файлы реализации:** `src/renderer/features/settings/components/SettingsPanel.vue`, `useSettingsNav.ts`, а также все секции в `src/renderer/features/settings/components/sections/`.

---

## 1. Группа: ОБЩИЕ (General)

### 1.1 Секция `quick` (Быстрые настройки ядра — QuickCoreSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.quick.voice_feedback` | Settings → General → Quick → Voice Feedback | Голосовая обратная связь (TTS) | toggle | Озвучивать выполнение команд и статусы системы (`settingsStore.voiceFeedback`) | `QuickCoreSection.vue:56` | `commands.settings.voice_feedback` | setup-once |
| `settings.quick.require_confirm` | Settings → General → Quick → Require Confirm | Подтверждение опасных действий | toggle | Запрашивать подтверждение перед удалением или перезагрузкой (`settingsStore.requireConfirm`) | `QuickCoreSection.vue:64` | `commands.settings.require_confirm` | setup-once |
| `settings.quick.use_local_llm` | Settings → General → Quick → Use Local LLM | Локальная нейросеть (Offline) | toggle | Переключение инференса на локальный движок Ollama/LlamaCpp (`settingsStore.useLocalLLM`) | `QuickCoreSection.vue:72` | `settings.localai.toggle`, `settings.routing` | weekly |
| `settings.quick.music_capsule` | Settings → General → Quick → Music Capsule | Музыкальная капсула (VK / Audio) | toggle | Отображение плавающего виджета музыкального плеера (`settingsStore.showMusicWidget`) | `QuickCoreSection.vue:80` | `settings.widgets.showMusicWidget` | daily |
| `settings.quick.tab_bar_pos` | Settings → General → Quick → TabBar Pos | Расположение меню вкладок | select / toggle | Выбор позиции навигации: Сверху (top) или Снизу (bottom) | `QuickCoreSection.vue:88` | `settings.appearance.tabBarPosition` | setup-once |
| `settings.quick.widget_layout` | Settings → General → Quick → Layout Mode | Режим виджетов | select (dock / float) | Переключение между боковым доком и плавающими карточками | `QuickCoreSection.vue:96` | `settings.widgets.widgetLayoutMode` | weekly |

### 1.2 Секция `appearance` (Внешний вид и темы — AppearanceSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.appearance.theme` | Settings → General → Appearance → Theme | Цветовая тема | select | Выбор цветовой схемы: Красный (A.R.C. Red), Синий (Cyan/Blue), Изумрудный | `AppearanceSection.vue:24` | - | weekly |
| `settings.appearance.blur_intensity` | Settings → General → Appearance → Blur | Интенсивность размытия стекла | slider | Регулировка `backdrop-blur` (от 0 до 40px) для окон и панелей | `AppearanceSection.vue:42` | - | setup-once |
| `settings.appearance.font_size` | Settings → General → Appearance → Font Size | Масштаб интерфейса | select | Размер базового шрифта (90%, 100%, 110%) | `AppearanceSection.vue:60` | - | setup-once |

### 1.3 Секция `widgets` (Рабочий стол и виджеты — WidgetsSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.widgets.show_telemetry` | Settings → General → Widgets → Telemetry | HUD телеметрии реактора | toggle | Отображение виджета производительности Three.js | `WidgetsSection.vue:35` | - | daily |
| `settings.widgets.show_timeline` | Settings → General → Widgets → Timeline | Таймлайн действий | toggle | Отображение виджета истории действий ассистента | `WidgetsSection.vue:45` | - | daily |
| `settings.widgets.show_router_diagram` | Settings → General → Widgets → Diagram | Граф маршрутизатора AI | toggle | Отображение виджета цепочки провайдеров | `WidgetsSection.vue:55` | - | daily |
| `settings.widgets.show_music` | Settings → General → Widgets → Music | Музыкальная капсула | toggle | Виджет управления медиаплеером | `WidgetsSection.vue:65` | `settings.quick.music_capsule` | daily |
| `settings.widgets.reset_positions` | Settings → General → Widgets → Reset | Сбросить позиции виджетов | button | Возврат плавающих окон в исходные экранные координаты | `WidgetsSection.vue:85` | - | weekly |

### 1.4 Секция `shortcuts` (Горячие клавиши — ShortcutsSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.shortcuts.mic_hold` | Settings → General → Shortcuts → Mic Hold | Активация микрофона (PTE) | readonly-info | Удержание Space (Пробел) для мгновенного голосового ввода | `ShortcutsSection.vue:22` | - | daily |
| `settings.shortcuts.spotlight` | Settings → General → Shortcuts → Spotlight | Быстрый поиск | readonly-info | Комбинация Ctrl + K для вызова Spotlight | `ShortcutsSection.vue:35` | - | daily |

---

## 2. Группа: ИНТЕЛЛЕКТ (Intelligence)

### 2.1 Секция `routing` (Маршрутизация моделей — RoutingSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.routing.smart_routing` | Settings → Intel → Routing → Smart Routing | Умный маршрут | toggle | Автоматический выбор модели на основе сложности промпта (`smartRoutingEnabled`) | `RoutingSection.vue:42` | - | weekly |
| `settings.routing.exclusive_mode` | Settings → Intel → Routing → Exclusive | Эксклюзивный режим | toggle | Запрет автоматического фолбека на другие модели при сбое (`exclusiveMode`) | `RoutingSection.vue:68` | - | weekly |
| `settings.routing.exclusive_provider` | Settings → Intel → Routing → Provider | Выбор эксклюзивного провайдера | select | Принудительная фиксация провайдера в эксклюзивном режиме | `RoutingSection.vue:85` | - | weekly |
| `settings.routing.cloud_preference` | Settings → Intel → Routing → Cloud Pref | Стратегия балансировки | select | Приоритет локальных или облачных нейросетей | `RoutingSection.vue:110` | `settings.quick.use_local_llm` | weekly |

### 2.2 Секция `providers` (Облачные провайдеры — ProvidersSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.providers.api_key_input` | Settings → Intel → Providers → API Key | Ключ API ([Провайдер]) | input (password) | Ввод и сохранение API-ключа провайдера (OpenAI, Gemini, Anthropic, DeepSeek, Groq) | `ProviderCard.vue:42` | - | setup-once |
| `settings.providers.test_connection`| Settings → Intel → Providers → Test | Проверить соединение | button | Отправка тестового запроса и немедленный сброс карантина провайдера | `ProviderCard.vue:65` | - | weekly |
| `settings.providers.fetch_models` | Settings → Intel → Providers → Fetch Models | Обновить список моделей | button | Запрос доступных моделей с сервера провайдера | `ProviderCard.vue:82` | - | monthly |

### 2.3 Секция `localAI` (Локальные нейросети — LocalAISection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.localai.builtin_engine` | Settings → Intel → LocalAI → Builtin Engine | Встроенный движок (Llama.cpp) | toggle | Использование нативного движка без сторонних серверов | `BuiltinModelCard.vue:35` | - | weekly |
| `settings.localai.ollama_endpoint` | Settings → Intel → LocalAI → Ollama URL | Адрес сервера Ollama | input | URL хоста Ollama (по умолчанию `http://127.0.0.1:11434`) | `OllamaEngineCard.vue:40` | - | setup-once |
| `settings.localai.refresh_ollama` | Settings → Intel → LocalAI → Refresh Ollama | Переподключиться | button | Проверка доступности запущенного сервиса Ollama | `OllamaEngineCard.vue:58` | - | daily |

### 2.4 Секция `models` (Менеджер моделей и Hub — ModelManagerSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.models.hw_scan` | Settings → Intel → Models → Hardware Scan | Сканирование оборудования | button | Анализ CPU/VRAM для расчета максимального размера контекста | `ModelManagerSection.vue:30` | `transcription.gpu` | setup-once |
| `settings.models.model_hub_download`| Settings → Intel → Models → Download Hub | Скачать модель GGUF | button | Фоновое скачивание квантованных моделей из репозитория | `ModelManagerSection.vue:85` | `transcription.model.download` | setup-once |

---

## 3. Группа: ГОЛОС (Voice)

### 3.1 Секция `stt` (Распознавание речи — STTSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.stt.engine_select` | Settings → Voice → STT → Engine | Движок STT | select | Выбор движка: Sherpa-ONNX (Локально) / Web Speech API | `STTSection.vue:45` | - | setup-once |
| `settings.stt.auto_clear_cache` | Settings → Voice → STT → Auto Clear Cache | Автоочистка аудио-кэша | toggle | Автоматическое удаление временных WAV-файлов распознавания | `STTSection.vue:82` | `settings.tts.auto_clear_cache` | setup-once |
| `settings.stt.vad_sensitivity` | Settings → Voice → STT → VAD Sensitivity | Чувствительность детектора голоса | slider | Порог отсечения тишины и фонового шума | `STTSection.vue:110` | - | weekly |

### 3.2 Секция `tts` (Синтез речи — TTSSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.tts.engine_select` | Settings → Voice → TTS → Engine | Движок синтеза (TTS) | select | Выбор синтезатора: Silero TTS v5.5 (Локально) / Edge TTS / SAPI | `TTSSection.vue:52` | - | setup-once |
| `settings.tts.speaker_select` | Settings → Voice → TTS → Speaker | Голос диктора | select | Выбор голоса Silero (Aidan, Baya, Kseniya, Eugene, Xenia) | `TTSSection.vue:75` | - | weekly |
| `settings.tts.speech_rate` | Settings → Voice → TTS → Rate | Скорость речи | slider | Регулировка темпа воспроизведения ответа (0.8x - 1.5x) | `TTSSection.vue:102` | - | weekly |
| `settings.tts.speech_pitch` | Settings → Voice → TTS → Pitch | Высота тона | slider | Настройка тембра голоса | `TTSSection.vue:120` | - | weekly |
| `settings.tts.auto_clear_cache` | Settings → Voice → TTS → Auto Clear Cache | Автоочистка аудио-кэша | toggle | Удаление кэшированных сгенерированных реплик TTS | `TTSSection.vue:145` | `settings.stt.auto_clear_cache` | setup-once |

### 3.3 Секция `hotwords` (Ключевые фразы активации — HotwordsSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.hotwords.wake_word_input` | Settings → Voice → Hotwords → Wake Word | Фраза вызова системы | input | Настройка имени активации (по умолчанию «Арк», «А.Р.К.») | `HotwordsSection.vue:35` | - | setup-once |
| `settings.hotwords.stop_words` | Settings → Voice → Hotwords → Stop Words | Стоп-фразы прерывания | input | Список фраз мгновенного глушения ответа (хватит, молчи, стоп) | `HotwordsSection.vue:65` | - | setup-once |

---

## 4. Группа: СИСТЕМА (System)

### 4.1 Секция `system` (Системные параметры и хранилище — SystemSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.system.data_dir_display` | Settings → System → Storage → Data Dir | Путь к папке данных | readonly-info | Локальный изолированный каталог пользовательских данных (`data/`) | `SystemSection.vue:35` | - | setup-once |
| `settings.system.open_logs` | Settings → System → Storage → Open Logs | Открыть лог-файл | button | Открытие последнего файла сессии `logs/` в системном блокноте | `SystemSection.vue:55` | - | daily |
| `settings.system.reset_data` | Settings → System → Storage → Factory Reset | Полный сброс данных | button | Закрытие базы SQLite, удаление профилей и перезапуск приложения | `SystemSection.vue:85` | `memory.toolbar.clear_all` | setup-once |

### 4.2 Секция `safety` (Безопасность и разрешения — SafetySection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.safety.shell_confirm` | Settings → System → Safety → Shell Confirm | Подтверждать Shell-скрипты | toggle | Принудительный запрос диалога ApprovalDialog перед `SHELL_RUN` | `SafetySection.vue:40` | `core.dialogs.shell_approval` | setup-once |
| `settings.safety.auto_save` | Settings → System → Safety → Auto Save | Автосохранение контекста | toggle | Периодическая запись рабочего состояния в локальное хранилище | `SafetySection.vue:65` | - | setup-once |
