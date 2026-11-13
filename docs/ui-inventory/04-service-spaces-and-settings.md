# Сервисные пространства и SETTINGS + карта дубликатов (04-service-spaces-and-settings.md)

> **Объединяет:** `06-memory.md`, `07-modules.md`, `08-files.md`, `09-transcription.md`, `10-vision.md`, `11-settings.md`, `duplicates.md`.
> **Примечание:** Документация инвентаризации консолидирована в 4 файла; машиночитаемый реестр параметров настроек ведется отдельно в `settings-registry.json`.

---

# Пространство: MEMORY (ПАМЯТЬ)

> **Пространство:** `memory`
> **Лейбл:** `ПАМЯТЬ`
> **Файлы реализации:**
> - `src/renderer/features/memory/components/MemoryView.vue`
> - `src/renderer/features/memory/components/MemoryToolbar.vue`
> - `src/renderer/features/memory/components/MemoryGrid.vue`
> - `src/renderer/features/memory/components/MemoryDetailModal.vue`
> - `src/renderer/features/memory/components/MemoryFormModal.vue`

## 1. Секция: Панель управления и фильтров (MemoryToolbar)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `memory.toolbar.search_query` | Memory → Toolbar → Search | Поиск в долговременной памяти... | input | Текстовый или семантический поиск по сохраненным фактам | `MemoryToolbar.vue:24` | - | daily |
| `memory.toolbar.semantic_toggle` | Memory → Toolbar → Semantic Search | Семантический поиск (векторный) | toggle / button | Переключение между точным текстовым сопоставлением и векторными эмбеддингами | `MemoryToolbar.vue:38` | - | daily |
| `memory.toolbar.category_filter` | Memory → Toolbar → Category | [Все / Факты / Настройки / Персона] | select / dropdown | Фильтрация сущностей памяти по категории | `MemoryToolbar.vue:56` | - | daily |
| `memory.toolbar.sort_by` | Memory → Toolbar → Sort | [Сначала новые / Высокая достоверность] | select | Порядок сортировки записей памяти | `MemoryToolbar.vue:74` | - | weekly |
| `memory.toolbar.create_button` | Memory → Toolbar → Create Memory | + СОЗДАТЬ ЗАПИСЬ | button | Вызов модального окна добавления нового факта вручную | `MemoryToolbar.vue:92` | - | weekly |
| `memory.toolbar.export_json` | Memory → Toolbar → Export JSON | ЭКСПОРТ JSON | button | Экспорт базы знаний в JSON-файл | `MemoryToolbar.vue:105` | - | setup-once |
| `memory.toolbar.import_json` | Memory → Toolbar → Import JSON | ИМПОРТ JSON | button | Загрузка внешнего файла знаний в SQLite | `MemoryToolbar.vue:118` | - | setup-once |
| `memory.toolbar.clear_all` | Memory → Toolbar → Clear All | ОЧИСТИТЬ ВСЮ ПАМЯТЬ | button | Вызов защитного диалога очистки всей когнитивной памяти | `MemoryToolbar.vue:132` | `settings.system.dbReset` | setup-once |
| `memory.toolbar.refresh` | Memory → Toolbar → Refresh | Обновить | button | Принудительная перезагрузка записей из базы данных | `MemoryToolbar.vue:145` | - | daily |

## 2. Секция: Сетка карточек памяти (MemoryGrid & MemoryCard)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `memory.grid.card_click` | Memory → Grid → Card Item | [Карточка памяти] | button | Открытие детального просмотра факта и истории доступа | `MemoryGrid.vue:42` | - | daily |
| `memory.grid.card_edit` | Memory → Grid → Edit Card | Иконка карандаша | button | Быстрое открытие формы редактирования записи | `MemoryGrid.vue:64` | `MemoryDetailModal` | weekly |
| `memory.grid.card_delete` | Memory → Grid → Delete Card | Иконка корзины | button | Удаление факта из памяти | `MemoryGrid.vue:78` | `MemoryDetailModal` | weekly |

## 3. Секция: Модальные окна (Detail, Form, ConfirmClear)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `memory.modals.form.save` | Memory → Modals → Form → Save | СОХРАНИТЬ | button | Валидация и запись факта в память | `MemoryFormModal.vue:85` | - | weekly |
| `memory.modals.clear_confirm` | Memory → Modals → Clear → Confirm | ОЧИСТИТЬ | button | Окончательное безвозвратное удаление всех записей памяти | `MemoryView.vue:71` | - | setup-once |

