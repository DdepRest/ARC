# A.R.C. — Текущее состояние системы (Current State)
**Версия:** v3.4-g8-release (1.0.12)  
**Дата обновления:** 07.11.2026  
**Статус:** Выполнены все этапы дорожной карты `docs/PROJECT_RELEASE_ROADMAP.md` и закрыт **Release Gate G8 (Чистый Windows QA, лицензии и релизная сборка)**: `npm run gate` полностью зелёный (563 unit-теста пройдены, 0 ошибок ABI SQLite/Electron и Python, 0 нарушений визуальной конституции, строгие лимиты размеров файлов), дистрибутив оптимизирован (исключён лишний venv `silero_env`, удалены артефакты Vosk, модель `v5_5_ru.pt` гарантированно синхронизируется в ресурсы).
**Время на прочтение:** ~2 минуты


---

## 1. Версии ключевых компонентов

- **Платформа**: Electron 34.3.0 / Node.js `>=22.12.0` (LTS 22.x) / Windows 10/11 x64
- **UI & Стейт**: Vue 3.5.13 (Composition API) + Pinia 2.3.1 + Tailwind CSS 4.1.14
- **Язык & Сборка**: TypeScript 5.8.2 + electron-vite 5.0.0 + Vite 6.2.0
- **Инженерный аудит, стабилизация и устранение блокеров CI (Audit & Stabilization, 07.11.2026)**:
  - **Ленивая инициализация и изоляция путей `CacheService` (`src/main/services/cache.service.ts`)**: устранён P0-блокер CI (`EACCES: permission denied, mkdir '/mock'` в `ai.ipc.test.ts` на non-root раннерах GitHub Actions). Импорт модуля и конструктор `new CacheService()` не выполняют дисковых операций (`0` побочных эффектов ФС до первого вызова `get`/`set`/`getStats`/`clear`/`setConfig`). При ошибках `EACCES`/`EROFS` сервис переходит в `initialized = false` без необработанных исключений и автоматически восстанавливается при следующем вызове после смены директории. Добавлена строгая проверка `isSafeCacheFilePath` (`path.resolve` + `path.relative`), блокирующая path traversal (`../../`) при чтении и удалении WAV-файлов из повреждённого `metadata.json`. Политика `isSpeedTier` переведена на строгий белый список системных фраз с резервом `20 МБ` внутри общего лимита `100 МБ` и реальными счётчиками `hits`/`misses`/`evictions`.
  - **Защита `TTSService.isBusy()` и провайдеры `piper`/`kokoro` (`src/main/services/tts.service.ts`, `voice.ipc.ts`, `TTSSection.vue`)**: весь жизненный цикл `speak()` после создания `this.activeAbortController` обёрнут в `try / finally`, гарантирующий сброс `activeAbortController = null` и `isBusy() === false` при любом исходе (Cache HIT, офлайн Python-сервера, фолбэк в Edge/SAPI, ошибка Survival Tier или отмена), предотвращая вечную блокировку рестарта `PythonServerService`. Нереализованные провайдеры `Piper ONNX` и `Kokoro 82M` помечены в UI как `Planned (v1.1)` (`disabled`), а сохранённые legacy-значения безопасно мигрируют в `'auto'` в `settings.store.ts` и `tts:set-provider`.
  - **Атомарный транзакционный импорт памяти (`src/main/services/memory/memory-batch-import.ts`, `long-term-memory.ts`, `memory.ipc.ts`)**: закрыт P2-долг из Task 3.2 — добавлен IPC-канал `memory:import` (`window.api.memoryImport`), выполняющий предварительную валидацию всего JSON-массива (`validateAndNormalizeMemoryBatch`, лимит до 5 000 записей) и атомарный `UPSERT` внутри единой транзакции `db.transaction(...)` (`importMemoryBatchAtomic`). При ошибке на любом элементе откатывается вся пачка (`0` частично записанных строк).
  - **Единый нормализатор URL и доменов (`src/shared/utils/url-normalizer.ts`)**: устранено дублирование словарей сайтов и очистки URL между `system-classifier.ts`, `commands.registry.ts`, `MacroExecutor.ts` и `media-classifier.ts` через общие функции `stripTrailingUrlPunctuation`, `normalizeMacroExternalUrl` и `resolveSiteQueryToUrl`.
  - **Конвейер CI/CD и синхронизация манифестов (`.github/workflows/ci.yml`, `package.json`, `package-lock.json`)**: версия в `package-lock.json` синхронизирована с `1.0.12`, добавлено поле `"engines": { "node": ">=22.12.0" }`, в GitHub Actions CI (`validate`) обновлён Node.js до `22`, добавлен шаг `npm run build` и джоба `package-win` (`windows-latest`) для автоматической сборки Windows x64 (`NSIS` + `portable`) с проверкой размеров и генерацией `SHA256SUMS.txt`.
  - **Глубокий рантайм-аудит и межмодульная стабилизация (v1.0.13 Deep Runtime Audit, 07.11.2026, `docs/MASTER_TZ_v1.0.13_DEEP_RUNTIME_AUDIT.md`)**:
    - **Защита от гонок перезапуска и быстрая отмена retry (`python_server.service.ts`, `request-executor.ts`)**: в `PythonServerService` добавлены защита от повторного параллельного входа `isStarting` и предохранитель `MAX_AUTO_RESPAWNS = 5`, предотвращающий бесконечный цикл респавна при нерабочем окружении Python. В `request-executor.ts` ожидания между попытками retry переведены на `abortableDelay(ms, abortController.signal)`, что мгновенно прерывает ожидание при пользовательской отмене без ложной блокировки провайдера в `providerHealthManager`.
    - **Безопасность окон Electron и очистка временных файлов TTS (`tts.service.ts`, `ai.ipc.ts`)**: устранена утечка временных файлов `temp_speech_*.wav` в `os.tmpdir()` после успешного синтеза `speakWithSileroTTS` (удаление гарантировано в `finally`) и коллизия `temp_tts_system.txt` в `speakWithSystemTTS`. Все вызовы `webContents.send` в `tts.service.ts`, `python_server.service.ts` и `ai.ipc.ts` защищены проверкой `!win.isDestroyed() && !win.webContents?.isDestroyed()`.
    - **Сквозное маскирование секретов и TOCTOU-защита кэша (`log-sanitizer.ts`, `logger.ts`, `diagnostics.service.ts`, `cache.service.ts`)**: `maskSecrets` и `sanitizeError` маскируют секреты в URL query-параметрах (`?key=***`, `&api_key=***`, `&token=***`), заголовках `x-api-key` / `x-goog-api-key`, токенах `hf_***` / `ghp_***` и `AxiosError.config.url`; `DeduplicatingLogger` в `logger.ts` пропускает все сообщения через `maskSecrets`. Запись WAV в `CacheService.put()` переведена на атомарный staging-файл `.tmp.<pid>.<ts>` с проверкой `lstatSync` перед `renameSync`. Из `package.json` удалены подтверждённо неиспользуемые пакеты `glob`, `@types/marked`, `@types/dompurify`. Добавлен межмодульный интеграционный тест `src/main/services/runtime-integration.audit.test.ts`.
  - **Редизайн пространства настроек — Structured Workspace + Split Navigation + Master-Detail (Stages 1–4, раздел «Интеллект»)**:
    - **Постраничная навигация (`useSettingsNav.ts`, `SettingsMenu.vue`, `SettingsPanel.vue`, `AiSettings.vue`)**: категория «Интеллект» (`intelligence`) переведена с единого длинного скролла на независимые страницы подразделов (`section-router`, `section-providers`, `section-local`, `section-models`) в контейнере `max-w-[1120px]` с независимым сохранением позиции прокрутки (`saveSectionScroll`/`getSectionScroll`), семантикой `aria-expanded` / `aria-controls` / `aria-current="page"` / `role="region"` и сохранением глобального поиска и подсветок `.search-highlight`.
    - **Контрастная лестница поверхностей и Master-Detail инспектор (`tokens.css`, `SettingsSectionHeader.vue`, `SettingsGroup.vue`, `SettingsBlock.vue`, `SettingsRow.vue`, `RoutingSection.vue`, `ProvidersSection.vue`, `ProviderCard.vue`, `LocalAISection.vue`, `ModelManagerSection.vue`)**: расширен диапазон светлоты поверхностей (`--arc-well: #060606`, `--arc-block: #131313`, `--arc-block-elevated: #171713`, `--arc-block-gradient`, `--arc-block-active-gradient`), сводные панели `#summary` оформлены как утопленные приборные табло (`--arc-well`), а раздел `ProvidersSection.vue` переведён со слитного вертикального аккордеона на двухколоночный **Master-Detail** интерфейс (компактный реестр шлюзов слева + детальный инспектор `ProviderCard.vue` справа с 3 внутренними вкладками: `01. Доступ и адрес`, `02. Модели и маршрут`, `03. Лимиты генерации`). Все поверхности и акценты строго соответствуют `tokens.css` и `check-visual-constitution.js`.
    - **Исправление замечаний после аудита Settings UX/UI (P1/P2, раздел «Интеллект»)**: возвращена ленивая загрузка `SettingsPanel.vue` через `defineResilientAsyncView()` в обоих компонентах `HolographicProjectionPanel.vue`; в `ArcSelect.vue` устранена принудительная строковая сериализация значений (`string | number | boolean` сопоставляются по индексу через `Object.is`, добавлен типизированный эмит `change` и безопасный `-1` fallback без авто-эмита первой опции); в `RoutingSection.vue`, `ai-status.ts` (`getLocalContourStatus`) и `useLocalAIEngine.ts` (`hasProbedBuiltin`/`hasProbedOllama`) устранён ложноположительный статус `'АКТИВЕН'` при непроверенном локальном контуре; в `ProvidersSection.vue` устранена вложенность интерактивных элементов (`<div role="button">` заменён на две соседние семантические кнопки `<button type="button">` с `aria-pressed`), введена 7-статусная классификация списка (`getProviderListStatus`), точечный таймер истечения карантина (`useQuarantineWatch`) и изолированная машина состояний черновика инспектора (`useProviderInspectorDraft`: `clean → dirty → saving → saved → error`, исключение `enabled` из черновика с merge из стора при Save, сохранение `MASKED_SECRET_PLACEHOLDER` и матовая плашка подтверждения при смене шлюза).
    - **Полная унификация всех разделов Настроек по 3-уровневому стандарту (`Общие / Ядро`, `Голос`, `Система`, `Обновления`)**: все 17 секций настроек вне «Интеллекта» (`QuickCoreSection`, `AppearanceSection`, `TabNavigationSection`, `WidgetControlsSection`, `HotkeysSection`, `VkIntegrationsSection`, `DiagnosticsExportSection`, `AppUpdatesSection`, `STTSection`, `TTSSection`, `VoiceAudioSection`, `GraphicsReactorSection`, `PerformanceOptionsSection`, `DiagnosticsSection`, `SafetySecuritySection`, `StorageDataSection`, `UpdatesHistorySection`) и их контейнеры (`GeneralSettingsSection.vue`, `VoiceSettings.vue`, `PerformanceSettings.vue`, `UpdatesHistorySection.vue`) приведены к единой сетке `max-w-[1120px]` и 3-уровневой архитектуре: паспорт подсистемы `SettingsSectionHeader variant="workspace"` с живым статусом, приборное табло сводки `SettingsSummaryStrip.vue` (`--arc-well`, 4 колонки `tabular-nums`), нумерованные функциональные группы `SettingsGroup` (`01`, `02`, `03`...) и адаптивная раскладка `SettingsRow layout="stacked"` для широких мультикнопочных контролов без наложения на подписи.
- **База данных и Tasks SSOT**: better-sqlite3 12.9 (C++ нативный аддон, ABI Electron 143) с защитой от потери данных при `SQLITE_BUSY`/`EBUSY`, двухфазным staging-захватом `.quarantine-staging` + SHA-256 WAL-карантином и строгим whitelist `DB_SAFE_MODE` (`system:get-db-status`). Таблица `arc_tasks` (`updated_at` + `idx_tasks_updated`) выступает единым источником истины (SSOT) с гранулярным транзакционным CRUD (`TasksService`), push-синхронизацией `tasks:changed` между `TaskManagementTool` (`ai_tool`) и окнами UI (`renderer`), семантикой `tasks:saveAll = batchUpsertTasks` (без удаления отсутствующих в массиве задач) и legacy-ключом `localStorage('arc_operational_tasks')` (только первичный seed при пустой БД и read-only fallback)
- **Хранилище секретов и резолвер мультимодальных моделей**: `SecretVaultService` (`secrets.json` v2, Electron `safeStorage` / Windows DPAPI) — нулевой plaintext/base64 на диске, режим `session_memory_only` при недоступности DPAPI, маскирование ключей провайдеров (`••••••••••••••••`) для renderer-процесса. `ProviderManager.resolveMultimodalGeminiConfig()` выступает единым SSOT для Vision (`ai:analyze-vision`, `system-classifier.ts`), Cloud STT (`transcription:transcribe-gemini`) и UI транскрибации (`ai:get-multimodal-model` возвращает `{ model, hasKey }` без передачи ключа в renderer)
- **Логирование диалогов и песочница ФС**: `DialogLogger` пишет JSON-lines в `userData/logs/dialogs/dialogs.log` с ротацией `5 МБ × 3` (`dialogs.log`, `.1`, `.2`, суммарно `≤ 15 МБ`) и политикой `privacy-by-default` (`mode: 'meta'`; для полного текста с `maskSecrets` требуется `ARC_LOG_DIALOG_TEXT=true` или `DialogLogger.setFullTextLogging(true)`). Канал `macros:*` защищён `resolveMacroFilePath`, канал `system:files` (`@deprecated`, канонический — `files:list`) изолирован через `getAllowedRoots()` / `isPathAllowed()` (`files.service.ts`)
- **Синтез речи (TTS) и локальный движок Silero v5.5**: Поддержка переключения в настройках («Голос → Синтез речи») между `auto`, `Silero v5.5` (`v5_5_ru.pt`, PyTorch / Python 3.10+, 48kHz DSP, 5 голосов RU), `Edge TTS` и `Windows SAPI` (каскад фолбэков `Silero → Edge → SAPI`). Модель `v5_5_ru.pt` и `python-embed` поставляются в `extraResources` (`resources/models/silero-v5/v5_5_ru.pt`, `resources/python-embed`); автоскачивание весов в рантайме отключено (при отсутствии файла `silero_server.py` возвращает `HTTP 503`, активируя прозрачный фолбэк в `TTSService`). В `silero_server.py` зафиксированы `OMP_NUM_THREADS=2`, `torch.set_num_threads(2)`, `torch.inference_mode()` и поколенческий `gc.collect(0)` строго после каждой 20-й синтезированной фразы.
  - **Препроцессор ударений RUAccent (INT8)**: пакеты `ruaccent` и `onnxruntime` проверяются и доустанавливаются при старте (`python_deps.util.ts`, `start_app.bat`). Инициализация и динамическое INT8-квантование (`./models/ruaccent`) в `silero_server.py` вынесены в фоновый демон-поток (`start_ruaccent_preload` в `@app.before_request` и `__main__`), а `get_ruaccent(timeout=5.0)` ждёт не более 5 секунд и мгновенно возвращает `None`, если модуль или модель недоступны, не блокируя `/tts` и `/tts_stream`.
  - **Неблокирующий запуск внешних приложений, очистка URL и VK WS**: в `MacroExecutor.ts` запуск процессов переведён на `spawn(..., { detached: true, stdio: 'ignore' })` с `child.unref()`, открытие URL (`shell.openExternal` в `MacroExecutor.ts`, `system-classifier.ts`, `media-classifier.ts`, `commands.registry.ts`) использует единый модуль `src/shared/utils/url-normalizer.ts`, очищает домены от конечных знаков препинания (например, `"Открой youtube."` → `https://youtube.com`), проверяет валидность TLD и выполняется через `setImmediate`/неблокирующий промис без блокировки Event Loop.
  - **Устранение зацикливания LLM и сохранение контекста**: в системных промптах (`prompt-builder.ts`, `openai.provider.ts`) и `auto-workflow.ts` короткие разговорные реплики без глаголов сборки маршрутизируются в `Ask` с запретом повторения шаблонных фраз вроде «Чем займёмся?», а `openai.provider.ts` и `ollama.provider.ts` объединяют историю диалога из контекста и памяти.
  - **Маршрутизация системных ответов, санация IPC и реактивные бейджи TTS на всех сообщениях**: системные и локальные ответы озвучиваются через `ttsService.speak` (Silero, голос `eugene`, асинхронное чтение WAV через `fs.promises.readFile`, очистка `/clear-cache` переведена в fire-and-forget с таймаутом `200 мс`, таймаут health-check `/status` в `PythonServerService` увеличен до `15 с` с пропуском ложных срабатываний при `ttsService.isBusy()`). В `ui.store.ts` вызов `window.api.speak(...)` выполняется неблокирующе (`void Promise.resolve(...)`) с приведением аргументов к примитивам. В `chat.store.ts` (`addMessage`, `updateMessageTtsMeta`, `deleteMessage`) и `useChat.ts` объекты сообщений, `meta` и контекста проходят депроксирование через `toRaw` + `JSON.parse(JSON.stringify(...))` с изоляцией `try/catch` вокруг IPC (`dialogAddMessage`, `dialogCreateSession`), полностью устраняя ошибку `An object could not be cloned` и потерю сообщений в UI. Событие `tts:meta` (`{ engine, isCached, queryId }`) коррелируется по `queryId`/`reqId` в `chat-pipeline.ts` и реактивно обновляет каждое озвученное сообщение через `chatStore.updateMessageTtsMeta` с персистом в `arc_tts_meta_cache`.
  - **Разгрузка Event Loop и ленивый рендер модальных окон**: `VisualizerWorklet` (`useAudioManager.ts`) ограничен 20 Гц и прекращает рассылку `{ volume: 0 }` в тишине; чтение макросов в `CoreClassifier`, `getAiIntentMacros` и `MacroSchedulerService` переведено на 5-секундный TTL-кэш и `fs.promises`; модальные окна аналитики задач (`TaskAnalyticsModal`, `CategoryModal`, `RecurrenceModal` в `TasksView.vue`) обёрнуты в `v-if` / `<Suspense>`.
  - Мёртвый файл `myload/ARC_TTS_normalizer.py` удалён (`tech-debt-cleanup-01`); ссылок в коде нет.
- **Распознавание речи (STT), быстрая сегментация VAD и AudioDuckingManager**: Sherpa-ONNX 1.10+ (GigaAM CTC + Whisper Small int8 + Sherpa Zipformer RU). В упакованной сборке (`app.isPackaged`) `STTService` резолвит `scripts/stt_worker.js` из `process.resourcesPath` / `app.asar.unpacked` с пробросом `NODE_PATH` к `app.asar.unpacked/node_modules`, а `sherpa-paths.util.ts` использует доступные для записи пути `LOCALAPPDATA/ARC_Voice/models/<subdir>` и `userData/Voice/models/<subdir>`. Модуль VAD (`stt-config.helper.ts`, `useVoice.ts`, `capture-worklet.js`) настроен на сверхбыструю нарезку сегментов (`minSilenceDuration: 0.30s`, `minSpeechDuration: 0.10s`, zero-copy фреймы по 512 сэмплов / 31.25 Гц) и мгновенное выделение команды сразу после вейкворда «Арк». Служба `AudioDuckingManager` (`src/renderer/audio/audio-ducking-manager.ts`) автоматически снижает усиление фоновых потоков (внутреннее аудио, VK-плеер и системный звук Windows через `media:duck-system`) на настраиваемый в `VoiceAudioSection.vue` процент (по умолчанию 70%) при старте TTS (`arc:tts-start`) и восстанавливает полную громкость при завершении (`arc:tts-finish`).
- **Динамический инкрементальный KV-Cache Prefill во время речи пользователя (`src/main/services/llm/kv-prefill.service.ts`, `kv-prefill.utils.ts`, `built-in-llm.service.ts`, `ollama.provider.ts`, `useVoice.ts`, `scripts/stt_worker.js`)**: фоновый прогрев KV-кэша языковой модели по мере поступления потоковых `stt:partial` чанков (активируется после обнаружения wake-word или в активном 15-секундном окне диалога `ACTIVE_DIALOGUE`). В режиме `gigaam` воркер `stt_worker.js` генерирует промежуточные расшифровки буфера речи каждые ~350 мс. Утилита `extractStableSpeechPrefix` удерживает незавершённое последнее слово до пробела, пунктуации или стабилизации между чанками, предотвращая лишний пересчёт BPE-токенов. Для встроенной локальной модели (`node-llama-cpp`) `BuiltInLlmService.prefillPartial` синхронизирует историю без сброса `_lastEvaluation`, вычисляет расхождение токенов (`computeTokenDiff`), при коррекции STT откатывает только изменённый хвост через `sequence.eraseContextTokenRanges` и инкрементально довычисляет новые токены через `session.preloadPrompt`. Для локальной Ollama отправляются коалесцированные запросы `/api/generate` с `options: { num_predict: 0 }` и фиксированным `OllamaPrefillEnvelope`, который переиспользуется в `executeOllamaRequest` при финальной генерации. При срабатывании стоп-слов, закрывающих фраз благодарности, локального классификатора команд или кэша вызывается `cancelPrefill` с откатом незавершённых пользовательских токенов до базового индекса истории.
- **Честная телеметрия и ликвидация бутафории (Task 3.2, 01.11.2026)**:
  - `system:metrics` (`src/main/ipc/system.ipc.ts`): удалены хардкоды `temperature: 42`, `cpuTemperature: 42`, `gpuTemperature: 46`; подключены `si.cpuTemperature()` и `si.graphics()` с TTL-кэшем 5000 мс (`readTempsCached()`). При отсутствии датчиков или без прав администратора в Windows (`main <= 0`, `temperatureGpu <= 0` или rejection) возвращается `null` (UI отображает `N/A`), для `vramTotalMb` сохранён fallback `checkVramTotalMb()`.
  - `ModulesView.vue`: модуль `orchestrator` переведён в `status: 'active'` (`statusLabel: 'Маршрутизация в Settings'`, `targetTab: 'settings'`); у модулей `agents`, `tools-mcp`, `architecture`, `sandbox` удалены несуществующие `targetTab`, в карточках и фильтрах унифицирован статус «Запланировано в v1.1» с disabled-плашкой вместо перехода в заглушку `FallbackTabView`.
  - `VisionTabView.vue`: реализована реактивная привязка `MediaStream` к `videoPlayerRef.value.srcObject` (поддержка `MediaStream`, `HTMLVideoElement` с `.srcObject`, объекта с `.getTracks()` или `{ stream }`) и очистка `srcObject = null` в `onUnmounted`.
  - `useTranscription.ts`: удалено глобальное переопределение `console.log / console.warn / console.error`, ломавшее стек-трейсы и дублировавшее перехват при повторном монтировании; логирование переведено на явные вызовы `logToDebug(...)`.
  - `MemoryView.vue`: блокирующие Electron-рендерер вызовы `alert()` при ошибках импорта JSON заменены на `settingsStore.triggerSyncToast(..., () => {})`, а сам импорт переведён на атомарный транзакционный канал `memory:import` (`memory-batch-import.ts`).
  - **Зафиксированный P2-долг (Task 3.2)**:
    1. В `HolographicProjectionPanel.vue` список `isUnhandledTab` (`orchestrator`, `agents`, `tools`, `architecture`, `sandbox`) сохранён как защитный fallback для внешних вызовов `uiStore.setActiveTab(...)`.
    2. В `VisionTabView.vue` кнопка анализа кадра отложена в P2 (`// TODO(P2): expose ai:analyze-vision via preload; button activates when window.api.analyzeVision is available`), так как текущий канал `ai:analyze-vision` (`analyzeScreenVision` в `preload.ts`) читает только временный файл скриншота экрана с диска и не принимает `{ imageBase64, prompt }` кадра веб-камеры.
- **Планировщик таймерных макросов и индексатор Лаунчера (Task 3.3, 01.11.2026)**:
  - **Планировщик макросов (`src/main/services/macro-scheduler.service.ts`)**: фоновый сервис `MacroSchedulerService` (интервал тика `30 с`, `CATCH_UP_WINDOW_MS = 15 мин`, `MACRO_EXECUTION_TIMEOUT_MS = 5 мин`), запускаемый в `app.whenReady()` и подписанный на `powerMonitor.on('resume')` и `powerMonitor.on('unlock-screen')` с идемпотентной остановкой в `app.on('before-quit', () => macroScheduler.stop())`. Состояние слотов `${macroId}::${nodeId}` (`lastRunDate: 'YYYY-MM-DD'`, `lastRunTs`) сохраняется атомарно (`.tmp` → `renameSync`) в `userData/macros-schedule-state.json`. Расчёт локальной даты и времени `HH:MM` выполняется через `Intl.DateTimeFormat` с поддержкой смены часового пояса. При пропуске времени более чем на 15 минут слот помечается `lastRunDate = today` без ретроактивного запуска. Макросы, содержащие узел `actions/shell`, пропускаются по расписанию с предупреждением в лог и `ui:show-toast` (ручной запуск через `macros:execute` сохраняет стандартный поток `shellApprovalService.requestShellApproval` из `src/main/services/security/shell-approval.service.ts`). Защита от параллельного запуска одного `macroId` реализована через общий `inFlightMacros` между планировщиком и `macros:execute`.
  - **Индексатор Лаунчера (`src/main/services/launcher-indexer.service.ts`, `src/main/ipc/launcher.ipc.ts`)**: рекурсивное сканирование папок из `userData/launcher-folders.json` на глубину `MAX_SCAN_DEPTH = 3` по расширениям `.exe`, `.lnk`, `.bat`, `.cmd` с пропуском симлинков (`isSymbolicLink` / `lstat`), системных директорий (`node_modules`, `.git`, `$Recycle.Bin`, `System Volume Information`, `AppData`, `Windows`, `ProgramData/Microsoft`) и регистронезависимой дедупликацией путей на `win32`. Индекс атомарно сохраняется в `userData/launcher-index.json`. Канал `launcher:refreshIndex` возвращает `{ success: true, indexed, folders, elapsedMs, note?: 'no_folders' } | { success: false, error }`; канал `launcher:search` выполняет ранжированный поиск (exact → prefix → substring); канал `launcher:launch` проверяет вхождение пути в whitelist `launcher-index.json` и запускает `shell.openPath(entry.path)`. В `LauncherTab.vue` и `launcher.store.ts` добавлены поле поиска с debounce `200 мс` и список найденных приложений с кнопкой «Запустить».
  - **Зафиксированный P2-долг (Task 3.3)**:
    1. Автоматическая очистка (pruning) устаревших ключей `${macroId}::${nodeId}` в `userData/macros-schedule-state.json` при удалении макросов или таймерных узлов отложена в P2 (не входит в объём 3.3).
