# Глобальный аудит A.R.C. и Дорожная карта до Release Ready (v1.0) — Редакция 2.0 (Validated)

> **Документ**: `docs/PROJECT_RELEASE_ROADMAP.md` (синхронизировано с ревью второго прохода `docs/PROJECT_RELEASE_ROADMAP_REVIEW.md`)  
> **Объект аудита**: **A.R.C. (Autonomous Reactor Core)** — локально-ориентированная Windows/Electron AI-среда вокруг живого 3D-Реактора  
> **Версия кодовой базы**: `1.0.0` (ветка `main`, 495 файлов в `src/**`, ~63 975 строк кода)  
> **Принцип приоритизации**: `Целостность данных и безопасность → Работоспособность установщика и ИИ → Голосовой контур и устранение бутафории → Оптимизация на основе замеров → Расширение функциональности`  
> **Статус защищённых зон**: 3D-Реактор (`src/renderer/components/reactor/**`, `ReactorCore.vue`, `useReactor3D.ts`), `useVoice.ts`, `built-in-llm.service.ts`, `useMacroEditor.ts`, `ObjectiveEngine.ts`, а также UI-пространства `Chat` и `Tasks` соблюдаются согласно `AGENTS.md` Раздел 3 и **не подвергаются непрошеному рефакторингу ради формальных метрик размера файла**.  
> **Синхронизация Release Hardening (21.11.2026, `v1.0.12 RC`):** исторический снимок блокеров ниже сохранён как исходный baseline аудита `v1.0.0`. Все кодовые, архитектурные, security, voice/model, DB-migration, CI/packaging, SBOM (`CycloneDX 1.5`) и repository-hygiene задачи гейтов **G1–G7** реализованы и проверены в Linux (`ARC_RELEASE_HARDENING_TZ.md`, Sprint 0–4 + §§9–11, `npm run gate` зелёный). **Gate G8 (живые прогоны на Windows 10/11 — soak, upgrade/DPAPI, Clean OS, UX-матрица, подпись артефактов `UNSIGNED` и release sign-off)** остаётся **`NOT RUN`** и выполняется по `docs/WINDOWS-RELEASE-QA-PROTOCOL.md`.

---

## A. Executive Summary

### 1. Реальное текущее состояние A.R.C.

По результатам двухпроходного инструментального и кодового аудита **A.R.C. обладает зрелым архитектурным ядром и богатой функциональностью в среде разработки, однако ещё не готов к публичному распространению среди конечных пользователей (Статус: Functional Beta — Blocked by Packaging & Data Safety Gates)**.

Оценка готовности больше не выражается произвольным «процентом готовности», поскольку наличие хотя бы одного критического блокера (потеря БД или неработающий инсталлятор) делает выпуск невозможным. Вместо этого зрелость оценивается по **8 обязательным релизным гейтам (Release Gates G1–G8)**:

| Код гейта | Область контроля | Текущий статус | Краткое обоснование по коду |
| :--- | :--- | :--- | :--- |
| **G1** | **Ядро 3D-Реактора и Визуальная Конституция** | **ГОТОВО (PASS)** | `ReactorCore.vue` и `useReactor3D.ts` стабильны, поддерживают WebGL context recovery и Eco/Game Mode; `check-visual-constitution.js` проходит (остаток Фазы 6 — 19 литералов акцента). |
| **G2** | **Целостность данных и отказоустойчивость БД** | **БЛОКЕР (FAIL)** | Удаление `arc.db` без бэкапа (включая риск удаления при `SQLITE_BUSY`) в `database.ts:418-433`, тихий переход на неполноценный `JSONDatabase`, неатомарный `saveAllTasks` и гонка перезаписи `UI ↔ AI` в `tasks.service.ts:91-136`. |
| **G3** | **Упаковка Windows-дистрибутива и логирование** | **БЛОКЕР (FAIL)** | В `package.json` отсутствуют `silero_server.py` в `extraResources` и `node-llama-cpp` в `asarUnpack`; `DialogLogger` (`dialog-logger.ts:23-31`) пытается писать логи внутрь read-only архива `app.asar`. |
| **G4** | **Стабильность AI-провайдеров и ключей** | **БЛОКЕР (FAIL)** | В `ai.ipc.ts:357` ключ провайдера передаётся в `GoogleGenAI` в зашифрованном виде (`enc:...`) без `decryptApiKey`; `transcription.ipc.ts:123` игнорирует настройки пользователя и ищет только `process.env.GEMINI_API_KEY`; в `ollama.provider.ts:62` отключён стриминг. |
| **G5** | **Голосовой контур (STT / TTS)** | **ТРЕБУЕТ ДОРАБОТКИ** | STT (`stt_worker.js`) надёжен, но `PythonServerService` требует системный Python/FFmpeg и обрывает `pip install` через 30 с (`python_server.service.ts:93`), а `silero_server.py:25-31` не ищет модель в `resources/models/silero-v5`. |
| **G6** | **Достоверность UI и отсутствие заглушек** | **ТРЕБУЕТ ДОРАБОТКИ** | В `system.ipc.ts:196-198` захардкожены `42°C`/`46°C`; в `ObjectiveEngine.ts:754` и `useAiDecomp.ts:15` — шаблонные заглушки вместо ИИ; в `ModulesView.vue:259` — 5 кнопок ведут на несуществующие вкладки; в `launcher.ipc.ts:60` — `setTimeout` вместо индексации. |
| **G7** | **Первый запуск (Onboarding) и самодиагностика** | **НЕ РЕАЛИЗОВАНО** | Отсутствует мастер первого запуска (выбор Cloud/Local, тест микрофона, профиль графики) и функция экспорта обезличенного диагностического отчёта. |
| **G8** | **Чистый Windows QA, лицензии и обновления** | **НЕ ПРОВЕРЕНО** | Требуется проверка установщика на чистой Windows 10/11 без Python/Node/FFmpeg, аудит лицензий моделей (`v5_5_ru.pt` CC-BY-NC-SA 4.0) и проверка миграций при обновлении версии. |

### 2. Главные проблемы, блокирующие статус Release Ready

1. **Риск безвозвратной потери пользовательских данных (`G2`)**:
   - В `src/main/services/database.ts:409-436` (`createOrRecoverSqliteDatabase`) блок `catch (err)` перехватывает **любую** ошибку (не только коррупцию, но и временную блокировку файла `SQLITE_BUSY` / `EBUSY`) и немедленно удаляет `arc.db`, `arc.db-wal`, `arc.db-shm` через `fs.unlinkSync` без сохранения резервной копии.
   - При ошибке загрузки нативного `better-sqlite3` система молча переключается на `JSONDatabase` (`arc_fallback.json`), который парсит SQL регулярными выражениями (`database.ts:147-327`) и не поддерживает `JOIN`, `FTS5`, сложные условия `objectives`/`decisions`, показывая пользователю пустую память и историю.
   - В `tasks.service.ts:91-136` и `tasks.store.ts:122-136` используется полная перезапись таблицы (`DELETE FROM arc_tasks` + цикл `INSERT`) без транзакции и без единого источника истины: любое изменение в UI перезаписывает задачи, только что добавленные ИИ-инструментом `TaskManagementTool`.

2. **Неработоспособность отдельных подсистем в собранном `.exe` (`G3`, `G5`)**:
   - В `package.json` (`build.extraResources`) не включены `silero_server.py`, `silero_text_prep.py`, `requirements-silero.txt`; в `build.asarUnpack` отсутствует `node-llama-cpp`.
   - `DialogLogger` (`src/main/services/dialog-logger.ts:23-31`) вычисляет путь логов через `path.join(app.getAppPath(), 'logs', 'dialogs', 'dialogs.log')`. В упакованном приложении `app.getAppPath()` указывает внутрь read-only архива `app.asar`, что вызывает ошибку файловой системы при логировании диалогов.
   - `silero_server.py:25-31` не проверяет путь `resources/models/silero-v5/v5_5_ru.pt` (куда `electron-builder` кладёт модель по `package.json:126-129`), а `PythonServerService` требует системного Python/FFmpeg и запускает `pip install` с таймаутом 30 секунд (`python_server.service.ts:93`).

3. **Дефекты работы с ключами и моделями в мультимодальных IPC-вызовах (`G4`)**:
   - В `src/main/ipc/ai.ipc.ts:355-358` (`ai:analyze-vision`) при чтении ключа из `aiService.getProviders()` возвращается зашифрованная строка (`enc:...` или `b64:...`), которая передаётся напрямую в `new GoogleGenAI({ apiKey })` **без вызова `decryptApiKey()`**.
   - В `src/main/ipc/transcription.ipc.ts:123` (`transcription:transcribe-gemini`) ключ берётся исключительно из `process.env.GEMINI_API_KEY`, полностью игнорируя ключи, сохранённые пользователем в настройках A.R.C.
   - Идентификаторы моделей для Vision и Transcription захардкожены (`gemini-3.5-flash` в `ai.ipc.ts:375` и `transcription.ipc.ts:141`) отдельно от настроек провайдера пользователя (`provider-manager.ts:85`).

4. **Разрыв между UI и фактической реализацией отдельных функций (`G6`)**:
   - Захардкоженные температуры `42°C`/`46°C` в `system.ipc.ts:196-198`; англоязычные константы вместо ИИ в `ObjectiveEngine.decomposeObjective` (`ObjectiveEngine.ts:754-767`); имитация ИИ через `setTimeout(1200)` в `useAiDecomp.ts:15-51`; 5 тупиковых кнопок в `ModulesView.vue:259-263`; фейковая индексация в `launcher.ipc.ts:60-63`; глобальный перехват `console.log/warn/error` без очистки в `useTranscription.ts:89-100`.

### 3. Сильные стороны проекта (на что опираться)