---

# Пространство: MODULES (МОДУЛИ)

> **Пространство:** `modules`
> **Лейбл:** `МОДУЛИ`
> **Файл реализации:** `src/renderer/features/modules/components/ModulesView.vue`

## 1. Секция: Верхняя панель и фильтрация

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `modules.header.search` | Modules → Header → Search | Поиск модуля... | input | Текстовый фильтр модулей и подсистем по названию и описанию | `ModulesView.vue:26` | - | daily |
| `modules.header.filter_all` | Modules → Header → Filter All | Все (10) | button (tab) | Отображение полного списка архитектурных модулей | `ModulesView.vue:38` | - | daily |
| `modules.header.filter_active` | Modules → Header → Filter Active | Работающие (7) | button (tab) | Фильтр только готовых к работе модулей со статусом ONLINE | `ModulesView.vue:44` | - | daily |
| `modules.header.filter_calibrating`| Modules → Header → Filter Calibrating | Калибровка (3) | button (tab) | Фильтр модулей, находящихся в процессе интеграции | `ModulesView.vue:52` | - | daily |

## 2. Секция: Карточки модулей и прямой переход

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `modules.grid.open_module` | Modules → Grid → Module Card → Action | Открыть модуль (Открыть вкладку) | button | Прямой переход в соответствующее пространство приложения (`uiStore.setActiveTab(targetTab)`) | `ModulesView.vue:115` | `TabBar.vue:18` | daily |

> **Примечание:** `ModulesView` выполняет роль интерактивной системной карты архитектуры A.R.C. Кнопки «Открыть модуль» вызывают те же действия перехода, что и верхний/нижний `TabBar`.

---

# Пространство: FILES (ФАЙЛЫ)

> **Пространство:** `files`
> **Лейбл:** `ФАЙЛЫ`
> **Файл реализации:** `src/renderer/features/files/components/FilesTabView.vue`

## 1. Секция: Панель навигации по директориям

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `files.toolbar.navigate_up` | Files → Toolbar → Up Button | Стрелка назад / Вверх | button | Переход на один уровень каталога вверх (`..`) | `FilesTabView.vue:5` | - | daily |
| `files.toolbar.current_path` | Files → Toolbar → Path Display | [Текущий путь] | readonly-info | Текстовое отображение текущей директории в файловой системе | `FilesTabView.vue:8` | - | daily |
| `files.toolbar.refresh` | Files → Toolbar → Refresh Button | Иконка обновления | button | Принудительное пересканирование содержимого текущей папки | `FilesTabView.vue:11` | - | daily |

## 2. Секция: Список файлов и сетка элементов

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `files.list.item_click` | Files → List → File/Directory Item | [Имя файла / Папки] | button | Открытие вложенной папки или выбор файла для предпросмотра | `FilesTabView.vue:40` | - | daily |
| `files.list.return_to_root` | Files → List → Root Button | Вернуться в корень | button | Сброс пути в корень проекта при ошибке чтения директории | `FilesTabView.vue:28` | - | weekly |

## 3. Секция: Панель предпросмотра файла (File Preview)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `files.preview.close` | Files → Preview → Close Button | Иконка крестика | button | Закрытие панели предпросмотра файла | `FilesTabView.vue:59` | - | daily |
| `files.preview.content` | Files → Preview → Text Content | [Текст файла] | readonly-info / textarea | Отображение текстового содержимого выбранного файла (readonly) | `FilesTabView.vue:72` | - | daily |

---

# Пространство: TRANSCRIPTION (АУДИО)

> **Пространство:** `transcription`
> **Лейбл:** `АУДИО`
> **Файл реализации:** `src/renderer/features/transcription/components/TranscriptionView.vue`