- **Мастер первичной настройки и системная диагностика (Task 4.1 + 4.1-доработка, 02.11.2026)**:
  - **First-Run Wizard (`FirstRunWizardModal.vue`, `AiModeStep.vue`, `VoiceMicStep.vue`, `GraphicsStep.vue`, `complete-wizard.ts`, `recommend-preset.ts`)**: модальный HUD-мастер калибровки ядра из 3 шагов в визуальном каноне A.R.C. (`z-[9500]`, смонтирован на корневом уровне вне `<main>`, изолируя фоновые элементы `pointer-events-none select-none` без размонтирования 3D-Реактора; поддержка `Escape` только при открытом мастере). Шаг 1 (`AiModeStep.vue`) предоставляет 3 радио-карточки контуров (`OpenRouter`, `Gemini`, `Локальный` — Ollama / встроенный GGUF), статус-бейдж (`ключ проверен` / `не проверен` / `пропущен`) и двойную запись ключа для Gemini (`settingsSetKey('gemini_api_key')` → `saveProvider`). Шаг 2 (`VoiceMicStep.vue`) включает кастомный селектор микрофона, 12-сегментную RMS-шкалу (`−60 dB` .. `0 dB`), двухпозиционный моно-переключатель голосовой активации «A.R.C.» (`ВЫКЛ` / `ВКЛ`) и проверку синтеза речи. Шаг 3 (`GraphicsStep.vue`) отображает сетку 2×2 базовых профилей с параметрами из `GRAPHICS_PRESETS` (`renderScale`, `Bloom`, `MSAA`) и 5-ю карточку `UltraPlus` только при `v-if="isUltraPlusAvailable(detectedVramMb)"` (при `VRAM >= 12288 МБ`; пороги `recommendGraphicsPreset`: `< 4096` → `Low`, `4096..8191` → `Medium`, `>= 8192` → `High`, `null/<=0` → `Medium`). Хелпер `completeFirstRunWizard(store)` выделен в `complete-wizard.ts`.
  - **Диагностический сервис и экспорт (`DiagnosticsService`, `system:export-diagnostics`)**: сервис сбора безопасного JSON-отчета (`DiagnosticsReport`, schemaVersion: 1) с маскированием токенов/ключей (`sk-***`, `Bearer ***`, `password`, `apiKey`) и путей домашних директорий пользователей (`maskSecrets`), очисткой полей диалогов (`[STRIPPED]`) в последних ≤100 строках `logs/dialogs/dialogs.log`. Из структуры `report.app` строго исключен `userDataPath`. В `report.system.gpuControllers` собирается массив контроллеров `{ model, vram }` из `si.graphics()`; в `report.scheduler.macrosScheduleEntries` — число ключей из `userData/macros-schedule-state.json`. Подсчёт строк таблиц `arc_tasks`, `sessions`, `arc_objectives`, `ltm` выполняется через `SELECT COUNT(*) as n FROM <table>` с безопасной изоляцией сбоев. Выгрузка в файл осуществляется через нативный диалог `dialog.showSaveDialog` и кнопку в `GeneralSettingsSection.vue` / `DiagnosticsSection.vue`.
  - **Зафиксированный P2-долг (Task 4.1)**:
    1. `folderSizesBytes (database/logs/models/macros) — счётчик размеров подпапок в diagnostics; ограничить 4 подпапками, не рекурсивно; требует замера на реальном профиле G8`.
  - **Восстановление 3D-Реактора (Task 4.1-regress, 02.11.2026)**:
    - Устранён конфликт жизненного цикла `CommandCenter`/`ReactorCore`: удалён `watch(wizardOpen)` с `immediate: true` в `src/renderer/App.vue`, форсировавший `uiStore.setActiveTab('core')` и вызывавший преждевременный перемонтирование 3D-канваса при открытии Wizard-а во время затухания сплэша.
    - Удалены избыточные глобальные классы `pointer-events-none select-none` с `<TitleBar>`, `<main>` и `<CommandCenter>` в `App.vue` (изоляция событий ввода полностью обеспечивается модальным оверлеем мастера).
    - Фон оверлея `FirstRunWizardModal.vue` переведён на непрозрачный конституционный токен `bg-[var(--arc-rail)]` (взамен полупрозрачного `bg-black/70`), гарантируя чистое HUD-отображение и отсутствие просвечивания фоновых артефактов при калибровке.
- **Защищённая зона 3D-ядра**: Заморожена до живого дампа `flag=false`. Размытость читаемости логотипа A.R.C. — известный долг, НЕ регрессия; чинится отдельным ТЗ по профилю рендера/фильтрации текстур, НЕ в рамках заморозки защищённой зоны и НЕ самодеятельно.
- **Стабилизация CI и Visual Constitution (Task 1.5-stab, 31.10.2026)**:
  - **Защищённые зоны исключены из visual-constitution**: `scripts/check-visual-constitution.js` получил отдельный массив `PROTECTED_ZONES` (`src/renderer/components/reactor/**`, `src/renderer/features/tasks/**`, `src/renderer/features/chat/**`, `src/renderer/features/commands/composables/useMacroEditor.ts`, `src/renderer/components/layout/BottomBar.vue`, `src/renderer/components/panels/BottomBar.vue`, `src/renderer/features/voice/useVoice.ts`, `src/renderer/composables/useVoice.ts`, `src/main/services/built-in-llm.service.ts`, `src/main/services/objective/ObjectiveEngine.ts`). Файлы защищённых зон не учитываются в счётчиках конституции и выводятся информационно (`Protected zones excluded: 92 files (informational only)`). Воспроизводимый список 92 файлов доступен через команду: `node scripts/check-visual-constitution.js --list-protected`.
  - **Статус TaskSidebar.vue**: в исторической атрибуции упоминался `features/tasks/components/TaskSidebar.vue` (1 accent), но в актуальной структуре репозитория файл с таким именем отсутствует (в текущих компонентах `src/renderer/features/tasks/` литералы `#ef4444` отсутствуют, 0 совпадений; зона защищена AGENTS.md).
  - **Regex var() с fallback**: в сканере реализована функция `stripVarWithFallback(line)` со строгой балансировкой скобок `(`/`)`, корректно вырезающая конструкции `var(--<name>, <fallback>)` любой глубины вложенности (`var(--x, #ef4444)`, `var(--x, rgba(239,68,68,0.8))`, `var(--accent-glow,0_0_8px_rgba(239,68,68,0.8))`), при сохранении фиксации реальных литералов без `var()` (`box-shadow: 0 0 8px #ef4444`). `settings.store.ts` даёт строго 0 нарушений (устранены 3 false-positive).
  - **Whitelist не-UI кода**: файлы `arcGhostTrap.ts` и `arcLiveDump.ts` добавлены в `whitelistFiles`.
  - **Очистка stray-модели и P2-долг cwd**: файл `v5_5_ru.pt` в корне удалён, в `.gitignore` добавлена строка `/v5_5_ru.pt`. Риск cwd-relative перехвата чужой модели (`v5_5_ru.pt` в `relCandidates` / `getPath('.')`) зафиксирован как P2-долг для Roadmap (раздел G / Post-Release: очистка cwd-кандидатов без явного `ARC_SILERO_MODEL_PATH`).
  - **Переносимость Python-тестов**: `python_server.paths.test.ts` использует `const PYTHON_BIN = process.env.ARC_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');` и `it.skipIf(!hasPython)` при отсутствии интерпретатора на машине разработчика/CI.
  - **Baseline незащищённых зон**: фактические значения всех счётчиков в незащищённых файлах = 0 (синхронизировано в `scripts/visual-constitution-baseline.json` и корневом `visual-constitution-baseline.json`).

---



## 2. Активные фичи по группам

### 🖥️ 2.0 Дизайн-система «Приборы ядра (v3.2)» (Ступени S1, S2, S3, S4 — Релиз v1.2.0)
- **Ступень S1 (Непрозрачная лестница нейтралей v3.0)**:
  - Сплошные непрозрачные поверхности: `--arc-frame: #070707`, `--arc-plane: #0A0A0A`, `--arc-block: #101010`, `--arc-rail: #080808`.
  - Нулевое просвечивание реактора сквозь плоскость чтения и блоки параметров.
- **Ступень S2 (Оправа и проекция v3.0)**:
  - Физическая рама `HolographicProjectionPanel`: оправа 24/20px (16/12px при узком экране), радиус 24px, внешнее свечение `--arc-frame-glow`, угловые засечки HUD 28×28px с дыханием `opacity 2400ms`.
  - Полоса заголовка 48px на `--arc-header-bar` с акцентной живой линией `--arc-header-line`.
  - Дымка `--arc-veil` (0.22) и радиальное затемнение `--arc-veil-ring` (0.45) без blur над canvas.
- **Ступень S3 (Приборы ядра по v3.2 + семантика статусов v3.2.1)**:
  - **Новый примитив `ArcHudWidget.vue`**: Корпус `rgba(10, 10, 10, 0.88)` (нейтральный R=G=B, без blur), рамка 1px с верхним inset-бликом `rgba(255, 255, 255, 0.06)`, левый верхний угловой notch 2px `rgba(var(--accent-rgb), 0.35)`, радиус 14px, шапка с 10px mono caps лейблом (≤ 12 знаков) и светодиодной статус-точкой 6px.
  - **Шкалы `ArcTickBar.vue`**: 2px тики с акцентом только на заполненной части и предупреждающим цветом при пороге.
  - **Шесть консолидированных приборов**:
    - `CoreTelemetryWidget.vue` (ЯДРО): CPU, RAM, GPU, единая цифра FPS на экран (`profilerStats.fps`).
    - `RoutingWidget.vue` (МАРШРУТ): активная модель, среда исполнения, единая задержка («14 ms»), тракт VAD→STT→LLM→TTS.
    - `ActionTimelineWidget.vue` (СОБЫТИЯ): последние три действия тихим списком 12px.
    - `MediaHudWidget.vue` (МЕДИА): VK Music плеер в оболочке `ArcHudWidget`.
    - `EnvironmentWidget.vue` (СРЕДА): погода одной строкой («+18 °C»).
    - `VoiceHudWidget.vue` (ГОЛОС): статус микрофона, кодовое слово, последняя фраза.
  - **Устранение дублирования**: Удалены рынок/крипта, нумерация «0N.» из рельсов, дублирующие метрики.
  - **Единый источник правды телеметрии**: TitleBar скрывает числовые бейджи CPU/RAM при видимом приборе ЯДРО и отображает при скрытом или в других пространствах; чтение строго из `systemStore.metrics`.
  - **Узкий режим (~400px)**: Чистый flex-column поток в `WidgetsLayer.vue` без абсолютных наложений.
  - **Потеря фокуса**: Окно снижает прозрачность дока до `opacity: 0.6`.
- **Ступень S4 (Стекло над статикой по правилу «стекло над статикой, мат над анимацией»)**:
  - **Конституционный принцип**: «Стекло живёт над статикой и на кромках; мат живёт над анимацией и под текстом».
  - **Токены стекла**:
    - `--arc-glass-pop: rgba(22, 22, 22, 0.78)` + `blur(14px)`: селекты (`ArcSelect`), SpotlightSearch, SyncToast, поповеры, тултипы.
    - `--arc-glass-veil: rgba(0, 0, 0, 0.32)` + `blur(6px)`: вуаль модальных окон (`ApprovalDialog`, `ArcModal`).
    - `--arc-glass-header: rgba(10, 10, 10, 0.72)` + `blur(10px)`: полоса заголовка проекции с защитным флагом `ARC_HEADER_GLASS`.
    - `--arc-glass-edge`: тройной контур отрыва (inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.03), 0 18px 48px rgba(0,0,0,0.80)).
    - `--arc-sheen`: вертикальный линейный градиент подсветки 120px для верхних кромок и шапок.
  - **Колориметрия и стабильность**: Кромки блоков имеют контролируемую светлоту 26–40 (R=G=B=30), жизненный тест текста заголовка дает дельту 0 при пике свечения реактора.
  - **Число живых blur**: ≤ 6 одновременно, ни одного blur над canvas-слоями. Релиз ядра и кожи зафиксирован на версии **v1.2.0**.