- **Архитектурно зрелый 3D-Реактор (`ReactorCore.vue`, `useReactor3D.ts`)**: защищённая зона с поддержкой восстановления WebGL-контекста, 3-полосной FFT-реактивностью и автоматической остановкой рендера в `hidden` / при открытии полноэкранных рабочих пространств.
- **Строгая Визуальная Конституция v3.4 (`tokens.css`, `check-visual-constitution.js`)**: автоматизированный контроль поверхностей, запрета блюра над холстом и типографики.
- **Отказоустойчивый STT-воркер (`stt.service.ts`, `scripts/stt_worker.js`)**: изолированный процесс с пред-буфером 350 мс, Silero VAD, каскадом GigaAM CTC → Whisper Small int8 и защитой от переполнения кольцевого буфера.
- **Проработанный контур безопасности терминальных команд (`shell-approval.service.ts`, `ApprovalDialog.vue`)** и файловой песочницы (`files.service.ts`).

---

## B. Карта проекта

### 1. Архитектура и технологический стек

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                         RENDERER PROCESS (Vue 3.5 + Pinia + Vite)                 │
│                                                                                   │
│  ┌──────────────────────┐   ┌──────────────────────────────────────────────────┐  │
│  │   3D REACTOR CORE    │   │         HOLOGRAPHIC PROJECTION WORKSPACES        │  │
│  │  (PROTECTED AREA)    │   │  Chat │ Tasks │ Objectives │ Memory │ Commands   │  │
│  │  Three.js / WebGL    │   │  Files │ Vision │ Transcription │ Modules │ Set. │  │
│  └──────────┬───────────┘   └────────────────────────┬─────────────────────────┘  │
│             │                                        │                            │
│  ┌──────────┴────────────────────────────────────────┴─────────────────────────┐  │
│  │        Pinia Stores (settings, ui, eco, performance, chat, tasks, memory)   │  │
│  │        Composables (useVoice [VoiceFSM], useChat, useAudioManager)          │  │
│  └──────────────────────────────────────┬──────────────────────────────────────┘  │
└─────────────────────────────────────────┼─────────────────────────────────────────┘
                                          │ window.api (Preload ContextBridge)
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           MAIN PROCESS (Electron 41 / Node.js)                    │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                     16 IPC Modules (src/main/ipc/*.ipc.ts)                  │  │
│  └──────┬──────────────────┬───────────────────┬───────────────────┬───────────┘  │
│         ▼                  ▼                   ▼                   ▼              │
│  ┌──────────────┐  ┌───────────────┐   ┌───────────────┐   ┌───────────────────┐  │
│  │  AI Router   │  │ Voice Engine  │   │ Cognitive DB  │   │ System & Security │  │
│  │ - OpenRouter │  │ - STTService  │   │ - SQLite WAL  │   │ - ShellApproval   │  │
│  │ - Gemini     │  │ - TTSService  │   │ - FTS5 Search │   │ - MacroExecutor   │  │
│  │ - Ollama     │  │ - PythonSrv   │   │ - LTM Vectors │   │ - Files Sandbox   │  │
│  │ - BuiltInLLM │  │ - WhisperSrv  │   │ - Tasks/Obj.  │   │ - StorageManager  │  │
│  └──────┬───────┘  └───────┬───────┘   └───────┬───────┘   └───────────────────┘  │
└─────────┼──────────────────┼───────────────────┼──────────────────────────────────┘
          │                  │                   │
          ▼                  ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ node-llama-cpp   │ │ Child Processes: │ │ userData/arc.db  │
│ Local GGUF /     │ │ 1. stt_worker.js │ │ config/*.json    │
│ Cloud REST APIs  │ │ 2. silero_server │ │ models/*         │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### 2. Карта покрытия аудита (Проверено vs Требует натурного стенда Windows)

- **Проверено напрямую по исходному коду и автотестами**:
  - Все 16 IPC-модулей (`src/main/ipc/*.ts`), `src/main/index.ts`, `src/main/preload.ts`;
  - Все ключевые сервисы (`database.ts`, `ai.service.ts`, `ai.router.ts`, `request-executor.ts`, `provider-manager.ts`, `provider.api.ts`, `openai.provider.ts`, `ollama.provider.ts`, `built-in-llm.service.ts`, `stt.service.ts`, `tts.service.ts`, `python_server.service.ts`, `built-in-whisper.service.ts`, `dialog.service.ts`, `dialog-logger.ts`, `tasks.service.ts`, `files.service.ts`, `storage-manager.service.ts`, `MacroExecutor.ts`, `shell-approval.service.ts`, `memory-manager.ts`, `ObjectiveEngine.ts`, `core-classifier.ts`, `tool-dispatcher.ts`, `system-control.tool.ts`, `task-management.tool.ts`);
  - Оба внешних воркера (`scripts/stt_worker.js`, `silero_server.py`) и все 11 пространств рендерера (`src/renderer/**`).
- **Не может быть проверено внутри Linux-контейнера AI Studio (вынесено в обязательный Release Gate G8)**:
  - Инсталляция и деинсталляция NSIS-пакета (`electron-builder --win`) на чистой Windows 10/11;
  - Поведение Windows DPAPI (`safeStorage`), Windows SAPI, `user32.dll` (`SystemControlTool`) и `powerMonitor` при сне/блокировке сессии Windows;
  - Реальное потребление памяти и GPU всего дерева процессов Electron на целевых конфигурациях Windows ПК.

---

## C. Аудит функциональности

| Подсистема / Модуль | Статус | Фактическая реализация (доказательства в коде) | Выявленные дефекты, заглушки и риски | Что требуется для Release Ready |
| :--- | :--- | :--- | :--- | :--- |
| **1. 3D-Реактор и графический контур** (`src/renderer/components/reactor/**`, `EcoStore`, `PerformanceStore`) | **Готово** *(Защищённая зона)* | Three.js сцена (`useReactor3D.ts`), 3-полосный FFT-анализ микрофона/TTS, WebGL context loss/restore (`ReactorCore.vue`), пресеты `Low`..`UltraPlus`, авто-остановка RAF в `hidden` и при открытых вкладках. | Известный зафиксированный в `AGENTS.md` долг читаемости логотипа ядра (решается отдельным ТЗ вне заморозки). | **Не трогать защищённую зону.** Сохранить текущие инварианты и тесты `ReactorCore.fallback.test.ts`. |
| **2. Визуальная Конституция и UI-система** (`tokens.css`, `scripts/check-visual-constitution.js`, `CommandCenter.vue`) | **Готово** *(остаток Фазы 6: 19 литералов)* | Лестница поверхностей v3.0, правило стекла/мата (`backdropBlurOverCanvas: 0`), правило шкалы Hero-показаний. Скрипт проверки проходит. | В `visual-constitution-baseline.json` остаётся плановый долг Фазы 6: `literalAccentClasses: 19`, `bgWhiteFills: 4`, `coloredStatusFills: 4`, `fontSizesUnder12: 2`. | Выполнить плановый sweep Фазы 6 (`docs/phase6-sweep-worklist.md`) на этапе P2 после функциональной стабилизации. |
| **3. База данных и Хранилище** (`database.ts`, `storage-manager.service.ts`) | **Требует переработки (P0)** | SQLite3 (`better-sqlite3`) в режиме WAL, FTS5-индекс сообщений, таблицы задач, целей и памяти. | 1. `createOrRecoverSqliteDatabase` (`database.ts:418-436`) удаляет `arc.db`, `-wal`, `-shm` без бэкапа при **любой** ошибке в `try` (включая `SQLITE_BUSY`!).<br>2. При сбое `better-sqlite3` происходит тихий фолбэк на `JSONDatabase` (`arc_fallback.json`), который не поддерживает FTS5 и сложные запросы.<br>3. Отсутствуют версионированные миграции `PRAGMA user_version`. | 1. Исключить удаление БД при `SQLITE_BUSY`/`EBUSY` (добавить retry).<br>2. При реальной коррупции перемещать `arc.db + wal + shm` вместе в `backups/corrupted-<ts>/`.<br>3. Запретить тихий переход на `JSONDatabase` в продакшене (вводить явный `DB_SAFE_MODE` с уведомлением).<br>4. Ввести миграции по `PRAGMA user_version`. |
| **4. Операционные задачи (Tasks)** (`features/tasks/**`, `tasks.service.ts`, `tasks.ipc.ts`, `task-management.tool.ts`) | **Требует доработки (P0/P1)** *(UI Scope-Locked)* | Список, Канбан, Матрица Эйзенхауэра, Focus Sprint, таймер отдыха, рекуррентные правила, аналитика. | 1. **Риск потери данных**: `saveAllTasks` (`tasks.service.ts:91-136`) делает `DELETE FROM arc_tasks` + цикл `INSERT` без транзакции.<br>2. **Гонка перезаписи**: `tasks.store.ts` при любом клике отправляет весь массив `tasks.value` в `saveAllTasks`, затирая задачи, созданные через `TaskManagementTool`.<br>3. В `useAiDecomp.ts:15-51` ИИ-декомпозиция имитируется через `setTimeout(1200)` и 4 шаблона по ключевым словам. | 1. Сделать SQLite единым источником истины: перейти от полной перезаписи `DELETE + INSERT` к гранулярным CRUD-методам (`upsertTask`, `deleteTask`) с контролем `updated_at` и рассылкой `tasks:updated`.<br>2. Подключить `useAiDecomp.ts` к реальному AI-вызову с фолбэком на шаблон только в офлайне. |
| **5. AI-Маршрутизатор, Провайдеры и Мультимодальность** (`ai.router.ts`, `provider-manager.ts`, `ai.ipc.ts`, `transcription.ipc.ts`, `ollama.provider.ts`) | **Требует доработки (P0)** | Поддержка OpenRouter, Gemini, OpenAI, Ollama, Built-in GGUF. Health-мониторинг с карантином, кэш, очистка `<think>`, фолбэк-цепочка. | 1. **Критический баг в `ai.ipc.ts:357`**: `geminiProvider.apiKey` передаётся в `GoogleGenAI` без расшифровки `decryptApiKey()` (передаётся строка `"enc:..."`).<br>2. **Критический баг в `transcription.ipc.ts:123`**: проверяется только `process.env.GEMINI_API_KEY`, игнорируя ключи из настроек A.R.C.<br>3. Дублирование хранилищ ключей (`secure-keys.json` vs `ai-providers.json`) с тихим фолбэком в `base64`.<br>4. Жёстко зашитый ID модели в Vision/Transcription без единого конфига и без проверки доступности.<br>5. В `ollama.provider.ts:62` отключён стриминг (`stream: false`). | 1. Единый `CredentialVaultService` на базе системного `safeStorage` (Windows DPAPI) с миграцией ключей и вызовом `decryptApiKey` во всех IPC.<br>2. Единый резолвер мультимодальной модели (настройки провайдера + проверка через `models.list`/`models.get`).<br>3. Потоковый парсинг ответа в `ollama.provider.ts`. |
| **6. Когнитивный Чат и Логирование диалогов** (`features/chat/**`, `dialog.service.ts`, `dialog-logger.ts`) | **Требует доработки (P0 в `DialogLogger`)** *(UI Scope-Locked)* | Стриминг ответов, статус-бар этапов, группировка сессий, FTS5-поиск, авто-резюме, экспорт в Markdown, вложения. | **Критический баг продакшена в `dialog-logger.ts:23-31`**: `DialogLogger` пытается создать папку и писать `dialogs.log` внутри `app.getAppPath()` (в упакованном виде это read-only архив `app.asar`!), без ротации размера и без `maskSecrets`. | Перенести запись логов в `path.join(app.getPath('userData'), 'logs')`, добавить ротацию файлов (`≤ 5 МБ`) и обязательную фильтрацию через `maskSecrets`. |
| **7. Речевой контур TTS и Python-сервер** (`tts.service.ts`, `python_server.service.ts`, `silero_server.py`, `MacroExecutor.ts`) | **Требует переработки (P0/P1)** | Каскад `Silero v5.5` → `Edge TTS` → `Windows SAPI`. Высокое качество синтеза и нормализации русского текста. | 1. В `package.json` `silero_server.py`, `silero_text_prep.py`, `requirements-silero.txt` не добавлены в `extraResources`.<br>2. В `silero_server.py:25-31` нет пути `resources/models/silero-v5/v5_5_ru.pt` (сервер не видит упакованную модель).<br>3. `PythonServerService` требует системный Python/FFmpeg и ставит `torch` с таймаутом 30 с (`python_server.service.ts:93`).<br>4. Узел макроса `actions/speak` (`MacroExecutor.ts:221`) обходит `ttsService`. | 1. Включить скрипты Silero в `extraResources` и исправить пути к `v5_5_ru.pt`.<br>2. Сделать `ffmpeg` в `silero_server.py` опциональным (прямой WAV-выход через `numpy/scipy/soundfile`).<br>3. Обеспечить работу TTS с первой секунды через `Edge TTS / SAPI` и поставку предсобранного Python-рантайма без зависимости от системного Python.<br>4. Направить `MacroExecutor` (`actions/speak`) через `ttsService.speak()`. |
| **8. Речевой контур STT** (`stt.service.ts`, `scripts/stt_worker.js`, `useVoice.ts`) | **Готово** *(оптимизация RAM — P2)* | Воркер `stt_worker.js`, пред-буфер 350 мс, Silero VAD, каскад GigaAM CTC 220M → Whisper Small int8, защита кольцевого буфера. | При старте в режиме `gigaam` `stt_worker.js:75-131` инициализирует сразу оба движка в RAM (GigaAM + резервный Whisper Small). | После замеров на слабых ПК (P2) перевести резервный `whisperRecognizer` на ленивую инициализацию (только при сбое GigaAM). |
| **9. Транскрибация аудиофайлов** (`features/transcription/**`, `transcription.ipc.ts`, `built-in-whisper.service.ts`) | **Требует доработки (P1)** | Локальные модели `Xenova/whisper-*` и облачная транскрибация через Gemini, таймкоды, поиск. | В `useTranscription.ts:89-100` глобально перезаписываются `console.log`, `console.warn`, `console.error` без восстановления в `onUnmounted` (утечка памяти и цепочка обёрток). | Убрать глобальное переопределение `console.*` в `useTranscription.ts`, заменив на локальную функцию логирования. |
| **10. Стратегические цели (Objectives)** (`features/objectives/**`, `ObjectiveEngine.ts`, `objective.ipc.ts`) | **Требует переработки (P1)** | Интерфейс целей, Outcomes, графа топологии, карты маршрута и отката (`ObjectiveRollbackDialog`). | `ObjectiveEngine.decomposeObjective` (`ObjectiveEngine.ts:754-767`) не использует ИИ, а вставляет англоязычные заглушки (`"Achieve baseline trajectory..."`, `"npm run lint"`). | Реализовать LLM-декомпозицию со строгой валидацией JSON-схемы, защитой от дубликатов и двухфазным подтверждением пользователем (`DRAFT` → `approveRoute`) перед созданием операционных задач. |
| **11. Команды, Макросы и Лаунчер** (`features/commands/**`, `MacroExecutor.ts`, `macros.ipc.ts`, `launcher.ipc.ts`) | **Требует доработки (P1)** | Редактор графов `litegraph.js`, триггеры, действия, подтверждение опасных shell-команд (`shellApprovalService`). | 1. Таймерные макросы (`triggers/timer`) не имеют фонового планировщика.<br>2. `launcher:refreshIndex` (`launcher.ipc.ts:60-63`) — 2-секундный `setTimeout`-стаб.<br>3. В `macros.ipc.ts:37` нет санитизации `id` файла. | 1. Персистентный планировщик макросов с учётом сна ОС (`powerMonitor`), защитой от дублей и окном догоняющего запуска (`Catch-Up Window`).<br>2. Реальный индексатор `.lnk`/`.exe` в `launcher.ipc.ts`.<br>3. Санитизация `path.basename(id)` в `macros.ipc.ts`. |
| **12. Модули, Зрение и Телеметрия** (`ModulesView.vue`, `VisionTabView.vue`, `system.ipc.ts`) | **Проблемное (P1)** | Реестр подсистем в `ModulesView.vue`, захват вебкамеры в `VisionTabView.vue`, системный монитор `systeminformation`. | 1. `system.ipc.ts:196-198` возвращает фейковые `temperature: 42, cpuTemperature: 42, gpuTemperature: 46`.<br>2. 5 карточек `calibrating` в `ModulesView.vue:259-263` открывают пустой экран `isUnhandledTab`.<br>3. В `VisionTabView.vue:144-148` пустой `watch` не привязывает поток камеры к `<video>`. | 1. Возвращать реальные данные датчиков или честный `null` в `system.ipc.ts`.<br>2. Убрать переходы на несуществующие вкладки в `ModulesView.vue`.<br>3. Привязать поток камеры и кнопку мультимодального анализа кадра в `VisionTabView.vue`. |
| **13. Долговременная память (Memory)** (`features/memory/**`, `memory-manager.ts`) | **Готово** *(мелкая правка P1)* | LTM категории, векторный поиск, авто-обогащение промпта, импорт/экспорт JSON. | В `MemoryView.vue:218, 222` используется блокирующий `alert(...)`, запрещённый правилами среды. | Заменить `alert()` на системный тост `settingsStore.triggerSyncToast` и обернуть `importEntries` в транзакцию. |

---

## D. Целевая модель Release Ready (Критерии зрелости v1.0)

Конечная цель **A.R.C. v1.0 Release Ready** — не максимальное количество экспериментальных функций, а **законченный, надёжный, предсказуемый и безопасный продукт ежедневного использования, который не требует от пользователя быть программистом или системным администратором**.

### 1. Сквозные пользовательские сценарии (End-to-End User Journeys)

1. **Сценарий 1. Установка и первичный вход (Раздельные контуры Cloud vs Local)**:
   - **Установка и мастер настройки (≤ 60 секунд взаимодействия)**: пользователь запускает установщик на чистой Windows 10/11 (без Python, Node.js, FFmpeg и Git) и проходит 3 шага мастера первого запуска (выбор режима ИИ, проверка микрофона, выбор профиля графики).
   - **Ветка А — Облачный режим (Cloud Mode)**: сразу после ввода и валидации API-ключа (OpenRouter / Gemini / OpenAI) пользователю полностью доступны когнитивный чат, инструменты и голосовая озвучка (через Edge TTS / SAPI).
   - **Ветка Б — Локальный режим (Local GGUF / Ollama / локальный Silero TTS)**: интерфейс не блокируется; в доке уведомлений (`DownloadNotificationDock.vue`) отображается честный прогресс скачивания и проверки целостности (SHA-256) локальной модели и голосового пакета, а после завершения загрузки локальный контур бесшовно активируется без перезапуска приложения.

2. **Сценарий 2. Непрерывный голосовой и текстовый рабочий цикл**:
   - Голосовая активация («Арк...»), распознавание речи через `stt_worker.js`, маршрутизация в `ai.router.ts` или локальные классификаторы, вызов инструментов (`get_weather`, `wikipedia`, `web_search`, `memory:search`, `task_management`, `system_control`) и озвучивание ответа с мгновенным прерыванием по стоп-слову (`barge-in`).

3. **Сценарий 3. Надёжное управление задачами и целями без потери данных**:
   - Задачи, созданные голосом, через чат-инструмент `task_management` или вручную в UI `Tasks`, синхронизируются через единый источник истины (SQLite) без взаимного затирания.
   - Декомпозиция стратегической цели в `Objectives` через ИИ предлагает структурированный план (Outcomes + Tasks), проходит валидацию на дубликаты и применяется только после подтверждения оператором (`approveRoute`).

4. **Сценарий 4. Безопасная автоматизация и честная диагностика**:
   - Визуальные макросы работают по голосовым и таймерным триггерам (с корректной отработкой после выхода ПК из сна), любые shell-команды проходят через `ApprovalDialog`, а все приборы дока отображают исключительно достоверную телеметрию.

### 2. Архитектурные, эксплуатационные и релизные требования

- **Целостность данных и обновлений**:
  - Ни одна ошибка блокировки файла (`SQLITE_BUSY`) не приводит к удалению БД;
  - При подтверждённой коррупции сохраняется полный комплект `arc.db + arc.db-wal + arc.db-shm`;
  - При недоступности SQLite приложение явно переходит в диагностический режим `DB_SAFE_MODE`, а не в скрытый `JSONDatabase`;
  - Установка новой версии поверх старой сохраняет все пользовательские данные и создаёт `pre-migrate` бэкап перед поднятием `PRAGMA user_version`.
- **Безопасность и приватность**:
  - Ключи API шифруются через системный `safeStorage` (Windows DPAPI) с автоматической миграцией старых записей; при недоступности системного шифрования деградация не скрывается от пользователя;
  - Все файловые логи пишутся в `userData/logs` с ротацией размера и обязательной очисткой секретов через `maskSecrets` (`log-sanitizer.ts`).
- **Производительность и профили оборудования (на основе инструментальных замеров)**:
  - Замеры RAM, CPU и GPU проводятся **по всему дереву процессов приложения** (`Main + Renderer + GPU Process + STT Worker + Python TTS`) на трёх профилях оборудования (Low-End 8GB iGPU, Mid-Range 16GB, High-End dGPU);
  - В свёрнутом состоянии (`hidden`) цикл `requestAnimationFrame` 3D-Реактора полностью остановлен (`0 FPS` рендера сцены), а фоновый опрос сервисов переведён в редкий интервал (`30 с`).
- **Модульность и границы защищённых зон**:
  - Проверка `scripts/check-file-sizes.js` используется как инструмент архитектурного контроля для нового и изменяемого кода;
  - Защищённые `AGENTS.md` файлы (`useVoice.ts`, `built-in-llm.service.ts`, `useMacroEditor.ts`, `ObjectiveEngine.ts`, `ReactorCore.vue`, `useReactor3D.ts`, `Chat` и `Tasks` UI) **официально закреплены как документированные архитектурные исключения** и не подвергаются искусственному дроблению ради метрики размера файла.

---

## E. Критические проблемы (Верифицированный реестр блокеров P0 и P1)

| ID | Приоритет | Проблема и точная локализация в коде | Последствия при игнорировании |
| :--- | :--- | :--- | :--- |
| **B-01** | **P0** | **Уничтожение БД при ошибке открытия / `integrity_check` без бэкапа WAL/SHM и без фильтрации `SQLITE_BUSY`** (`src/main/services/database.ts:409-436`) | Любая временная блокировка файла антивирусом/вторым процессом или сбой питания приводит к удалению `arc.db`, `-wal`, `-shm` и полной потере истории чатов, памяти и задач. |
| **B-02** | **P0** | **Тихий переход на неполноценный `JSONDatabase` при сбое `better-sqlite3`** (`src/main/services/database.ts:449-454, 493, 516`) | Пользователь видит пустую память и чаты без сообщения об ошибке; FTS5 и запросы `Objectives` перестают работать. |
| **B-03** | **P0** | **Неатомарный `DELETE + INSERT` в `saveAllTasks` и перезапись задач ИИ старым массивом из рендерера** (`src/main/services/tasks.service.ts:91-136`, `src/renderer/features/tasks/stores/tasks.store.ts:122-136`) | Потеря задач при сбое посреди цикла записи; задачи, созданные голосом или через инструмент `task_management`, затираются при следующем клике пользователя в UI `Tasks`. |
| **B-04** | **P0** | **Неполная конфигурация упаковки `electron-builder` и путей к моделям** (`package.json:105-131`, `silero_server.py:25-31`) | Отсутствие `silero_server.py` в `extraResources` и `node-llama-cpp` в `asarUnpack` ломает TTS и локальную LLM в `.exe`; `silero_server.py` не видит упакованную в `resources/models/silero-v5` модель `v5_5_ru.pt`. |
| **B-05** | **P0** | **Запись логов `DialogLogger` внутрь read-only архива `app.asar` без ротации и маскирования секретов** (`src/main/services/dialog-logger.ts:21-31, 61`) | Гарантированные ошибки записи файловой системы в упакованном приложении (`app.getAppPath()` указывает на `app.asar`). |
| **B-06** | **P0** | **Передача нерасшифрованного ключа `enc:...` в `ai:analyze-vision` и игнорирование настроек ключей в `transcription:transcribe-gemini`** (`src/main/ipc/ai.ipc.ts:355-358`, `src/main/ipc/transcription.ipc.ts:123-126`) | Отказ авторизации Google API при анализе экрана Vision и невозможность использовать облачную транскрибацию без системной переменной окружения `GEMINI_API_KEY`. |
| **B-07** | **P1** | **Зависимость `PythonServerService` от системного Python/FFmpeg и 30-секундный таймаут `pip install`** (`src/main/services/python_server.service.ts:47-125`, `silero_server.py:250-305`) | На чистой Windows без Python и FFmpeg или при обычном интернете Silero TTS не запускается; узел макроса `actions/speak` (`MacroExecutor.ts:221`) говорит системным SAPI вместо голоса A.R.C. |
| **B-08** | **P1** | **Бутафорская телеметрия, шаблонные заглушки и тупиковые экраны** (`system.ipc.ts:196`, `ObjectiveEngine.ts:754`, `useAiDecomp.ts:15`, `ModulesView.vue:259`, `launcher.ipc.ts:60`, `useTranscription.ts:89`) | Фейковые `42°C`/`46°C`, англоязычные константы вместо ИИ-декомпозиции, 5 кнопок с переходом на пустой `isUnhandledTab`, утечка глобального `console.log` и неработающие таймеры макросов. |

---

## F. Roadmap (Поэтапный план работ до Release Ready)

---

### Этап 1 (P0). Целостность базы данных, единый источник истины и безопасность логов/ключей

#### Задача 1.1. Безопасное восстановление SQLite (с учётом WAL/SHM и `SQLITE_BUSY`), миграции `user_version` и режим `DB_SAFE_MODE`
1. **Название и проблема**: `createOrRecoverSqliteDatabase` (`database.ts:409-436`) удаляет `arc.db`, `-wal`, `-shm` без бэкапа при любой ошибке (включая `SQLITE_BUSY`), миграции не версионированы, а при сбое `better-sqlite3` происходит тихий переход на неполноценный `JSONDatabase`.
2. **Зачем это нужно**: Полностью исключить потерю пользовательских данных и скрытую деградацию хранилища.
3. **Затронутые модули и файлы**: `src/main/services/database.ts`, `src/main/ipc/system.ipc.ts`, `src/main/services/classifiers/core-classifier.ts`.
4. **Что конкретно нужно сделать**:
   - В `createOrRecoverSqliteDatabase`:
     - проверять код ошибки при открытии БД: если это `SQLITE_BUSY`, `SQLITE_LOCKED`, `EBUSY` или `EACCES` — выполнять до 3 повторных попыток с задержкой (200 / 500 / 1000 мс) и **ни при каких обстоятельствах не вызывать `fs.unlinkSync`**;
     - только при подтверждённой коррупции (`SQLITE_CORRUPT`, `SQLITE_NOTADB` или неуспешный `PRAGMA quick_check` / `integrity_check`): закрыть `instance.close()`, создать папку `userData/database/backups/corrupted-<timestamp>/` и переместить туда **все три файла вместе** (`arc.db`, `arc.db-wal`, `arc.db-shm`);
     - при успешном старте здоровой БД раз в 24 часа создавать консистентную резервную копию `userData/database/backups/arc.db.daily.bak` (и копию перед миграцией `arc.db.pre-migrate-v<X>.bak`).
   - Запретить тихий переход на `JSONDatabase` в production-сборке (`NODE_ENV !== 'test'`): при фатальной ошибке нативного драйвера выставлять статус `DatabaseService.status = 'SAFE_MODE'` с передачей диагностического баннера в UI.
   - Ввести версионированные миграции через `PRAGMA user_version` внутри `db.transaction()`.
   - В `core-classifier.ts:57` защитить `app?.getPath ? app.getPath('userData') : process.cwd()`.
5. **Зависимости**: Нет (стартовая задача №1).
6. **Приоритет**: **P0**
7. **Оценка сложности**: **M**
8. **Критерии готовности (Acceptance Criteria)**:
   - Ошибка `SQLITE_BUSY` / `EBUSY` не приводит к удалению файлов БД.
   - При подаче повреждённого `arc.db` комплект `arc.db` + `-wal` + `-shm` сохраняется в `backups/corrupted-<timestamp>/`.
   - `PRAGMA user_version` фиксирует актуальную версию схемы.
9. **Необходимые тесты и проверки**: Unit-тесты `database.recovery.test.ts` (сценарии: коррупция заголовка, наличие `-wal`, симуляция `EBUSY`, миграция `user_version`), `npm test`.

#### Задача 1.2. Архитектура единого источника истины (SQLite CRUD) для `Tasks` без гонок перезаписи
1. **Название и проблема**: `tasks.store.ts` при каждом изменении вызывает `saveAllTasks`, который делает неатомарный `DELETE FROM arc_tasks` + цикл `INSERT` (`tasks.service.ts:91-136`) и затирает задачи, созданные через `TaskManagementTool` (`task-management.tool.ts`).
2. **Зачем это нужно**: Исключить потерю задач при конкурентной работе пользователя в UI и голосовых/чат-инструментов ИИ, не нарушая Scope Lock на дизайн `TasksView.vue`.
3. **Затронутые модули и файлы**: `src/main/services/tasks.service.ts`, `src/main/ipc/tasks.ipc.ts`, `src/main/preload.ts`, `src/renderer/features/tasks/stores/tasks.store.ts`.
4. **Что конкретно нужно сделать**:
   - В `tasks.service.ts`:
     - добавить гранулярные транзакционные методы `upsertTask(task)` (с полем `updated_at = Date.now()`), `batchUpsertTasks(tasks)` (через `INSERT OR REPLACE` в `db.transaction` **без `DELETE FROM arc_tasks`**) и `deleteTask(id)`;
     - обернуть `saveAllTasks` в `db.transaction()` и оставить очистку таблицы только для явного сброса (`clearAllTasks`);
     - при любом изменении задачи в `tasks.service.ts` (через IPC или через `TaskManagementTool`) отправлять во все окна `BrowserWindow` событие `tasks:changed` с полезной нагрузкой `{ action: 'upsert' | 'delete' | 'reload', task?, id? }`.
   - В `tasks.store.ts`:
     - переключить операции добавления, изменения статуса, подзадач и удаления одной задачи на вызов гранулярных IPC-методов (`tasks:upsert`, `tasks:delete`);
     - подписаться на `tasks:changed` и атомарно обновлять реактивный массив `tasks.value` по `id` (с учётом `updated_at`).
5. **Зависимости**: Задача 1.1.
6. **Приоритет**: **P0**
7. **Оценка сложности**: **M**
8. **Критерии готовности (Acceptance Criteria)**:
   - Если `TaskManagementTool` создаёт задачу в БД, а через 50 мс пользователь меняет статус другой задачи в UI, обе задачи сохраняются в SQLite и отображаются в UI.
   - Все массовые операции в `tasks.service.ts` выполняются строго внутри `db.transaction()`.
9. **Необходимые тесты и проверки**: Интеграционный тест конкурентной записи `tasks.concurrency.test.ts` (UI store + `TaskManagementTool`), `npm test`.

#### Задача 1.3. Системное хранилище ключей (`safeStorage` / DPAPI), исправление `DialogLogger` (`app.asar`) и санитизация путей
1. **Название и проблема**:
   - В `ai.ipc.ts:357` зашифрованный ключ `enc:...` передаётся в `GoogleGenAI` без `decryptApiKey`;
   - В `transcription.ipc.ts:123` игнорируются ключи из настроек A.R.C.;
   - Ключи дублируются между `secure-keys.json` и `ai-providers.json` с тихим фолбэком в `base64`;
   - `DialogLogger` (`dialog-logger.ts:23-31`) пишет в `app.getAppPath()` (внутрь `app.asar`!) без ротации и без `maskSecrets`;
   - В `macros.ipc.ts:37` и `system.ipc.ts:45` отсутствует санитизация файловых путей.
2. **Зачем это нужно**: Устранить падение логирования в упакованном `.exe`, починить авторизацию Gemini в Vision/Transcription и защитить ключи через Windows DPAPI без самодельной криптографии.
3. **Затронутые модули и файлы**: `src/main/services/security/credential-vault.ts` (новый), `src/main/services/llm/providers/provider-manager.ts`, `src/main/ipc/settings.ipc.ts`, `src/main/ipc/ai.ipc.ts`, `src/main/ipc/transcription.ipc.ts`, `src/main/services/dialog-logger.ts`, `src/main/ipc/macros.ipc.ts`, `src/main/ipc/system.ipc.ts`.
4. **Что конкретно нужно сделать**:
   - Создать `CredentialVaultService` поверх `electron.safeStorage` (Windows DPAPI):
     - реализовать автоматическую миграцию ранее сохранённых `b64:` ключей в `enc:` при старте;
     - если `safeStorage.isEncryptionAvailable() === false` — **не сохранять** ключи в `base64` молча: держать их только в памяти процесса на время сессии либо требовать явного согласия пользователя с предупреждением в UI;
     - использовать `CredentialVaultService.getDecryptedKey(...)` в `ai.ipc.ts:357` и `transcription.ipc.ts:123`.
   - В `DialogLogger` (`src/main/services/dialog-logger.ts`):
     - изменить путь хранения с `app.getAppPath()` на `path.join(app.getPath('userData'), 'logs', 'dialogs')`;
     - пропускать записываемый текст через `maskSecrets` (`src/shared/utils/log-sanitizer.ts`) и добавить ротацию файла при достижении `5 МБ`.
   - В `macros.ipc.ts` санитизировать `id` через `path.basename(String(id)).replace(/[^a-zA-Z0-9_-]/g, '')`; в `system.ipc.ts:45` делегировать `system:files` в `files.service.ts`.
5. **Зависимости**: Нет.
6. **Приоритет**: **P0**
7. **Оценка сложности**: **M**
8. **Критерии готовности (Acceptance Criteria)**:
   - `ai:analyze-vision` и `transcription:transcribe-gemini` успешно получают расшифрованный API-ключ из настроек провайдера пользователя.
   - `DialogLogger` пишет логи в `userData/logs/dialogs/dialogs.log`, маскируя любые токены `sk-...` / `AIza...`.
   - Попытка передать `../` в `macros:*` отклоняется.
9. **Необходимые тесты и проверки**: Unit-тесты `credential-vault.test.ts`, `dialog-logger.test.ts`, `settings.ipc.test.ts`, `files.ipc.test.ts`.

---

### Этап 2 (P0/P1). Упаковка Windows-приложения, стабильность AI-провайдеров и автономность TTS

#### Задача 2.1. Исправление упаковки `electron-builder` (`extraResources`, `asarUnpack`) и путей моделей в `silero_server.py`
1. **Название и проблема**: В `package.json` отсутствуют `silero_server.py`, `silero_text_prep.py`, `requirements-silero.txt` в `extraResources` и `node-llama-cpp` в `asarUnpack`, а `silero_server.py:25-31` не ищет модель `v5_5_ru.pt` в `resources/models/silero-v5`, куда её кладёт сборщик.
2. **Зачем это нужно**: Обеспечить физическое наличие и доступность всех скриптов, весов моделей и нативных бинарников после установки Windows-инсталлятора.
3. **Затронутые модули и файлы**: `package.json`, `silero_server.py`, `src/main/services/python_server.service.ts`.
4. **Что конкретно нужно сделать**:
   - В `package.json` (`build.extraResources`) добавить `silero_server.py`, `silero_text_prep.py`, `requirements-silero.txt`.
   - В `package.json` (`build.asarUnpack`) добавить `**/node_modules/node-llama-cpp/**/*` и `**/node_modules/@node-llama-cpp/**/*`.
   - В `silero_server.py:25-31` добавить в `candidate_model_paths` пути:
     - `os.path.join(script_dir, 'models', 'silero-v5', 'v5_5_ru.pt')`,
     - `os.path.join(script_dir, 'resources', 'models', 'silero-v5', 'v5_5_ru.pt')`,
     - путь из переменной окружения `ARC_SILERO_MODEL_PATH`, передаваемой из `PythonServerService`.
5. **Зависимости**: Нет.
6. **Приоритет**: **P0**
7. **Оценка сложности**: **S**
8. **Критерии готовности (Acceptance Criteria)**:
   - `silero_server.py` находит локальную модель в `models/silero-v5/v5_5_ru.pt` без обращения к `models.silero.ai`.
   - Конфигурация `package.json` валидна и включает все необходимые ресурсы.
9. **Необходимые тесты и проверки**: Скрипт проверки путей упаковки, `npm run build`.

#### Задача 2.2. Единый конфигурационный источник моделей Gemini/Vision/Transcription и включение стриминга Ollama
1. **Название и проблема**: В `ai.ipc.ts:375`, `transcription.ipc.ts:141` и `useTranscription.ts:48` жёстко зашита модель `gemini-3.5-flash` отдельно от `provider-manager.ts:85` (`gemini-2.5-flash`) без проверки доступности модели для ключа и эндпоинта пользователя; в `ollama.provider.ts:62` отключён стриминг (`stream: false`); перед вызовом Wikipedia стоит искусственный `setTimeout(1500)`.
2. **Зачем это нужно**: Избавиться от захардкоженных идентификаторов моделей, проверять реальную поддержку модели API-ключом пользователя и обеспечить плавный стриминг локальных моделей Ollama.
3. **Затронутые модули и файлы**: `src/main/services/llm/providers/provider-manager.ts`, `src/main/services/llm/providers/provider.api.ts`, `src/main/ipc/ai.ipc.ts`, `src/main/ipc/transcription.ipc.ts`, `src/renderer/features/transcription/composables/useTranscription.ts`, `src/main/services/llm/providers/ollama.provider.ts`, `src/main/services/llm/providers/openai.provider.ts`.
4. **Что конкретно нужно сделать**:
   - Выделить в `provider-manager.ts` единый резолвер мультимодальной модели `resolveMultimodalGeminiConfig()`:
     - брать выбранную пользователем модель из активного провайдера Gemini (а при её отсутствии — проверять доступность модели через `models.list` / `models.get` с кэшированием списка поддерживаемых моделей и автоматическим фолбэком между поддерживаемыми поколениями Flash);
     - использовать этот единый резолвер как в `ai:analyze-vision`, так и в `transcription:transcribe-gemini`.
   - В `ollama.provider.ts` включить потоковую передачу чанков (`stream: isStreamingEnabled`) с разбором NDJSON-потока и фильтрацией `<think>` через `StreamingThinkingFilter`.
   - Убрать искусственный `setTimeout(r, 1500)` из `openai.provider.ts:40` и `ollama.provider.ts:88`.
5. **Зависимости**: Задача 1.3.
6. **Приоритет**: **P0**
7. **Оценка сложности**: **M**
8. **Критерии готовности (Acceptance Criteria)**:
   - Vision и Cloud Transcription используют единую конфигурацию ключа и модели из `providerManager` с проверкой доступности модели.
   - Ответы от локальной Ollama стримятся в чат по мере генерации токенов.
9. **Необходимые тесты и проверки**: `ai.ipc.test.ts`, `openai.provider.test.ts`, новый тест `ollama.provider.test.ts`, `npm test`.

#### Задача 2.3. Отказоустойчивость Silero TTS без системного FFmpeg/Python и унификация озвучки в макросах
1. **Название и проблема**: `silero_server.py` в эндпоинте `/tts` требует внешний `ffmpeg`, `PythonServerService` падает по 30-секундному таймауту `pip install` и требует системного Python, а `MacroExecutor.ts:221` озвучивает узлы `actions/speak` через сырой PowerShell SAPI.
2. **Зачем это нужно**: Гарантировать работу голосового синтеза на чистой пользовательской Windows без предустановленных инструментов разработчика.
3. **Затронутые модули и файлы**: `silero_server.py`, `src/main/services/python_server.service.ts`, `src/main/services/tts.service.ts`, `src/main/services/MacroExecutor.ts`.
4. **Что конкретно нужно сделать**:
   - В `silero_server.py`: добавить проверку наличия `ffmpeg` (`shutil.which('ffmpeg')` или путь из `ARC_FFMPEG_PATH`). Если `ffmpeg` отсутствует — не вызывать `subprocess.run(['ffmpeg', ...])`, а возвращать WAV-поток, обработанный встроенным `numpy` + `reverb_mix` (`scipy.signal.fftconvolve`) + `soundfile`, чтобы синтез работал со 100% надёжностью без `ffmpeg`.
   - В `PythonServerService`:
     - поддержать запуск из портативного встроенного Python (`resources/python-embed/python.exe` или `userData/silero_env`);
     - если окружение разворачивается впервые — убрать 30-секундный обрыв, транслировать прогресс установки в UI, а на время подготовки окружения автоматически обслуживать все запросы озвучки через `Edge TTS` / `SAPI` без блокировки ответа ассистента.
   - В `MacroExecutor.ts:221-244` перевести действие `actions/speak` на вызов `await ttsService.speak(text)`.
5. **Зависимости**: Задача 2.1.
6. **Приоритет**: **P1**
7. **Оценка сложности**: **M**
8. **Критерии готовности (Acceptance Criteria)**:
   - При отсутствии `ffmpeg` в системе эндпоинт `/tts` в `silero_server.py` возвращает корректный WAV-файл со статусом `200 OK`.
   - Макрос с узлом «Озвучить текст» говорит основным голосом A.R.C. (`ttsService`).
9. **Необходимые тесты и проверки**: `tts.service.test.ts`, проверка `silero_server.py` без `ffmpeg` в `PATH`.

---

### Этап 3 (P1). Доведение рабочих пространств до честной реализации (Objectives, Modules, Vision, Commands)

#### Задача 3.1. Проверяемая ИИ-декомпозиция в `ObjectiveEngine` и `useAiDecomp` (с валидацией и подтверждением)
1. **Название и проблема**: `ObjectiveEngine.decomposeObjective` (`ObjectiveEngine.ts:754-767`) пишет англоязычные константы вместо вызова LLM, а `useAiDecomp.ts:15-51` имитирует декомпозицию задачи через `setTimeout(1200)`.
2. **Зачем это нужно**: Сделать стратегическое и операционное планирование реально работающим когнитивным инструментом без риска засорения базы галлюцинациями модели.
3. **Затронутые модули и файлы**: `src/main/services/objective/ObjectiveEngine.ts`, `src/main/ipc/objective.ipc.ts`, `src/renderer/features/objectives/composables/useObjectives.ts`, `src/renderer/features/tasks/composables/useAiDecomp.ts`.
4. **Что конкретно нужно сделать**:
   - В `ObjectiveEngine.decomposeObjective`:
     - сформировать структурированный запрос к активному LLM-провайдеру через `executeRequestFallbackChain` с требованием вернуть JSON `{ outcomes: [...], decisions: [...], tasks: [...], risks: [...] }` на русском языке;
     - провалидировать схему ответа (проверка типов, обрезка длины строк, ограничение `≤ 5` outcomes и `≤ 7` задач, дедупликация относительно уже существующих элементов цели);
     - сохранять сгенерированный маршрут в статусе `DRAFT` (предпросмотр в UI `ObjectiveDetailsWorkspace`), а реальные задачи в `arc_tasks` (`tasksService.createTask`) создавать только при подтверждении маршрута оператором (`approveRouteMap`);
     - если все ИИ-провайдеры недоступны (офлайн без локальной модели) — возвращать честный русскоязычный базовый шаблон с пометкой `[Локальный шаблон — ИИ офлайн]`.
   - В `useAiDecomp.ts` вызывать реальный ИИ-запрос для разбиения конкретной задачи на 3–5 подшагов, оставляя захардкоженные шаблоны только как офлайн-фолбэк.
5. **Зависимости**: Задачи 1.2, 2.2.
6. **Приоритет**: **P1**
7. **Оценка сложности**: **M**
8. **Критерии готовности (Acceptance Criteria)**:
   - В `ObjectiveEngine.ts` больше не создаются англоязычные строки `"Achieve baseline trajectory..."` и `"npm run lint"` для пользовательских целей.
   - Невалидный JSON от LLM не роняет `ObjectiveEngine` и не создаёт дублирующихся задач.
   - Задачи добавляются в операционный список `Tasks` после подтверждения маршрута цели.
9. **Необходимые тесты и проверки**: Unit-тест `ObjectiveEngine.decomposition.test.ts` (проверка валидного JSON, битого JSON, дедупликации и офлайн-фолбэка).

#### Задача 3.2. Ликвидация бутафорской телеметрии (`42°C`), тупиковых вкладок в `ModulesView`, утечки `console.*` и починка `VisionTabView`
1. **Название и проблема**:
   - `system.ipc.ts:196-198` возвращает фейковые `temperature: 42, cpuTemperature: 42, gpuTemperature: 46`;
   - `ModulesView.vue:259-263` ведёт на 5 несуществующих вкладок (`isUnhandledTab`);
   - `VisionTabView.vue:144-148` не привязывает поток камеры к `<video>` и не вызывает анализ кадра;
   - `useTranscription.ts:89-100` глобально перезаписывает `console.log/warn/error`;
   - `MemoryView.vue:218, 222` использует блокирующий `alert()`.
2. **Зачем это нужно**: Устранить все нарушения Конституции A.R.C. (запрет фейковой телеметрии и мёртвых кнопок) и утечку памяти в транскрибации.
3. **Затронутые модули и файлы**: `src/main/ipc/system.ipc.ts`, `src/renderer/features/modules/components/ModulesView.vue`, `src/renderer/features/vision/components/VisionTabView.vue`, `src/renderer/features/transcription/composables/useTranscription.ts`, `src/renderer/features/memory/components/MemoryView.vue`.
4. **Что конкретно нужно сделать**:
   - В `system.ipc.ts`: заменить захардкоженные `42`/`46` на реальный опрос `si.cpuTemperature()` и `si.graphics()` (с кэшем 5 с); если датчик недоступен без прав администратора — возвращать `null`.
   - В `ModulesView.vue`: для модулей в статусе `calibrating` убрать вызов несуществующих вкладок (`agents`, `tools`, `architecture`, `sandbox`), заменив кнопку на честный статус `Запланировано в v1.1` (а `orchestrator` перенаправить в настройки маршрутизации ИИ).
   - В `VisionTabView.vue`: привязать `MediaStream` к `videoPlayerRef.value.srcObject` и добавить кнопку «Анализировать кадр / экран», вызывающую `window.api.analyzeVision()`.
   - В `useTranscription.ts:89-100`: удалить перезапись глобальных `console.log/warn/error`, используя локальную функцию записи в `debugLogs`.
   - В `MemoryView.vue:218, 222`: заменить `alert(...)` на `settingsStore.triggerSyncToast(...)`.
5. **Зависимости**: Задача 2.2.
6. **Приоритет**: **P1**
7. **Оценка сложности**: **M**
8. **Критерии готовности (Acceptance Criteria)**:
   - В `system.ipc.ts` отсутствуют захардкоженные числа `42` и `46`.
   - Ни одна карточка в `ModulesView.vue` не открывает пустую заглушку `isUnhandledTab`.
   - Многократное открытие `Transcription` не оборачивает `window.console.log`.
9. **Необходимые тесты и проверки**: `npm run lint`, `npm run check-visual-constitution`, `npm test`.

#### Задача 3.3. Надёжный планировщик таймерных макросов (с учётом сна ОС и пропущенных запусков) и индексатор Лаунчера
1. **Название и проблема**: Макросы с `triggers/timer` никогда не запускаются автоматически, а `launcher:refreshIndex` (`launcher.ipc.ts:60-63`) является `setTimeout`-заглушкой.
2. **Зачем это нужно**: Обеспечить предсказуемую работу автоматизации по расписанию (включая выход ноутбука/ПК из спящего режима) и голосовой запуск программ из папок Лаунчера.
3. **Затронутые модули и файлы**: `src/main/services/MacroExecutor.ts`, `src/main/ipc/macros.ipc.ts`, `src/main/ipc/launcher.ipc.ts`, `src/main/index.ts`.
4. **Что конкретно нужно сделать**:
   - В `MacroExecutor`:
     - реализовать персистентный учёт срабатываний расписаний в `userData/macros-schedule-state.json` (`{ [macroId_nodeId]: { lastRunDate: 'YYYY-MM-DD', lastRunTs: number } }`);
     - проверять расписание раз в 30 секунд, а также немедленно по событиям `electron.powerMonitor.on('resume')` и `unlock-screen`;
     - реализовать политику догоняющего запуска (`Catch-Up Window = 15 минут`): если назначенное время `HH:MM` сегодняшнего дня прошло не более 15 минут назад (например, ПК был в сне) и `lastRunDate !== todayLocal`, выполнить макрос (для макросов с `actions/shell` обязательно через `shellApprovalService`); если прошло более 15 минут — отметить пропуск в логе без неожиданного исполнения устаревшей задачи;
     - корректно вычислять локальное время через `Intl.DateTimeFormat` при смене часового пояса.
   - В `launcher.ipc.ts`: реализовать рекурсивный обход выбранных папок (глубина до 3 уровней) с индексацией `.exe`, `.lnk`, `.bat`, `.cmd` файлов в `userData/launcher-index.json`.
5. **Зависимости**: Задача 1.3.
6. **Приоритет**: **P1**
7. **Оценка сложности**: **M**
8. **Критерии готовности (Acceptance Criteria)**:
   - Макрос по таймеру `HH:MM` срабатывает ровно 1 раз в сутки и не дублируется при перезапуске приложения в ту же минуту.
   - При симуляции выхода из сна через 5 минут после `HH:MM` срабатывает догоняющий запуск; через 2 часа — запуск безопасно пропускается.
   - `launcher:refreshIndex` возвращает реальный список найденных приложений.
9. **Необходимые тесты и проверки**: Unit-тесты `macro-scheduler.test.ts` (повторный запуск в ту же минуту, выход из сна внутри и вне окна 15 мин), `npm test`.

---

### Этап 4 (P1). Мастер первого запуска (First-Run Onboarding) и самодиагностика

#### Задача 4.1. Мастер первого запуска (Cloud vs Local пути) и экспорт обезличенного диагностического отчёта
1. **Название и проблема**: Новый пользователь после установки попадает в неконфигурированное приложение без ключей и локальных моделей; при возникновении проблем нет инструмента для выгрузки безопасного диагностического отчёта без утечки API-ключей.
2. **Зачем это нужно**: Сделать вход в продукт понятным за ≤ 60 секунд и дать пользователю и разработчику безопасный инструмент диагностики.
3. **Затронутые модули и файлы**: `src/renderer/components/onboarding/FirstRunWizardModal.vue` (новый), `src/renderer/App.vue`, `src/main/ipc/system.ipc.ts`, `src/renderer/features/settings/components/sections/GeneralSettingsSection.vue`.
4. **Что конкретно нужно сделать**:
   - Реализовать 3-шаговый `FirstRunWizardModal.vue`:
     - **Шаг 1 (Режим ИИ)**: чёткое разделение на **«Облачный старт (готов сразу)»** (ввод и тест ключа OpenRouter/Gemini) и **«Локальный автономный режим»** (проверка Ollama или запуск фоновой загрузки компактной модели GGUF с отображением размера файла и свободного места на диске);
     - **Шаг 2 (Голос и микрофон)**: выбор микрофона, индикатор уровня сигнала и выбор активации (`Wake Word "АРК"` / `По клику`), с пояснением, что `Edge TTS / SAPI` работают сразу, а студийный голос `Silero v5.5` можно активировать в 1 клик;
     - **Шаг 3 (Графика)**: выбор пресета 3D-Реактора с рекомендацией под обнаруженную конфигурацию ПК.
   - Добавить IPC `system:export-diagnostics`: формирует `.zip` или `.json` отчёт, содержащий версии ОС/Electron, параметры CPU/RAM/GPU, статус таблиц SQLite (`PRAGMA quick_check`), список активных провайдеров (**без полей `apiKey`**) и последние 200 строк системного лога, пропущенных через `maskSecrets` (**без текстов личных сообщений пользователя**).
5. **Зависимости**: Задачи 1.3, 2.2, 2.3.
6. **Приоритет**: **P1**
7. **Оценка сложности**: **M**
8. **Критерии готовности (Acceptance Criteria)**:
   - Прохождение мастера занимает ≤ 60 секунд; в облачном режиме чат и голос работают немедленно после закрытия мастера.
   - Экспортированный диагностический файл гарантированно не содержит ни одного ключа API (`sk-`, `AIza`, `enc:`) и ни одного текста личных сообщений чата.
9. **Необходимые тесты и проверки**: Тест `diagnostics-export.test.ts` на отсутствие секретов в дампе, `npm run check-visual-constitution`.

---

### Этап 5 (P2). Инструментальное профилирование слабых ПК, оптимизация и плановая гигиена

#### Задача 5.1. Замер дерева процессов и оптимизация потребления памяти на слабых ПК (Lazy STT Fallback)
1. **Название и проблема**: В `stt_worker.js:75-131` при старте одновременно загружаются в память и GigaAM CTC 220M, и резервный Whisper Small int8; целевые метрики RAM/GPU должны опираться на замеры всех процессов приложения, а не одного главного процесса.
2. **Зачем это нужно**: Снизить базовое потребление ОЗУ на ноутбуках с 8 ГБ RAM без потери отказоустойчивости («неснимаемого пола» Whisper Small) и зафиксировать реальные профили ресурсов.
3. **Затронутые модули и файлы**: `scripts/stt_worker.js`, `src/main/ipc/system.ipc.ts`, `src/renderer/features/settings/stores/settings.store.ts`.
4. **Что конкретно нужно сделать**:
   - В `system.ipc.ts` добавить агрегацию метрик памяти по `app.getAppMetrics()` (сумма `workingSetSize` по `Browser`, `Tab/Renderer`, `GPU`, `Utility` процессам) + PID дочерних воркеров `stt_worker.js` и `silero_server.py`.
   - В `scripts/stt_worker.js`: если выбран режим `gigaam` и `gigaamRecognizer` успешно инициализирован, сохранять `whisperConfig` и инициализировать `whisperRecognizer` **лениво (on-demand)** только при ошибке инициализации GigaAM или при срабатывании `fallback_to_whisper`.
   - В `settings.store.ts`: при первом запуске на системах с `hardwareConcurrency <= 4` предлагать по умолчанию пресет `Medium` вместо `High`.
5. **Зависимости**: Завершение задач P0/P1.
6. **Приоритет**: **P2**
7. **Оценка сложности**: **S**
8. **Критерии готовности (Acceptance Criteria)**:
   - В режиме `gigaam` дочерний процесс `stt_worker.js` не тратит RAM на `whisperRecognizer` до момента реального фолбэка.
   - Все существующие тесты `stt-worker-gigaam.test.ts` проходят успешно.
9. **Необходимые тесты и проверки**: `src/main/services/stt-worker-gigaam.test.ts`, замер `app.getAppMetrics()`.

#### Задача 5.2. Завершение Фазы 6 Визуальной Конституции (19 литералов акцента) и закрепление правил `check-file-sizes.js`
1. **Название и проблема**: В `visual-constitution-baseline.json` остаётся плановый долг `literalAccentClasses: 19` (`docs/phase6-sweep-worklist.md`), а в `scripts/check-file-sizes.js` защищённые `AGENTS.md` файлы смешаны в одном списке `IGNORE_FILES` с обычными крупными файлами.
2. **Зачем это нужно**: Довести переключение цветовых тем реактора до 100% консистентности во всех вкладках и устранить формальное противоречие между `check-file-sizes.js` и неприкосновенностью защищённых зон.
3. **Затронутые модули и файлы**: Файлы из `docs/phase6-sweep-worklist.md`, `visual-constitution-baseline.json`, `scripts/check-file-sizes.js`.
4. **Что конкретно нужно сделать**:
   - Заменить 19 оставшихся литералов `text-red-*`/`bg-red-*`/`border-red-*` на `var(--accent)` или `var(--status-err)` и обновить `visual-constitution-baseline.json` (`literalAccentClasses: 0`).
   - В `scripts/check-file-sizes.js` явно разделить список исключений на `PROTECTED_ARCHITECTURE_FILES` (защищённые согласно `AGENTS.md` файлы, которые не подлежат дроблению без спец-запроса) и `LEGACY_ALLOWLIST` (незащищённые файлы, декомпозируемые по мере их доработки).
5. **Зависимости**: Нет.
6. **Приоритет**: **P2**
7. **Оценка сложности**: **S**
8. **Критерии готовности (Acceptance Criteria)**:
   - `npm run check-visual-constitution` проходит при `literalAccentClasses: 0 (baseline: 0)`.
   - `npm run check-sizes` проходит, явно документируя статус защищённых файлов.
9. **Необходимые тесты и проверки**: `npm run check-visual-constitution`, `npm run check-sizes`.

---

### Этап 6 (P0 Release Gate). Дистрибуция, лицензионная чистота, обновления и натурный Windows Release QA

#### Задача 6.1. Лицензионный аудит (`THIRD_PARTY_NOTICES.md`), политика обновлений и безопасная миграция версий
1. **Название и проблема**: В проекте используются модели и библиотеки с различными лицензиями (в частности, Silero `v5_5_ru.pt` — CC-BY-NC-SA 4.0), не оформлен реестр лицензий и не закреплён безопасный механизм проверки обновлений с сохранением пользовательской БД.
2. **Зачем это нужно**: Исключить юридические риски при публичном релизе и гарантировать, что установка версии `1.0.x` поверх предыдущей не повредит пользовательские данные.
3. **Затронутые модули и файлы**: `THIRD_PARTY_NOTICES.md` (новый), `package.json`, `src/main/ipc/app.ipc.ts`, `src/renderer/features/settings/components/sections/GeneralSettingsSection.vue`.
4. **Что конкретно нужно сделать**:
   - Сформировать `THIRD_PARTY_NOTICES.md` с точным перечнем лицензий npm-зависимостей и используемых ML-моделей (Silero VAD, Silero TTS `v5_5_ru.pt`, GigaAM, Whisper, Qwen/Llama). Зафиксировать соответствие модели поставки лицензии `v5_5_ru.pt`.
   - Настроить `electron-builder` NSIS (`oneClick: false`, `perMachine: false`, `deleteAppDataOnUninstall: false`), чтобы при обновлении приложения папка `AppData/Roaming/arc-electron` (`arc.db`, ключи, макросы, скачанные модели) гарантированно сохранялась.
   - Добавить в `Settings → Система` кнопку «Проверить обновления» (безопасный запрос к GitHub Releases API с отображением чейнджлога, SHA-256 хэша установщика и ссылкой на скачивание новой версии).
5. **Зависимости**: Задача 1.1, Задача 2.1.
6. **Приоритет**: **P0 (Release Gate)**
7. **Оценка сложности**: **S**
8. **Критерии готовности (Acceptance Criteria)**:
   - В корне репозитория присутствует полный `THIRD_PARTY_NOTICES.md`.
   - Конфигурация NSIS явно сохраняет `userData` при обновлении версии.
9. **Необходимые тесты и проверки**: Проверка конфигурации `package.json` (`build.nsis`), `npm run build`.

#### Задача 6.2. Финальный натурный протокол испытаний на чистой Windows 10/11 (Clean-OS & Hardware Release QA)
1. **Название и проблема**: Успешное прохождение `lint`, `vitest` и `electron-vite build` в среде разработки не доказывает работоспособность скомпилированного `.exe` на чистой пользовательской ОС Windows.
2. **Зачем это нужно**: Проверить реальный путь конечного пользователя от запуска установщика до всех ключевых сценариев на чистой Windows.
3. **Затронутые модули и файлы**: Скомпилированный дистрибутив `dist/A.R.C. Setup 1.0.0.exe`, `docs/current-state.md`.
4. **Обязательный чек-лист испытаний Release QA (блокирующий условие выпуска v1.0)**:
   1. **Чистая установка (Clean Windows 10 & Windows 11 VM)**: установка `.exe` на чистую систему **без** установленных Python, Node.js, FFmpeg, Git. Проверка корректного запуска `better-sqlite3`, `sherpa-onnx-node` и `node-llama-cpp` из `app.asar.unpacked`.
   2. **Холодный старт и Первый запуск**: прохождение `FirstRunWizardModal` в облачном и локальном режимах; проверка микрофона и мгновенной работы TTS.
   3. **Персистентность и аварийное восстановление**: создание диалога, задачи, цели, узла памяти и макроса → принудительное завершение процесса через Диспетчер задач (`taskkill /F /IM`) → повторный запуск → проверка 100% сохранности всех записей в `arc.db`.
   4. **Обновление поверх предыдущей сборки**: запуск установщика новой версии поверх уже установленной с заполненной базой `arc.db` → проверка создания `pre-migrate` бэкапа и сохранения всех ключей, задач и сессий.
   5. **Работа полностью без интернета (Offline Airplane Mode)**: отключение сетевого адаптера → запуск A.R.C. → проверка отсутствия бесконечных зависаний, работы локального STT (`stt_worker.js`), локальной LLM (`node-llama-cpp` / Ollama), офлайн-озвучки и локального управления задачами.
   6. **Сон и блокировка экрана Windows (`Sleep / Resume / Win+L`)**: перевод ПК в сон на 5 минут при активном A.R.C. → пробуждение → проверка восстановления WebGL-контекста 3D-Реактора, работы микрофона (`useVoice`) и планировщика макросов (`powerMonitor`).
   7. **Тест на слабом оборудовании (8 ГБ RAM, встроенная графика iGPU)**: замер суммарного потребления RAM/CPU/GPU всех процессов A.R.C. в режимах `ACTIVE`, `BACKGROUND` и `GAME_MODE`.
5. **Зависимости**: Все задачи Этапов 1–5 и Задача 6.1.
6. **Приоритет**: **P0 (Final Release Gate)**
7. **Оценка сложности**: **M**
8. **Критерии готовности (Acceptance Criteria)**:
   - Все 7 пунктов натурного протокола пройдены без критических ошибок (`P0/P1 = 0`).
   - Результаты замеров на реальном оборудовании зафиксированы в `docs/current-state.md`.
9. **Необходимые тесты и проверки**: Автоматические гейты (`npm run lint`, `npm run check-sizes`, `npm run check-visual-constitution`, `npm test`, `npm run build`) + протокол ручного приёмочного тестирования на Windows 10/11.

---

## G. После релиза (Post-Release v1.1 / v2.0 Backlog)

Функции, вынесенные за пределы v1.0 для сохранения фокуса на стабильности и предсказуемости продукта:
1. **Полноценный клиент протокола MCP (Model Context Protocol)** (`Modules → tools-mcp`).
2. **Автономный мультиагентный рой (`Agent Swarm` / фоновый `ObjectiveExecutionLoop` без участия человека)**.
3. **Потоковая нейросетевая видео-сегментация в реальном времени (`Vision Phase 2`)**.
4. **Локальное клонирование голоса (F5-TTS / RVC) и студийная биометрическая калибровка тембра**.
5. **Кроссплатформенные инсталляторы для macOS (`.dmg`) и Linux (`.AppImage` / `.deb`)**.

---

## H. Нерешённые вопросы (Требуют решения владельца проекта)

1. **Юридическая и продуктовая модель распространения A.R.C. v1.0 (Некоммерческая vs Коммерческая)**:
   - Веса модели Silero TTS (`v5_5_ru.pt`) распространяются по лицензии **CC-BY-NC-SA 4.0 (только некоммерческое использование)**.
   - Если A.R.C. v1.0 выпускается как бесплатный / некоммерческий продукт — модель может поставляться в составе пакета с указанием авторства в `THIRD_PARTY_NOTICES.md`.
   - Если планируется коммерческая продажа — необходимо либо приобрести коммерческую лицензию у авторов Silero, либо использовать для коммерческой сборки модели под лицензией Apache-2.0 / MIT (Kokoro / Piper) или скачивать вес пользовательским скриптом напрямую с официального репозитория.

2. **Подпись Windows-инсталлятора сертификатом Code Signing (SmartScreen)**:
   - Будет ли для релиза v1.0 использоваться сертификат подписи кода Windows (OV/EV Code Signing), либо распространение среди первых пользователей будет сопровождаться опубликованными SHA-256 чек-суммами и инструкцией прохождения предупреждения Windows SmartScreen.

3. **Формат поставки Python-окружения для локального Silero TTS**:
   - *Вариант А (Рекомендуемый)*: Базовый установщик остаётся компактным (~180 МБ, с первых секунд работают Edge TTS и Windows SAPI), а предсобранный архив портативного окружения Silero (`python-embed + CPU torch`) докачивается в 1 клик из настроек речи с отображением прогресс-бара.
   - *Вариант Б*: Полный офлайн-инсталлятор (~950 МБ) со встроенным `python-embed` и `torch` внутри `extraResources`.

---

## I. Точка старта (Первые 5 шагов в точном порядке выполнения)

Все стартовые работы сгруппированы так, чтобы сначала закрыть риски потери данных и неработоспособности продакшен-сборки, не затрагивая защищённые зоны:

1. **Шаг 1 (Задача 1.1 — P0)**: Защита `DatabaseService.createOrRecoverSqliteDatabase` от удаления БД при `SQLITE_BUSY`/`EBUSY`, комплексный бэкап `arc.db + wal + shm` при коррупции, запрет тихого перехода на `JSONDatabase` в продакшене (`DB_SAFE_MODE`) и миграции `PRAGMA user_version` (`src/main/services/database.ts`, `src/main/services/classifiers/core-classifier.ts`).
2. **Шаг 2 (Задача 1.3 — P0)**: Создание `CredentialVaultService` (`safeStorage`/DPAPI), исправление передачи нерасшифрованного `enc:...` ключа в `ai.ipc.ts:357` и чтения ключей в `transcription.ipc.ts:123`, а также перенос логов `DialogLogger` из `app.getAppPath()` (`app.asar`) в `userData/logs` с `maskSecrets` (`src/main/services/dialog-logger.ts`, `src/main/ipc/ai.ipc.ts`, `src/main/ipc/transcription.ipc.ts`, `src/main/ipc/macros.ipc.ts`).
3. **Шаг 3 (Задача 1.2 — P0)**: Перевод `TasksService` и `tasks.store.ts` с полной перезаписи таблицы (`DELETE + INSERT`) на транзакционный гранулярный CRUD с SQLite в качестве единого источника истины и синхронизацией изменений от `TaskManagementTool` (`src/main/services/tasks.service.ts`, `src/main/ipc/tasks.ipc.ts`, `src/renderer/features/tasks/stores/tasks.store.ts`).
4. **Шаг 4 (Задачи 2.1 + 2.2 — P0)**: Включение `silero_server.py`, `silero_text_prep.py` в `extraResources` и `node-llama-cpp` в `asarUnpack` (`package.json`), добавление пути `resources/models/silero-v5/v5_5_ru.pt` в `silero_server.py`, создание единого резолвера мультимодальных моделей Gemini и включение стриминга в `ollama.provider.ts`.
5. **Шаг 5 (Задачи 2.3 + 3.1 + 3.2 — P1)**: Безаварийная работа `silero_server.py` без системного `ffmpeg`, перевод `MacroExecutor` (`actions/speak`) на `ttsService`, замена фейковых температур `42°C`/`46°C` в `system.ipc.ts`, закрытие тупиковых переходов в `ModulesView.vue` и подключение валидируемой LLM-декомпозиции в `ObjectiveEngine.ts`.