## 1. Секция: Загрузчик и прослушивание аудиофайла

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.upload.dropzone` | Transcription → Upload → Dropzone | ПЕРЕТАЩИТЕ АУДИО ФАЙЛ | input (file drag-drop) | Выбор аудио/видео файла для транскрибации (MP3, WAV, M4A, OGG, FLAC) | `TranscriptionView.vue:38` | - | daily |
| `transcription.upload.clear_file` | Transcription → Upload → Reset File | Сбросить файл | button | Очистка выбранного аудиофайла и результатов | `TranscriptionView.vue:71` | - | daily |
| `transcription.preview.player` | Transcription → Preview → Audio Player | Плеер источника | custom (audio player) | Предварительное прослушивание загруженного аудиофайла | `TranscriptionView.vue:85` | - | daily |

## 2. Секция: Выбор интеллектуальной модели STT

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.model.select` | Transcription → Model → Select Model | [Карточка модели STT] | select / radio | Выбор модели распознавания (Whisper Small, Whisper Large-v3, Gemini 3.5 Flash) | `TranscriptionView.vue:105` | `settings.voice.stt` | daily |
| `transcription.model.download` | Transcription → Model → Download | Скачать ([размер]) | button | Фоновое скачивание локальной модели Whisper с HuggingFace | `TranscriptionView.vue:127` | `settings.voice.stt.download` | setup-once |

## 3. Секция: Аппаратное ускорение (GPU Boost / Acceleration)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.gpu.device_cpu` | Transcription → GPU → Device CPU | ЦП (WASM) | button (radio) | Инференс на процессоре без использования дискретной видеокарты | `TranscriptionView.vue:150` | `settings.models.device` | weekly |
| `transcription.gpu.device_cuda` | Transcription → GPU → Device CUDA | NVIDIA CUDA | button (radio) | Аппаратное ускорение на видеокартах NVIDIA GeForce | `TranscriptionView.vue:167` | `settings.models.device` | weekly |
| `transcription.gpu.device_dml` | Transcription → GPU → Device DirectML | DIRECTML (GPU) | button (radio) | Универсальное ускорение DirectML для AMD / Intel / Apple | `TranscriptionView.vue:185` | `settings.models.device` | weekly |