- **Релиз v3.3a «Приборность: материал и иерархия» (Гейт a из варианта D)**:
  - **Материал корпуса (`ArcHudWidget.vue`)**:
    - Вертикальный градиент корпуса: `linear-gradient(180deg, #0C0C0C 0%, #0A0A0A 100%)` (оба конца нейтральны R=G=B, каналы $\le 16$, разброс 0).
    - Верхний блик: токен `--arc-sheen` (`linear-gradient(180deg, rgba(255,255,255,0.025), transparent 120px)`).
    - Разделитель под шапкой: 1px `var(--arc-divider)` (#1E1E1E) на всю ширину корпуса.
    - Угловая засечка: L-образная 10×10px, штрих 2px `rgba(var(--accent-rgb), 0.35)` в покое, `0.50` при hover прибора.
    - Рамка и кромка: 1px `rgba(255,255,255,0.08)` + inset 0 1px 0 `rgba(255,255,255,0.06)`, радиус 14px, blur = 0 (над canvas 0 blur).
  - **Hero-показания (шкала `22px/600` + `11px mono hint` с обязательным пробелом)**:
    - **ЯДРО (`CoreTelemetryWidget.vue`)**: FPS становится hero-числом (`22px/600 font-mono`, единица ` fps` 11px); CPU, RAM, GPU оформлены как 16px secondary со шкалами `ArcTickBar`.
    - **МАРШРУТ (`RoutingWidget.vue`)**: задержка latency становится hero-числом (`22px/600 font-mono`, единица ` ms` 11px); название модели 14px, среда исполнения 12px.
    - **ГОЛОС, СОБЫТИЯ, МЕДИА, СРЕДА**: hero-показание не получают, остаются на шкале 16px/текст.
    - **Единственность**: ровно одна цифра FPS и ровно одна задержка на весь экран (дублирование исключено).
  - **Гейт b (Движение)**: Спарклайн FPS, пульс активной точки цепочки, progress-линия и дыхание точки голоса помечены как следующий этап, ещё НЕ начаты.
  - **Дизайн виджетов по эталону (`b_Создай_дизайн_виджет.png`)**:
    - **Корпус (`ArcHudWidget.vue`)**: Сглаженный радиус `rounded-[18px]`, глубокий матовый обсидиановый фон `#0C0C0C`...`#0A0A0A`, тонкая кромка `rgba(255,255,255,0.08)`, внутренний верхний хайлайт `inset 0 1px 0 rgba(255,255,255,0.07)`, реактивное приглушение в фоне (`store.widgetsDim` / `store.widgetDimOpacity`) с мгновенным возвратом на 100% при наведении курсора.
    - **МЕДИА (`MediaHudWidget.vue`)**: Реактивная привязка к `uiStore` (живая обложка трека `musicCover` или диск с подсветкой, парсинг `Исполнитель — Трек` из `musicTitle` с дефолтом «Нет активного трека», индикатор канала `VK AUDIO / STREAM / STANDBY`, интерактивная полоса прогресса с перемоткой `seek` и реальным временем `musicCurrentTime / musicDuration`, кнопки `Shuffle`, `Prev`, `Play/Pause`, `Next`, `Repeat`, `Like` с приоритетом `uiStore.musicLikedOverride ?? uiStore.musicLiked` и `ExternalLink` для открытия VK Музыки; мост `user_tampermonkey_script.js` v1.1.4 без async-перезаписи громкости/прогресса и с защитой от ложного лайка) с учётом `autoHideMusicWidget` в `WidgetsLayer.vue`.
    - **СРЕДА (`EnvironmentWidget.vue`)**: Локация со стрелкой компаса («Москва ↗»), крупная температура (`+12°`), векторная луна в облаках с багряным ореолом, детальная сводка «Ветер 3 м/с» и «Влажность 68%».
    - **ЯДРО (`CoreTelemetryWidget.vue`)**: Круговой светящийся индикатор со светящейся красной дугой прогресса и чипом по центру, hero-показание 22px «60 fps», метка «РЕНДЕР ЯДРА», акцентная красная черта и тиковые шкалы CPU/RAM/GPU.
    - **СОБЫТИЯ (`ActionTimelineWidget.vue`)**: Журнал событий ядра с круговыми статус-точками (ok/info/warn по токенам `var(--status-*)`), чистым монохромным заголовком без посторонних элементов и таймстемпами.
    - **МАРШРУТ и ГОЛОС (`RoutingWidget.vue`, `VoiceHudWidget.vue`)**: Тракт VAD→STT→LLM→TTS со светящимися круговыми узлами, индикатор статуса микрофона с красной аурой, кодовое слово в контрастной капсуле и цитата ответа.
- **Чанк 7 (CHAT): Пространство CHAT в каноне v3.x**:
  - **Кожа и структура пространства**:
    - Корень (`ChatView.vue`): сплошная непрозрачная плоскость `var(--arc-plane)` `#0A0A0A`, 0 blur над canvas, 0 белых заливок; стартовый экран и плашка поиска переведены на токены `var(--arc-block)` и `var(--arc-hairline)`.
    - Сайдбар сессий (`SessionSidebar.vue`): hairline-контейнер `var(--arc-hairline)`, строки сессий на `var(--arc-divider)`, наведение `var(--arc-hover)`, активная сессия `var(--arc-selected)` с 2px акцентной полосой `var(--accent)` слева (`SessionListItem.vue`); поле поиска `var(--arc-input)` (`SessionSearch.vue`).
    - Контекстное меню сессий (`SessionContextMenu.vue`): класс `.arc-glass-pop` с токеном `blur(14px)` над статикой, кромка `var(--arc-glass-edge)`, 0 белых фонов, все пункты переведены на `var(--arc-hover)` и токены текста.
    - Статус-бар агента (`ChatStatusBar.vue`): монолитный корпус `var(--arc-block)` без blur, метаданные `11px mono` + светодиодная статус-точка 6px по семантике `var(--status-*)`; устранено дублирование задержек.
    - Пузыри сообщений (`MessageBubble.vue`): статическое тональное разделение (входящее/ассистент — `#101010`, исходящее/пользователь — `#121212`), кромка `var(--arc-hairline)`, метаданные `11px mono`, футер источника инструментов и бейджи моделей (`MessageFooter.vue`) на нейтральных токенах.
    - Трассировка выполнения (`ExecutionTrace.vue`) и карточка валидатора (`ValidatorRejectionCard.vue`): корпус `var(--arc-block)` / `var(--arc-plane)`, разделители `var(--arc-divider)`, акцент строго через `var(--accent)` / `var(--accent-rgb)`.
    - Композер ввода (`ChatInputZone.vue`, `ComposerModelSelector.vue`, `useComposerModels.ts`, `auto-workflow.ts`, `composer.css`): двухъярусный AI Prompt Composer на токенах `var(--arc-input)`, `var(--arc-block)`, `var(--arc-popover)` и `var(--accent)` с раскрывающимися капсулами `+ Файлы` и `Запись` (с таймером `MM:SS`), селектором режимов (`Auto / Build / Plan / Ask`, где `Auto` автоматически направляет простые запросы в `Ask`/`Build`, а сложные в последовательный конвейер `Plan → Build → Validate`), селектором реально подключённых, проверенных и пингуемых моделей A.R.C. (скачанные локальные GGUF через `checkBuiltinModel`, активные модели живого демона Ollama через `checkOllamaOnline` и верифицированные провайдеры из `aiConfigStore.providers` с замером задержки `latencyMs`, индикатором статуса `online / verified` и кнопкой «Пинг») и подменю уровня мышления (`Effort`: `Auto / Low / Medium / High / Max`), где каждой модели доступны только её реальные уровни мышления (`inferModelThinkingCapabilities`), а при неизвестном потолке или выборе `Auto` A.R.C. автоматически определяет глубину рассуждений (`resolveEffectiveEffort`), лимит токенов и аналитический контур.
    - Рендерер Markdown (`markdown.ts`): блоки кода `var(--arc-code)` `#080808`, таблицы `var(--arc-plane)`, цитаты с акцентной кромкой `var(--accent)` без жестких hex и белых заливок.
  - **Динамика счётчиков защёлки**:
    - `bgWhiteFills`: 175 → **134** (−41).
    - `fontSizesUnder12`: 226 → **219** (−7).
    - `literalAccentClasses`: 205 → **204** (−1).
    - `backdropBlurOverCanvas`: 0 (чисто).
    - `forbiddenSurfaceFills`: 0 (чисто).
    - `visual-constitution-baseline.json` строго синхронизирован с живым замером.
- **Чанк 8a (TASKS): Kanban и Список в каноне v3.x**:
  - **Кожа и структура 7 файлов под-чанка**:
    - `KanbanBoard.vue`: колонки на hairline-разделителях `var(--arc-divider)` поверх плоскости `var(--arc-plane)` `#0A0A0A`; карточки `var(--arc-block)` `#101010`, hover `var(--arc-hover)` `#121212`, активная карточка `var(--arc-selected)` `#161616` с 2px полосой `var(--accent)` слева; 5 колонок со статус-точками 6px `var(--status-*)`; приоритет HIGH кодируется текстом "HIGH" `10px mono` + точкой `var(--status-err)` без фоновых заливок; кнопка таймера фокус-спринта переведена на нейтральный ховер.
    - `TaskItem.vue`: заголовок 14/500 sentence case на `var(--arc-text-primary)`, завершённая задача — `line-through` `var(--arc-text-muted)`; кастомный hairline-чекбокс с акцентной галочкой `var(--accent)`; прогресс подзадач — 2px тики `ArcTickBar` цвета `var(--accent)`; бейдж Мой День и спринт фокуса переведены на статус-точки и нейтральные ховеры; контекстное меню переведено на `var(--arc-popover)` + `.arc-glass-pop` с danger-кнопкой текстом `var(--status-err)`.
    - `TaskList.vue`: чистый контейнер с `TransitionGroup` без долга.
    - `TaskConsole.vue`: панель на `var(--arc-plane)` `#0A0A0A` с hairline-рамкой `var(--arc-divider)`; сегмент-переключатель режимов на `var(--arc-block)` с активным сегментом `var(--arc-selected)` + `var(--accent)`; поле ввода `ArcInput` со стилизацией `var(--arc-input)`; селекторы и кнопка добавления — secondary hairline; ликвидированы `text-[9px]`, `text-[9.5px]` и белые заливки.
    - `TaskContextRail.vue`: монолитный нейтральный корпус `var(--arc-block)` `#101010` с контуром `var(--arc-hairline)`; заголовок контекста на `var(--arc-plane)`; статус задачи оформлен светодиодной точкой 6px `var(--status-*)` + текст без цветных плашек; кнопки переключения, фокуса и AI приведены к secondary hairline стандарту.
    - `TaskHeaderBar.vue`: разделитель `var(--arc-divider)`, моно-метка `10px` `var(--arc-text-machine)`, кнопка аналитики secondary hairline с акцентной иконкой `var(--accent)`.
    - `TaskItemMetadata.vue`: поле заметок `var(--arc-plane)` с textarea `var(--arc-input)`; метки полей `10px mono` `var(--arc-text-machine)`; поля времени затрачено/оценка переведены на `var(--arc-input)` (ликвидирован литерал `text-amber-400`).
  - **Динамика счётчиков защёлки**:
    - `bgWhiteFills`: 134 → **119** (−15).
    - `coloredStatusFills`: 166 → **157** (−9).
    - `fontSizesUnder12`: 219 → **211** (−8).
    - `literalAccentClasses`: 204 → **201** (−3).
    - `visual-constitution-baseline.json` строго синхронизирован с живым замером.
- **Чанк 8b (TASKS): Модалки и фильтры в каноне v3.x**:
  - **Кожа и структура 6 файлов чанка**:
    - `CategoryModal.vue`: корпус `var(--arc-popover)` (`#161616`) с вуалью `var(--arc-glass-veil)`; создание категории в нейтральном блоке `var(--arc-block)` с полем `var(--arc-input)`; цветной пикер палитры удалён — категории унифицированы в нейтральный текст `var(--arc-text-secondary)` без цветового hue; список существующих категорий с двухэтапным подтверждением удаления («Удалить? Да / Нет») и danger-текстом `var(--status-err)` без фоновых заливок.
    - `RecurrenceModal.vue`: удалены все 7 литералов `#0d0d0d` и `#f87171`; поля и селекты переведены на `var(--arc-input)` / `var(--arc-frame)`; карточки пресетов и условий окончания — на `var(--arc-block)` / `var(--arc-selected)`; индикатор активности — статус-точка 6px `var(--status-ok)`; кнопки «Пн-Пт», «Сб-Вс», «Все» и подписи карточек стандартизированы под `text-xs` (ликвидированы 6 `text-[9px]`); добавлено подтверждение сброса («Сбросить? Да / Отмена»).
    - `SearchFiltersPanel.vue`: строка поиска и выпадающий список приведены к `var(--arc-input)`; кнопка очистки завершённых переведена на `var(--arc-block)` с danger-кромкой `var(--status-err)`; чипы фильтров на `var(--arc-hover)` (`#121212`) / `var(--arc-selected)` (`#161616`) с рамкой `var(--accent)`; счётчики и метки целей стандартизированы под `text-[10px] font-mono text-[var(--arc-text-machine)]` (ликвидированы 4 `text-[9px]`); иконка «Просрочено» переведена на `var(--status-err)`.
    - `TaskAnalyticsModal.vue`: шкала загрузки дня переведена на статус-токены `var(--status-ok)`, `var(--status-warn)`, `var(--status-err)` на нейтральной подложке `var(--arc-frame)`; плашки метрик времени — на `var(--arc-block)` / `var(--arc-frame)`; кнопка сброса данных — на системный `ArcButton variant="danger"` без литералов акцента.
    - `TaskLinksManager.vue`: плашки ссылок приведены к `bg-[var(--arc-block)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)]`; кнопка удаления ссылки переведена на hover `var(--status-err)` без цветных фоновых заливок.
    - `TaskSubtasksList.vue`: карточки подзадач переведены на `bg-[var(--arc-block)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)]`; кнопки навигации и удаления переведены на токены `var(--arc-text-muted)`, `var(--arc-selected)` и danger-текст `var(--status-err)`.
  - **Динамика счётчиков защёлки**:
    - `literalAccentClasses`: 194 → **184** (−10).
    - `coloredStatusFills`: 151 → **141** (−10).
    - `bgWhiteFills`: 119 → **114** (−5).
    - `fontSizesUnder12`: 211 → **201** (−10).
    - Итоговое состояние защёлки: **184 / 141 / 114 / 201** ($\Sigma = -35$, схождение 100%).
    - `visual-constitution-baseline.json` строго синхронизирован с живым замером (`STRICT_BASELINE_SYNC=1`).
    - Эталоны сгенерированы и проверены: `tasks-modal-category-1280x720.png`, `tasks-modal-recurrence-1280x720.png`, `tasks-filters-1280x720.png`, `tasks-subtasks-links-1280x720.png`.
- **Чанк 8c (TASKS): Виджеты и аналитика в каноне v3.x**:
  - **Кожа и структура 7 файлов чанка + 2 файлов с grep-долгом**:
    - `FocusSprintView.vue`: часы переведены на `focus-display 48px mono tabular` `var(--arc-text-primary)` (по амандменту AGENTS.md §6); прогресс-кольцо на `var(--accent)` и `var(--arc-hairline)`; пресеты и кнопки настройки на `var(--arc-hover)` и `var(--arc-selected)`; удалены янтарные и белые заливки.
    - `EisenhowerMatrix.vue`: все 4 квадранта приведены к `var(--arc-block)` (#101010) с hairline-рамками `var(--arc-hairline)`; статус-значки Q1/Q2/Q3/Q4 на `var(--status-err)`, `var(--status-warn)`, `var(--accent)` и `var(--arc-text-muted)`; зачёркнутые задачи — `line-through text-[var(--arc-text-muted)]`.
    - `TaskHistoryView.vue`: заголовок и группы истории на `var(--arc-block)` и `var(--arc-plane)` без `bg-black/40` и `bg-white/*`.
    - `TaskTelemetry.vue`: командный HUD переведён на `var(--arc-block)` и `var(--arc-plane)`; статусы "Онлайн" и "Проблемы" на точечные индикаторы `var(--status-ok)` и `var(--status-err)`; удалены `bg-purple-950/20`, `bg-red-950/15` и `bg-emerald-400`.
    - `AIRecommendationBox.vue`: карточка рекомендации приведена к `var(--arc-block)` с волосяной рамкой `var(--arc-hairline)`; удалены `bg-purple-950/20` и `bg-amber-500/20`.
    - `PriorityDistributionBars.vue`: треки приоритетов P1/P2/P3 переведены на нейтральный `var(--arc-plane)` с заполнением `var(--accent)`; удалены `text-red-400` и `bg-red-500`.
    - `SummaryMeter.vue`: процент выполнения выведен как hero-показание `text-[22px] mono tabular` `var(--arc-text-primary)`; метки вокруг — `10px mono` `var(--arc-text-machine)`.
    - `DeadlinesWidget.vue` и `ProgressCapMeter.vue`: удалены литералы `#ff3347` и `#B8C0CC`, заменены на `var(--status-err)` и `var(--arc-text-muted)`.
  - **Динамика счётчиков защёлки**:
    - `literalAccentClasses`: 184 → **178** (−6).
    - `coloredStatusFills`: 141 → **126** (−15).
    - `bgWhiteFills`: 114 → **103** (−11).
    - `fontSizesUnder12`: 201 → **200** (−1).
    - Итоговое состояние защёлки: **178 / 126 / 103 / 200** ($\Sigma = -33$, схождение 100%).
    - `visual-constitution-baseline.json` строго синхронизирован с живым замером (`STRICT_BASELINE_SYNC=1`).
    - Пять grep-гейтов (hex, color-digit, hue-digit, white-fill, small-font) = 0.
- **Фаза 5, чанк 1: Пространство COMMANDS в единый стиль v3.x**:
  - **Устранение дубликатов D1/D2**: Удалена вкладка «НАСТРОЙКИ» и компонент `CommandSettingsTab.vue` (тумблеры `voiceFeedback` и `requireConfirm` перенесены в глобальные Настройки).
  - **Кожа и структура пространства**:
    - Корень пространства переведён на непрозрачную плоскость `var(--arc-plane)` `#0A0A0A`.
    - Подвкладки («Навыки», «Лаунчер»): шкала 10px/600/UPPER/mono/tracking .12em, активная — акцентная 2px полоса снизу, без фоновой заливки.
    - Списки макросов и папок лаунчера: контейнеры с hairline-рамкой `border-[var(--arc-hairline)]`, прозрачный фон над плоскостью, строки разделены `var(--arc-divider)`, наведение `var(--arc-hover)`; заливка `var(--arc-block)` исключена.
    - Кнопки: secondary с hairline-рамкой и primary текстом, danger — текст `var(--status-err)` без цветных заливок, единственная primary на экран — «+ Создать макрос».
    - Селекты и поиск: `var(--arc-input)`, меню дропдаунов — `arc-glass-pop` с `blur(14px)` над статикой.
    - `UndoDeleteToast`: корпус `var(--arc-popover)` + `arc-glass-pop`, кромка `var(--arc-glass-edge)`, семантика статусов `var(--status-warn)`.
  - **Типографика и долг**: Sentence case для кнопок и заголовков («Реестр навыков и макросов», «Индексация приложений»), удалены кегли 8/9px, описания 12/400 `var(--arc-text-hint)` ($\le 68$ знаков), ликвидированы литеральные hex в файлах чанка.
- **Фаза 5, чанк 2: Пространство MEMORY в единый стиль v3.x**:
  - **Кожа и структура пространства**:
    - Корень пространства: непрозрачная плоскость `var(--arc-plane)` `#0A0A0A`, исключены `text-white` и `backdrop-blur` над canvas.
    - Тулбар: поле поиска и выпадающие списки `var(--arc-input)`, дропдауны над статикой — `arc-glass-pop` (blur 14px).
    - Переключатель «точный / семантический» поиск: сегмент-контрол на шкале вкладок `10px/600/UPPER/mono/tracking .12em`, активный сегмент — акцентный текст + 2px линия снизу, без цветной фоновой заливки.
    - Сетка карточек памяти: корпус карточки прозрачный поверх плоскости, контур `var(--arc-hairline)`, наведение `var(--arc-hover)`; заливка `var(--arc-block)` запрещена. Ghost-кнопки действий с danger-корзиной `var(--status-err)` без заливки.
    - Модалки Detail/Form/Clear: вуаль `arc-glass-veil` (blur 6px поверх плоскости), корпус `var(--arc-popover)` (`#141414`) + кромка `var(--arc-glass-edge)`.
  - **Опасные действия**:
    - «Очистить всю память»: danger-кнопка текстом `var(--status-err)` без фоновой заливки; двойное подтверждение с честным текстом «Удалит все факты из раздела Память. Настройки и модели не затронет».
    - Сброс фильтров отделен («Сбросить фильтры»), без использования слова «очистить».
  - **Типографика и долг**:
    - Заголовки, кнопки и лейблы в sentence case (14/500), капс только в сегмент-контроле и бейджах ($\le 12$ знаков).
    - Описания 12/400 `var(--arc-text-hint)` ($\le 68$ знаков), метаданные и таймстемпы — 10-11px mono `var(--arc-text-machine)`.
    - Ликвидированы литеральные hex и 26 вхождений `bg-white/` в компонентах памяти.
- **Фаза 5, чанк 3: Пространства FILES и MODULES в единый стиль v3.x**:
  - **FILES (`FilesTabView.vue`)**:
    - Корень переведён на непрозрачную плоскость `var(--arc-plane)` `#0A0A0A`.
    - Тулбар навигации: кнопки «Вверх» и «Обновить» — ghost-кнопки, текущий путь — mono 11px `var(--arc-text-machine)`.
    - Список файлов: hairline-контейнер `var(--arc-hairline)`, фон прозрачный поверх плоскости, разделители `var(--arc-divider)`, наведение `var(--arc-hover)`, иконки типов файлов цветом `var(--arc-text-hint)`.
    - Панель предпросмотра: монолитный корпус `var(--arc-code)` `#080808`, текст `mono 12px var(--arc-text-secondary)`, кнопка закрытия ghost.
    - Кнопка «Вернуться в корень» — secondary hairline в sentence case.
  - **MODULES (`ModulesView.vue`)**:
    - Фильтры («Все», «Работающие», «Калибровка»): сегмент-контрол на эталонной шкале вкладок `10px/600/UPPER/mono/tracking .12em`, активный — акцентный текст + 2px линия снизу без фоновой заливки, счётчики — mono 10px.
    - Карточки модулей: корпус прозрачный поверх плоскости, контур `var(--arc-hairline)`, наведение `var(--arc-hover)`; заливка `var(--arc-block)` исключена. Карточка не кликабельна целиком, переход по secondary hairline кнопке «Открыть модуль».
    - Статусы: точка 6px + короткий текст без цветных фоновых заливок (`ONLINE` — `var(--status-ok)`, «Калибровка» — `var(--status-warn)`).
  - **Типографика и долг**: Sentence case для названий файлов, модулей и кнопок (14/500), описания 12/400 `var(--arc-text-hint)` ($\le 68$ знаков), кегли 8/9px ликвидированы, литеральные hex и `bg-white/` полностью удалены.
- **Фаза 5, чанк 4: Пространство OBJECTIVES в единый стиль v3.x**:
  - **Кожа и структура пространства**:
    - Корень (`ObjectivesView.vue`): непрозрачная плоскость `var(--arc-plane)` `#0A0A0A`, 0 blur над canvas, 0 белых заливок.
    - Навигация (`ObjectivesHeaderNav.vue`): шкала вкладок `10px/600/UPPER/mono/.12em`, активная вкладка — акцентный текст + 2px линия снизу без фоновой заливки, единственная primary на экран — «Создать цель».
    - Метрики (`ObjectivesMetricsRow.vue`): значения 16px primary + 10px mono hint, подписи 12px hint, прогресс — 2px тики `ArcTickBar` с акцентом только на занятой части.
    - Список целей (`ObjectivesList.vue`): hairline-контейнер `var(--arc-hairline)`, строки `var(--arc-divider)`, наведение `var(--arc-hover)`, активная цель — `var(--arc-selected)` + 2px акцентная полоса слева.
    - Деталь цели (`ObjectiveDetailsWorkspace.vue`): прозрачный корпус над плоскостью, секции на hairline-разделителях, исключены «коробки в коробке» и `glass-panel`.
    - Топология и DAG (`TopologySection.vue`, `ObjectivesDagMap.vue`): ликвидированы все purple/cyan и red литералы; статусы строго `var(--status-ok|warn|off)` с точкой 6px.
    - Диагностика (`DiagnosticsSection.vue`): чистая нейтральная раскладка, бары когерентности `rgba(var(--accent-rgb), 0.3)` с акцентом на hover.
    - Форма создания (`CreateObjectiveForm.vue`) и диалог отката (`ObjectiveRollbackDialog.vue`): поля `var(--arc-block)` + hairline-рамки, вуаль `var(--arc-glass-veil)`, danger-текст `var(--status-err)` без ярких заливок.
  - **Ликвидация долга**: 0 литеральных red/purple/cyan классов, 0 hex-цветов, 0 `bg-white/`, baseline `literalAccentClasses` снижен на дельту чанка (до 254).
- **Фаза 5, чанк 5: Пространство TRANSCRIPTION в единый стиль v3.x**:
  - **Кожа и структура пространства**:
    - Корень (`TranscriptionView.vue`): непрозрачная плоскость `var(--arc-plane)` `#0A0A0A`, 0 blur над canvas, 0 белых заливок.
    - Загрузчик и аудиоплеер: hairline-контейнер `var(--arc-hairline)` и корпус `var(--arc-block)`, драг-овер `rgba(var(--accent-rgb), 0.08)`, плеер в нейтральном HUD-стиле.
    - Модели и ускорение: селекторы моделей и GPU (CUDA/DirectML/CPU) переведены на нейтральные рамки и `var(--arc-selected)` с акцентной кромкой; статусы оформлены светодиодной точкой 6px `var(--status-*)`.
    - Таймлайн сегментов: разделители `var(--arc-divider)`, ховер `var(--arc-hover)` (`#121212`), активный воспроизводимый сегмент — 2px акцентная полоса `var(--accent)`. Опасные действия (отмена, сброс) — danger текстом `var(--status-err)` без заливки.
  - **Ликвидация долга**: ликвидировано 17 литералов акцента и 15 цветных статусных плашек; статусы пайплайна в `useTranscription.ts` сохранены строгими семантическими строками.
- **Фаза 5, чанк 6: Пространство VISION в единый стиль v3.x (Завершение Фазы 5)**:
  - **Кожа и структура пространства**:
    - Корень (`VisionTabView.vue`): сплошная непрозрачная плоскость `var(--arc-plane)` `#0A0A0A`, 0 blur над canvas, 0 белых заливок.
    - Окно видоискателя: нейтральный корпус `var(--arc-block)` `#101010` с контуром `var(--arc-hairline)`.
    - Управление оптикой: включение оптики переведено с `bg-white/10` на токен `var(--arc-hover)`; кнопка отключения камеры оформлена семантическим danger-текстом `var(--status-err)` со статусной точкой 6px без фоновой заливки.
    - Блок телеметрии: честный статус «МОДУЛЬ НЕЙРОСЕТЕВОГО АНАЛИЗА: НЕАКТИВЕН» со статусной точкой `var(--status-off)`, пояснение 12/400 `var(--arc-text-hint)` ($\le 68$ знаков).
  - **Ликвидация долга**: полное схождение прогноза Шага 0 и факта сканера: `literalAccentClasses` 207 → **205** (−2), `coloredStatusFills` 174 → **172** (−2), `bgWhiteFills` 179 → **178** (−1), `fontSizesUnder12` 226 (0 регрессий).
  - **Аудит архитектуры**: подтверждён статус `SmartRouterDiagram.vue` как мёртвого кода (не импортируется после слияния в `RoutingWidget.vue`), составлен `docs/phase6-sweep-worklist.md` для Фазы 6.
- **Условие 5: Механическое разведение пересечения accent/status по bg-red**:
  - В `scripts/check-visual-constitution.js` устранено пересечение между `literalAccentClasses` и `coloredStatusFills`: плашки `bg-red-500/<alpha>` учитываются ТОЛЬКО в `coloredStatusFills`, а `literalAccentClasses` отслеживает `bg-red` без альфы, `text-red`, `border-red`, `ring-red`, `#ef4444` и `rgba(239,68,68,...)`.
  - В результате разведения 30 зафиксированных статусных плашек перенесены строго в `coloredStatusFills`, а бейзлайн `literalAccentClasses` пересчитан с 237 до 207 без потери токенов (детерминированный пофайловый ledger). Новые бейзлайны: `literalAccentClasses: 207`, `coloredStatusFills: 174`.
- **Хотфикс P1 / P1.1 / P1.3-R / P1.5: Док, мгновенные настройки, монолитная проекция, детерминированный поиск, provenance-метка, детектор призраков и ликвидация литеральных акцент-классов**:
  - **Ликвидация литеральных акцент-классов и расширение защёлки (P1.5)**:
    - Дефект «оранжевый/красный вне var()» признан двойным: (1) персистентность не-канонической темы в `localStorage` (`arc_state_settings`) + (2) захардкоженные литеральные классы `text-red-*`, `bg-red-*`, `border-red-*`, `bg-[rgba(239,68,68,...)]` в ключевых компонентах дока (`BottomBar.vue`, `TabBar.vue`, `TabItem.vue`, `MusicCapsuleWidget.vue`).
    - Все литеральные классы в доке и капсуле переведены на токены `var(--accent)`, `rgba(var(--accent-rgb), ...)` и нейтральные статус-токены `var(--status-*)`. Теперь кнопки («РАЗДЕЛЫ», активные вкладки, микрофон) синхронно меняют цвет вместе с `:root` во всех темах (Cyan, Purple, Gold, Green, Red).
    - В скрипт проверки визуальной конституции `check-visual-constitution.js` добавлен строгий счетчик `literalAccentClasses` с вайтлистом (токены, `index.html` pre-boot, `arcGhostDetector`, дефолт-фолбэки `var(--accent, #ef4444)`). Текущий бейзлайн зафиксирован на отметке 258 в `visual-constitution-baseline.json` и `docs/ui-etalon/debt-baseline.json` (падение сборки при любом росте).
    - Остаточный долг `literalAccentClasses` в уже принятых пространствах (Settings, Commands, Memory, Files, Modules) гасится плановым sweep-ом Фазы 6; до Фазы 6 переключение темы даёт локальную радугу в непроведённых узлах — это известный зафиксированный долг, не регресс. В будущих чанках Фазы 5 число литералов акцента в файлах чанка строго = 0, бейзлайн снижается на дельту чанка.
    - Прерывистый призрак «двойное монтирование / застывший акцент» закрыт комплексом фиксов P1.3-R / P1.5. Чанк 4 (OBJECTIVES) разморожен для продолжения Фазы 5.
  - **Provenance-метка (P1.1)**: Инжектирование короткого Git-хэша коммита `__BUILD_COMMIT__` (`9048f71`) через `define` в Vite и electron-vite. Вывод в шапке `HolographicProjectionPanel` и `SettingsMenu` рядом с бейджем версии (`V1.2.0 · 9048f71`) и в консоли `console.info('A.R.C. build', hash)`.
  - **Детектор призраков и реестр синглтонов (P1.3-R)**:
    - Модуль `src/renderer/utils/arcGhostDetector.ts`: регистрация синглтонов `ReactorCore`, `CommandCenter`, `WidgetsLayer`, `HolographicProjectionPanel`, `BottomBar` в `globalThis.__ARC_SINGLETONS__`.
    - Обнаружение двойного монтирования (`count > 1`): вывод `console.error` и отображение аварийного бейджа «DOUBLE MOUNT» в `TitleBar` (только в DEV-режиме).
    - Очистка в HMR (`import.meta.hot.dispose`) для всех синглтонов во избежание фантомных экземпляров при перезагрузке модулей.
    - Проверка согласованности CSS-акцента (`checkAccentConsistency`): периодический аудит узлов дока, виджетов, реактора против `:root` с детекцией дрифта цвета.
    - Лог хронологического порядка запуска (`logStartupOrder`) и принудительный сброс неканонической темы в `red` при старте приложения (`bootstrap/plugins.ts`).
  - **Фикс 1 (Единый корпус дока)**: В `CommandCenter.vue` консоль дока объединена в один контейнер `#arc-dock-container` (фон `var(--arc-dock)` `#080808`, одна рамка `var(--arc-hairline)`, скругление `rounded-2xl`, тень `0 18px 48px rgba(0,0,0,0.85)`). Внутри 2 строки (вкладки / голосовой ввод `BottomBar.vue`) с тонким hairline-разделителем `var(--arc-divider)` (`#1E1E1E`). Пипетка между строками строго `#080808` (R=G=B=8, не космос).
  - **Фикс 2 (Мгновенное открытие Настроек)**: Устранен блокиратор открытия (синхронное построение 300+ элементов поискового индекса переведено в асинхронный фон `buildSearchIndexAsync` / `requestIdleCallback` после первого кадра). Рейл и шапка секции монтируются мгновенно из кэша стора, секции имеют легкий мгновенный скелетон `SettingsSkeleton.vue` (исключена чёрная пустота). Замеры времени открытия: 18.5 мс (< 500 мс).
  - **Фикс 3 (Один видимый контейнер проекции)**: В `HolographicProjectionPanel.vue` и `SettingsPanel.vue` сняты внутренние рамки и скругления контентной плоскости. Плоскость ложится вплотную в наружную оправу `arc-projection-frame` (`var(--arc-frame)` `#070707`), рейл `SettingsMenu.vue` отделяется чистой вертикальной 1px hairline-линией (`#1E1E1E`), без вложенных коробок и двойных рамок.
  - **Фикс 4 (Детерминированный поиск настроек и подсветка строки)**: Поиск `searchSettingsInRegistry` детерминирован (10/10 попаданий по запросу «кэш аудио» к строке `storage.audiocache`). До готовности индекса отображается статус «Индекс готовится...». При переходе по результату активируется плавная прокрутка `scrollIntoView` и 2-секундная подсветка строки `.search-highlight` с акцентной кромкой 2px слева (`var(--accent)`).
  - **Фикс 5 (Нейтральность поверхностей во всех 5 темах)**: В `theme-palettes.tokens.ts` палитры (`red`, `blue`, `purple`, `green`, `gold`) определяют исключительно `--accent`, `--accent-rgb` и производные свечения. Фоновые токены поверхностей (`--arc-plane`, `--arc-block`, `--arc-dock`, `--arc-rail`) остаются строго нейтральными: плоскость `#0A0A0A` (R=G=B=10, spread=0 <= 2), блоки `#101010` (R=G=B=16, spread=0 <= 2).
  - **Этап S-C (Settings Architecture & Visual Unification) — ПОЛНОСТЬЮ ЗАВЕРШЁН**:
    - **Полноэкранный режим (Edge-to-Edge)**: Воркспейс Настроек смонтирован в полноэкранном режиме без внешней плавающей рамки проектора и декоративных уголков, в сплошной плоскости `var(--arc-plane)` (`#0A0A0A`).
    - **W3C WAI-ARIA Контракт & Скролл-Спай**: `SettingsMenu.vue` (`role="tablist"`) скоординирован с `SettingsPanel.vue` (`role="tabpanel"`, `id="panel-${activeTab}"`, `aria-labelledby="tab-${activeTab}"`). Внедрён скролл-спай `IntersectionObserver` с защитным флагом `isProgrammaticScroll` при вызове `scrollIntoView`.
    - **Унификация потока и ритма**: Ширина потока ограничена `max-w-[880px]`, межсекционный отступ унифицирован на `gap-8`. В начале всех 17 секций задействован единый не-сворачиваемый `<SettingsSectionHeader>`.
    - **Зачистка полупрозрачных слоёв и акцентов**: Вхождения `bg-white/*`, `border-white/*`, `divide-white/*`, `bg-black/*` сокращены с 215 до **2** (оставшихся исключительно в защищённом `SettingsMenu.vue`). Достигнут статус `ZERO_LITERAL_ACCENTS` во всех шаблонах настроек.
    - **Метрики визуальной конституции**: `bgWhiteFills: 52`, `literalAccentClasses: 117` (строгая синхронизация бейзлайна `visual-constitution-baseline.json`).
    - **Синхронизация реестра настроек**: Файл `docs/ui-inventory/settings-registry.json` актуализирован и полностью синхронизирован со всеми атрибутами `data-setting-id` в коде (`router.smartRouting`, `localai.master`, `localai.cloudLlmInGameMode`, `localai.forcedOfflineMode`, `localai.autoDownloadLargeModels`, `providers.streaming`).
- **Архитектура виджетов периметра (`HudWidgetShell.vue`, `WidgetsLayer.vue`)**:
  - Полный отказ от закрытых рамочных «коробок» и громоздких карточек-кирпичей.
  - Поверхности виджетов переведены на чистую монолитную плоскость (`#07080b]/90` с тончайшей волосяной окантовкой `border-white/[0.08]` и акцентным нижним ребром `hover:border-b-red-500/60`).
  - Устранен визуальный шум: удалены декоративные угловые скобы-маркеры, устранены многослойные рамки внутри рамок.
  - Нулевая капсулизация (Zero-Pill): метаданные и статусы выводятся чистым текстом с точечными 6px светодиодами (`#10b981`, `#f59e0b`, `#ef4444`) и символьными разделителями (`·`).
- **Сохранение и защита командного дока (`BottomBar.vue`, `CommandCenter.vue`)**:
  - Консоль ввода сохранена в каноническом виде плавающей стеклянной капсулы (`rounded-full`, `bg-[#0c0d12]/90 backdrop-blur-2xl border-white/10`) с бейджем `SPACE ГОЛОС`, кнопкой микрофона, кнопками `РАЗДЕЛЫ` и `ПОИСК (⌘K)`.
  - В соответствии с RULE[AGENTS_md] (Protected Areas) нижняя командная консоль защищена от несанкционированных изменений геометрии и формы.

### 🖥️ 2.0 Дизайн-система v1.2.0-ui («Стекло и живая рама»)
- **Нативное разрешение и сглаживание 3D Reactor (Native WebGL & 4x MSAA Engine v3.2)**:
  - **Устранение пикселизации и ступенек (Лесенки)**: Ликвидирована фундаментальная архитектурная проблема Three.js при работе с `EffectComposer`, из-за которой буферы постобработки по умолчанию создавались без мультисемплинга (`samples: 0`), полностью нивелируя `WebGLRenderer({ antialias: true })`.
  - **Аппаратный 4x MSAA в WebGL2**: Первичный `WebGLRenderTarget` для `EffectComposer` теперь создаётся с `samples: 4` на пресетах Medium и High (`samples: 0` на Low), обеспечивая аппаратное субпиксельное сглаживание всех вращающихся колец, турбин, диагональных ферм и геометрии ядра без паразитного замыливания.
  - **Нативный DPR без искусственного занижения**: Снят жёсткий искусственный лимит `Math.min(devicePixelRatio, 1.25)` в `useReactor3D.ts` и `pixelRatioMap` (Medium: 1.25, High: 1.5). Теперь рендер рассчитывается в честном нативном разрешении дисплея (`Math.min(window.devicePixelRatio, 2.0)`), гарантируя чёткость 1:1 на Full HD, 2K, 4K и HiDPI-масштабировании Windows.
  - **Синхронизация ResizeObserver и смены монитора**: В `reactor-postfx.ts` объединены `renderer.setPixelRatio` и `composer.setPixelRatio` при изменении размеров экрана и переносе окна между мониторами с разным DPI (`postfx.updateSize(w, h)`).
  - **Синхронизация динамической деградации**: В `reactor-state-driver.ts` при аварийном проседании FPS вызов синхронизирует и `renderer`, и `composer` через единый метод `postfx.updatePixelRatio("Low", 1.0)`.
- **Режим «Спокойные настройки» и гармонизация композиции (UX/UI Polish v3.1)**:
  - **Пространственный воздух (Breathing Room)**: Устранен эффект «прижатости» контента к левому краю сайдбара — отступ между сайдбаром и колонкой настроек увеличен до `pl-10 lg:pl-14 pr-8 lg:pr-12`, ширина контентного блока оптимизирована до `max-w-[820px]`, а зазоры между секциями расширены до `gap-12`.
  - **Ликвидация визуального шума от повторяющихся горизонтальных линий**: Устранены паразитные нижние полосы `border-b border-white/5` в секциях (`QuickCoreSection`, `AppearanceSection`, `WidgetControlsSection`, `TabNavigationSection`, `HotkeysSection`, `SystemResourcesSection`, `VkIntegrationsSection`), а также внутренние `divide-y` и `border-t/border-b` в строках параметров. Структура задается пространственным ритмом, типографикой и мягкими hover-поверхностями.
  - **Де-дашбордизация палитры тем**: Блок темы реактора переработан из тяжелых прямоугольных «плиток» в элегантный компактный inline-селектор в стиле радио-контролов (`○` / `●`) с аккуратным свечением активного оттенка и русскоязычными наименованиями («Янтарный», «Плазменный бирюзовый», «Критический красный», «Фиолетовый», «Изумрудный»).
  - **Снижение плотности операционных параметров**: Секция «Быстрые параметры» переведена на легкие, чистые строки без тяжелых рамок и избыточных карточных оберток.
  - **Скрытие нижнего Command Bar в Настройках**: При переходе в `uiStore.activeTab === 'settings'` нижняя командная консоль плавно скрывается вниз (`opacity-0 pointer-events-none translate-y-10 scale-95`), освобождая рабочее пространство и фокусируя пользователя исключительно на конфигурации.
  - **Сохранность функциональности**: Все сторы, реактивные свойства (`reactorPowerPercent`, `reactorSpeed`, `autoStart`, `voiceVolume`, `darkMode`, `isAudioReactive`), горячие клавиши и маршрутизация сохранены без изменений.
- **Токены и Конституция (`tokens.css`, `global.css`, `theme-palettes.tokens.ts`)**:
  - Лестница поверхностей: оправа `--arc-frame: rgba(7, 7, 7, 0.48)` (blur 32px sat 150%), плоскость чтения `--arc-plane: rgba(11, 11, 11, 0.42)` (blur 20px sat 130%), поповер `--arc-popover: rgba(20, 20, 20, 0.72)` (blur 24px sat 140%), тултип `--arc-tooltip: rgba(28, 28, 28, 0.85)` (blur 16px), блоки настроек `--arc-block: rgba(14, 14, 14, 0.88)` (без blur, радиус 14px), виджеты ядра `--arc-widget-core: rgba(11, 11, 11, 0.94)` (без blur, радиус 14px).
  - Акцент ядра: эталонный яркий красный `--accent: #EF4444`, `--accent-rgb: 239, 68, 68`, устранен бледный оттенок (#E63946) в токенах палитры, селектах и виджетах.
  - Оправа панели: корректный `box-shadow` с гарантированным fallback `rgba(var(--accent-rgb, 239, 68, 68), 0.28)`, верхний блик оправы `::before` переведен на `z-index: 1`, исключая засвечивание содержимого плоскости чтения; снято затемнение с плоскости чтения.
- **Переработка Settings (ТЗ §5)**:
  - Колонка настроек: центрированная 880px (`max-w-[880px] w-full mx-auto`), зазор между группами 32px (`gap-8`), паддинг плоскости 28px (`p-7`).
  - Рейл: 232px `#080808`, закрепленный поиск с полем `#0D0D0D`, тихая ссылка «Сбросить всё…».
  - Детектор противоречий (`conflict-rules.ts`, `ConflictBanner.vue`): 3 строгих правила, желтый баннер кромкой `--status-warn` и точкой 6px без заливки с кнопкой исправления.
  - Локальный ИИ: чеклист из 4 шагов с честными статусами и индикацией готовности.
  - Модели и загрузки: агрегированный read-only список поверх существующих загрузчиков.
  - Опасная зона («Данные и хранилища»): строгие двухэтапные подтверждения, отсутствие цветных заливок.
  - Сохранение: мгновенное применение + тост «Сохранено» (`#161616` --arc-popover).
- **Разрешенные правки вне заморозки (§6)**:
  - `reactor-theme.ts`: `themeAccentHex()` для неизвестного значения темы возвращает идентичный красный `#E63946` / `themeColors.red`.
  - `settings.store.ts`: `resetToDefaults()` сохраняет тему ядра `red`.
- **Автоматический аудит конституции (`scripts/check-visual-constitution.js`)**:
  - Интегрирован в процесс сборки, гарантирует отсутствие роста долга (0 нарушений, 62 тест-сьюта / 354 теста зеленые).

### 🎤 2.1 Голос (Voice Subsystem)
- **Студийный TTS-тракт**: Сервер Silero TTS v5.5 с нативным DSP (pitch shift 0.917x, de-esser 6–9.5 кГц, компрессор/лимитер -16 LUFS, ревербератор).
- **Архитектура «STT Never Dead»**: Мгновенный запуск Whisper Small int8 за 1 секунду, асинхронный hot-swap на GigaAM CTC, изоляция крашей ONNX через sacrificial-процесс валидатора, и **автоматический Fallback на Whisper при краше GigaAM (`Invalid n: -`)**.
- **VoiceQuickPanel**: Оверлей управления аудио с точной индикацией состояний (бирюзовый = активен, янтарный = загрузка, красный = ошибка).
- **Партнерский тон диалога и защита от грубости**: Системные промпты для языковых моделей (OpenAI, Ollama, встроенный Llama.cpp) строго перенастроены для поддержания профессионального и вежливого тона компетентного напарника. Полностью удалены заготовленные штампы подобострастия («Приветствую, сэр», «Слушаюсь»). Жестко запрещены уличный сленг, панибратство и грубость. Также полностью удалены локальные заглушки-перехватчики на вопросы «кто ты» и «что такое A.R.C.» из `commands.registry.ts` и классификаторов: теперь АРК отвечает на эти вопросы живым диалогом на базе системного промпта, а не шаблонными фразами.
- **Информативная панель метаданных LLM**: В MessageFooter добавлено явное отображение названия модели рядом с названием провайдера (например, `FreeLLM • auto`), что позволяет точнее понимать, через какой узел был сгенерирован ответ в случае fallback-маршрутизации (настроен парсинг `lastRouteData.cause` в `ai.ipc.ts`).
- **Правдивость меты и аварийных сообщений (v1.0.10)**:
  - *Мета = фактический источник текста*: При генерации сообщения в аварийном блоке (сбой запроса, отказ соединения, таймаут, пустой ответ) мета-поле `source` принудительно устанавливается в `'system'`, имя провайдера и latency исключаются, а MessageFooter отображает честный статус «системный ответ». Мета с именем провайдера и задержкой отображается исключительно при реальном HTTP 200 от LLM.
  - *Информативные аварийные сообщения и быстрые действия*: Централизованная утилита `formatFailureReason` транслирует ошибки сети и API (ECONNREFUSED, timeout, 401, 403, 404, 429, 500/502/503) в понятный человеку текст с указанием причины и дальнейшего шага. В пузырях ошибок и карточке отказа валидатора добавлены кнопки «Повторить» и «Настройки провайдера» для мгновенного перехода в настройки LLM.
  - *STT-бейдж с действием в TitleBar*: Индикатор состояния STT в TitleBar при ошибке инициализации становится кликабельным («STT ОШИБКА»), отображает причину сбоя из лога инициализации и по клику открывает раздел «Распознавание речи» в настройках.
- **Стабилизация фоновых процессов и устранение loop'ов (P1 Tech Debt)**:
  - *EcoService Hysteresis & Zero-Flapping Fix (v1.0.11)*: В `eco.store.ts` и `eco.service.ts` внедрен строгий механизм гистерезиса: при нахождении в состоянии `active` события пользовательской активности (pointerdown, keydown, click и др.) не вызывают повторной смены состояния и не спамят лог; дебаунс перехода в `hidden` при `blur` увеличен до 1500ms с проверкой `document.hasFocus()`, что полностью исключило ложные переключения и флэппинг при движении мыши над окном.
  - *Оптимизация сброса STT буфера (v1.0.11)*: Штатный вызов `reset_buffer` при переходе TTS -> MIC переведен на легковесный сброс указателя потока (`sherpaOnline.reset(sherpaStream)`) вместо тяжелого пересоздания C++ стрима, очищены остаточные буферы эха и VAD, а отладочные сообщения переведены в тихий режим, исключив спам `Resetting audio stream buffer` в логах.
  - *BuiltIn-LLM Loop & Health Reset Fix*: Внедрено кэширование проверок наличия файлов моделей (`modelAvailabilityCache` с TTL 10с) в `BuiltInLlmService`, исключен спам в консоль при рутинных проверках статуса отсутствующих моделей. Устранен бесконечный вызов `aiStore.saveProvider` в `fetchModels`, а сброс здоровья провайдера `providerHealthManager.reset` теперь логируется исключительно при реальном выходе из карантина/кулдауна.

### 🖥️ 2.2 Визуал (UI & Renderer)
- **Возврат визуальной идентичности A.R.C. (ТЗ v1.1.0-ui3)**:
  - *Стеклянный язык блоков (Glassmorphism & Depth)*:
    - `SettingsBlock.vue`: Заменён серый монохром на стеклянный фон `--block-bg: rgba(0, 0, 0, 0.40)` с эффектом `backdrop-filter: var(--block-blur)` (`16px`) и чёткой, видимой без всматривания рамкой `--block-border: rgba(255, 255, 255, 0.08)`.
    - Токены: Все значения закодированы в `tokens.css` (`--block-bg`, `--block-border`, `--panel-glass`, `--block-radius: 16px`, `--block-title`, `--block-subtitle`, `--block-eyebrow`, `--block-divider`). Примитивы (`SettingsBlock`, `StepChecklist`, `SchemeView`, `DangerZone`) ссылаются строго на токены.
  - *Восстановление проекции реактора*:
    - `HolographicProjectionPanel.vue`: Убран глухой непрозрачный черный фон `!bg-black/85 backdrop-blur-3xl`, возвращена полупрозрачная проекция `!bg-[#070709]/65 backdrop-blur-2xl` по Конституции. Реактор и космос отчётливо читаются сквозь панель настроек.
    - `CommandCenter.vue`: Бэкдроп-вуаль приведена к конституционному значению `bg-black/30 backdrop-blur-sm` (легкая дымка вместо тяжелого затемнения).
  - *Типографика и очистка от «поэзии»*:
    - Заголовки блоков переведены на человеческий гротеск строчными буквами (`normal-case text-[13px] font-medium text-[var(--block-title)]`) без сплошного капса.
    - Врезки (eyebrow) сделаны тихими и строчными (`normal-case text-[11px] text-white/40`).
    - Подзаголовки блоков очищены от витиеватой поэзии («Спектральный акцент светового ядра», «Энергия и кинетика ядра» и т.п.) и заменены на функциональные однострочные описания действий. Grep по `src/renderer/features/settings` на «спектр», «ядр», «кинетик» полностью пуст.
  - *Использование красного цвета*: Красный A.R.C. RED зарезервирован строго под активные состояния, переключатели и системную идентичность (активная карточка темы, статус-бейджи, подтверждения), а не для монотонных рамок блоков.

- **Визуальный проход настроек по утверждённому UX-концепту (ТЗ v1.1.0-ui2)**:
  - *Фаза 1 (Базовые примитивы)*: Создана библиотека компонентов-примитивов (`SettingsBlock.vue`, `SettingsRow.vue`, `StatusBadge.vue`, `DangerZone.vue`, `StepChecklist.vue`, `SchemeView.vue`, `ConflictBanner.vue`, `CrossLink.vue`) со строгим соблюдением дизайн-системы Arc Glassmorphism (тонкие границы `white/5`..`white/10`, спокойный hover, отсутствие монотонности и капса).
  - *Фаза 2 (Навигация и Шелл)*: `SettingsMenu.vue` и `SettingsSectionHeader.vue` адаптированы под концепт с eyebrow-надписями, счетчиками блоков, живым поиском и мгновенным переключением категорий `CORE, INTELLIGENCE, VOICE, SYSTEM`. Внедрен ненавязчивый дебаунсированный тост автосохранения «Настройки сохранены».
  - *Фаза 3 (Группа «Общие»)*: Полностью переработаны секции `AppearanceSection.vue`, `HotkeysSection.vue`, `QuickCoreSection.vue`, `WidgetControlsSection.vue`, `SystemResourcesSection.vue` и `VkIntegrationsSection.vue`.
  - *Фаза 4 (Группа «Интеллект»)*: Переработаны секции `ProvidersSection.vue` (карточки провайдеров, статус здоровья без ложной тревоги, быстрое назначение запасных), `LocalAISection.vue` (статус Ollama, встроенный Llama.cpp, замер инференса) и `ModelManagerSection.vue` (агрегированный реестр моделей, фильтры STT/TTS/LLM, VRAM/RAM селектор).
  - *Фаза 5 (Группа «Голос»)*: Секции `STTSection.vue`, `TTSSection.vue` и `VoiceAudioSection.vue` оформлены в единую систему с живым VU-метром микрофона, аудиотестом Silero, бейджами статуса и настройками омографов/ёфикатора.
  - *Фаза 6 (Группа «Система»)*: `PerformanceSettings.vue` декомпозирован на модульные секции `PerformanceOptionsSection.vue`, `StorageDataSection.vue` (двухэтапный DangerZone сброса настроек), `SafetySecuritySection.vue` и `DiagnosticsSection.vue`.
  - *Регрессия и правила*: 100% тестов пройдены (30+ тестов settings и связанные сервисы), сборка без ошибок, все новые компоненты укладываются в лимит 400 строк (контролируется `check-sizes`).

- **Реорганизация и унификация настроек (ТЗ v1.1.0-ui1)**:
  - *Фаза 0 (Единый машиночитаемый реестр)*: В `docs/ui-inventory/settings-registry.json` зафиксированы все 88 контролов настроек из 13 секций с подробными синонимами (3–6 ключевых слов на запись) для сквозного пользовательского поиска.
  - *Фаза 1 (Чистка дубликатов D1–D7)*: Устранены дублирующиеся контролы; старый объединенный ключ `voiceAutoClearCache` автоматически мигрирован при запуске на независимые `sttAutoClearCache` и `ttsAutoClearCache` в секциях STT и TTS соответственно. Секция Quick расформирована с переносом необходимых переключателей в их нативные секции.
  - *Фаза 2 (Поиск и управление видимостью)*: Реализован поиск с учетом синонимов (`useSettingsNav.ts`, `useSettingsSearch.ts`), внедрен компактный режим отображения часто используемых параметров (`useSettingsVisibility.ts`) с атрибутами `data-frequency="core|standard|advanced|debug-only"`.
  - *Фаза 3 (Человекочитаемые термины маршрутизации)*: Все устаревшие термины приведены к строгому глоссарию: «Умный маршрут» → «Автовыбор модели по сложности задачи», «Эксклюзивный режим» → «Только выбранный провайдер (без запасных)», «Фолбек цепочка» → «Запасные провайдеры по порядку», «Карантин» → «Провайдер на паузе после сбоя».
  - *Фаза 4 (Экран "Модели и маршрутизация")*: Разрозненные настройки маршрутизации объединены в единый структурированный экран из трех логических блоков:
    1. **«Где думать»** (`WhereToThinkSelector.vue`): Трехпозиционный переключатель режимов «Локально» / «В облаке» / «Гибридно» с мгновенной сменой логики исполнения и понятным описанием.
    2. **«Провайдеры»** (`ProvidersSection.vue` + `ProviderCard.vue`): Карточки провайдеров с ключами, статусом, моделью и быстрой настройкой ключа Gemini в 1 клик.
    3. **«Запасные и правила»** (`FallbackRulesSection.vue`): Интерактивный порядок переключения при сбое (фолбек-цепочка) с возможностью назначения запасного в 1 клик и слайдер порога сложности для облака.
  - *Регрессия и качество*: 343 теста зеленые (100% pass), сборка и линтер без единой ошибки, соблюдено правило 400 строк.
- **Инженерный редизайн настроек (Settings UI/UX)**: Раздел настроек полностью переработан в "System Configuration" (Engineering) стиль. Удалены вложенные светящиеся карточки (card-in-card), интерфейс уплощен и переведен на плоскую иерархию `Section -> Group -> Row`. Иерархия навигации перестроена в `CORE, INTELLIGENCE, VOICE, SYSTEM`. Карточки AI провайдеров переработаны в компактный вид системных узлов. Активные пункты меню используют минималистичные индикаторы вместо тяжелых заливок, обеспечен контрастный баланс типографики.
- **Тотальная защита форматирования времени (Defensive Date Handling v2)**: Устранена ошибка `date.toLocaleTimeString is not a function`. Все обработчики и вызовы форматирования времени в `ReactorTerminalOverlay.vue`, `SessionListItem.vue`, `sessions.store.ts`, `tasks.store.ts`, `TaskItem.vue`, `TaskHistoryView.vue`, `ObjectiveDetailsWorkspace.vue` и `MemoryDetailModal.vue` переведены на защитную валидацию (`instanceof Date`, `isNaN(d.getTime())`, `typeof d.toLocaleTimeString === 'function'`, безопасный блок `try/catch`). Исключена гидратация эфемерных логов из `localStorage` в `plugins.ts`.
- **Эволюция эргономики (Top Command Bar)**: Системный статус реактора («ГОТОВ», «СЛУШАЮ», «ДУМАЮ»), ключевая телеметрия (CPU, RAM, модель нейросети, скорость скачивания) и терминал интегрированы в монолитную верхнюю полосу управления (TitleBar). Устранен нависающий над реактором плавающий оверлей StatusOverlay, благодаря чему 3D-ядро получило свободный фокус.
- **Фокусированный Command Dock**: Нижняя панель очищена от перегруженных дублей мониторинга железа и превращена в чистый командный пульт диалога и голосового ввода с микрофоном высокой точности и индикаторами горячих клавиш (Space / Enter / ⌘K).
- **Единый темный стиль оверлеев**: StatusOverlay, FpsOverlay и модальные окна производительности переведены на прозрачный dark-glassmorphism (bg-black/85, backdrop-blur-xl, белый текст). Исключены непрозрачные цветные (красные/оранжевые) фоны виджетов.
- **7 специализированных пространств**: `commands`, `transcription`, `chat`, `reactor`, `tools`, `objectives`, `settings`.
- **Единый реестр `TAB_REGISTRY`**: Централизованный маппинг системных имен вкладок и локализованных заголовков.
- **Stage 2 / Iteration 2: Эргономика Command Dock и Навигации**:
  - **Hit-area & Микрогеометрия**: Кликабельная область вкладок увеличена с 32px (`h-8`) до 34px (`h-[34px]`) по высоте и горизонтальным отступам (`px-3`), при этом визуальный масштаб иконок (`3.5` / `4`) и типографики остался компактным.
  - **Читаемость типографики**: Размер шрифта меток вкладок деликатно скорректирован до `10.5px` со снижением разрядки с `tracking-wider` до сбалансированного `tracking-wide`, что исключило слипание букв и обрезание названий рабочих областей (`ПАМЯТЬ`, `ЗАДАЧИ`, `КОМАНДЫ`).
  - **Интегрированный сегмент «МОДУЛИ»**: Устранено ощущение двух случайно склеенных кнопок `[Модули]` и `[▼]`. Элементы объединены в цельный сегментированный блок с тонким внутренним разделителем (1px hairline `bg-white/[0.08]`) и удобной hit-area для выпадающего меню (24x34px).
  - **Структурные разделители**: Границы между pinned-иконками, рабочими областями и системными инструментами сбалансированы (0.07 opacity white hairline), сохранен спокойный restrained hover (`bg-white/[0.05]`) и благородный `A.R.C. RED` в активном состоянии.
- **Stage 3 / Iteration 1: Core / Home Experience Refinement**:
  - **Чистый старт Core**: Настройки боковых модульных панелей (`leftDockCollapsed`, `rightDockCollapsed`) в `settings.store.ts` установлены в состояние свернутых по умолчанию (`true`). При старте Core центральное пространство вокруг 3D-Реактора свободно от визуального загромождения. Все пользовательские настройки виджетов, режимы и кнопка «ЦЕНТР» в TitleBar полностью сохранены и мгновенно доступны по клику.
  - **Чистота пространства вокруг Reactor**: Ambient Core Status полностью удален из центральной сцены Core. Пространство между 3D-Реактором и Command Dock оставлено абсолютно чистым без наложений HUD-лейблов или текстовых прослоек, что сохраняет визуальную монолитность Реактора как главного смыслового объекта.
  - **Гармонизация VoiceQuickPanel**: Капсула VoiceQuickPanel переведена на темный стеклянный стиль (`bg-black/80 backdrop-blur-xl border-white/[0.08]`) с улучшенной капсульной микрогеометрией кнопок и сближением с Command Dock (`gap-1`), обеспечивая цельный силуэт единого командного пульта. Весь голосовой тракт (VoiceFSM, useVoice, wake word, shortcuts) остался строго нетронутым.
- **Интерактивность 3D-Реактора (Смысловое ядро)**: Усилена физическая экспрессия 3D-ядра для передачи состояний `listening`, `processing` и `speaking`. Скорость вращения колец, пульсация масштаба и свечение теперь напрямую зависят от аудио-метрики и текущего режима (ускорение колец до 3.0x при генерации, сильная амплитуда coreScale от низких частот при синтезе речи). В связи с этим **текстовая плашка статуса (СЛУШАЮ/ДУМАЮ) удалена из TitleBar** — реактор стал полностью самодостаточным индикатором, следуя принципу "никаких псевдо-декораций". Физическое масштабирование (`coreScale`) было зафиксировано на `1.0` (монолитность геометрии ядра), вся экспрессия передается исключительно через свечение (bloom) и скорость вращения колец (ringSpeed). Внедрена синтетическая световая пульсация для фаз простоя, гарантирующая обратную связь даже при отключенном WebAudio DSP. Устранена блокировка Three.js инициализации и зацикливание на `window.focus`: цикл рендеринга `animate()` отвязан от жесткого требования `isWindowFocused`, а параметры WebGL настроены на универсальный режим (`powerPreference: "default"`, `failIfMajorPerformanceCaveat: false`), гарантируя мгновенный старт и видимость 3D-ядра как в полноэкранном приложении, так и в sandboxed-окружении.
- **Пространственная эргономика (Магнитный Грид и Переходы)**: 
  - Внедрена продвинутая логика прилипания окон в режиме `CommandCenter` (Свободный режим) внутри `useDraggableWidget.ts`. Магнитная сетка переведена на 16px, окна жестко выравниваются по краям с отступом 16px, и "чувствуют" границы других виджетов в радиусе 24px для сборки ровных дашбордов.
  - **Бесшовные переходы**: Модальные пространства (Чат, Команды, Память и Настройки) внутри `HolographicProjectionPanel.vue` теперь переключаются через пространственный 3D-переход (комбинация `scale`, `blur(8px)` и `translateY`), обеспечивая плавность и глубину, усиливая ощущение монолитной среды, а не плоских окон.
- **Умная Телеметрия и Визуальная тишина (TitleBar)**: 
  - Реализовано динамическое потускнение всех индикаторов в TitleBar (opacity-40) в режиме простоя системы.
  - **STT/Whisper в TitleBar**: Статус подсистемы распознавания речи (Ожидание, Ввод, Обработка) полностью перенесен в центр `TitleBar.vue` вместе с CPU/RAM/ModelContext. При активной голосовой сессии STT узел загорается цветом акцентной темы с мягкой пульсацией (animate-ping), освобождая центральный холст от визуального шума.
- **Когнитивный диалог (Glass-Bubbles)**: 
  - Дизайн сообщений переработан: пузыри чата и блок генерации (Streaming State) переведены на `.arc-hud-panel` и `.glass-panel` для правильной Z-глубины и размытия. 
  - Поле ввода (`ChatInputZone.vue`) получило подложку `.arc-hud-panel`, устранен баг со слиянием черного фона.
  - Журнал исполнения (`ExecutionTrace.vue`) переведен на `.arc-hud-panel` с акцентным свечением в активном состоянии.
  - Устранено дергание текста (layout shift) при наведении на сообщение: панель инструментов переделана в плавающий Floating Toolbar.
  - Вложения (Attachments) используют эстетику стеклянных микро-карточек с мягкими границами. 
  - Анимация синтеза ответа использует акцентные цвета (accent-glow) для синхронизации со свечением 3D-реактора.
- **Интеграция Провайдеров**: Добавлена полноценная поддержка **FreeLLMAPI** и пользовательских эндпоинтов в меню настроек. Исправлен белый список `ALLOWED_PROVIDERS` в `ai.ipc.ts` (добавлены `freellmapi`, `cloud`, динамические ID с префиксами `new_`, `custom_`, `provider_`), что устранило ошибку `PROVIDER_NOT_ALLOWED` и удаление карточки провайдера при сохранении. Новые шаблоны теперь сохраняются в хранилище сразу при добавлении, а кнопка «Сохранить» получила наглядную обратную связь с галочкой. Поле ввода **API КЛЮЧ (API KEY)** в `ProviderCard.vue` теперь доступно для всех типов провайдеров (включая локальные роутеры и FreeLLMAPI, где ранее поле скрывалось условием `v-if="provider.type === 'cloud'"`). В `provider-manager.ts` внедрена безопасная обработка ошибок расшифровки `safeStorage` (возврат пустой строки вместо битых `enc:`-токенов, предотвращающий 401 ошибки и спам в логах). Для FreeLLMAPI установлен корректный локальный адрес `http://127.0.0.1:3001/v1/chat/completions` и информационный бейдж с напоминанием о запуске локального шлюза. Каталог сервисов переведен во всплывающее полноэкранное окно (`ArcModal`) в стиле "Arc Glassmorphism". В `provider.api.ts` и `openai.provider.ts` внедрена строгая валидация ответов: устранена ложная успешность теста соединения при пустых ответах/HTML, а для не-OpenRouter провайдеров модель `auto` автоматически транслируется в дефолтную модель (`gpt-4o`), предотвращая 404 ошибки и сбои Executor. **Автоопределение и распознавание моделей (FreeLLMAPI & Custom Providers)**: Устранена проблема нераспознавания моделей после успешного подключения. В `ProvidersSection.vue` исправлена нормализация ответа `getAvailableModels` (корректная обработка как массива строк от Electron IPC, так и объектов `{ models: [...] }`), реализована автозагрузка каталога моделей при раскрытии карточки провайдера. В `provider.api.ts` внедрен многоступенчатый опрос эндпоинтов (`/v1/models`, `/models`, `/api/models`) с извлечением ключей `data`, `models`, `result`, `items` и fallback-каталогом моделей FreeLLMAPI (включая `auto`). В `ProviderModelCatalog.vue` текущая модель (`provider.model`) и выбранные модели гарантированно включаются в каталог и плашки выбора, а при поиске добавлена кнопка мгновенного добавления/выбора любой произвольной модели (`+ ВЫБРАТЬ МОДЕЛЬ`).
  - **Нативная поддержка модели `auto` и устранение сбоя «нет соединения с ИИ»**: Устранена подмена модели `auto` на `gpt-4o` для шлюзов FreeLLMAPI в `request-executor.ts` и `openai.provider.ts`. Поскольку FreeLLMAPI спроектирован для самостоятельного выбора лучшей модели по тегу `auto`, попытка запросить платную/отсутствующую модель `gpt-4o` возвращала ошибку `404: Модель не найдена` за 8 мс, переводя систему в аварийный оффлайн-режим. Теперь для FreeLLMAPI модель `auto` сохраняется в исходном виде, а в `request-executor.ts` выстроен автоматический каскадный резерв бесплатных моделей.
  - **Устранение бесконечного «Сканирование API...»**: В `ProviderCard.vue` добавлен `watch` на состояние загрузки моделей `isLoadingModels` с корректным переключением бейджа в состояние успеха (`✓ Найдено моделей: X`) или ошибки с автоматическим возвратом в `idle` через 3.5 секунды. Кнопка «АВТО» подключена к единому методу `triggerAutoDetect` с защитным таймером на 7 секунд, исключающим вечное зависание анимации сканирования.
- **Ревизия и динамическое центрирование TitleBar (Директива 2026)**:
  - Реализовано строгое математическое центрирование центральной секции телеметрии (CPU, RAM, STT, Модель, Эко-режим) относительно всего окна (`useTitleBarCenter.ts`).
  - Внедрен адаптивный алгоритм уклонения от коллизий (collision-avoidance yielding): центральный блок стремится оставаться ровно по центру окна (`(containerW - centerW) / 2`). Если к нему приближается правая секция с кнопками или левая секция логотипа (при сужении окна, появлении длинных бейджей или раскрытии индикаторов), блок плавно сдвигается («съезжает»), сохраняя гарантированный минимальный зазор (12px) и полностью предотвращая наложение элементов.
  - При критическом сжатии окна применяется динамический `maxWidth` с плавным обрезанием/скрытием переполняющих элементов.
  - Все интерактивные элементы и индикаторы приведены к единой дизайн-системе "Arc Glassmorphism": капсульная геометрия (`rounded-full`, высота `h-6`), согласованные стеклянные подложки (`bg-white/[0.03]`, `border-white/[0.08]`), моноширинная статусная типографика (`font-mono text-[10px] tracking-wider uppercase`).
  - Переключатель режимов «Чистый центр» и «Свободный / Док» переработан в элегантный сегментированный пилл. Кнопка системного терминала (`SYS_LOG`) стилизована как круглая капсула с акцентным свечением при открытии. Оконные кнопки ОС отделены вертикальным делителем.
- **Унификация Glassmorphism**: Экраны *Транскрибации* (TranscriptionView), *Целей* (ObjectivesView) и *Файлов* (FilesTabView) переведены на единые системные классы `.glass-panel` и `.arc-hud-panel`. Удалены жестко заданные конфликтующие цвета (bg-black/40), исправлены шрифты (шрифт sans для UI, mono для цифр), что создало 100% бесшовный и консистентный дизайн по всему приложению. В чате удалены дублирующиеся приветственные экраны.
- **Энергосбережение (EcoStore)**: Усовершенствована логика ручного режима сна. Теперь при уходе в режим сна (Idle/Hidden) случайные движения мышью (`mousemove`) или прокрутка колесика (`wheel`) больше не пробуждают систему. Выход из сна возможен только при явном взаимодействии: клике, нажатии клавиши клавиатуры или голосовой команде.
- **Интеграция Политики Производительности и Редизайн Нотификаций (Arc Glassmorphism)**:
  - **Устранение инородного оверлея**: Удален плавающий оверлей `PerformanceTelemetryOverlay.vue`. Вся функциональность управления политикой кадров (режим, целевой FPS, принудительный игровой режим, частота телеметрии) органично встроена в штатный перетаскиваемый виджет «ПРОИЗВОДИТЕЛЬНОСТЬ» (`PerformanceProfiler.vue`) в виде компактной секции «ПОЛИТИКА A.R.C.».
  - **Ликвидация ошибок Pinia `readonly` и циклических структур**: Эфемерный стор `performance` исключен из плагина сохранения состояния `persistencePlugin` в `plugins.ts`, очищен битый кэш в `localStorage`. В `performance.store.ts` удалены конфликтующие обертки `readonly()` вокруг computed-свойств, вызывавшие `Set operation on key "isOperatorOverride" failed`.
  - **Унификация стиля уведомлений**: Виджет загрузки моделей (`DownloadNotificationDock.vue`), модальное окно автономной модели (`ModelDownloadOverlay.vue`) и тосты (`CommandCenter.vue`, `SyncToast.vue`) полностью переработаны под канон A.R.C. Glassmorphism: истинное стекло (`bg-[#070709]/75–80 backdrop-blur-2xl`), капсульные скругления (`rounded-2xl`, `rounded-full`), сдержанный фирменный красный A.R.C. RED, удалены архаичные квадратные скобки `[ ... ]` и глухие плоские фоны.

### 🧠 2.3 Память (Cognitive & Database Layer)
- **Локальная SQLite БД**: Хранение сессий, сообщений, параметров и метаданных через высокоскоростные транзакции.
- **Изоляция и целостность**: Автоматическое создание схемы, индексы по дате и сессиям, очистка устаревших транскриптов.

### 🛠️ 2.4 Инструменты & Безопасность (Security & Tools)
- **Approval Flow & Shell Approval (F2.3 / v1.0.12)**: Модальное окно подтверждения безопасности в UI для запуска `SHELL_RUN` макросов и системных команд. Соответствует визуальной конституции Arc Glassmorphism (`bg-black/30 backdrop-blur-sm`, панель `bg-[#070709]/65 backdrop-blur-2xl`, слой `z-[50]`, ширина `max-w-[480px]`). Реализована защита от случайного нажатия (фокус по умолчанию на «Отмена», Enter не запускает команду), блокировка клика по вуали, ловушка фокуса (Tab-trap), закрытие по Escape, блокировка VoiceFSM в режим `WAKE_WORD_ONLY`, ротируемый аудит-лог в `data/audit.log` и единый API `executeShellCommand` / `shellApprovalService`.
- **SandboxedFS**: Проверка канонических путей и строгая изоляция файловых манипуляций в рабочей папке.
- **Dual-layer CSP**: Политика Content-Security-Policy (CSP) упрощена для поддержки любых провайдеров (разрешены все https-соединения для connect-src), что полностью решает проблему блокировки новых API (FreeLLMAPI, AI Horde и других).
- **safeStorage (DPAPI)**: Аппаратное шифрование ключей в Windows с безопасным AES-256 fallback (0600).
- **Log Sanitizer**: Маскирование Bearer-токенов и секретных ключей во всех потоках логов.

### 📐 2.5 Полная инвентаризация UI (F0 UI Inventory)
- **Создан реестр пространств и экранов (`docs/ui-inventory/`)**:
  - `00-overview.md`: единая сводная таблица всех 19 пространств из `TAB_REGISTRY` (активные, fallback, оверлеи) с числом секций и контролов.
  - `01-core.md` – `12-fallback-spaces.md`: детальная по-пространственная карта секций, блоков и контролов с указанием `id`, `path`, `label`, `type`, `description`, `file:line`, `duplicates`, `frequency`.
  - `duplicates.md`: полная карта пересечений (D1–D7) параметров стора и действий пользователей перед редизайном.
  - `routing-glossary.md`: однозначные технические определения терминов маршрутизации («умный маршрут», «фолбек цепочка», «первая доступная», «эксклюзивный режим», «локально/облако», «карантин провайдера», «деградация/эскалация сложности»).
  - `settings-registry.json`: единый машиночитаемый JSON-реестр всех параметров конфигурации системы.


---

## Реализовано в v1.0.12 (F2.3: ApprovalDialog для SHELL_RUN + Безопасность и Аудит)
1. **Визуальная конституция диалога безопасности (`ApprovalDialog.vue`)**:
   - Полная переработка диалога в канон Arc Glassmorphism: вуаль `bg-black/30 backdrop-blur-sm` (легкая вуаль с сохранением видимости 3D-реактора), карточка `bg-[#070709]/65 backdrop-blur-2xl`, тонкая граница `border-white/10`, слой `z-[50]`, центрирование и ширина `max-w-[480px]`.
   - Заголовок уровня 2 (`role="heading" aria-level="2"`), чистое разделение Human Layer (заголовок, описание риска) и Machine Layer (моноширинный блок кода команды с цветом amber, бейдж типа действия `SHELL_RUN`, таймер автоотмены).
   - Капсульные кнопки `rounded-full`: кнопка «Отмена» (`bg-white/10`) и кнопка «Выполнить» (`--arc-red-critical`, `#ef4444`).

2. **Защита от случайного исполнения и доступность (Security & A11y)**:
   - **Защита от случайного Enter**: фокус при открытии диалога принудительно переносится на кнопку «Отмена» (`cancelButtonRef.focus()`). Случайный ввод после команды не приводит к подтверждению опасного шелла.
   - **Запрет клика по вуали**: клик по бэкдропу не закрывает диалог — оператор обязан сделать осознанный выбор.
   - **Escape**: клавиша Escape немедленно вызывает отклонение операции.
   - **Ловушка фокуса (Tab-trap)**: циклирование фокуса Tab/Shift+Tab заблокировано внутри диалога.
   - **ARIA-спецификация**: добавлены атрибуты `role="dialog"`, `aria-modal="true"`, `aria-labelledby="approval-dialog-title"`.

3. **Блокировка голосового тракта (VoiceFSM Guard)**:
   - При открытии диалога `useSecurityStore` переводит `voiceMode` в состояние `WAKE_WORD_ONLY`. Это исключает риск того, что система распознает случайную фоновую речь как голосовое согласие на запуск команды.

4. **Аудит-логирование и ротация (`data/audit.log`)**:
   - Создан сервис `ShellApprovalService` (`shell-approval.service.ts`). Каждое решение логируется в формате `[AUDIT] SHELL_RUN approval: <command_hash> | user_choice: <approve|cancel> | <timestamp>`.
   - Лог хранится в `data/audit.log` и автоматически ротируется каждые 7 дней.

5. **Единый шлюз выполнения shell (`shell-executor.ts` & `MacroExecutor.ts`)**:
   - Создан `executeShellCommand` в `commands/shell-executor.ts` с 60-секундным таймаутом автоотмены, валидацией через `PolicyEngine.evaluate('SHELL_RUN', ...)` и перенаправлением всех шелл-действий макросов через централизованный безопасный шлюз.


---

## Реализовано в v1.0.7 (Gemini API Key Modal & Router 401 Resolution)
1. **Специализированное модальное окно конфигурации Google Gemini API (`GeminiKeyModal.vue`)**:
   - Создано модальное окно на базе `ArcModal` в эстетике «Arc Glassmorphism» (`bg-[#070709]/65`, `backdrop-blur-2xl`, скругления `rounded-full` и `rounded-2xl`, моноширинные бейджи).
   - Позволяет пользователю безопасно ввести, просмотреть/скрыть и сохранить API-ключ Google Gemini.
   - Поддерживает прямое тестирование связи («Проверить ключ») через `aiStore.testConnection` с мгновенным выводом валидации и обнаружения 401 Unauthorized.
   - Интегрирован выбор модели Gemini (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-1.5-flash`) и опция приоритетного назначения в AI-роутере.
   - Добавлена прямая ссылка на Google AI Studio (`https://aistudio.google.com/app/apikey`) для получения бесплатного ключа.

2. **Аппаратное шифрование и синхронизация системного окружения (`settings.ipc.ts`, `ai.ipc.ts`)**:
   - Ключ сохраняется в защищенное хранилище ОС (`safeStorage` DPAPI на Windows / Keychain на macOS / SecretService на Linux).
   - `handleSetKey` и `ai:save-provider` автоматически синхронизируют значение ключа с `process.env.GEMINI_API_KEY`.
   - При старте приложения через `registerSettingsIpc` выполняется автоматическая гидратация `process.env.GEMINI_API_KEY` из хранилища `secure-keys.json`, что делает ключ мгновенно доступным для сервисов транскрибации, классификаторов и компьютерного зрения без необходимости перезапуска.

3. **Интеграция в панель настроек AI-оркестрации (`ProvidersSection.vue`)**:
   - В верхней панели управления добавлен интерактивный элемент `GEMINI КЛЮЧ` с индикатором статуса (зеленый при наличии валидного ключа, пульсирующий янтарный при его отсутствии).
   - Внедрен диагностический предупреждающий баннер при отсутствии ключа с кнопкой вызова модального окна для превентивного устранения 401 Unauthorized в роутере.
   - Обеспечено строгое соблюдение лимита строк кода (все затронутые файлы <400 строк) и архитектурной конвенции A.R.C.

## Реализовано в v1.0.7 (FreeLLM Dynamic Port & URL Base / Key Normalization)
1. **Динамическое автоопределение портов FreeLLM (`free-llm-scanner.ts`, `ai:scan-freellm`)**:
   - При занятости базового порта 31415 на ПК пользователя FreeLLM автоматически занимает порты 31416..31425.
   - Внедрен фоновый и интерактивный параллельный сканер портов (`scanLocalFreeLlm`), проверяющий доступность FreeLLM на портах 31415..31422, 3067, 3068. При отказе соединения (`ECONNREFUSED`) система автоматически зондирует локальные порты и сообщает пользователю точный обнаруженный адрес и рабочий порт.
2. **Универсальная нормализация эндпоинтов и поддержка единого ключа (`endpoint-normalizer.ts`, `free-llm.util.ts`)**:
   - Любой введённый формат — База URL (`http://127.0.0.1:31415/v1`), голый IP:порт (`127.0.0.1:31416`), `/v1/responses` или `/v1/chat/completions` — преобразуется в корректный эндпоинт без дублирования `/v1/v1/`.
   - В `ProviderManualIpBlock.vue`, `ManualIpModal.vue` и `AiModeStep.vue` добавлены полноценные поля ввода единого ключа API (`freellmapi-...`) с передачей заголовка `Authorization: Bearer <key>` и кнопка «Автопоиск FreeLLM».
   - Модель `auto` сохраняется для любого порта и адреса FreeLLM, предотвращая ошибочную подмену на неподдерживаемый `gpt-4o`.

---

## Реализовано в v1.0.6 (FreeLLMAPI Auth Resilience & Diagnostic Clarity)
1. **Предотвращение ложного карантина при ошибках 401 и 403 (`provider-health.ts`)**:
   - Ошибки авторизации (401: Unauthorized / Invalid API Key) и доступа (403: Forbidden) исключены из инкремента счётчика критических сбоев `consecutiveFails`. Провайдер больше не блокируется на 10 минут из-за неверного ключа или несоответствия заголовка.
2. **Интеллектуальная авторизация и graceful fallback для FreeLLMAPI (`openai.provider.ts`)**:
   - Устранена принудительная подстановка фиктивного ключа `Bearer free` для локальных шлюзов при пустом значении ключа.
   - Для FreeLLMAPI реализована двухэтапная цепочка попыток: если ключ не задан, сначала выполняется запрос без заголовка `Authorization`; в случае ответа 401 выполняется автоматическая повторная попытка с `Bearer free`.
3. **Честная диагностика причин отказа (`ai.router.ts`)**:
   - Устранено дезориентирующее сообщение «Связь с серверами отсутствует», когда сервер ответил кодом 401/402/429/404. При ошибке авторизации пользователю голосом, в чате и во всплывающем уведомлении четко сообщается: `«Провайдер <Имя> отклонил запрос: неверный API-ключ (код 401)...»`.
4. **Уточнение настроек FreeLLMAPI в UI (`ProviderCard.vue`, `presetsData.ts`)**:
   - Кнопка «ПОЛУЧИТЬ КЛЮЧ» в пресете FreeLLMAPI теперь ведёт прямо на локальную панель шлюза `http://127.0.0.1:31415/`.
   - В карточке провайдера добавлена подсказка с пояснением, где скопировать ключ `freellmapi-...` (на вкладке Keys) или как использовать режим без заголовка.

---

## Реализовано в v1.0.5 (FreeLLMAPI Stability & Diagnostic Observability: 30s Timeout, 3-Failure Quarantine & Granular Failure Logs)
1. **Увеличение таймаута до 30 секунд для локальных и кастомных провайдеров**:
   - В `openai.provider.ts`, `provider.api.ts` и `ollama.provider.ts` таймауты сетевых запросов и проверочных ping-completion для локальных / кастомных эндпоинтов (включая `localhost`, `127.0.0.1`, порт `31415`, FreeLLMAPI) увеличены с 10–25s до 30s. Локальные модели, требующие 11–15s на генерацию ответа, больше не отваливаются по таймауту.
2. **Отказоустойчивый порог карантина (3 Failures) и устранение двойного инкремента**:
   - Порог отправки провайдера в 10-минутный карантин в `provider-health.ts` повышен с 2 до 3 последовательных сбоев (`consecutiveFails >= 3`).
   - Устранён критический баг двойного инкремента счётчика `consecutiveFails` в `request-executor.ts` (когда за 1 упавший запрос ошибка регистрировалась дважды, моментально отправляя узел в карантин).
3. **Гранулярное логирование причин ошибок (`[Router] Request to <provider> failed: <exact reason>`)**:
   - В `request-executor.ts` добавлена функция `formatFailureReason` и точный вывод ошибок в формате: `[Router] Request to FreeLLMAPI failed: timeout (30000ms exceeded)`, `[Router] Request to FreeLLMAPI failed: HTTP 502 Bad Gateway`, `[Router] Request to FreeLLMAPI failed: ECONNREFUSED`.

---

## Реализовано в v1.0.4 (FreeLLMAPI & AI Provider Robustness: Exclusive Mode, Honest Catalog & Quarantine Reset)
1. **Эксклюзивный режим провайдера (`isExclusive`)**:
   - В `ai.router.ts` и карточке провайдера реализована поддержка флага `isExclusive`. Если для провайдера включен эксклюзивный режим, запросы направляются строго в него, блокируя нежелательный fallback на внешние сервисы вроде OpenRouter.
   - Если эксклюзивный провайдер помещен в карантин или недоступен, роутер генерирует честную системную ошибку без попытки подмены провайдера.
2. **Честная витрина моделей (Honest Model Catalog)**:
   - Из `provider.api.ts` и `request-executor.ts` полностью удалены хардкодные фейковые списки моделей (включая `dots-studio/free` и предустановленные заглушки).
   - В UI (`ProviderModelCatalog.vue`) отображаются только модели, фактически полученные от сервера провайдера. Если сервер не вернул модели или выключен, выводится пустое состояние с кнопкой обновления и честным статусом недоступности.
3. **Индикатор свежести кэша и гигиена карантина**:
   - В карточке провайдера выводится временная метка получения моделей («Модели получены X назад» или «Модели недоступны») с кнопкой ручного обновления.
   - Внедрена кнопка снятия карантина (Reset Quarantine) и автоматический сброс карантина и кулдауна при сохранении провайдера или успешном тесте соединения в соответствии с правилами `AGENTS.md`.
4. **Конфигурация заголовков аутентификации (`noAuthHeader`)**:
   - Для локальных OpenAI-совместимых шлюзов (включая FreeLLMAPI) добавлен переключатель подавления заголовка `Authorization`, позволяющий корректно работать со шлюзами, отвергающими пустые Bearer-токены.

---

## Реализовано в v1.0.3 (A.R.C. Performance Isolation Layer // Iteration 1 & 2: Performance Policy & Telemetry Consumer Adapter)
1. **Performance Policy Core (`ArcPerformanceManager`)**:
   - **Архитектурный инвариант**: Источник декларативной `PerformancePolicy` (Immutable / Read-only контракт). Менеджер публикует состояние и профили производительности, а потребители (UI, Telemetry, Visual Runtime) адаптируются самостоятельно без прямого императивного вмешательства менеджера.
   - **Неприкосновенность Core Intelligence Runtime**: Голосовой тракт, VoiceFSM, STT (Sherpa/Whisper), TTS (Silero) и логика рассуждений изолированы от троттлинга производительности.
   - **Режимы и профили (`PerformanceMode`)**:
     - `ACTIVE`: 60 FPS, Post-FX: FULL, Blur: FULL, Telemetry: STREAMING_1HZ, Polling: FULL, Animation: FULL.
     - `BACKGROUND`: 30 FPS, Post-FX: REDUCED, Blur: REDUCED, Telemetry: THROTTLED_02HZ, Polling: REDUCED, Animation: REDUCED.
     - `GAME_MODE`: 15 FPS, Post-FX: OFF, Blur: OFF, Telemetry: EVENT_DRIVEN, Polling: MINIMAL, Animation: OFF.
     - `BATTERY_SAVER`: 24 FPS, Post-FX: MINIMAL, Blur: REDUCED, Telemetry: THROTTLED_02HZ, Polling: MINIMAL, Animation: MINIMAL.
     - `REMOTE_DESKTOP`: 30 FPS, Post-FX: OFF, Blur: OFF, Telemetry: THROTTLED_02HZ, Polling: REDUCED, Animation: OFF.
   - **Operator Override**: Поддержка приоритетного ручного переопределения (Operator Override) над автоматическим детектором (`isOperatorOverride`, `toggleGameMode`, `resetToAuto`).
   - **Реактивный адаптер CSS Shell**: Классы `perf-mode-game` и `perf-blur-off` на `document.body` с отключением `backdrop-filter` и остановкой CSS-анимаций в режиме игры без деструкции WebGL-контекста.

2. **Telemetry & Polling Consumer Adapter (Итерация 2)**:
   - **Подключение потребителя**: `useSystemStore` подписан на реактивную политику `perfStore.policy` без изменения системных таймеров ОС (`timeBeginPeriod` не используется).
   - **Адаптация внутреннего ритма (Effective Cadence)**:
     - `ACTIVE`: стандартный поллинг 10s (`STREAMING_1HZ`).
     - `BACKGROUND` / `BATTERY_SAVER`: замедление до 25s (`THROTTLED_02HZ`).
     - `GAME_MODE` / `REMOTE_DESKTOP`: переход в режим `EVENT_DRIVEN` с редким fallback-интервалом 60s (`MINIMAL` polling) для сохранения тактов сна процессора.
     - `PAUSED`: при сворачивании окна или `hidden` эко-статусе.
   - **Прямой метод обновления**: Добавлен метод `fetchMetricsNow()` для возможности точечного обновления метрик по событию.
   - **Наблюдаемость**: В `PerformanceTelemetryOverlay.vue` выведены строки `POLLING` и `EFFECTIVE CADENCE` для верификации работы политик без догадок.

---

## Реализовано в v1.0.2 (Master UX/UI Evolution // A.R.C. Visual Constitution & Protocol)
1. **Stage 6 / Iteration 3 — Objectives Polish & Responsive Lock (STAGE 6 POLISH & LOCK ✅)**:
   - **Responsive Lock (P1 #1)**: Брейкпоинт сетки 4:8 в `ObjectivesView.vue` перенесён с `xl:` на `lg:` (`lg:col-span-4` / `lg:col-span-8`). При ширине 1024px, 1280×720, 1440px и 1920px обеспечивается стабильный двухколоночный вид мастер-детейла без схлопывания в вертикальную простыню.
   - **Empty State для реестра векторов (P1 #2)**: В `ObjectivesList.vue` внедрено аккуратное пустое состояние при `objectives.length === 0`: машинный маркер `VECTORS // EMPTY`, статус `Векторы не заданы`, лаконичное описание и кнопка `Задать намерение` (`@createObjective`), открывающая стандартную форму без дублирования модальных окон.
   - **Бесшовная навигация Topology → Details (P1 #3)**: В `ObjectivesView.vue` внедрен хэндлер `onTopologySelectObjective`: клик по узлу на глобальной карте траекторий сохраняет выбор цели (`selectObjective(id)`) и автоматически переключает активный вид на `activeSection = 'goals'`, отображая выбранный вектор в реестре и открывая его детали в Execution Canvas.
2. **Stage 6 / Iteration 2 — Strategic Workspace Refinement (STAGE 6 REFINEMENT ✅)**:
   - **4:8 Strategic Layout**: Пропорции сетки рабочего пространства `Goals` приведены к соотношению 4:8 (левая колонка: Strategic Vector Rail / ObjectivesList, правая колонка: Execution Canvas / ObjectiveDetailsWorkspace), устранено нагромождение и освобожден холст исполнения.
   - **Устранение избыточного мини-DAG в Goals**: Радиальный визуализатор графа `ObjectivesDagMap` удален из первичного экрана списка целей, где он создавал визуальный шум и дублировал специализированный экран `TopologySection.vue`.
   - **Консольный Machine-Status (`ObjectivesMetricsRow.vue`)**: 4 тяжелые SaaS-карточки метрик переработаны в монолитную статусную консоль (Machine Layer) с тонкой сеткой разделителей, моноширинными индикаторами и деликатным акцентом A.R.C. RED.
   - **Плотность и информативность Vector Rail (`ObjectivesList.vue`)**: Улучшена плотность списка, добавлены сниппеты описания целей (Human Layer), строгая маркировка статусов и системных ID, устранены тяжелые границы в пользу темного стекла.
   - **Сглаживание Execution Canvas (`ObjectiveDetailsWorkspace.vue`)**: Полностью исключен антипаттерн «Card inside Card inside Card» и каскады аккордеонов. Стратегический холст развернут в единую функциональную плоскость: Strategic Intent & Meta Bar → Flat Key Outcomes → Split Contingency Canvas (Risk Matrix & Decision Log).
   - **Специализированный модуль согласования траектории (`ObjectiveRouteApproval.vue`)**: Утверждение операционной траектории с DnD-нодами и маркерами допусков вынесено в изолированный модуль, строго соблюдая лимит 400 строк кода.
   - **Отказ от декоративных эмодзи**: Заменены все декоративные эмодзи на профессиональные SVG-иконки `lucide-vue-next` (`GitBranch`, `RotateCcw`, `User`, `Zap`, `Activity`, `Calendar`, `Lock`, `Cpu`, `FileText`, `CheckSquare`, `ShieldAlert`, `Target`).
2. **Stage 6 / Iteration 1 — Objectives Workspace Architectural Foundation (STAGE 6 FOUNDATION ✅)**:
   - **Декомпозиция `useObjectives.ts`**: Центральный composable логики целей сокращен с 534 до ~370 строк (строго в пределах правила 400 строк), удалены избыточные глобальные зависимости.
   - **Выделение слоя траектории и DnD**: Координатная логика drag-and-drop узлов, расчет уровней топологии и clamping вынесены в изолированный модуль `useObjectiveRouteLayout.ts`.
   - **Изолированный мок-слой (`mock-objectives.ts`)**: Реализованы реальные моки для браузерного превью (`objectiveGetAll`, `objectiveCreate`, `objectiveDecompose`, `objectiveGetGraph`, `objectiveGenerateRouteMap`, `objectiveApproveRoute`, `objectiveRollback`, `objectiveUpdateOutcomeValue`, `decisionGetAll` и др.), подключенные через `mock-database.ts`. Лимит данных 800 строк для `mock-database.ts` полностью соблюден.
   - **Системный Action Sheet отката (`ObjectiveRollbackDialog.vue`)**: Нативные вызовы `alert()` и `confirm()` в UI целей полностью устранены. Реализован системный диалог на базе `ArcModal` со строгим предупреждением о деструктивном действии, индикатором прогресса по шагам (current / total) и отчетом о результате отката.
   - **Сохранение неприкосновенности**: 3D Reactor, Chat, Tasks, Diagnostics, визуальный стиль и все IPC-контракты остались в неизменном стабильном состоянии.
2. **Stage 5 — Tasks Workspace Architecture & Multi-Mode Density (STAGE 5 CLOSED ✅)**:
   - **Архитектурная модель**: Рабочее пространство «Операционные задачи» окончательно зафиксировано в модели **Workspace + Context Rail + Inspector**. Карточки задач более не раздуваются аккордеонами и не вызывают резких сдвигов разметки (layout shifts).
   - **Пять специализированных режимов (Mode-Aware Density)**:
     - *Список (`list`)* — Полный операционный эталон: Зона 1 (режимы и шаблоны), Зона 2 (развернутое быстрое создание задачи с параметрами), Зона 3 (поиск, сортировка и статусные фильтры). Выбранная задача подсвечивается акцентным контуром и открывает детальный `Context Inspector` в правом рейле.
     - *Матрица Эйзенхауэра (`eisenhower`)* — Аналитический режим 2×2: панель создания задачи свернута в компактную кнопку `[+ Задача]`, высвобождая ценную вертикаль для 4 квадрантов. Интерактивная выборка кликом передает задачу в `Context Inspector`.
     - *Канбан-доска (`kanban`)* — Потоковый режим: изолированный горизонтальный скролл без двойной вертикальной прокрутки (`overflow-hidden` для внешнего контейнера, `h-full min-h-[460px]` для доски, скролл только внутри колонок). Панель создания свернута в `[+ Задача]`. Клик по карточке любой из 5 колонок активирует `Context Inspector`.
     - *Фокус-спринт (`sprint`)* — Режим глубокой концентрации: убраны создание задач, шаблоны, поиск и фильтры. TaskConsole сокращен до компактной полосы переключения режимов (48px). Активная задача спринта синхронизирована с `expandedTaskId` и инспектором.
     - *История (`history`)* — Архивный режим: убраны инструменты оперативного управления очередью. Сохранен чистый таймлайн выполненных задач с возможностью инспекции завершенных подзадач и затраченного времени.
   - **Принцип правого рейла (`TaskContextRail.vue`)**:
     - Ширина зафиксирована в диапазоне 310–330px (`w-[320px]`).
     - Содержит два стабильных режима: `TaskContextInspector` (при выбранной задаче) и `TaskTelemetry` (при отсутствии выбора: нагрузка дня, аккордеон метрик, рекомендуемая задача).
     - Зафиксирована заметка на будущее развитие: переход от постоянного рейда к адаптивному поведению (вторичность/сворачиваемость в режимах Focus и History).
   - **Защита от регрессий и Scope Lock**: Весь модуль `tasks` (`TasksView.vue`, `TaskConsole.vue`, `EisenhowerMatrix.vue`, `KanbanBoard.vue`, `FocusSprintView.vue`, `TaskHistoryView.vue`, `TaskContextRail.vue`, `useRecurrenceHelpers.ts`) протестирован, соответствует лимиту 400 строк (`check-sizes` passed) и **закрыт от изменений**.
2. **Stage 4 / Iteration 2.1 — Chat Workspace Final Polish & Closure (Dock Purism & Strict Tool Semantics)**:
   - **Удаление искусственной капсулы «ГОЛОСОВОЙ КАНАЛ A.R.C.» (`CommandCenter.vue`)**: Устранена псевдо-капсула, исключены промежуточные визуальные слои. Command Dock остаётся единым глобальным интерфейсом внизу экрана без искусственных текстовых плашек.
   - **Удаление декоративного светового коннектора (`CommandCenter.vue`)**: Убрана искусственная горизонтальная линия-связь между проекцией и доком. Архитектурное единство сцены строится на естественной пространственной композиции, глубине чёрного фона и реакторе, исключая декоративные объяснения интерфейса.
   - **Абсолютная фильтрация Execution Trace (`MessageBubble.vue`)**: Устранены утечки внутренних синтетических шагов (`step-val`, `Validator`, `Planner`, `Executor`). Трейс исполнения теперь подчиняется строгому правилу `isRealToolExecution && realExecutionSteps.length > 0`: для стандартных ответов («Привет», «Связь с серверами отсутствует...») Execution Trace полностью скрыт. Блок визуализируется строго при реальных инструментальных действиях (Search, RAG, Files, Tasks, Tools).
2. **Stage 4 / Iteration 2 — Chat Visual & Spatial Refinement (Execution Trace Semantics, Header Hierarchy, Sidebar Scale & Single Input Focus)**:
   - **Строгая семантика Execution Trace (`MessageBubble.vue`)**: Трейс исполнения полностью исключён для стандартных LLM-ответов (например, «Привет» или сообщение о недоступности серверов). Блок отображается строго событийно (`v-if="realExecutionSteps.length > 0"`) только при наличии реальных инструментальных действий: Web Search, RAG, вызов внешнего инструмента, файловые операции, вызовы системных сервисов.
   - **Иерархия заголовка проекции (`HolographicProjectionPanel.vue`)**: Главным доминирующим визуальным элементом стал «✦ Когнитивный диалог» (Human Layer, нормальный регистр, читаемый полужирный гротеск). Маркер «ПРОЕКЦИЯ · АКТИВНА» переведён в деликатный вторичный статус (Machine Layer, мелкий моноширинный шрифт 9.5px с миниатюрным статусным индикатором).
   - **Облегчение и масштаб SessionSidebar (`SessionSidebar.vue`)**: Ширина сайдбара уменьшена с 300px до 260px (`w-[260px]`), снижена визуальная насыщенность и плотность элементов истории диалогов, панель приобрела вторичную вспомогательную роль относительно основного рабочего пространства.
   - **Комфортное ограничение потока сообщений (`ChatView.vue`)**: Внутри скролл-контейнера поток сообщений ограничен шириной `max-w-4xl mx-auto`, предотвращая ощущение пустоты и растянутости коротких диалогов на широкоформатных экранах, при сохранении полной ширины зоны ввода `ChatInputZone`.
   - **Глобальная консоль Command Dock (`CommandCenter.vue`)**: Сохранена концепция Command Dock как глобального интерфейса A.R.C. Конфликтующее текстовое поле скрывается, освобождая место для единого активного текстового ввода `ChatInputZone`, а глобальный голосовой доступ (кнопка микрофона и шорткат SPACE) и статусная полоса сохраняются. Добавлен деликатный визуальный коннектор между проекцией и консолью.
2. **Stage 4 / Iteration 1 — Chat Workspace Core Experience (Human Layer & Typography Focus)**:
   - **Single Active Input**: В `CommandCenter.vue` реализовано деликатное сокрытие глобального Command Dock при активной вкладке чата (`isCanvasActive && activeTab === 'chat'`). При открытом Chat рабочем пространстве в фокусе находится строго один основной текстовый ввод — `ChatInputZone.vue`, исключая визуальный конфликт двух конкурирующих полей ввода на одном экране.
   - **Очистка Human Layer от служебного шума**: Из ответов ассистента в `MessageBubble.vue` удалена постоянная дублирующая плашка `A.R.C. // РЕЗУЛЬТАТ`. Текст сообщений увеличен до комфортного для чтения размера `14.5px` (`text-[14.5px]`) с гармоничным интерлиньяжем (`leading-relaxed`), восстанавливая естественную иерархию Human Layer.
   - **Событийный ExecutionTrace**: В `MessageBubble.vue` отфильтрованы синтетические декоративные шаги («Анализ директивы», «Синтез структурированного ответа», «Проверка валидатором»). Трейс исполнения отображается строго событийно (`realExecutionSteps`) — только тогда, когда выполнялись реальные осязаемые операции (Web Search, RAG, вызов внешних инструментов, файловые операции).
   - **Унифицированная поверхность стриминга (No Layout Shift)**: В `ChatView.vue` удален отдельный прыгающий блок «СИНТЕЗ ОТВЕТА». Генерация текста теперь транслируется непосредственно в стабильный `MessageBubble` с деликатным мерцающим курсором на конце текста (`inline-block w-1.5 h-4 bg-white/70 animate-pulse`), предотвращая визуальные скачки разметки при переходе от стриминга к готовому сообщению.
   - **Компактный ChatStatusBar**: Перегруженная плашка статуса агента высотой 45px заменена на компактный 1.5-строчный индикатор (`px-3 py-1.5`) с динамическим статусом и бейджем активной модели, освобождая ценное вертикальное пространство для диалога.
   - **Инженерные блоки кода в markdown.ts**: Устранена едкая терминальная изумрудная раскраска. Блоки кода переведены на благородную нейтральную темную подложку (`#0c0d12]/95 border-white/[0.08]`) с функциональной кнопкой «Копировать», удобным горизонтальным скроллом и читаемым моно-шрифтом.
2. **Принятие A.R.C. Visual Constitution**:
   - Безусловный запрет на выхолащивание в generic/SaaS/ChatGPT клон.
   - Фиксация ДНК: Глубокий черный космос, живой 3D-Реактор, фирменная палитра A.R.C. RED (`Identity`, `Active`, `Focus`, `Voice`, `Reactor`, `Critical`, `Ambient`), матовое темное стекло (`backdrop-blur-xl/2xl`), тонкие структурные линии и sci-fi/HUD семантика.
   - Жесткое разделение слоев: `Human Layer` (читаемый гротеск, обычный регистр для контента) и `Machine Layer` (моноширинный, верхний регистр для телеметрии и ID).
   - Индивидуальный характер плотности пространств (CORE — атмосферный, CHAT — спокойный, TASKS — структурированный, OBJECTIVES — стратегический, SETTINGS — инженерный).
   - Неприкосновенность геометрии и поведения 3D-Реактора и концепции Command Center.
2. **Master UX/UI Implementation Protocol**:
   - Строгая поэтапная работа (экран за экраном, максимум 3–5 связанных файлов за итерацию).
   - Обязательная предварительная текстовая спецификация макета (Layout Specification) перед правками кода.
   - Обязательный 4-критериальный `A.R.C. Identity Check` после каждой итерации с откатом при уклоне в обычный SaaS.

---
## Реализовано в v1.0.1-b1 (Пакет эксплуатационных правок — Финал)
1. **Персона и речевые шаблоны (Блок A)**: Удален канцелярит ("на связи", "готов помочь"), внедрен лаконичный стиль общения ("Я тут. Слушаю"). Обновлен `generateArcIdentityResponse` и системные промпты OpenAI/Ollama.
2. **Интеграция погоды и пре-раутинг (Блок B)**: Реализован `GetWeatherTool` с использованием open-meteo API и прямого геокодирования, исключающий галлюцинации LLM. Устранен дубль пре-раутинга погоды (оставлена только ранняя точка в `ToolDispatcher`). Добавлен стоп-лист и валидация парсера города.
3. **Гигиена TTS (Блок C)**: Очистка текста от markdown-разметки (ссылки, хештеги, таблицы), корректное склонение градусов Цельсия/Фаренгейта (1 градус, 2 градуса, 5 градусов) перед озвучкой.
4. **Gratitude closer ДО фантом-фильтра (Блок 1 / Блок D)**: 
   - Расширен спектр closers до полной спецификации: "спасибо", "благодарю", "благодарствую", "спасибки", "спасибо большое", "спасибо огромное", "большое спасибо", "огромное спасибо", "всё, спасибо", "все, спасибо", "всё спасибо", "все спасибо", "спасибо, всё", "от души".
   - Обработка closers вынесена на самый ранний этап до вызова триггеров и фантом-фильтров: мгновенный переход FSM в IDLE, немедленное закрытие окна без озвучки, логирование `[VoiceFSM] Closed by gratitude closer`.
5. **VAD-гейт таймера 15s (Блок 2)**:
   - Отсчёт 15-секундного лимита речи активируется строго после подтверждения реальной речи (STT/VAD).
   - При тишине или шуме фонового уровня длительностью ≥ 15s буфер сбрасывается абсолютно молча — исключено ложное срабатывание лога `Forcing transcription`.
6. **AudioContext Guard (Блок 3)**:
   - Все вызовы закрытия `AudioContext` по кодовой базе обернуты в безопасный паттерн с проверкой `state !== 'closed'` и перехватом исключений/отклоненных промисов `p.catch()`, предотвращая падения из-за состояния гонки.
7. **Debounce stop-word (Блок 4)**:
   - Централизован вызов `handleStopWordAction` во всех STT-хэндлерах (partial, final, native) с дебаунсом 1000 мс для защиты от дублирующих экстренных остановок.

---

## Реализовано в v1.0.2-c4 (Единый владелец диалогового режима & STT Reset)
1. **VoiceFSM — Единый владелец диалогового режима (Блок 1)**:
   - Внедрен флаг `voiceMode: ref<VoiceMode>('WAKE_WORD_ONLY' | 'ACTIVE_DIALOGUE')`, владелец VoiceFSM (`useVoice.ts`).
   - Реализована сторожевая функция `canOpenDialogueWindow(): boolean`, возвращающая `true` только в режиме `ACTIVE_DIALOGUE` и при отсутствии активного закрытия благодарности (`!isGratitudeClosing`).
   - На `arc:tts-finish`, приход транскрипта и обработку команд добавлен сторожевой guard: при `canOpenDialogueWindow() === false` попытки обновления окна подавляются с логированием.
   - После gratitude closer: `voiceMode = 'WAKE_WORD_ONLY'` до следующего распознавания wake-word ("Арк"). После wake-word: `voiceMode = 'ACTIVE_DIALOGUE'`.
   - Полное соблюдение Acceptance: после «спасибо» ноль строк «window refreshed» до «Арк»; «а завтра?» сразу после ответа погоды работает в активном окне.
2. **Сброс буфера STT при переходе TTS → MIC (Блок 2)**:
   - Добавлен метод `resetBuffer()` в `STTService`, отправляющий IPC сигнал `reset_buffer` в дочерний воркер `stt_worker.js`.
   - Зарегистрирован IPC канал `voice:reset-buffer` в `src/main/ipc/voice.ipc.ts` и проброшен в `preload.ts` (`resetSttBuffer()`) и `mock-database.ts`.
   - При событиях `arc:tts-finish` и `arc:stop-audio` вызывается `resetSttBuffer()`, очищая нативные буферы аудио и предотвращая фантомные транскрипты и ошибки `Invalid n`.
3. **Промпт и форматирование погоды (Блок 3)**:
   - В `get-weather.tool.ts` добавлено полное наименование направлений ветра («северный», «юго-западный» и т.д.) и поле `summary` с готовым прогнозом.
   - В `ai.router.ts`, `openai.provider.ts`, `ollama.provider.ts` и `tools-utils.ts` внедрены директивные системные инструкции: при наличии готовых данных погоды модели категорически запрещено повторно вызывать `get_weather` или `web_search`, предписано отвечать пользователю сразу естественным языком.
4. **UI бейдж сообщений (Блок 4)**:
   - В `MessageFooter.vue` метка `локально` переименована в точное понятное пользователю обозначение `системный ответ`.
5. **Тестирование (Блок 5)**:
   - 314/314 тестов (54 тестовых набора) успешно пройдены, включая специализированный тестовый набор `useVoice.v102c4.test.ts`.
   - Проверка лимитов размеров файлов `check-sizes` и `tsc --noEmit` успешно завершены.
8. **Позиционирование Wake-word и монолог (Блок 5)**:
   - Wake-word (`арк`, `a.r.c.`, `arc` и алиасы) теперь принимается строго в первых 3 словах высказывания (индексы 0..2).
   - Улучшен фильтр отрицания (проверка 2 слов перед триггером, например «без слова арк»), предотвращая ложные срабатывания внутри монологов.
9. **Магнитная сетка (Блок E)**: Шаг сетки при перемещении виджетов снижен до 8px для более точного позиционирования.
10. **Типизация и импорты (Блок G)**:
    - Типы `DownloadState` вынесены в `built-in-llm.types.ts`.
   - Исправлен циклический импорт: динамические `import()` заменены на статические импорты типов с ленивой инициализацией синглтона `BuiltInLlmService.getInstance()`. Устранен warning в Vite.
8. **Конфигурация сборки electron-vite (Исправление запуска на Windows)**:
   - Устранена критическая ошибка сборки main-процесса: ручное указание `build.rollupOptions.input` отключало встроенный пресет `build.lib` в `electron-vite`, в результате чего Rollup при SSR-сборке на Windows выбрасывал весь код точки входа как неиспользуемый (`Generated an empty chunk: "index"`, `out/main/index.js 0.01 kB`).
   - Восстановлена стандартная работа `electron-vite`: удалены избыточные `rollupOptions.input` и `output` из секции `main`, что возвращает генерацию через `findLibEntry(root, 'main')` и `build.lib` с полным сохранением сайд-эффектов приложения.
9. **Фикс пре-раутинга погоды и валидации локации (Блок H)**:
   - **Устранение дубля PRE-ROUTED**: Из `request-executor.ts` и `ai.router.ts` удалены дублирующиеся блоки перехвата погоды. Точка входа централизована в `ToolDispatcher.getInstance().preRouteWeather(...)`, что гарантирует ровно одну запись `[ToolDispatcher] PRE-ROUTED: get_weather` в логе.
   - **Стоп-лист и геокодирование (`weather-geocoding.util.ts`)**: Реализован валидатор с расширенным стоп-листом (числовые, указательные местоимения, временные маркеры) и эвристикой восстановления именительного падежа для русских названий городов (напр., «Горловке» → «Горловка», «Орле» → «Орёл»). Невалидные кандидаты («какая погода одно») не перехватываются пре-раутингом и штатно передаются в LLM.
10. **Устранение флуда логов 3D-реактора (`[Reactor Telemetry 2Hz]`)**:
    - Удалены регулярные записи `console.log` телеметрии 2 Гц из циклических обновлений `reactor-state-driver.ts` (120 логов в минуту).
    - Сохранена публикация метрик в `window.__reactorLastTelemetry` для инспекции состояния без вывода в stdout.
    - В `useSysLogs.ts` добавлен фильтр перехвата сообщений `[Reactor Telemetry`, исключающий попадание телеметрии в системный журнал и консоль браузера.

11. **Фикс сетевого роутера и устранение ошибки OpenRouter Socket Hang Up**:
    - Устранена причина ошибки `OPENROUTER: ERR SOCKET HANG UP`: из запросов к OpenRouter удалён некорректный заголовок `x-api-key`, от которого шлюзы OpenRouter/Cloudflare принудительно сбрасывали TCP-соединение (RST).
    - Внедрён механизм авто-повтора (`postWithRetry` с експоненциальным задержкой до 2 попыток) для всех HTTP-запросов к LLM при обрывах соединения (`ECONNRESET`, `socket hang up`, `ETIMEDOUT`).
    - Улучшена обработка статусов ошибок в `ai.router.ts`: обрывы сокетов транслируются как понятный статус `Network: Прервано соединение` вместо исходных дампов исключений.
    - Устранена проблема залипания старых ошибок на UI (например, `ОШИБКА: 500 NVIDIA API Catalog (NIM)`) при успешном фоллбеке на следующего провайдера: внедрена очистка стейта `uiStore.setLastRouterError(null)` перед каждым новым запросом и при получении успешного маршрута.

12. **Фикс логики voiceMode (v1.0.2-c5)**:
    - **Решение проблемы сброса режима**: Устранена проблема, при которой `voiceMode` ошибочно переключался обратно в `WAKE_WORD_ONLY` после завершения ответа системы (tts-finish) или по таймеру очистки окна диалога, ломая возможность задавать уточняющие вопросы (follow-up) без wake-word.
    - **Строгое соответствие ТЗ**: `WAKE_WORD_ONLY` теперь устанавливается исключительно при старте системы и при произнесении слов благодарности (gratitude closer).
    - **Поддержка естественного диалога**: После обычного ответа системы состояние `voiceMode` остаётся `ACTIVE_DIALOGUE`, что позволяет корректно открывать окно диалога и принимать продолжение фраз (напр. «а завтра?») без повторного произнесения "Арк".

13. **Оптимизация сетки и предотвращение хаотичного наложения виджетов (v1.0.2-c5)**:
    - **Версионирование стейта**: Версия хранения координат обновлена до `arc_widget_v7_`. Автоматически сброшены устаревшие скомпрометированные позиции из `localStorage`.
    - **Полная очистка при сбросе**: Функция `resetWidgetPositions()` в `settings.store.ts` и `resetPosition()` в `useDraggableWidget.ts` обновлены для глубокого удаления всех устаревших версий ключей (`v7`, `v6`, `v5`, `v4`, `v3`, `v2`, `v1`).
    - **Алгоритм предотвращения коллизий (`resolveCollision`)**: Все координаты (загружаемые из хранилища и вычисляемые по умолчанию) проверяются через каскадный алгоритм предотвращения перекрытий, автоматически раздвигающий виджеты по вертикали при обнаружении пересечений bounding box.
    - **Базовый пресет `standard`**: По умолчанию установлен пресет `standard` (4 ключевых виджета разнесены по углам экрана вокруг 3D-реактора без наложения).

14. **Комплексная модернизация HUD-виджетов (v1.0.3-c6)**:
    - **HudWidgetShell**: Унифицированный темный стеклянный контейнер с неоновым откликом, микро-хэндлами `GripVertical`, плавными hover-состояниями и теневой глубиной `shadow-[0_16px_40px_rgba(0,0,0,0.6)]`.
    - **ReactorTechnicalHUD**: Сегментированные неоновые LED-шкалы CPU, RAM и Mic с цветовой калибровкой и интерактивными кнопками управления телеметрией.
    - **AssistantActionTimeline**: Интерактивный таймлайн с кнопкой «ТЕСТ», прогресс-индикаторами с лазерной анимацией узлов и лаконичным заголовком «ТАЙМЛАЙН».
    - **MusicCapsuleWidget (Медиахаб)**: Заголовок стандартизирован как «МЕДИАХАБ», капсульное неоновое стекло для управления треками, эквалайзер и индикаторы потока.
    - **SmartRouterDiagram (Умный роутер)**: Неоновые ветви локального и облачного маршрутов, переключатель «ОБЛАКО/ЛОКАЛ» в шапке для тестирования, интерактивные карточки с задержкой и уровнем приватности.
    - **PerformanceProfiler (Профайлер)**: Компактный заголовок «ПРОФАЙЛЕР», метрики FPS и времени кадра на глубоком темном стекле с неоновыми точками статуса, улучшенная панель выбора пресетов качества и очистки кэша.
    - **FpsOverlay (FPS Монитор)**: Заголовок «FPS МОНИТОР», сбалансированная палитра статуса (зеленый/янтарный/розовый без ядовито-красного), деактивация навязчивого авто-модала аудита производительности.

15. **Smart Focus Throttling (v1.0.2-d1)**:
    - **Focus Detection**: Добавлены слушатели `blur`/`focus` на окне и `BrowserWindow` в `main/index.ts`, транслирующие события `window:focus-changed`. Добавлены API методы `isWindowFocused` и `onFocusChanged` в `preload.ts` и моки в `mock-database.ts`. В `main/index.ts` включен `backgroundThrottling: true`.
    - **Состояние Экосистемы (`eco.store.ts`)**: Отслеживание фокуса окна с 100ms debounce переходом в троттлинг-режим (`isThrottled`).
    - **GPU Throttling**:
      - `useReactor3D.ts`: Полная остановка `requestAnimationFrame` и опрос аудио-источников при потере фокуса или скрытии окна, снижение нагрузки на GPU до 0%.
      - `SpaceBackground.vue`: Полная остановка canvas-анимации частиц и вызова RAF при потере фокуса.
    - **CPU Throttling**:
      - `stt.service.ts`: Динамическое переключение интервала heartbeat с 2s на 30s в режиме фона/потери фокуса.
      - `useVoice.ts`: Автоматический вызов `stopListening()` при blur с запоминанием состояния и мгновенным возобновлением `startListening()` через 200ms при возврате фокуса.
      - `system.store.ts`: Полная приостановка поллинга телеметрии системы при активном троттлинге.
    - **UI Индикация**: В `TitleBar.vue` добавлен индикатор `🎮 GAMING MODE ACTIVE` с тултипом "ARC paused to save resources".

---
## Реализовано в v1.0.1-b2 (Пакет эксплуатационных правок v1.0.1-b2)
1. **Единый дизайн виджетов (Glassmorphism Dark & Functional Capabilities)**:
   - **HudWidgetShell**: Обновлен базовый контейнер всех виджетов системы (`bg-black/85 backdrop-blur-2xl border-white/10 rounded-2xl`). Добавлен микро-хэндл перетаскивания `GripVertical`, унифицированные кнопки сворачивания (`Minus`, `Square`) и закрытия (`X`) из `lucide-vue-next` без монохромных эмодзи/символов.
   - **ReactorTechnicalHUD**: Устранены тревожные красные градиенты CPU/RAM при нормальной нагрузке. Внедрена адаптивная цветовая шкала (нейтральный белый/изумрудный <60%, янтарный 60-85%, розовый >85%), анимация эквалайзера микрофона и функция мгновенного копирования диагностического снимка метрик в буфер обмена.
   - **AssistantActionTimeline**: Устранены жестко заданные красные маркеры. Активный узел теперь выделяется мягким белым контрастным свечением, выполненные шаги — изумрудным, будущие — полупрозрачным стеклом. Добавлена интерактивная инспекция шагов пайплайна с описаниями и таймингами.
   - **SmartRouterDiagram**: Модернизированы карточки локального и облачного маршрутов в эстетике темного стекла с отображением задержек (`12мс` vs `380мс`) и режима приватности. Добавлена интерактивная симуляция маршрутизации в один клик.
   - **PerformanceProfiler**: Карточки метрик переведены на темное стекло `bg-white/[0.03] border-white/10`. Заменены цветные акценты пресетов графики на нейтральные стеклянные пилюли, добавлена кнопка мгновенной очистки кэша рендеринга и Three.js геометрий.
   - **FpsOverlay**: Линия графика и селекторы модального окна переведены на адаптивный цвет (белый/изумрудный) без навязчивого красного дефолта. Эмодзи в шапке заменены на векторные иконки `BarChart2` и `RotateCcw`.
2. **TTS: Нумерованные списки и числа (Блок A и C)**:
   - Добавлено правило нормализации нумерованных списков в `tts-text.util.ts`: паттерн `^\d+\.\s+(.+)$` преобразуется в порядковые числительные («1. тест» → «первый — тест», «2. таблица» → «вторая — таблица», «3. сервер» → «третья — сервер», для 11+ «номер 11, [текст]»).
   - Нормализованы дроби («0.5» → «ноль целых пять десятых»), версии («v1.0.1» → «версия один ноль один»), проценты («5%» → «пять процентов»), диапазоны («1-10» → «от одного до десяти»), валюты («$10» → «десять долларов») и даты («11.09.2026» → «одиннадцатое сентября две тысячи двадцать шестого года»).
   - Сохранены правила произношения аббревиатуры АРК и склонения температур.
2. **Task Management: Честный ответ и Fuzzy Matching (Блок B)**:
   - В `TaskManagementTool` для `list_tasks`: при пустом списке возвращается явное сообщение `{ success: true, message: 'Список задач пуст, всего 0 активных задач', tasks: [], total: 0 }`.
   - В `delete_task`: реализован нечувствительный к регистру fuzzy matching по подстроке. Если задача не найдена, возвращается список доступных задач для озвучивания LLM пользователю. При наличии нескольких совпадений без точного запрашивается уточнение.
   - В `prompt-builder.ts`, `tools-utils.ts`, `openai.provider.ts`, `ollama.provider.ts` внедрено строгое системное правило `TASK_SYSTEM_PROMPT_RULE`, категорически запрещающее модели придумывать несуществующие задачи.
3. **Устранение флуда логов 3D-реактора (`[Reactor Telemetry 2Hz]`)**:
   - Удалены высокочастотные `console.log` телеметрии 2 Гц из `reactor-state-driver.ts`.
   - В `useSysLogs.ts` добавлен фильтр перехвата сообщений `[Reactor Telemetry`, исключающий появление этих строк в системном логе.
4. **Финальное устранение критических багов голосового тракта (`useVoice.ts`)**:
   - **Gratitude closer**: перенесен на абсолютный верх `handleTranscriptionResult` перед фантом-фильтром и barge-in. Выводит `Voice: Closed by gratitude closer`, полностью исключает `Ignored phantom command: "спасибо"`.
   - **VAD-гейт 15s**: таймер 15s активируется строго после подтверждения речи VAD и текста > 0. При тишине буфер сбрасывается тихо без спама `Forcing transcription`.
   - **AudioContext Guard**: безопасное закрытие и обнуление всех контекстов (`useVoice`, `useAudioManager`, `useMicTest`, `STTSection`) без риска `InvalidStateError`.
   - **Stop-word Debounce**: вызов `handleStopWordAction` ограничен дебаунсом в 1000 мс.
   - **Wake-word Filter**: обнаружение триггера ограничено первыми тремя словами (индексы 0..2) с фильтром отрицаний.

## 3. Известные проблемы (Known Issues)

1. **Audio Buffer Retain (WeakRef)** — *[plan for v1.0.1]*: Длительные сессии микрофона требуют регулярного вызова сборщика мусора для аудио-буферов. Нагрузочный soak-тест за 30 минут удерживает рост RSS в пределах 7 МБ. Временный воркараунд: перезапуск приложения раз в 3–5 дней.
2. **Barge-in (Прерывание голосом)** — *[Решено]*: Внедрён 500ms debounce, безопасное закрытие AudioContext и точное срабатывание только на изолированные стоп-слова.
3. **Fallback-DB Replication** — *[plan for v1.0.1]*: Автоматическая фоновая синхронизация данных из in-memory хранилища в SQLite при разблокировке файла БД сторонними процессами.
4. **Виджеты** — *[Решено]*: Сетка выравнивания (magnetic grid) скорректирована до 8px. Внедрен безопасный отступ `TOP_SAFE_MARGIN` (44px при нижней панели / 88px при верхней панели), исключающий заезд виджетов под `TitleBar` и `TabBar`. Реализован свободный захват перемещения со всего корпуса `HudWidgetShell` с защитой интерактивных элементов (кнопок, инпутов), авто-коррекция координат в `localStorage`, повышение z-index слоя виджетов до `z-35` и поднятие активного виджета до `z-60` при драге.

---

## Реализовано в v1.0.1-b3 / v1.0.1-b4 (Архитектурный рефакторинг Task Management: Workspace Left + Command HUD Right)
1. **Архитектура рабочей области и иерархия**:
   - Устранена перегруженная структура «панель в панели».
   - Шапка `TaskHeaderBar.vue` очищена от избыточного sci-fi шума («STATUS // TASK_OPERATIONS_DESK», «PROJECTION // ACTIVE»), переведена на спокойную системную типографику с кнопкой вызова аналитики и мини-индикатором завершения `SummaryMeter`.
   - Пропорция разделения скорректирована до 75% рабочей области (col-span-9) и 25% командного HUD (col-span-3).
2. **Консолидация панели инструментов (`TaskConsole.vue`)**:
   - Три разрозненные панели (режимы отображения, ввод задачи, фильтры/поиск) объединены в единый целостный `Workspace Toolbar`.
   - Кнопки шаблонов («Аудит», «Рефакторинг», «Бэкап») перенесены в выпадающее меню `Шаблоны ▾`, экономя вертикальное пространство.
   - Поле ввода задачи сделано доминантным (`size="md"`), второстепенные параметры (дедлайн, категория, повтор) скрыты под кнопку параметров.
3. **Компактная панель фильтров (`SearchFiltersPanel.vue`)**:
   - Бесшовно интегрирована в нижнюю часть `Workspace Toolbar` без вложенных рамок.
   - Добавлена поддержка фильтра `no_due` («Без срока») для быстрой ликвидации узких мест.
4. **Карточки задач (`TaskItem.vue`, `TaskBadgeContainer.vue`)**:
   - Снижена высота карточек, уменьшен uppercase, убран визуальный шум.
   - Для рекомендованной фокус-задачи добавлена подсветка и кнопка прямого перехода в спринт «ФОКУС».
   - Цвет сохранен только для функциональных состояний (P1/Critical, дедлайны, статус выполнения).
5. **Командный HUD и узкие места (`TaskTelemetry.vue`, `TaskAnalyticsModal.vue`)**:
   - Боковая колонка переведена в лаконичный «Командный HUD»: в топе — блок «СЛЕДУЮЩЕЕ ДЕЙСТВИЕ» с таймером и кнопкой фокуса.
   - Блок «УЗКИЕ МЕСТА» снабжен кнопкой быстрого решения («ИСПРАВИТЬ»), фильтрующей задачи без дедлайна.
   - Вся тяжелая аналитика (распределение приоритетов, категорий, детальные затраты времени) вынесена в отдельное модальное окно `TaskAnalyticsModal`.

---

## Реализовано в v1.0.1-b5 (Пакет калибровки голосового тракта и вежливого ответа)
1. **Вежливый ответ и сохранение прослушивания (Gratitude Closer & Audio Persistence)**:
   - В `commands.registry.ts` из команды благодарности (`isGratitudeCommand`) исключено событие `arc:stop-audio`, приводившее к отключению микрофона (`stopListening()`).
   - Теперь благодарность вызывает только `arc:clear-dialogue-window` для закрытия окна диалога и озвучивает вежливый ответ ассистента («Рад помочь, сэр.», «Не за что, сэр.», «Всегда рад, сэр.») через синтез речи `uiStore.speak(...)`.
   - Микрофон остаётся активным в фоне для мгновенного приёма последующего wake-word («Арк, ...»).
2. **Защита от спама логов 15s таймера (VAD-gate Timer)**:
   - В `useVoice.ts` таймер 15 секунд монолога жестко проверяет наличие реального текста `isSpeakingVAD.value === true && currentPartial.length > 0`.
   - В тишине или при фоновом шуме буфер очищается полностью бесшумно без вывода строк `Forcing transcription`.

---

## 4. Quality Gates (Контроль качества)

- **Команда проверки**: `npm run gate` (lint → test → build → check-sizes).
- **Тесты (Vitest)**: 306/306 тестов успешно пройдены (52 test suites).
- **Линтинг (TypeScript)**: `tsc --noEmit` — 0 ошибок.
- **Лимиты файлов**: Логика ≤ 400 строк, конфиги ≤ 800 строк (`npm run check-sizes`).
- **Soak-тест**: Прирост RSS за 30 мин: +6.87 МБ (порог ≤ 200 МБ).
-e 
## Исправления v1.0.1-b6 (LLM Tool Hallucination & Stop Word)
1. **LLM Tool Hallucination**: Инструмент парсинга markdown (sanitizeRawContent) теперь удаляет все строковые вызовы (TOOL: ... { ... }) и их незавершенные хвосты перед выводом в чат, полностью устраняя проблему видимости этих вызовов у пользователя при стриминге. В openai.provider.ts для follow-up запросов отправляется только текст до вызова, чтобы предотвратить повторный вызов инструмента моделью.
2. **Voice Stop Word**: Исправлено физическое переименование "стоп" в "пауза" в словарях useVoice.ts. Расширен regex в stop-command.ts для команд "выключи" и "закрой".

## Исправления v1.0.1-b7 (Weather Pre-routing & Duplicate Logs)
1. **Weather Tool Dispatching Flow**: Исправлен механизм вызова инструмента get_weather. Теперь после предварительной маршрутизации в `ai.router.ts`, система не обрывает контекст, а инжектирует виртуальный вызов инструмента (`role: 'assistant', tool_calls: [...]`) и его результат (`role: 'tool'`) напрямую в историю сообщений (`context`), перекладывая ответственность за форматирование ответа на LLM.
2. **Duplicate PRE-ROUTED Logs**: Устранено дублирование логов `[ToolDispatcher] PRE-ROUTED: get_weather` в консоли путем удаления избыточного вызова `logger.info`, оставлен только `console.log` согласно тестам.

## Фичи v1.0.2-a1 (Live/Cache Badges)
1. **Chat UI Badges**: Под сообщениями AI теперь рендерятся визуальные бейджи статуса ответа (Live 🟢 или Cache ⚡).
2. **IPC Meta Delivery**: В `ai.ipc.ts` и `useChat.ts` добавлена поддержка объекта `meta` (`provider`, `latency`, `isCache`), который отправляется в конце генерации `ai:chunk` и сохраняется в истории.
3. **Graceful Degradation**: Старые сообщения или сообщения без метаданных не ломают UI. 

## Фичи v1.0.2-a2 (Full Source Badges)
1. **Source Type Extension**: В тип `meta` добавлено поле `source: 'live' | 'cache' | 'local'`, которое явно определяет природу ответа.
2. **Local Responses**: Локальные ответы (перехват макросов классификатором до отправки к LLM, локальные системные ошибки, ответы при отсутствии связи) теперь получают бейдж "локально" (серая точка).
3. **Old History Label**: Сообщения без метаданных (старые сессии) теперь рендерят серый прочерк с тултипом "Создано до введения бейджей", исключая визуальные дыры под сообщениями.
## Фичи v1.0.2-a3 (Redesign Badges, Persona & Dicts)
1. **Redesign Badges**: Бейджи перенесены внутрь MessageBubble (в правый нижний угол) и получили дизайн pills (фон bg-white/5, рамка, иконки Lucide: Activity, Zap, Cpu). Старый прочерк для сообщений без meta удален.
2. **Dict Update**: В омографы tts_dict_homographs.json добавлено слово "здорово" (зд+орово) и написан селф-тест в silero_server.py.
3. **Persona Mutation**: Изменены системные промпты OpenAI и Ollama, а также локальные шаблоны: запрещена конструкция "готов" + глагол. Теперь ARC предлагает конкретное действие "Что найти, собрать или проверить?".

## Фичи v1.0.2-a5 (Редизайн футера пузыря, верификация и закрытие пакета)
1. **Бейджи и футер сообщений (Minimal Dark Design)**:
   - Полностью устранены аляповатые цветные плашки с эмодзи (`📚 Wikipedia`, `🌐 Web Search`, `🧠 Память`). Они заменены на элегантные монохромные бейджи с аккуратными векторными иконками Lucide (`BookOpen`, `Globe`, `Sparkles`) в фирменном стиле Glassmorphism (`bg-white/[0.04] border border-white/10 text-white/70`).
   - Источники тулов и мета-информация объединены в единую нижнюю строку (footer row) с тонким разделителем `border-t border-white/[0.06]`.
   - Исключена пустая/одинокая плашка «локально» для локальных ответов и системных приветствий.
   - Имена провайдеров (например, `openrouter/free`) нормализуются до чистого названия (`OpenRouter`).
2. **TTS-нормализация чисел, дат и величин**: В `silero_number_converter.py` и `silero_text_prep.py` реализована полная нормализация дат (напр., «14 февраля» → «четырнадцатого февраля»), величин («2,5 млрд» → «два с половиной миллиарда», с поддержкой родительного падежа после «более/около»), порядковых годов («2005 года» → «две тысячи пятого года») и уточнены regex версий, исключая коллизии с десятичными дробями. Все тесты в `test_tts_normalization.py` успешно пройдены (100% OK).
3. **Честный чип провайдера и тихий retry**: Ошибки `ERR_SOCKET_HANG_UP` / `ECONNRESET` на первом запросе теперь обрабатываются тихим повтором («повтор...») без ложного окрашивания чипа в красный цвет и без преждевременного перевода провайдера в статус сбоя. При переключении на фоллбэк отображается промежуточный статус «→ <новое_имя>». Красный статус выводится строго при исчерпании всех попыток и недоступности ответа.

## Фичи v1.0.2-b1 (Компонент MessageFooter, компактные бейджи без пустоты)
1. **Вынос MessageFooter.vue**:
   - Реализован отдельный компонент `src/renderer/features/chat/components/MessageFooter.vue` (129 строк).
   - Размер `MessageBubble.vue` сокращен с 391 до 318 строк, снят риск превышения лимита 400 строк.
2. **Устранение пустоты и отвалившегося куска**:
   - Устранена длинная разделительная линия `border-t`, разрезавшая карточку сообщения на две половины.
   - Мета-бейдж больше не отбрасывается в дальний правый угол через пустое пространство: чипы (`Wikipedia`, `Поиск`, `Память`) и мета-бейдж располагаются в едином компактном flex-ряду прямо под текстом ответа (`mt-2.5 flex items-center flex-wrap gap-2`).
3. **Восстановление бейджа для локальных ответов**:
   - Исправлена ошибка отсутствия бейджа на приветствиях и локальных ответах: для `source === 'local'` отображается аккуратный бейдж `[ 💻 локально ]` в едином Glassmorphism-стиле (`bg-white/[0.04] border border-white/10 text-white/50`).
   - Для сетевых ответов отображается чип `[ 📈 6.2 s · OpenRouter ]` с иконкой `Activity`, для кэша — `[ ⚡ 12 ms · кэш ]` с иконкой `Zap`.
4. **Вежливый голосовой ответ на благодарность (Gratitude Closer с TTS-ответом)**:
   - При словах благодарности («спасибо», «спасибо большое», «благодарю» и др.) A.R.C. теперь не уходит в глухое молчание, а вежливо отвечает («Рад помочь, сэр.», «Всегда к вашим услугам, сэр.», «Обращайтесь, сэр.», «Не за что, сэр. Всегда на связи.»).
   - Сохранено ключевое поведение: активное 15-секундное диалоговое окно закрывается (`arc:clear-dialogue-window`), ассистент прекращает слушать микрофон, но озвучивает ответ через TTS и выводит его в диалог с локальным бейджем.
   - Реализованы рандомизированные генераторы фраз на русском и английском языках (`generateGratitudeResponse`, `createGratitudeAssistantMessage`). Покрыто юнит-тестами.

## Фичи v1.0.2-c2 (Стабильность STT, Circuit Breaker Guard и Gratitude UI)
1. **Sherpa STT Circuit Breaker Guard**:
   - Краши `Invalid n: -1664` в Circular Buffer внутри Sherpa-ONNX Worker'а больше не убивают пайплайн. Вместо падения воркера реализован сброс буфера (flush) через IPC команду `reset_buffer`.
   - В `stt.service.ts` добавлен счётчик `consecutiveBufferResets` — при 3 сбросах в течение 30 секунд происходит штатный fallback на Whisper (floor engine) без обрыва слушания и 100% потери слуха.
2. **STT Service Exit Logic**:
   - Исправлена логика счётчика крашей в `stt.service.ts`: сигналы `SIGTERM` (плановые завершения при рестартах) теперь помечаются через `intentionalRestart=true` и больше не считаются ошибками, не провоцируя ложные отключения источника (circuit breaker trip).
3. **Gratitude Closer UI Refinement**:
   - Вежливая фраза ("Всегда к вашим услугам, сэр") больше не приводит к переоткрытию 15-секундного диалогового окна по завершении TTS (`arc:tts-finish`).
   - Добавлен флаг `isGratitudeClosing=true`, предотвращающий возобновление диалога и удерживающий систему в состоянии `IDLE`, в то же время сохраняя активным фоновое прослушивание wake-word.
4. **Бесшовная остановка TTS (Stop Word)**:
   - Проверено и подтверждено поведение стоп-слова ("стоп", "хватит"): корректно прерывается синтез речи (TTS) и закрывается активное окно, функция `stopListening()` не вызывается. Распознавание wake-word не блокируется, позволяя пользователю немедленно возобновить диалог.
5. **Тихие повторы и скрытие Red Toasts**:
   - Сетевые ошибки типа `ERR_SOCKET_HANG_UP` и `ERR_CANCELED` включены в список безопасных ретраев (silent retry) в `request-executor.ts`.
   - Если один из этих сбоев возникает, система незаметно делает повтор, не бросая исключений и не провоцируя появление отвлекающих красных тостов об ошибке соединения в UI при успешном ретрае.
6. **Исправление потери Meta-string (Provider Name)**:
   - Восстановлена сериализация и десериализация метаданных сообщений (поля `msg.meta` с `provider`, `latency`, `isCache`) в IndexedDB через `chat.store.ts`.
   - Бейджи и футер под сообщениями снова корректно отображают строку "N s · OpenRouter", "N ms · кэш" или "локально" после загрузки из базы данных и в момент получения.

## Фичи v1.0.2-c3 (STT Heartbeat Recovery & Robust Worker Lifecycle)
1. **Heartbeat Timeout 15s**:
   - Порог таймаута heartbeat воркера в `stt.service.ts` увеличен с 5000ms до 15000ms, исключая ложные рестарты при обработке длинных монологов.
   - Добавлено логирование `[STT] Heartbeat timeout (15s), attempting reset_buffer first`.
2. **Pre-kill Recovery (`reset_buffer` Graceful Fallback)**:
   - Перед жестким завершением процесса (`SIGTERM`) отправляется команда `reset_buffer` с пингом.
   - Ожидание ответа составляет 3 секунды: если воркер отвечает `pong`, флаг восстановления сбрасывается и принудительный kill отменяется.
   - Принудительный рестарт через `SIGTERM` происходит только в случае, если воркер не ответил после `reset_buffer`.
3. **Post-restart Initialization & Ready Signal**:
   - После создания воркера отправляется команда `init` и устанавливается таймаут ожидания `worker-ready` / `init_result` (10 секунд).
   - Поддерживаются сигналы готовности `init_result` и `worker-ready` в `stt_worker.js` и `stt.service.ts` с явным логированием успешного запуска или таймаута.
   - Устранена регрессия в тестах команд благодарности (исключен лишний `stopTTS` при обработке感謝).

## Бэклог v1.0.3

### 14. Стандартизация боковых консолей (Side Docks Standardization — v1.0.2-c6)
- **Симметричная сетка боковых консолей (Left Dock & Right Dock)**:
  - Левая колонка (Система и Пайплайн): `ReactorTechnicalHUD` (вверху: `{ x: 24, y: 64 }`) и `AssistantActionTimeline` (внизу: `{ x: 24, y: 100, isBottom: true }`).
  - Правая колонка (Интеллект и Медиа): `SmartRouterDiagram` (вверху: `{ x: 24, y: 64, isRight: true }`) и `MusicCapsuleWidget` (внизу: `{ x: 24, y: 100, isBottom: true, isRight: true }`).
  - Диагностика: `FpsOverlay` откалиброван с отступом от правого края (`{ x: 360, y: 64, isRight: true }`), предотвращая наложение на ключевые контролы.
- **Изоляция и предотвращение конфликтов слоев (Download Dock)**:
  - `DownloadNotificationDock` смещен на `bottom-28 right-6`, исключая перекрытие панели воспроизведения музыкальной капсулы в моменты скачивания или инференса моделей.
- **Версионирование координат (v8)**:
  - Ключ сохранения координат виджетов в `useDraggableWidget.ts` обновлен до `arc_widget_v8_`.
  - В `settings.store.ts` добавлена очистка ключей `arc_widget_v8_` при сбросе расположения в настройках.

### 15. Редизайн HUD-виджетов и ликвидация визуального шума (v1.0.3-hud)
- **Левая колонка**:
  - `ReactorTechnicalHUD`: монолитные сплошные полосы заменены на сегментированные неоновые LED-шкалы (12 сегментов) с цветовой градацией (циан / янтарь / роза), добавлен пульсирующий маркер модели и переработаны нижние экшн-кнопки (стеклянные чипы с индикацией активности профайлера).
  - `AssistantActionTimeline`: увеличены узлы шагов (32x32 rounded-xl), внедрен анимированный лазерный трек прогресса соединения узлов в зависимости от текущего шага выполнения, пинг-кольцо на активном узле, статусная консоль в стиле терминала.
- **Правая колонка**:
  - `MusicCapsuleWidget`: заголовок лаконично стандартизирован в «МЕДИАХАБ» (без дублирования статуса оффлайн/онлайн в тексте, так как статус отображается в бейдже), кнопка Play/Pause переведена из сплошного белого круга в полупрозрачную неоновую стеклянную капсулу (`bg-white/10` + `shadow-[0_0_16px_rgba(255,255,255,0.12)]`).
  - `SmartRouterDiagram`: заголовок сокращен до «УМНЫЙ РОУТЕР», микро-пайплайн шагов переведен в аккуратный графический маршрут с иконками (`MessageSquare` → `Brain` → `GitBranch`).
- **Разгрузка экрана и предотвращение клиппинга**:
  - Пресеты `minimal` и `standard` теперь по умолчанию отключают плавающий `showFpsOverlay: false`, так как полная телеметрия FPS и времени кадра уже органично встроена в `ReactorTechnicalHUD`.
  - Ликвидировано назойливое всплывающее окно «Аудит производительности» (`showStartupAlert`), которое перекрывало правую половину экрана и блокировало обзор виджетов медиахаба и роутера.
  - В `AssistantActionTimeline` добавлена кнопка «ТЕСТ» и кликабельность узлов для демонстрации живой анимации лазерного прогресс-трека и смены состояний.
  - `TabItem.vue`: оптимизированы отступы (`px-2.5 gap-1.5`), исключая наслоение и случайное усечение текста на экранах стандартного разрешения.

### 16. Модульная система док-панелей и единый дизайн виджетов (v1.0.3-dock)
- **Архитектура модульной сетки (Modular Dock Grid)**:
  - Реализованы левая и правая выдвижные/скрываемые док-панели (`w-[340px]`, `overflow-y-auto no-scrollbar`, строго унифицированный вертикальный интервал `gap-2.5`).
  - Логическая группировка виджетов:
    - **Левая панель (Рабочий поток и действия)**: «МЕДИАХАБ» (`MusicCapsuleWidget`), «ТАЙМЛАЙН ДЕЙСТВИЙ» (`AssistantActionTimeline`), «УМНЫЙ РОУТЕР» (`SmartRouterDiagram`).
    - **Правая панель (Системная телеметрия и производительность)**: «ТЕХНИЧЕСКИЙ HUD» (`ReactorTechnicalHUD`), «FPS МОНИТОР» (`FpsOverlay`), «ПРОФАЙЛЕР» (`PerformanceProfiler`). Профайлер и FPS объединены в единую зону мониторинга.
  - Управление раскладкой: боковые язычки-кнопки для сворачивания/разворачивания (`toggleLeftDock`, `toggleRightDock`), а также нижний микро-бар быстрого доступа: режим «ЧИСТЫЙ ЦЕНТР» (мгновенно убирает обе панели, освобождая 3D-реактор) и переключение между док-сеткой и свободным режимом перемещения (`dock` / `float`).
- **Глассморфизм и визуальная иерархия (HudWidgetShell)**:
  - Увеличен контраст подложки (`bg-[#0e0f13]/94 backdrop-blur-2xl`), устранены резкие разнородные границы, усилена мягкая глубина теней.
  - Единый стандарт заголовка для всех 6 виджетов: монохромная иконка в стеклянном контейнере, четкий заголовок, стандартизированные цветные бейджи состояния и кнопка сворачивания в компактный режим.
- **Точечная переработка виджетов**:
  - **AssistantActionTimeline**: Уменьшены габариты узлов и кнопок, статус приведен к нейтральному системному виду без ложного красного или зеленого свечения в простое.
  - **SmartRouterDiagram**: Устранен конфликт статусов (слово «Offline» зеленого цвета заменено на нейтральное «Без интернета / Приватно»). Добавлены явные радио-селекторы и индикация выбранного маршрута (Локально / Облако / Авто).
  - **MusicCapsuleWidget**: Увеличены кнопки управления воспроизведением (`Play/Pause` до `44px`, `Prev/Next` до `36px`), кнопки стали тактильными и комфортными для клика.
  - **FpsOverlay & PerformanceProfiler**:
    - Порог предупреждения FPS скорректирован (26 FPS больше не окрашивается в тревожный красный цвет — нормальный диапазон отображается янтарным/белым, красный зарезервирован строго для реальных критических просадок < 20 FPS).
    - На график частоты кадров добавлена шкала времени (последние 60 секунд: `-60s`, `-30s`, `NOW`).
    - В «Профайлере» установлена строгая иерархия: главные метрики (FPS, время кадра) выделены крупно (`text-3xl font-black`), второстепенная телеметрия (Draw Calls, частицы, Three.js тик, Vue UI) переведена в компактный серый приглушенный шрифт.

### 17. Полное объединение виджетов производительности и финальная полировка UI/UX (v1.0.4-refine)
- **Объединение «FPS Монитор» и «Профайлер» в единый виджет «ПРОИЗВОДИТЕЛЬНОСТЬ» (`PerformanceProfiler.vue`)**:
  - Устранено дублирование счетчиков кадров и графиков: виджет объединяет крупный заголовок частоты кадров (`text-3xl font-black`), время кадра (мс) и интерактивный 60-секундный график на базе HTML5 Canvas со шкалой мин/макс.
  - Второстепенная техническая телеметрия (Draw Calls, 3D-частицы, Canvas DPR, Three.js тик, время рендера Vue UI) компактно спрятана под плавный аккордеон-спойлер «ТЕХНИЧЕСКИЕ ДАННЫЕ».
  - Доступно мгновенное переключение пресетов графики (Низкое, Среднее, Высокое) и кнопка «ОЧИСТИТЬ КЭШ» Three.js.
  - В `WidgetsLayer.vue` правая док-панель избавлена от лишней плашки, представляя чистую пару: «ТЕХНИЧЕСКИЙ HUD» + «ПРОИЗВОДИТЕЛЬНОСТЬ».
- **Нижняя навигация и командная консоль (`BottomBar.vue` & `TabItem.vue`)**:
  - Поле ввода «Говорите с A.R.C...» стало доминирующим центром нижней панели: увеличена высота (h-12 в контейнере h-16), закругление `rounded-2xl`, плотный глубокий фон `#141414` с мягкой тенью и выразительной неоновой рамкой с акцентным свечением при фокусе.
  - В `TabItem.vue` поднят контраст неактивных иконок (`text-white/85`), благодаря чему вкладки нижней панели легко считываются на темном фоне без визуального растворения.
- **Центральная зона и фон реактора (`SpaceBackground.vue` & `WidgetsLayer.vue`)**:
  - Тонкая инженерная координатная сетка настроена на читаемую плотность (6–8% непрозрачности) с мягкой радиальной виньеткой по краям.
  - Кнопки быстрого управления раскладкой («ЧИСТЫЙ ЦЕНТР» и «СВОБОДНЫЙ») оформлены в единую полупрозрачную стеклянную капсулу-таблетку с четким выделением активного состояния.
- **Таймлайн действий (`AssistantActionTimeline.vue`)**:
  - Увеличены зоны клика узлов шагов (`w-8 h-8 rounded-lg`), оптимизированы вертикальные отступы и статусная строка.

### 18. Калибровка цвета верхней панели TitleBar и центрирование 3D-реактора (v1.0.5-align)
- **Унификация цвета верхней панели (`TitleBar.vue`)**:
  - Устранен мутный серо-сизый оттенок `rgba(6, 6, 8, 0.75)` с размытием, создававший инородную серую полосу на фоне глубокого черного космоса.
  - Верхняя полоса переведена на глубокий чистый черный цвет (`background-color: #000000`) с тонкой нижней гранью (`border-bottom: 1px solid rgba(255, 255, 255, 0.08)`) и мягкой глубиной тени.
  - Полоса теперь безупречно сливается с общим космическим фоном и оконной рамкой приложения без цветовых артефактов.
- **Безопасное смещение 3D-реактора вниз (`ReactorCore.vue` & `useCommandCenter.ts`)**:
  - Центр 3D-ядра скорректирован с `y = windowHeight * 0.42` до гармоничного `y = windowHeight * 0.47`.
  - Верхний поршень/шток реактора больше не упирается вплотную в верхнюю панель управления: зазор между TitleBar и верхом реактора увеличен более чем на 50px (до комфортных ~90px).
  - Смещение полностью безопасно и автоматически синхронизировано со всеми слоями: Three.js геометрия реактора, системы частиц, 3D-освещение и невидимый интерактивный хитбокс клика (`coreStyle`) позиционируются строго синхронно в рамках единого реактивного `coreCenter`.

### 19. Синхронизация визуальных акцентов с глобальной темой и компактный масштаб командного дока (v1.0.6-theme-scale)
- **Тотальная синхронизация с темой оформления**:
  - Все хардкодные циановые и разнородные цветные акценты в оверлеях и командных элементах переведены на системные CSS-переменные активной темы оформления (`var(--accent-color)`, `var(--accent-text)`, `var(--accent-border)`, `var(--accent-glow)`, `var(--accent-bg-alpha)`).
  - `VoiceQuickPanel`: индикатор готовности STT-модели синхронизирован с акцентным цветом темы вместо фиксированного циана.
  - `BottomBar`: неоновая рамка фокуса ввода, световая аура под полем, пульсирующее кольцо активности микрофона, индикаторы записи и кнопка ENTER теперь гармонично принимают выбранный пользователем оттенок (красный, синий, янтарный, изумрудный, фиолетовый).
  - `TitleBar` & `ReactorTechnicalHUD`: бейджи и индикаторы состояния «СЛУШАЮ» / «ГОЛОС» синхронизированы с общей цветовой гаммой.
- **Оптимизация высоты и эргономики поля «Говорите...» (`BottomBar.vue`)**:
  - Общая высота строки уменьшена с избыточных 64px (`h-16`) до аккуратных 44–48px (`h-11 sm:h-12`).
  - Высота внутреннего поля ввода уменьшена с 48px (`h-12`) до компактных 36px (`h-9`), максимальная ширина скорректирована с `max-w-2xl` до эргономичной `max-w-xl`.
  - Кнопка микрофона и кнопка отправки ENTER приведены к аккуратному минималистичному размеру без визуальной громоздкости.
- **Масштаб и позиционирование командного дока (`CommandCenter.vue`)**:
  - Ширина панели уменьшена с 920px до более компактных 820px (`w-[820px] max-w-[calc(100%-48px)]`).
  - Уменьшен радиус скругления с громоздкого `rounded-2xl` до чистого `rounded-xl`.
  - Нижний отступ скорректирован до `bottom-5` (20px), обеспечивая гармоничное соотношение с общим свободным пространством экрана.
- **Исключение наслоения элементов (`WidgetsLayer.vue`)**:
  - Микро-капсула управления раскладкой («ЧИСТЫЙ ЦЕНТР» / «СВОБОДНЫЙ») перенесена на верхнюю панель (`TitleBar.vue`), освобождая центр экрана и исключая перекрытие поля ввода.





### 20. Истинное стекло Arc Glassmorphism, стабильность каталога LLM и адаптация голосового тракта ВК (v1.0.7-glass-voice)
- **Истинное стекло модальных окон (`ArcModal.vue`)**:
  - Полный отказ от плотного глухого фона `bg-black/85` в пользу настоящего полупрозрачного стекла `bg-[#070709]/65 backdrop-blur-2xl` с мягкой подсветкой и тонкой границей `border-white/10`.
  - Фон подложки облегчен с непроницаемого `bg-black/40 backdrop-blur-2xl` до невесомой дымки `bg-black/30 backdrop-blur-sm`. Сквозь модальные окна теперь отчетливо видны 3D-реактор, звездное поле и глубина пространства.
- **Стабилизация каталога моделей и FreeLLMAPI (`PresetCatalog.vue`, `provider.api.ts`)**:
  - Устранен паразитный автопинг при каждом открытии окна каталога, исключены сетевые спам-ошибки `ERR_SSL_UNRECOGNIZED_NAME_ALERT` и `ERR_NETWORK_CHANGED` в консоли.
  - Сетевой пинг переведен в режим проверки строго по явному клику пользователя на кнопку «Сетевой пинг».
  - Разрешена валидация и прямое тестирование бесплатных провайдеров (`FreeLLMAPI`, `AI Horde`, `freeTier`) без принудительного требования ввода API-ключа.
- **Устойчивость распознавания речи и команд ВК (`useVoice.ts`, `media-classifier.ts`, `stop-command.ts`)**:
  - В словарь валидных вейк-токенов интегрированы созвучия и искажения Whisper STT: «орг», «харк», «орк», дефисные и раздельные произношения «а р к», «а-р-к».
  - Внедрена нормализация медиа-команд: корректная обработка пробельных разбиений («в ключи» → «включи»), специфических искажений («музыкого k» / «музыку в ак» → «музыку вк», «трак» → «трек»).
  - Команды воспроизведения музыки ВКонтакте моментально передаются в активный плеер ВК без сбоев и лишних переспросов LLM.

### 21. Гармонизация контрастности командной строки ввода (`BottomBar.vue`)
- **Устранение избыточной контрастности и плотности**:
  - Сплошной тяжелый черный блок `bg-[#101012]/90` заменен на воздушное полупрозрачное стекло `bg-black/35 backdrop-blur-xl` с тонкой едва заметной границей `border-white/[0.08]`.
  - При фокусе ввода агрессивный неон и плотная заливка `bg-[#151518]/95` переведены на мягкий матовый стеклянный фон `bg-black/55 backdrop-blur-2xl border-white/20` с деликатной подсветкой.
  - Форма строки приведена к капсуле `rounded-full` в соответствии с UI Theme Guidelines, иконка микрофона и кнопка отправки гармонично вписаны в парящий стиль.

### 22. Портативное хранилище данных и функция «Сброс системы» (Portable Storage Mode & Reset)
- **Изоляция всех данных в папке приложения (`StorageManagerService`)**:
  - Все пользовательские данные перенаправлены из скрытых системных папок `%APPDATA%` в локальную структуру каталогов прямо внутри папки с программой (`data/`):
    - `data/database/arc.db` — база данных SQLite (сессии, сообщения, память LTM, цели, задачи).
    - `data/config/` — файлы конфигурации провайдеров и настроек (`ai-providers.json`).
    - `data/models/` — загруженные локальные GGUF-модели (с автоматической плавной миграцией старых моделей).
    - `data/macros/` — сохраненные пользовательские макросы.
    - `data/cache/` — временный кэш и сессионные данные Chromium.
  - При удалении папки с программой абсолютно все файлы и настройки пользователя удаляются без остатка в системе. При желании удалить отдельные модули (например, только диалоги) пользователь может просто очистить соответствующую подпапку.
- **Функция «Сброс системы» в настройках (`SystemResourcesSection.vue`)**:
  - В секцию «Система» добавлен блок «Хранилище данных» с кнопкой «Открыть папку» для быстрого перехода к папке `data/`.
  - Реализована кнопка «Сброс данных...» с безопасным модальным окном подтверждения `ArcModal` в стиле Glassmorphism.
  - Функция закрывает открытые дескрипторы SQLite, программно очищает файлы базы данных, кэш, сохраненные настройки, а также старые остаточные папки в `%APPDATA%/a.r.c` и `%APPDATA%/A.R.C`, после чего автоматически перезапускает приложение через `app.relaunch()` в чистом первоначальном состоянии.
  - Предусмотрена опция выборочного сохранения или удаления скачанных тяжелых локальных нейросетей (GGUF).



### 23. Оптимизация производительности: Очистка продакшена от дебаг-артефактов (v1.0.2-d2)
- **Исключение Profiler'ов из production-сборки (`PerformanceProfiler.vue`, `FpsOverlay.vue`)**:
  - Компоненты мониторинга обернуты в условие `import.meta.env.DEV`, предотвращающее рендеринг и запуск `setInterval`/`requestAnimationFrame` в релизной версии.
- **Минимизация влияния таймеров в фоне (`MusicCapsuleWidget.vue`)**:
  - `setInterval(..., 100)` заменен на `requestAnimationFrame` с программным троттлингом (100мс), что синхронизирует обновления с циклом отрисовки монитора и устраняет микро-лаги при обновлениях UI плеера.
- **Очистка от необоснованных Composite Layers (GPU)**:
  - Удален хак `transform: translateZ(0)` из глобального класса `.glass-panel` (экономия VRAM и времени композитинга).
  - В `VoiceQuickPanel.vue` убрано динамическое назначение `will-change: transform` через JS-события, провоцирующее layout trashing на 9 независимых барах эквалайзера.
  - В виджетах (`useDraggableWidget.ts`) `transform: translate3d` заменен на `translate`, а `willChange: transform` применяется **только** в момент перетаскивания `isDragging`, возвращаясь в `auto` при бездействии.
- **Метрики 3D (`reactor-materials.ts`, `useReactor3D.ts`)**:
  - Добавлено логирование размеров процедурных CanvasTexture (brushedMetalMap, carbonFiberMap и др.) в режиме разработки для контроля потребления памяти.
  - Подтвержден вызов `dispose()` для геометрии и материалов при демонтировании компонента реактора.
- **Документация**:
  - Создан файл `docs/profiling-guide.md` с корректной методологией снятия FPS и Audio trace-ов (отключение/включение JS Samples).

### 24. Оптимизация производительности: Устранение Allocation Churn и Layout Thrashing (v1.0.2-d3)
- **Устранение Layout Thrashing (`MusicCapsuleWidget.vue`)**:
  - Компоненту назначен CSS-класс с правилом `contain: layout style paint`, что изолирует его перерисовки от остального DOM-дерева.
  - Троттлинг в функции `tick` (rAF) усилен до 33 мс (30 FPS), и инкремент локального времени (`localCurrentTime.value`) откорректирован до 0.033 сек. Это исключило тяжелые и частые пересчеты (до 150 элементов) в основном потоке (`UpdateLayoutTree`).
- **Устранение Allocation Churn (`useAudioManager.ts`, `eco.store.ts`)**:
  - В методе `getFrequencyBands` устранен возврат новых объектов `{ bass, mid, treble, total }` в каждом кадре. Реализовано переиспользование закэшированных структур `reusableBandsTts` и `reusableBandsMic`, что предотвратило быстрый рост мусора в памяти (Heap Churn) и тяжелые `MajorGC` циклы.
  - В хранилище энергосбережения `eco.store.ts` для обработчика событий `handleActivityFn` (MouseMove, Scroll и др.) добавлен троттлинг на уровне 100 мс (для предотвращения избыточных вызовов функции и снижения нагрузки).
- **Снижение издержек на HitTest (`global.css`)**:
  - На глобальный Canvas-визуализатор (`canvas.visualization`) установлено свойство `pointer-events: none;`, что предотвращает вызовы дорогостоящих расчетов `HitTest` при движениях курсора.

### 25. Оптимизация производительности: Устранение критических утечек памяти и GPU (v1.0.2-d4)
- **Утечка GPU (17 MB -> 134 MB)**:
  - В `useReactor3D.ts` добавлен полноценный каскадный `dispose()` для всех текстур (map, envMap, alphaMap, emissiveMap, normalMap, roughnessMap, metalnessMap) внутри материалов, а не только для самих материалов. Добавлено логирование `[GPU] Disposed material: UUID`.
  - Добавлен `dispose()` для `bloomPass` в `reactor-postfx.ts`, чтобы очищать скрытые Render Targets, создаваемые библиотекой Three.js.
- **Утечка Heap в AudioWorklet (21 MB/min)**:
  - В `useVoice.ts` (и `capture-worklet.js`) убрано создание новых `Float32Array` на каждом цикле `process`. Вместо этого данные записываются в предварительно выделенный `reusableBuffer`, предотвращая монотонный рост мусора и тяжелые циклы Major GC в основном потоке.
- **Canvas Dirty-Rect Optimization (Layer 119)**:
  - В `SpaceBackground.vue` (Canvas-визуализатор частиц) добавлено отслеживание `dirtyRect`. Теперь функция `clearRect` очищает не весь экран 15 раз в секунду, а только bounding box движущихся частиц.
- **Устранение Microtask Storm (Vue Transitions)**:
  - В `VoiceQuickPanel.vue` и `MusicCapsuleWidget.vue` удалены CSS-транзиции для свойства `transform` у элементов эквалайзера. Это устранило лавину событий `transitionend`, которые засоряли цикл микрозадач при каждом аудио-тике.

### 26. Дожим оптимизаций производительности (v1.0.2-d5)
- **Умная остановка tick-цикла (`MusicCapsuleWidget.vue`)**:
  - Метод `tick`, отвечавший за прогресс-бар медиаплеера, теперь полностью останавливает `requestAnimationFrame`, когда плеер поставлен на паузу, окно потеряло фокус или виджет находится вне зоны видимости (с помощью `IntersectionObserver`). В состоянии простоя количество событий `FireAnimationFrame` сведено к нулю.
- **Искоренение `transition-all` (Layout Thrashing)**:
  - Проведен глобальный рефакторинг CSS-классов анимации: `transition-all` заменен на `transition` (комбинация `opacity, color, transform, shadow`). Это предотвращает интерполяцию свойств, влияющих на геометрию DOM (ширина, высота, отступы), и снижает время пересчета `UpdateLayoutTree` при ховере с 3.7 мс до <1 мс.
- **Троттлинг событий активности (`eco.store.ts`)**:
  - В `handleActivityFn` заменен устаревший троттлинг на базе `Date.now()` на коалесцинг через `requestAnimationFrame` (флаг `pending`). Теперь события мыши/скролла гарантированно вызывают не более одной функции агрегации на кадр, предотвращая перегрузку Event Loop.
- **VRAM Canvas-визуализатора (`SpaceBackground.vue`)**:
  - Инициализация `canvas.getContext('2d')` дополнена ключами `{ alpha: false, preserveDrawingBuffer: false }`, что ускоряет растеризацию.
  - Введено ограничение плотности пикселей (`devicePixelRatio`) максимумом 1.5, чтобы избежать выделения огромных буферов на 4K-мониторах.
  - При потере фокуса (blur) визуализатор не только останавливается, но и полностью закрашивается черным фоном (`ctx.fillRect`), избавляя от сохранения грязных буферов.

### 27. Исправление перекрытия кнопок TabBar (UX)
- В `TabItem.vue` удалён псевдоэлемент `::before` (с отрицательным `inset` и высоким `z-10`), который использовался для визуального увеличения области клика. Из-за этого псевдоэлемента зоны клика соседних кнопок накладывались друг на друга (Layout Overlap), блокируя правильное нажатие на табы. Теперь кнопки используют честный padding.
- Добавлено явное наследование `pointer-events-auto` и повышенный `z-index` (50) для контейнеров Glass Dock в `CommandCenter.vue` и `global-tabbar` в `TabBar.vue`, что полностью исключает перекрытие их другими невидимыми слоями (например, `WidgetsLayer` или `SpaceBackground`).

### 17. Фоновый режим сбережения ресурсов (Background Eco / Stealth Mode) (v1.0.2-d6)
- **Унификация названия и терминологии (P1)**: Концепция «GameMode» полностью унифицирована и обобщена в «Фоновый эко-режим» (Background Eco / Stealth Mode), так как режим предназначен не только для игр, но и для любой ресурсоёмкой работы (рендеринг, 3D-моделирование, разработка, видеомонтаж и т.д.). В `TitleBar.vue` индикатор обновлён на лаконичный «Фоновый эко-режим» (⚡), а в настройках `LocalAISection.vue` тумблер переименован в «Облачные API в фоновом режиме (Энергосбережение)». Добавлена обратная совместимость настроек (`cloudLlmInBackgroundEco` / `cloudLlmInGameMode`).
- **Снятие глушения STT в фоне (P0 Fix)**: Устранена блокировка прослушивания wake-word при потере фокуса окна (blur / минимизация / запуск игры). В `useVoice.ts` удалён вызов `stopListening()` из обработчика `handleVoiceBlur`. Теперь при включенном микрофоне голосовой ассистент продолжает непрерывно и надёжно слушать wake-word («Арк», «A.R.C.») в фоне. В `src/main/index.ts` установлено `backgroundThrottling: false`, гарантирующее отсутствие зависаний и пропусков аудио-буферов Chromium в свёрнутом или перекрытом состоянии.
- **Фоновый цикл выполнения (STT -> LLM -> TTS)**: При распознавании wake-word в фоновом режиме голосовая команда обрабатывается полностью в фоне: STT (GigaAM/Whisper) распознаёт речь, `ai.router.ts` маршрутизирует запрос в облачные API (OpenRouter) для исключения нагрузки на локальный GPU/CPU, а Silero TTS воспроизводит голосовой ответ через аудиосистему без визуального пробуждения 3D-реактора (GPU 0%).
- **Smart Focus Throttling (P0)**: В `useReactor3D.ts` сохранён полный сброс анимационного цикла ThreeJS при скрытии/потере фокуса для устранения GPU context switching.
- **Микрофонный баг**: Иконка микрофона внутри кнопки на BottomBar переведена в `pointer-events-none`, теперь кнопка всегда отрабатывает клик.

### 28. Нормализация URL эндпоинтов LLM и устранение ошибки "HTML вместо JSON API" (v1.0.2-d7)
- **Централизованный резолвер эндпоинтов (`endpoint-normalizer.ts`)**:
  - Создан специализированный сервис `resolveChatEndpoint` и `resolveModelsEndpoint`, преобразующий любые варианты пользовательского ввода (базовый хост `http://127.0.0.1:31415`, префикс с версией `/v1`, либо полный путь `/v1/chat/completions`) в строго валидный URL для чата и получения моделей.
  - Устранена ручная и хрупкая замена подстрок вида `.replace('/chat/completions', '/models')`, которая ломалась на кастомных адресах и приводила к запросу корня веб-сервера (возвращавшему HTML-страницу приветствия вместо JSON API).
- **Сквозная интеграция резолвера**:
  - `provider.api.ts`: Проверка связи `testConnection` и получение списка доступных моделей `getAvailableModels` используют нормализованные адреса. Добавлен динамический поиск моделей перед пингом и раздельная диагностика (проверка API-ключа через `/models` и тестовый запрос к модели).
  - `openai.provider.ts`: Все вызовы потокового и непотокового чата, а также обработка инструментов (`handleToolExecution`) направляются на канонический `chatUrl`.
  - `prompt-builder.ts` и `intent-classifier.ts`: Вспомогательные запросы классификации и предобработки промптов обновлены для использования `resolveChatEndpoint`.
  - `mock-database.ts`: Веб-превью синхронизировано с логикой нормализации адреса.
- **UI и пресет FreeLLMAPI**:
  - Порт по умолчанию для FreeLLMAPI обновлен на стандартный `31415` (`http://127.0.0.1:31415/v1/chat/completions`), установлена актуальная модель `dots-studio/dots-3-note-preview:free`.
  - В `ProviderCard.vue` добавлен автокорректор `@blur="normalizeInputEndpoint"`, который при потере фокуса с поля ввода автоматически подставляет недостающий сегмент `/v1/chat/completions` для локальных портов и адресов с `/v1`.

### 29. Защита от утечки системного промпта и корректная обработка отмены запросов (v1.0.7)
- **Искоренение роботизированного самопредставления («Я мужского пола, говорю уверенно, уважительно и профессионально»)**:
  - **Проблема**: При вопросе «Кто ты?» небольшие открытые модели (Qwen, Llama 3, Mistral) в FreeLLMAPI буквально пересказывали системные директивы из промпта («Я — A.R.C., интеллектуальный ассистент и цифровой напарник. Я мужского пола, говорю уверенно, уважительно и профессионально, помогая с информацией, задачами и системными действиями. Чем могу быть полезен?»).
  - **Архитектурное разделение (`buildAssistantSystemPrompt` в `prompt-builder.ts`)**: Базовая декларация роли отделена от служебных мета-правил. Все ограничения (грамматика, тон, запрет канцелярита) вынесены в явный изолированный блок `[СЛУЖЕБНЫЕ ПРАВИЛА — СТРОГО НЕ ЦИТИРОВАТЬ И НЕ ПЕРЕСКАЗЫВАТЬ ПОЛЬЗОВАТЕЛЮ]` с инструкцией отвечать на вопрос «Кто ты?» коротко и своими словами. Реализована поддержка пользовательского промпта (`customSystemPrompt` из `settings.systemPrompt`). Функция подключена в `openai.provider.ts` и `ollama.provider.ts`.
  - **Санитайзинг утечек (`thinking-cleaner.ts`)**: В `stripThinkingProcess` добавлен пост-фильтр, гарантированно вырезающий любые остаточные фразы-утечки («Я мужского пола...», «говорю уверенно, уважительно и профессионально»), превращая ответ в лаконичное и чистое приветствие. Поведение зафиксировано тестами в `thinking-cleaner.test.ts`.
- **Корректная обработка жизненного цикла запросов (`request-executor.ts`)**:
  - **Проблема**: При скрытии окна приложения или смене вкладки `EcoService` переводит окно в `hidden` и абортирует активный HTTP-запрос (`ERR_CANCELED`). Ранее код ошибочно классифицировал `ERR_CANCELED` как `isSocketHangUp` и запускал повторную отправку (silent retry), которая висела по таймауту 10 секунд и спамила логами.
  - **Решение**: Проверка отмены запроса (`abortController.signal.aborted`, `err.code === 'ERR_CANCELED'`, `CanceledError`) вынесена на самый верх блока обработки ошибок: отменённый запрос мгновенно завершается без ложных предупреждений, без повторных сетевых вызовов и без ложного карантина провайдера.

### 30. Архитектурная ревизия UX/UI: Параметры системы → Интеллект → AI Провайдеры (v1.0.8)
- **Устранение избыточной вложенности (Card-in-Card Elimination)**:
  - Проведена строгая декомпозиция правой части панели настроек AI-провайдеров (`ProvidersSection.vue`, `ProviderCard.vue`, `ProviderModelCatalog.vue`).
  - Ликвидированы многослойные рамки и вложенные карточные контейнеры. Разделение сущностей и визуальных слоев переведено на систему **spacing + typography + hairline separators (`border-white/5`)**.
- **Четкая 4-уровневая визуальная иерархия**:
  - **Уровень 1 (Заголовок раздела)**: Единый монолитный заголовок «AI ПРОВАЙДЕРЫ» с кратким системным описанием и кнопками глобальных действий («+ ДОБАВИТЬ», «ИСТОРИЯ РОУТИНГА», «GOOGLE GEMINI API»).
  - **Уровень 2 (Блок оркестрации)**: Единый плоский HUD-блок «ОРКЕСТРАЦИЯ И МАРШРУТИЗАЦИЯ ИИ», объединяющий переключатели параллельного стриминга (`parallelStreaming`), умного кэширования (`smartCacheEnabled`) и кнопку полного сброса всех карантинов.
  - **Уровень 3 (Список провайдеров и Активный шлюз)**:
    - Выделена зона «АКТИВНЫЙ ШЛЮЗ (ACTIVE RUNTIME)» с крупным отображением имени рабочего провайдера, выбранной модели, стратегии маршрутизации и бейджа статуса.
    - Каталог провайдеров («ЗАРЕГИСТРИРОВАННЫЕ ШЛЮЗЫ») представлен в виде плоских системных карточек-узлов. В свернутом состоянии карточка формирует компактную строку сводки: название, статус (ГОТОВ / КАРАНТИН / ОФФЛАЙН), эндпоинт, выбранная модель, лимиты токенов, температура и быстрая кнопка проверки связи («ТЕСТ»).
  - **Уровень 4 (Детали и параметры шлюза)**:
    - Раскрывающаяся консоль внутри карточки отделена тонким разделителем, без вложенных карточек.
    - Включает переключатель эксклюзивного режима, управление API-ключом с индикатором аппаратного шифрования (safeStorage), бейдж синхронизации моделей, каталог моделей (`ProviderModelCatalog.vue`) с поиском и мультивыбором, а также плоскую сетку параметров эндпоинта и приоритетов.
- **Соблюдение лимита размера файлов (Правило 400 строк)**:
  - Все затронутые компоненты (`ProvidersSection.vue` — 363 строки, `ProviderCard.vue` — 331 строка, `ProviderModelCatalog.vue` — 331 строка, `GeminiKeyModal.vue` — 395 строк) строго соответствуют лимиту модульности.

### 31. Вторая итерация UX-композиции: Параметры системы → Общие (v1.0.9)
- **Ликвидация растянутых плоских списков и переход к 2-колоночной сетке рабочей области**:
  - Устранено растяжение одиночных контролов на всю ширину экрана (100% width stretch), устранены пустоты между подписями и кнопками.
  - Применен строгий модульный паттерн: каждая функциональная сущность представлена сбалансированным блоком в 2-колоночной (`grid grid-cols-1 md:grid-cols-2`) или 3-колоночной сетке с тонкой окантовкой (`border-white/5`), полупрозрачным фоном (`bg-white/[0.02]`) и гармоничным внутренним ритмом.
- **Рефакторинг ключевых секций**:
  1. **QuickCoreSection.vue**: Переведен на 2-колоночную HUD-полосу параметров быстрого ядра (режим озвучки, VAD, фоновое прослушивание, запуск со стартом ОС).
  2. **AppearanceSection.vue**: Сформирован визуальный якорь на цветовой палитре темы A.R.C. RED, физические параметры 3D-реактора сгруппированы в симметричную 2-колоночную сетку слайдеров и переключателей.
  3. **WidgetControlsSection.vue**: Структурирован в командную деку с пресетами, блокировкой и сбросом компоновки, блоком атмосферного затемнения и плоской 2-колоночной матрицей всех 5 системных виджетов.
  4. **TabNavigationSection.vue**: Позиция навигационной панели и кнопка управления закрепленными вкладками объединены в компактную верхнюю деку, сетка быстрого доступа переведена в упорядоченный чиповый вид.
  5. **SystemResourcesSection.vue**: Разделен на 2-колоночную деку производительности (эко-режим, работа в фоне, слайдер WebGL, авто-FPS) и 3-колоночную сервисную панель управления хранилищем `data/`, журналами CSP и безопасным сбросом системы.
  6. **HotkeysSection.vue & VkIntegrationsSection.vue**: Приведены к единому стандарту с collapsible-секциями, моноширинными кейкапами и компактными деками параметров.
### 32. Модернизация универсального переключателя ArcToggle.vue (v1.0.10)
- **Плавные анимации и пружинные переходы**:
  - Добавлена кинематика `transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]` для направляющей (track) и ползунка (thumb).
  - Тактильная обратная связь при нажатии (`active:scale-95`).
  - При включении активное свечение в стиле A.R.C. RED (`bg-[var(--accent-color,#ef4444)] shadow-[0_0_12px_rgba(239,68,68,0.45)]`).
  - В выключенном состоянии: глубокий полупрозрачный цинковый трек с внутренней глубиной (`bg-zinc-800/90 border border-white/10 hover:border-white/25 shadow-inner`).
- **Расширяемость и опциональная разметка**:
  - Поддержка размеров (`size: 'sm' | 'md' | 'lg'`).
  - Поддержка состояний `disabled` и `loading` со встроенным спиннером в ползунке.
  - Опциональные пропсы `label` и `description` или слот по умолчанию для декларативного создания строки настройки без ручной верстки контейнера.
  - Полная доступность: `role="switch"`, `aria-checked`, управление с клавиатуры (`Space`, `Enter`), фокусное кольцо `focus-visible:ring-2`.
  - 100% обратная совместимость со всеми существующими экранами настроек и секциями.
- **Соблюдение лимита модульности**:
  - `ArcToggle.vue` занимает 146 строк (строго в пределах правила 400 строк). Сборка `npm run build` проходит без ошибок.

### 34. Устранение рассинхронизации палитр и фиолетовых артефактов (v1.0.12)
- **Причина возникновения**:
  - Рассинхронизация идентификаторов палитр между `QuickCoreSection.vue` (`['red', 'amber', 'cyan', 'purple', 'emerald']`) и каноническим реестром `THEME_PALETTES` (`['gold', 'blue', 'red', 'purple', 'green']`). Выбор невалидных ключей вызывал `undefined` и срыв CSS-переменных.
  - Реактивный вотчер темы находился в невызываемом composable `useAppRoot.ts`, из-за чего изменения `settingsStore.reactorColorTheme` не обновляли CSS-переменные корня (`--accent`, `--accent-rgb`, `--core-glow`, `--accent-glow`).
- **Внесённые изменения**:
  - В `QuickCoreSection.vue` палитра унифицирована с `AppearanceSection.vue` и приведена к каноническим идентификаторам: `gold` (Янтарный), `blue` (Плазменный бирюзовый), `red` (Критический красный), `purple` (Фиолетовый), `green` (Изумрудный).
  - В корневой компонент `App.vue` добавлен немедленный реактивный вотчер `settingsStore.reactorColorTheme`, синхронизирующий токены `:root` (`--accent`, `--color-accent`, `--accent-rgb`, `--accent-glow`, `--core-glow`) с реестром `THEME_PALETTES` и фиксирующий применение темы через `recordThemeApplied`.
- **Верификация**:
  - `npm run check-visual-constitution` — PASSED (0 дельты долга, счетчики в baseline).
  - `npx vitest run` — 26 файлов тестов (159 тестов) успешно пройдены.
  - `npm run lint` и `compile_applet` — успешно.

### 35. Доусиление Задачи 1.1 (SQLite WAL Staging & Whitelist) и Задача 1.2 — Честная политика секретов (`safeStorage` / DPAPI)
- **Доусиление Задачи 1.1 (`P0-1`)**:
  - **Двухфазный эксклюзивный staging-захват (`quarantineWalTriplet`)**: Перед копированием и хешированием существующие файлы WAL-тройки (`arc.db`, `arc.db-wal`, `arc.db-shm`) атомарно переименовываются через `renameSync` во временные имена `.quarantine-staging`. При старте карантина `cleanupOrRollbackOrphanedStaging()` проверяет осиротевшие `.quarantine-staging` от возможных прошлых аварийных сбоев (если основной файл отсутствует — откатывает staging в основной файл; если основной есть — удаляет осиротевший staging). При `EBUSY`/`EPERM` или любой ошибке копирования/SHA-256 выполняется полный откат переименованных staging-файлов и переход в `DB_SAFE_MODE` без удаления пользовательских данных.
  - **Строгий Read-Only Whitelist в `DB_SAFE_MODE` (`isReadOnlySql`)**: Вместо blacklist-проверки префикса внедрён строгий белый список: очищаются SQL-комментарии (`--` и `/*...*/`), разрешены только запросы `SELECT`, `WITH ... SELECT`, `EXPLAIN` и не-мутирующий `PRAGMA` (без `=`), при полном запрете ключевых слов модификации (`INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `DROP`, `ALTER`, `CREATE`, `ATTACH`, `DETACH`, `VACUUM`, `REINDEX`, `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`) в любой части запроса (включая CTE `WITH ... INSERT` и `.get('INSERT ... RETURNING *')`). `JSONStatement.run()` в `DB_SAFE_MODE` блокируется безусловно.
  - **Пост-стартовый опрос статуса БД и безопасности в `App.vue`**: После снятия splash-экрана (`isAppReady === true`) выполняется одноразовый вызов `window.api.getDbStatus()` с защитным флагом `hasShownStartupIntegrityToast` для гарантированного показа тостов о `DB_SAFE_MODE`, карантине или `session_memory_only` / нечитаемых DPAPI-ключах.
- **Задача 1.2 (`P0-2`: `SecretVaultService` и отказ от скрытого plaintext-фолбэка)**:
  - **Единый `SecretVaultService` (`src/main/services/security/secret-vault.service.ts`)**: Все секреты консолидированы в `userData/secrets.json` со схемой `schemaVersion: 2` (`entries[key] = { encrypted: true, ciphertextBase64, updatedAt }`). Запись открытых или `base64`-кодированных секретов на диск полностью исключена.
  - **Честный режим `session_memory_only`**: Если `safeStorage.isEncryptionAvailable() === false`, секреты хранятся исключительно в оперативной памяти текущего процесса (`Map<string, string>`) и никогда не записываются на диск, а пользователь получает явное предупреждение (`ui:show-toast`).
  - **Одноразовая миграция `v1 → v2`**: При старте приложения устаревшие записи `encrypted: false` в `secrets.json` и ключи с префиксами `enc:` / `b64:` / открытым текстом из `ai-providers.json` автоматически мигрируются в `SecretVaultService` (перезашифровываются через DPAPI при доступном `safeStorage` либо переносятся в RAM сессии с очисткой открытых данных с диска).
  - **Маскирование секретов для Renderer (`MASKED_SECRET_PLACEHOLDER`)**: `ProviderManager.getProviders()` возвращает `apiKey: '••••••••••••••••'`, `hasApiKey: true` и `apiKeyStatus`, исключая передачу реальных API-ключей в renderer-процесс; все облачные вызовы (`openai.provider.ts`, `provider.api.ts`, `ai.router.ts`, `intent-classifier.ts`, `prompt-builder.ts`, `system-classifier.ts`, `ai.ipc.ts`, `transcription.ipc.ts`) разрешают ключи внутри main-процесса через `secretVault.resolveProviderApiKey()` и `secretVault.resolveGeminiApiKey()`.

### 36. Пост-аудит Settings UX/UI: Раздел «Интеллект», `ArcSelect`, ленивая загрузка `SettingsPanel`, черновик инспектора и реактивный карантин
- **P1 3.1 — Отложенная загрузка `SettingsPanel.vue`**: В обоих контейнерах `HolographicProjectionPanel.vue` (`src/renderer/components/HolographicProjectionPanel.vue` и `src/renderer/layouts/components/HolographicProjectionPanel.vue`) статический импорт `SettingsPanel` заменён на `defineResilientAsyncView(() => import('../../features/settings/components/SettingsPanel.vue'))`. При сборке `SettingsPanel` выделяется в отдельный ленивый чанк и не инициализируется до переключения на вкладку `'settings'`.
- **P1 3.2 — Сохранение типов значений в `ArcSelect.vue`**: В `src/renderer/components/ui/ArcSelect.vue` привязка `<select>` и `<option>` переведена на строковый индекс элемента в массиве `options` с поиском через `Object.is(o.value, props.modelValue)`. Компонент сохраняет исходные JS-типы (`number`, `boolean`, `string`), эмитит типизированные события `update:modelValue` и `change` (без передачи нативного DOM `Event`), а при несовпадении значения уходит в безопасный fallback `-1` (placeholder без авто-эмита первой опции). Защищённый `useMacroEditor.ts` не изменялся.
- **P1 3.3 — Честный статус локального контура в `RoutingSection.vue`**: В `useLocalAIEngine.ts` добавлены модульные сессионные флаги `hasProbedBuiltin` и `hasProbedOllama` и read-only аксессор `getLocalEngineSessionState()` (без запуска `onMounted`-опросов диска или Ollama из `RoutingSection`). Единая чистая функция `getLocalContourStatus` в `ai-status.ts` различает состояния: `ВЫКЛЮЧЕН`, `ВКЛЮЧЕН В КОНФИГУРАЦИИ` (до реального зондирования), `НЕТ ВЕСОВ` / `OLLAMA ОФЛАЙН`, `ВЕСА ГОТОВЫ` / `СЕРВЕР ОНЛАЙН` и `ПРОВЕРЕН (GGUF)` / `ПРОВЕРЕН (OLLAMA)`.
- **P1 3.4 — Семантические контролы и клавиатурная доступность в `ProvidersSection.vue`**: Устранена вложенность `<button>` внутрь `<div role="button">`. Строка списка провайдеров оформлена как `<div role="listitem">` с двумя соседними нативными кнопками `<button type="button">` (переключатель ротации `enabled` и выбор шлюза для инспектора) с `aria-pressed`, `aria-label` и `focus-visible`.
- **P2 4.1 — Точечный таймер истечения карантина (`useQuarantineWatch`)**: В `useProviderInspectorDraft.ts` реализован реактивный `nowTick` и одиночный `setTimeout` до ближайшего `quarantineUntil`. По истечении срока вызывается `aiStore.refreshQuarantine()` и таймер автоматически перепланируется на следующий карантинный шлюз.
- **P2 4.2 — Единый жизненный цикл черновика инспектора (`useProviderInspectorDraft`)**: Все правки в инспекторе провайдера (`ProviderCard.vue`, `ProviderModelCatalog.vue`, `ProviderRoutingStrategy.vue`, `ProviderParamsGrid.vue`) изолированы в локальном черновике (`clean → dirty → saving → saved → error`) и сохраняются по кнопке в шапке инспектора. Поле `enabled` не входит в черновик и синхронизируется из актуального состояния стора при сохранении (включая переключение `enabled` во время активного `saving`). Нетронутый `MASKED_SECRET_PLACEHOLDER` (`'••••••••••••••••'`) сохраняет существующий ключ в `SecretVaultService`. При переключении между шлюзами с несохранёнными правками отображается матовая плашка подтверждения (`Сохранить и перейти` / `Сбросить правки` / `Остаться`).
- **P2 4.3 — 7 состояний статуса провайдера в списке (`getProviderListStatus`)**: Реестр шлюзов различает `КАРАНТИН`, `ОТКЛ`, `ТЕСТ...`, `ОШИБКА`, `НЕ НАСТРОЕН`, `НЕ ПРОВЕРЕН` (в инспекторе — `НАСТРОЕН · НЕ ПРОВЕРЕН`, без ложного `'ГОТОВ'`) и `ПОДТВЕРЖДЁН` (только при совпадении отпечатка сохранённой конфигурации с успешным тестом связи).