## 4. Секция: Запуск, логи и экспорт результатов

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.actions.start` | Transcription → Actions → Start Button | Запустить расшифровку | button | Запуск полного процесса декодирования аудиодорожки в текст | `TranscriptionView.vue:279` | - | daily |
| `transcription.actions.toggle_logs`| Transcription → Actions → Toggle Debug | [Показать / скрыть логи системы] | button | Отображение консоли логов пайплайна транскрипции | `TranscriptionView.vue:291` | - | debug-only |
| `transcription.actions.search` | Transcription → Actions → Search Text | ПОИСК В ТЕКСТЕ... | input | Быстрая фильтрация по таймлайну и сегментам расшифровки | `TranscriptionView.vue:324` | - | daily |
| `transcription.actions.save_txt` | Transcription → Actions → Save TXT | СОХРАНИТЬ TXT | button | Экспорт распознанного текста с таймкодами в текстовый файл | `TranscriptionView.vue:330` | - | daily |

---

# Пространство: VISION (КАМЕРА)

> **Пространство:** `vision`
> **Лейбл:** `КАМЕРА`
> **Файл реализации:** `src/renderer/features/vision/components/VisionTabView.vue`

## 1. Секция: Оптический видеопоток (Optical Feed Canvas)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `vision.camera.enable` | Vision → Camera → Enable Button | ВКЛЮЧИТЬ КАМЕРУ | button | Запрос доступа к веб-камере через `navigator.mediaDevices.getUserMedia` и запуск видеопотока | `VisionTabView.vue:29` | - | daily |
| `vision.camera.disable` | Vision → Camera → Disable Button | ОТКЛЮЧИТЬ | button | Остановка видеопотока камеры и освобождение видеоустройства | `VisionTabView.vue:36` | - | daily |

## 2. Секция: Статус когнитивного распознавания

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `vision.status.recognition_info` | Vision → Status → Diagnostic Info | Распознавание не подключено (фаза 2) | readonly-info | Честная индикация состояния детекции объектов (согласно принципу честности данных) | `VisionTabView.vue:48` | - | setup-once |

---

# Пространство: SETTINGS (НАСТРОЙКИ)

> **Пространство:** `settings`
> **Лейбл:** `НАСТРОЙКИ`
> **Файлы реализации:** `src/renderer/features/settings/components/SettingsPanel.vue`, `useSettingsNav.ts`, а также все секции в `src/renderer/features/settings/components/sections/`.

## Группа 1: ОБЩИЕ (General)

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

## Группа 2: ИНТЕЛЛЕКТ (Intelligence)

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

## Группа 3: ГОЛОС (Voice)

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

## Группа 4: СИСТЕМА (System)

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

---

# Карта дубликатов и пересечений интерфейса

> **Статус:** Анализ фактического дублирования контролов и параметров по состоянию на v1.0.12
> **Определение дубликата:** Одна и та же настройка, состояние стора или действие доступны пользователю в двух или более независимых местах интерфейса.

## 1. Сводная таблица дубликатов настроек

| # | Параметр в Pinia / Модель | Первое место (file:line) | Второе место (file:line) | Третье+ место | Анализ и рекомендация |
|---|---|---|---|---|---|
| **D1** | `voiceFeedback` (Озвучивать команды через TTS) | `QuickCoreSection.vue:56` | `CommandSettingsTab.vue:12` | - | **Критический дубликат.** Оба компонента читают и пишут в `settingsStore.voiceFeedback`. Рекомендация: оставить в Настройках (`General → Quick`), убрать вкладку Настройки из `CommandsView`. |
| **D2** | `requireConfirm` (Подтверждение опасных действий) | `QuickCoreSection.vue:64` | `CommandSettingsTab.vue:23` | `SafetySection.vue:40` (связанный `shell_confirm`) | **Критический дубликат.** Рекомендация: консолидировать параметры безопасности в секции `Settings → System → Safety`. |
| **D3** | `showMusicWidget` (Отображение виджета музыки) | `QuickCoreSection.vue:80` | `WidgetsSection.vue:65` | - | **Прямой дубликат.** Включение капсулы дублируется в «Быстрых» и в «Виджетах». Рекомендация: оставить управление виджетами в `WidgetsSection`. |
| **D4** | `voiceAutoClearCache` (Автоочистка аудио-кэша) | `STTSection.vue:82` | `TTSSection.vue:145` | - | **Скрытый дубликат ключа.** Обе секции биндятся на одну переменную стора `voiceAutoClearCache`. Переключение в STT незаметно меняет поведение TTS. Рекомендация: либо разделить на `sttAutoClearCache` и `ttsAutoClearCache`, либо вынести в `System → Storage`. |
| **D5** | `widgetLayoutMode` (Режим дока / плавающий) | `QuickCoreSection.vue:96` | `WidgetsSection.vue` | `WidgetsLayer.vue` | **Дубликат управления.** Переключение режима компоновки виджетов доступно и на экране быстрых настроек, и во вкладке виджетов. |
| **D6** | `tabBarPosition` (Позиция меню: сверху/снизу) | `QuickCoreSection.vue:88` | `AppearanceSection.vue` | - | **Дубликат кастомизации.** Рекомендация: оставить строго в `General → Appearance`. |
| **D7** | `useLocalLLM` (Переключение на локальную модель) | `QuickCoreSection.vue:72` | `RoutingSection.vue:110` | `LocalAISection.vue:35` | **Тройное пересечение.** Настройка переключает флаг `useLocalLLM`, но в `RoutingSection` есть отдельный селектор приоритета «Локально/Облако», а в `LocalAISection` — тумблер встроенного движка. Рекомендация: синхронизировать с `RoutingSection`. |

## 2. Сводная таблица пересечений действий (Action Overlaps)

| Действие | Где реализовано в UI | В чем пересечение | Рекомендация к оптимизации |
|---|---|---|---|
| **Сброс / очистка данных** | `SystemSection.vue:85` (Factory reset), `MemoryToolbar.vue:132` (Clear memory) | Пользователь может случайно стереть долговременную память из тулбара памяти, думая что чистит фильтр | Сделать явное разделение: «Очистить текущие фильтры» vs «Глобальное стирание базы знаний» |
| **Выбор аппаратного устройства (GPU / DirectML / CPU)** | `TranscriptionView.vue:148-200`, `ModelManagerSection.vue:30` | Выбор ускорителя для инференса транскрибации Whisper дублирует селектор оборудования для локальных LLM | Вынести единый детектор/селектор аппаратного ускорения в системную диагностику |
| **Скачивание весов моделей** | `TranscriptionView.vue:127` (Whisper), `ModelManagerSection.vue:85` (LLM GGUF), `STTSection.vue` (Sherpa) | Три независимых прогресс-бара и загрузчика с HuggingFace/внешних URL | Объединить в единый фоновый менеджер загрузок моделей |
| **Переход по вкладкам** | `TabBar.vue:18` (Dock/Top bar), `ModulesView.vue:115` (Карточки модулей) | Кнопки «Открыть модуль» в `ModulesView` полностью дублируют функционал системного таб-бара | Сохранить как архитектурную карту, так как `ModulesView` выполняет роль каталога |
