# Второй проход: Верификация и критический пересмотр Дорожной карты (`PROJECT_RELEASE_ROADMAP_REVIEW.md`)

> **Документ**: `docs/PROJECT_RELEASE_ROADMAP_REVIEW.md`  
> **Назначение**: Техническая верификация выводов первого прохода аудита (`docs/PROJECT_RELEASE_ROADMAP.md`), разбор архитектурных уязвимостей предложенных решений, устранение противоречий и формирование безопасного, технически достоверного плана до **A.R.C. v1.0 Release Ready**.  
> **Ограничения прогона**: Ни один файл исходного кода (`src/**`), конфигураций сборки или защищённых зон (включая 3D-Реактор `src/renderer/components/reactor/**`, `useVoice.ts`, `Chat` и `Tasks` UI) не изменён. Все выводы строго привязаны к фактическим файлам, методам и номерам строк репозитория.

---

## 1. Подтверждённые проблемы (Повторная верификация P0 и P1 по исходному коду)

Каждая проблема ниже повторно проверена непосредственно по исходному коду репозитория с установлением точного механизма отказа и способа воспроизведения тестом.

### 1.1. [ПОДТВЕРЖДЕНО — P0] Удаление `arc.db`, `-wal` и `-shm` без резервной копии при любой ошибке открытия или `integrity_check`
- **Точная локализация**: `src/main/services/database.ts`, метод `DatabaseService.createOrRecoverSqliteDatabase` (строки `409–443`).
- **Фактическое поведение кода**:
  ```ts
  // src/main/services/database.ts:411-435
  try {
      instance = new DatabaseClass(dbPath);
      const check = instance.pragma('integrity_check');
      const isOk = Array.isArray(check) && check[0] && (check[0].integrity_check === 'ok' || check[0] === 'ok');
      if (!isOk) {
          throw new Error(`SQLite integrity_check returned: ${JSON.stringify(check)}`);
      }
  } catch (err: any) {
      // ... закрытие instance ...
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
      if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
      instance = new DatabaseClass(dbPath);
  }
  ```
- **Дополнительная находка второго прохода (ещё опаснее, чем отмечено в первом отчёте)**:
  Блок `catch (err: any)` перехватывает **любую** ошибку внутри `try`, а не только `SQLITE_CORRUPT` / `SQLITE_NOTADB` или неуспешный `integrity_check`. Если `new DatabaseClass(dbPath)` выбросит транзиентную ошибку блокировки файла (`SQLITE_BUSY` / `EBUSY` — например, предыдущий процесс Electron ещё не завершился при перезапуске или антивирус Windows сканирует файл), код попытается выполнить `fs.unlinkSync` над живой базой и её журналом `-wal`!
- **Воспроизводимость тестом**: 100% воспроизводится модульным тестом путём записи невалидного заголовка в временный файл `arc.db` (или мока `pragma('integrity_check')`), после чего `createOrRecoverSqliteDatabase` уничтожает исходный файл без создания `.bak`.

### 1.2. [ПОДТВЕРЖДЕНО — P0] Неатомарная перезапись таблицы задач и потеря изменений при конкурентной записи UI ↔ AI
- **Точная локализация**:
  - `src/main/services/tasks.service.ts`, метод `saveAllTasks` (строки `91–136`);
  - `src/main/services/tools/task-management.tool.ts`, метод `execute` (строки `63–160`);
  - `src/renderer/features/tasks/stores/tasks.store.ts`, метод `saveTasks` (строки `122–136`) и мутаторы (`updateTaskTitle`, `updateTaskStatus`, `addSubtask`, `toggleSubtask`, `addTask` — строки `312–620`).
- **Фактическое поведение кода**:
  1. В `tasks.service.ts:95` выполняется `DatabaseService.db.prepare('DELETE FROM arc_tasks').run()`, после чего в цикле `for (const t of tasks)` (строка `104`) поштучно вызывается `stmt.run(...)` **без `DatabaseService.db.transaction(...)`**.
  2. В `tasks.store.ts:122-136` любое изменение одной задачи в UI вызывает `saveTasks()`, который передаёт **весь массив `tasks.value`** из памяти рендерера в `tasks:saveAll`, полностью стирая таблицу `arc_tasks` в SQLite и записывая её заново.
  3. Когда ИИ-инструмент `TaskManagementTool` (`task-management.tool.ts:68, 113, 155`) создаёт, завершает или удаляет задачу через `tasksService.createTask` / `completeTask` / `deleteTask`, изменения попадают только в SQLite. Рендерер об этом не знает и при следующем клике пользователя в UI вызывает `saveTasks()`, **затирая созданную ИИ задачу**.
- **Воспроизводимость тестом**: Полностью воспроизводится интеграционным тестом: `tasks.store` загружает задачи → `tasksService.createTask` добавляет задачу в БД → `tasks.store` меняет статус старой задачи → созданная через сервис задача исчезает из БД.

### 1.3. [ПОДТВЕРЖДЕНО — P0] Проблемы упаковки Windows-дистрибутива (`package.json`) и первого запуска Silero TTS (`python_server.service.ts`)
- **Точная локализация**:
  - `package.json`, секция `build.asarUnpack` (строки `105–109`) и `build.extraResources` (строки `110–131`);
  - `src/main/services/python_server.service.ts`, методы `start` (строки `36–74`) и `setupVenvAndStart` (строки `76–130`);
  - `silero_server.py` (строки `24–45`, `191–310`).
- **Фактическое поведение кода**:
  1. В `package.json` в `extraResources` перечислены только `scripts/stt_worker.js`, `models/silero-vad`, `models/whisper-small` и `resources/models/silero-v5`. Файлы **`silero_server.py`, `silero_text_prep.py` и `requirements-silero.txt` отсутствуют в `extraResources`**, хотя `python_server.service.ts:40` в упакованном режиме ищет `path.join(process.resourcesPath, 'silero_server.py')`.
  2. В `package.json` в `asarUnpack` указаны только `better-sqlite3` и `sherpa-onnx*`. Модуль **`node-llama-cpp`** (и `@node-llama-cpp/*`) не распаковывается из `app.asar`.
  3. В `python_server.service.ts:93` команда `"${venvPython}" -m pip install -r "${reqFile}"` вызывается с `{ timeout: 30000 }` (30 секунд), чего недостаточно для скачивания и установки `torch` и `torchaudio`.
  4. В `silero_server.py:41` при отсутствии локального `v5_5_ru.pt` в корне скрипта сервер пытается скачать его из `https://models.silero.ai/models/tts/ru/v5_5_ru.pt`, при этом в `candidate_model_paths` (`silero_server.py:25-31`) **нет пути `resources/models/silero-v5/v5_5_ru.pt`**, куда `electron-builder` кладёт модель согласно `package.json:126-129`! Это важнейшая находка второго прохода: модель упаковывается в `resources/models/silero-v5`, но `silero_server.py` ищет её только в `./v5_5_ru.pt`, `~/.cache/torch/...` и `./Voice/models/v5_5_ru.pt`!

### 1.4. [ПОДТВЕРЖДЕНО — P0] Фатальная запись логов диалогов внутрь архива `app.asar` в продакшене (`DialogLogger`)
- **Точная локализация**: `src/main/services/dialog-logger.ts`, метод `DialogLogger.init` (строки `17–35`) и `DialogLogger.log` (строки `37–66`).
- **Фактическое поведение кода** *(обнаружено при углублённой проверке второго прохода)*:
  ```ts
  // src/main/services/dialog-logger.ts:21-31
  let projectRoot = process.cwd();
  try {
    projectRoot = app.getAppPath();
  } catch (err) { ... }
  const projectLogsDir = path.join(projectRoot, 'logs', 'dialogs');
  if (!fs.existsSync(projectLogsDir)) {
    fs.mkdirSync(projectLogsDir, { recursive: true });
  }
  this.logFilePathProject = path.join(projectLogsDir, 'dialogs.log');
  ```
  В собранном приложении с `asar: true` (`package.json:104`) вызов `app.getAppPath()` возвращает путь вида `C:\Users\...\AppData\Local\Programs\arc-electron\resources\app.asar`. Попытка выполнить `fs.mkdirSync` и `fs.appendFileSync` внутри `app.asar/logs/dialogs/dialogs.log` в продакшене гарантированно падает с `ENOTDIR` / `EROFS` при каждом сообщении чата! Кроме того, `DialogLogger` пишет сырой текст без маскирования секретов (`maskSecrets`) и без ротации размера файла.

### 1.5. [ПОДТВЕРЖДЕНО — P1] Бутафорская телеметрия, шаблонные заглушки и тупиковые переходы
- **Точная локализация**:
  - `src/main/ipc/system.ipc.ts:196-198`: захардкожены `temperature: 42, cpuTemperature: 42, gpuTemperature: 46`; строки `205-213`: статический словарь `system:modules`.
  - `src/main/services/objective/ObjectiveEngine.ts:754-767`: метод `decomposeObjective` не обращается к AI-сервису, а записывает англоязычные константы `"Achieve baseline trajectory of..."`, `"npm run lint"`, `"npm run build"`.
  - `src/renderer/features/tasks/composables/useAiDecomp.ts:15-51`: функция `decomposeTaskWithAI` содержит комментарий `// Simulate smart AI analysis and decomposition steps based on task keywords`, ждёт `setTimeout(..., 1200)` и вставляет один из 4 захардкоженных списков подзадач по ключевым словам вместо вызова LLM.
  - `src/renderer/features/modules/components/ModulesView.vue:259-263`: 5 модулей со статусом `calibrating` при клике вызывают `openModuleTab` с вкладками `orchestrator`, `agents`, `tools`, `architecture`, `sandbox`, которых нет в `HolographicProjectionPanel.vue` (отображается пустой экран `isUnhandledTab`).
  - `src/main/ipc/launcher.ipc.ts:60-63`: `launcher:refreshIndex` возвращает `new Promise(resolve => setTimeout(() => resolve(true), 2000))`.
  - `src/main/ipc/voice.ipc.ts:281-284`: `voice:calibration-start/done/reset` — пустые заглушки `{ success: true }`.
  - `src/renderer/features/transcription/composables/useTranscription.ts:89-100`: глобальное переопределение `console.log`, `console.warn`, `console.error` при каждом вызове composable без очистки в `onUnmounted`.

---

## 2. Опровергнутые или уточнённые утверждения первого отчёта

### 2.1. Утверждение о «несуществующей модели `gemini-3.5-flash` и гарантированной ошибке 404» — ОПРОВЕРГНУТО / ПЕРЕКВАЛИФИЦИРОВАНО
- **Что было написано в первом проходе**: Утверждалось, что идентификатор `gemini-3.5-flash` не существует в Google API и гарантированно вызывает HTTP 404, поэтому его нужно механически заменить на `gemini-2.5-flash`.
- **Что показала повторная проверка кода (`src/main/ipc/ai.ipc.ts:352-386`, `src/main/ipc/transcription.ipc.ts:121-158`, `src/main/services/llm/providers/provider-manager.ts:85`)**:
  1. В `ai.ipc.ts:365-375` и `transcription.ipc.ts:129-141` используется официальный SDK `@google/genai` со специальным заголовком `headers: { 'User-Agent': 'aistudio-build' }`, где алиас `gemini-3.5-flash` поддерживается маршрутизацией Google AI. Объявлять этот идентификатор «несуществующим» было технически неверно.
  2. **Однако повторная инспекция этих же строк вскрыла две реальные, стопроцентные ошибки в коде вызова Gemini, которые в первом проходе были упущены за неверным диагнозом**:
     - **Ошибка А (Передача зашифрованного ключа в GoogleGenAI в `ai.ipc.ts:354-358`)**:
       ```ts
       const providers = aiService.getProviders();
       const geminiProvider = providers.find(p => (p.model.toLowerCase().includes('gemini') || p.name.toLowerCase().includes('gemini')) && p.apiKey && p.enabled);
       if (geminiProvider) {
           apiKey = geminiProvider.apiKey; // <-- БАГ: geminiProvider.apiKey хранится в виде "enc:..." или "b64:..."!
       }
       ```
       Метод `aiService.getProviders()` возвращает провайдеров с зашифрованным полем `apiKey` (`enc:...`). В отличие от `openai.provider.ts:145`, где вызывается `decryptApiKey(provider.apiKey)`, в `ai.ipc.ts:357` **расшифровка `decryptApiKey` НЕ вызывается**! В результате в `new GoogleGenAI({ apiKey })` передаётся строка `"enc:..."`, что приводит к гарантированному отказу авторизации при анализе экрана Vision!
     - **Ошибка Б (Игнорирование пользовательских настроек ключей в `transcription.ipc.ts:123-126`)**:
       ```ts
       const apiKey = process.env.GEMINI_API_KEY;
       if (!apiKey) {
         throw new Error('Ключ API GEMINI_API_KEY не задан в параметрах системы. Пожалуйста, добавьте его в панель Settings > Secrets.');
       }
       ```
       Облачная транскрибация вообще не проверяет ни `providerManager` (`ai-providers.json`), ни `secure-keys.json` (`settings.ipc.ts`), требуя только переменную окружения `process.env.GEMINI_API_KEY` и показывая сообщение про панель `Settings > Secrets` веб-среды AI Studio. На обычном Windows ПК пользователя, введшего ключ Gemini в настройках A.R.C., облачная транскрибация всегда выбросит эту ошибку.
     - **Ошибка В (Рассинхронизация конфигурации моделей)**: В `provider-manager.ts:85` используется `google/gemini-2.5-flash`, а в `ai.ipc.ts:375`, `transcription.ipc.ts:141` и `useTranscription.ts:48` жёстко зашита строка `gemini-3.5-flash` без возможности выбора пользователем или проверки доступности через API (`models.list` / `models.get`).

### 2.2. Оценка готовности «72%» — ИСКЛЮЧЕНА КАК НЕОБОСНОВАННАЯ МЕТРИКА
- **Почему убрано**: Число «72%» в первом отчёте не опиралось на формальную весовую методику. Наличие одного критического блокера в упаковке или сохранности БД делает невозможным публичный релиз вне зависимости от процента готовых экранов. Вместо абстрактного процента введена строгая матрица готовности по 8 релизным гейтам (Release Gates G1–G8).

---

## 3. Критика и исправление технических решений первого отчёта

Ниже разобраны архитектурные уязвимости решений, предложенных в первом проходе, и сформулированы инженерно надёжные замены.

### 3.1. Безопасное восстановление SQLite с учётом WAL/SHM и блокировок (`database.ts`)
- **Недостаток первоначального решения**: В первом отчёте предлагалось при ошибке в `createOrRecoverSqliteDatabase` просто копировать `arc.db` в `arc.db.corrupted.<timestamp>.bak` перед удалением.
- **Почему это опасно**:
  1. В режиме `WAL` (`journal_mode = WAL`) последние транзакции находятся в `arc.db-wal`. Если сохранить только `arc.db` и удалить `arc.db-wal`, данные последних сессий будут потеряны даже при восстановлении через `sqlite3 .recover`.
  2. Если `createOrRecoverSqliteDatabase` попал в `catch` не из-за коррупции, а из-за `SQLITE_BUSY` / `EBUSY` (файл занят другим процессом), удаление или переименование БД разрушит рабочую базу.
- **Правильное архитектурное решение**:
  1. Разделить обработку ошибок при открытии SQLite:
     - При `SQLITE_BUSY` / `SQLITE_LOCKED` / `EBUSY` / `EACCES` — выполнять до 3 повторных попыток с экспоненциальной задержкой (200 мс → 500 мс → 1000 мс) и **категорически запретить удаление файлов БД** при ошибках блокировки или доступа.
     - Только при подтверждённой коррупции (`SQLITE_CORRUPT`, `SQLITE_NOTADB` или `PRAGMA quick_check` / `integrity_check !== 'ok'`):
       - сначала закрыть дескриптор `instance.close()`;
       - создать директорию `userData/database/backups/corrupted-<timestamp>/`;
       - переместить туда **все три файла атомарно** (`arc.db`, `arc.db-wal`, `arc.db-shm`);
       - попытаться автоматически восстановить данные из последнего здорового суточного снепшота (`arc.db.daily.bak`, создаваемого через нативный `instance.backup()` раз в сутки при чистом `quick_check`), и только при его отсутствии инициализировать новую БД с обязательным показом диалогового уведомления пользователю.

### 3.2. Проблема конкурентной записи задач (`Tasks`) и единый источник истины
- **Недостаток первоначального решения**: Предлагалось оставить `saveAllTasks(tasks)` (полную перезапись массива из рендерера в транзакции) и добавить событие `tasks:changed`.
- **Почему это не решает проблему**: Как справедливо указано в ревью, при гонке (ИИ добавил задачу в SQLite → отправил `tasks:changed` → пользователь в этот же момент отредактировал задачу в UI и вызвал `saveAllTasks` со своим локальным массивом `tasks.value`) локальный массив рендерера всё равно перезапишет всю таблицу `arc_tasks` и уничтожит задачу ИИ.
- **Правильное архитектурное решение (без нарушения Scope Lock на UI `TasksView.vue`)**:
  1. **SQLite (`arc_tasks`) объявляется единственным источником истины (Single Source of Truth)**. `localStorage` используется исключительно как read-only кэш для мгновенного первого рендера до ответа IPC.
  2. В `tasks.service.ts` и `tasks.ipc.ts` вводятся атомарные гранулярные CRUD-операции: `tasks:upsert-one(task)` (с полем `updated_at`), `tasks:delete-one(id)`, `tasks:batch-upsert(tasks)` (без `DELETE FROM arc_tasks`!).
  3. В `tasks.store.ts` мутаторы (`addTask`, `updateTaskTitle`, `updateTaskStatus`, `toggleSubtask` и др.) вызывают гранулярный `tasks:upsert-one(changedTask)` вместо отправки всего массива через `saveAllTasks`. Метод `DELETE FROM arc_tasks` оставляется только для явного действия «Сбросить все задачи» (`triggerReset`).
  4. Любое изменение в `tasks.service.ts` (от UI или от `TaskManagementTool`) транслирует событие `tasks:updated { task, deletedId }` во все окна, где `tasks.store.ts` точечно обновляет элемент по `id` (с проверкой `incoming.updated_at >= local.updated_at`).

### 3.3. Судьба `JSONDatabase` при недоступности SQLite (`database.ts`)
- **Недостаток первоначального решения**: В первом отчёте констатировалась неполноценность `JSONDatabase`, но не было определено, что с ней делать.
- **Почему это опасно**: Тихий переход на `JSONDatabase` (`arc_fallback.json`) при сбое загрузки `better-sqlite3` приводит к тому, что пользователь видит пустую историю чатов, пустую память и неработающий FTS5-поиск, думая, что его данные пропали, и начинает создавать новые данные в несовместимом JSON-файле.
- **Правильное архитектурное решение**:
  1. Запретить тихий переход на `JSONDatabase` в production-режиме Electron.
  2. Если нативный модуль `better-sqlite3` не загрузился или `arc.db` недоступна после всех попыток восстановления, главный процесс переводит приложение в **явный диагностический режим (`DB_SAFE_MODE`)**:
     - в UI выводится заметный системный баннер с точной причиной ошибки (`Native SQLite driver error` или `Database file locked by another process`) и кнопками «Повторить подключение» / «Открыть папку БД»;
     - `JSONDatabase` сохраняется исключительно для легковесных unit-тестов (`NODE_ENV === 'test'`), где нативный бинарник может не требоваться.

### 3.4. Безопасное хранение API-ключей без самодельной криптографии (`settings.ipc.ts`, `provider-manager.ts`)
- **Недостаток первоначального решения**: В Задаче 1.3 первого отчёта предлагалось при недоступности `safeStorage` шифровать ключи через `crypto.createCipheriv('aes-256-gcm', machineDerivedKey, iv)`.
- **Почему это ошибочно**: Любой `machineDerivedKey`, вычисленный детерминированно из параметров ОС/железа (`os.hostname()`, `os.userInfo()`, CPU ID), легко воспроизводится любым локальным процессом или вредоносным скриптом на той же машине и создаёт ложное чувство безопасности (Security Theater).
- **Правильное архитектурное решение**:
  1. Создать единый сервис `CredentialVaultService`, использующий **исключительно системное хранилище ОС через Electron `safeStorage` (Windows DPAPI на Windows 10/11)**.
  2. Устранить дублирование между `config/secure-keys.json` и `config/ai-providers.json` + подключить автоматическую расшифровку ключей в `ai.ipc.ts:357` и `transcription.ipc.ts:123`.
  3. При первом запуске после обновления выполнить **автоматическую миграцию** ранее сохранённых ключей (`b64:` → `safeStorage.encryptString` → `enc:`).
  4. Если `safeStorage.isEncryptionAvailable()` возвращает `false` (например, в нестандартном окружении без системного keyring):
     - **не сохранять** ключи на диск в `base64` молча;
     - держать ключ только в оперативной памяти на текущую сессию (`Session-Only Key`) ЛИБО запрашивать у пользователя явное подтверждение перед записью на диск с честным предупреждением о недоступности системного шифрования ОС.

### 3.5. Портативность Silero TTS, Python и FFmpeg в Windows-сборке (`python_server.service.ts`, `silero_server.py`)
- **Недостаток первоначального решения**: Предлагалось увеличить таймаут `pip install` с 30 секунд до 10 минут.
- **Почему этого недостаточно**: Даже с 10-минутным таймаутом `python -m venv` упадёт у любого пользователя, на чьём ПК вообще не установлен системный Python 3.10–3.12!
- **Правильное архитектурное решение**:
  1. **Исправить пути поиска модели в `silero_server.py:25-31`**: добавить `os.path.join(script_dir, 'models', 'silero-v5', 'v5_5_ru.pt')` и `os.path.join(script_dir, 'resources', 'models', 'silero-v5', 'v5_5_ru.pt')`, чтобы сервер находил уже упакованную в `extraResources` модель `v5_5_ru.pt` и не пытался скачивать её заново из интернета.
  2. **Сделать `ffmpeg` опциональным в `silero_server.py`**: сейчас `/tts` (`silero_server.py:200-310`) вызывает `subprocess.run(['ffmpeg', ...])` для компрессора и эквалайзера. Если `ffmpeg` не найден в `PATH` или рядом с приложением, `silero_server.py` должен автоматически отдавать WAV-аудио напрямую через уже используемые `numpy` + `scipy.signal.fftconvolve` + `soundfile` (как это уже сделано в `/tts_stream` на строках `156-164`!), без падения синтеза.
  3. **Исключить зависимость от системного Python у пользователя**:
     - Включить в сборку (или скачивать как единый предсобранный архив `silero-runtime-win-x64.zip` из релизного репозитория по кнопке в настройках речи) **Python Embeddable Package для Windows x64** с предустановленными CPU-колёсами `torch`, `scipy`, `soundfile`, `flask`.
     - Пока локальный пакет Silero не развёрнут или загружается, `ttsService` без пауз и ошибок использует `Edge TTS` (облачный) / `Windows SAPI` (офлайн), а статус в UI честно отображает активный движок озвучки.

### 3.6. Фоновый планировщик таймерных макросов (`MacroExecutor.ts`)
- **Недостаток первоначального решения**: Предлагалось просто проверять совпадение строки `HH:MM` раз в минуту.
- **Почему это ненадёжно**:
  - Если ПК был в спящем режиме в `09:00` и проснулся в `09:04`, проверка `currentHHMM === '09:00'` пропустит запуск.
  - Если пользователь перезапустил A.R.C. в течение той же минуты `09:00`, макрос без персистентной отметки сработает повторно.
  - При смене системного времени или часового пояса возможны ложные срабатывания.
- **Правильное архитектурное решение**:
  1. Хранить состояние выполнения расписаний макросов в SQLite (или `userData/macros-schedule-state.json`): `{ macroId, nodeId, lastTriggeredDate: 'YYYY-MM-DD', lastTriggeredTimestamp }`.
  2. Подписаться на события `powerMonitor.on('resume')` и `powerMonitor.on('unlock-screen')` в Electron.
  3. Ввести явную политику догоняющего запуска (`Catch-Up Policy`): если с момента назначенного времени `HH:MM` сегодняшнего дня прошло не более настраиваемого окна (например, `≤ 15 минут`, когда ПК выходил из сна) и `lastTriggeredDate !== todayLocal`, макрос выполняется (либо выводит тост «Пропущен макрос по расписанию — Запустить?» для макросов с shell-командами); если прошло `> 15 минут` — пропуск логируется без неожиданного запуска старых команд.

### 3.7. Валидация планов и защита от дубликатов в `ObjectiveEngine` и `useAiDecomp`
- **Недостаток первоначального решения**: Предлагалось просто вызывать LLM в `ObjectiveEngine.decomposeObjective` и сразу записывать возвращённый JSON в таблицы `outcomes` и `arc_tasks`.
- **Почему это опасно**: LLM может вернуть невалидный JSON, пустые заголовки, дубликаты уже существующих задач или десятки мусорных задач, которые без согласия пользователя засорят рабочее пространство `Tasks`.
- **Правильное архитектурное решение**:
  1. Строгая схема валидации ответа LLM (проверка типов полей, ограничение длины заголовков `3..150` символов, лимит `≤ 7` задач за одну декомпозицию).
  2. Дедупликация по нормализованному тексту относительно уже существующих `arc_outcomes` и `arc_tasks` данной цели.
  3. **Двухфазное применение (Preview & Confirm)**: ИИ-декомпозиция возвращает предпросмотр предложенных Outcomes и Tasks (или создаёт их в статусе черновика маршрута `DRAFT`), а запись задач в операционный пул `arc_tasks` происходит только после нажатия пользователем кнопки подтверждения маршрута (`approveRoute`).

### 3.8. Устранение противоречия по `IGNORE_FILES` и размерам защищённых файлов
- **Противоречие первого отчёта**: Требовалось одновременно «не трогать Protected Areas (`useVoice.ts` — 2104 строки, `built-in-llm.service.ts` — 1210 строк, `useMacroEditor.ts` — 1082 строки, `ObjectiveEngine.ts` — 949 строк)» и получить «0 файлов в `IGNORE_FILES` свыше лимитов».
- **Исправление**:
  - Требование «0 файлов в `IGNORE_FILES`» **исключено из критериев Release Ready**.
  - Скрипт `scripts/check-file-sizes.js` разделяет список на две явные категории:
    1. `PROTECTED_ARCHITECTURE_FILES` — защищённые `AGENTS.md` файлы (`useVoice.ts`, `built-in-llm.service.ts`, `useMacroEditor.ts`, `ObjectiveEngine.ts`, `tasks.store.ts`, `settings.store.ts`), которые **запрещено рефакторить ради уменьшения числа строк**;
    2. `LEGACY_DEBT_ALLOWLIST` — обычные незащищённые файлы, которые декомпозируются планово (P2) только тогда, когда в них вносятся функциональные правки.

### 3.9. Реалистичное разделение сценария First-Run («Zero-to-Core») и метрик ресурсов
- **Исправление сценария первого запуска**:
  - **Мастер первичной настройки (UI Setup)**: проходится пользователем **за ≤ 60 секунд**.
  - **Готовность в облачном режиме (Cloud Mode)**: чат и голос (через Edge TTS / Windows SAPI) доступны **сразу после завершения мастера** и проверки ключа.
  - **Готовность в локальном режиме (Local Mode / Silero TTS)**: зависит от скорости интернет-соединения пользователя (скачивание GGUF модели ~1.0–4.5 ГБ и/или пакета Silero). При этом пользователь не блокируется экраном загрузки: он сразу попадает в рабочее пространство с индикатором загрузки в доке (`DownloadNotificationDock.vue`), а базовые голосовые команды и системное управление работают немедленно.
- **Исправление метрик производительности (RAM / CPU / GPU)**:
  - Вместо жёстких абсолютных констант («≤ 650 МБ RAM, 0% GPU»), не учитывающих накладные расходы всех процессов Chromium/Electron и драйверов Windows DWM, вводятся **измеримые профильные ориентиры по всем процессам дерева приложения (`Main + Renderer + GPU Process + STT Worker + Python TTS`)** с привязкой к 3 классам оборудования (Tier 1 Low-End iGPU 8GB, Tier 2 Mid-Range 16GB, Tier 3 High-End dGPU).
  - Целевой показатель GPU в свёрнутом состоянии (`hidden`): **прекращение цикла `requestAnimationFrame` Three.js (0 кадров/с рендера сцены)** и снижение фоновой нагрузки GPU до уровня покоя Chromium (`< 2%`).

---

## 4. Новые обязательные требования (Пропущенные в первом проходе)

В дорожную карту добавлены 5 обязательных для десктопного релиза направлений, которые отсутствовали или были упомянуты лишь вскользь:

### 4.1. Безопасность логов, квотирование и диагностический бандл (`Logging & Diagnostics Hygiene`)
- **Проблема в коде**:
  1. `DialogLogger` (`src/main/services/dialog-logger.ts:23-31`) пишет в `path.join(app.getAppPath(), 'logs', 'dialogs', 'dialogs.log')`, что в упакованном `app.asar` вызывает ошибку записи, а в dev-режиме бесконечно растит лог-файл без ротации и без маскирования секретов (`maskSecrets`).
  2. Отсутствует кнопка «Экспортировать диагностический отчёт» (обезличенный архив логов, версии ОС/GPU, состояния БД и списка активных модулей без API-ключей и без личных переписок) для поддержки пользователей.
- **Требование**: Перенести все файловые логи в `path.join(app.getPath('userData'), 'logs')`, ввести ротацию (`≤ 5 МБ` × 3 файла), пропускать все записи через `maskSecrets` (`src/shared/utils/log-sanitizer.ts`), а запись полного текста диалогов в `dialogs.log` сделать строго opt-in настройкой режима отладки.

### 4.2. Лицензионный аудит ML-моделей и сторонних компонентов (`Licensing & Distribution Compliance`)
- **Критический юридический и продуктовый риск**:
  - Модель **Silero TTS (`v5_5_ru.pt`)** распространяется авторами (snakers4/silero-models) по лицензии **CC-BY-NC-SA 4.0 (Non-Commercial)**, если не приобретена коммерческая лицензия.
  - Модели **GigaAM** и **Whisper**, а также шрифты и библиотеки (`litegraph.js`, `three`, `sherpa-onnx`) имеют собственные лицензионные требования (MIT / Apache-2.0 / BSD).
- **Требование**: До публичного распространения дистрибутива зафиксировать модель распространения A.R.C. (некоммерческий Open-Source / Freeware релиз или коммерческий продукт). Если продукт коммерческий — не вшивать вес `v5_5_ru.pt` внутрь платного инсталлятора без лицензии (скачивать с официального хаба на стороне пользователя либо использовать Apache-2.0 альтернативы: Piper / Kokoro). Сформировать файл `THIRD_PARTY_NOTICES.md`.

### 4.3. Политика цифровой подписи установщика и Windows SmartScreen (`Code Signing & Installer Trust`)
- **Требование**: Неподписанный NSIS `.exe` установщик блокируется экраном Windows Defender SmartScreen («Система Windows защитила ваш компьютер») и антивирусами (особенно при наличии дочерних процессов `stt_worker.js`, `python.exe` и вызовов `powershell.exe` / `user32.dll`). Для v1.0 необходимо определить процедуру подписи (OV/EV Code Signing сертификат или документированный профиль сборки для тестеров с инструкцией верификации SHA-256 хэша).

### 4.4. Стратегия обновлений и сохранности пользовательских данных при апгрейде (`Update & Migration Policy`)
- **Требование**: При установке новой версии A.R.C. поверх предыдущей NSIS-инсталлятор не должен удалять или затирать `AppData/Roaming/arc-electron` (`arc.db`, `config/ai-providers.json`, `macros/`, скачанные модели в `models/`). Перед применением миграций новой версии `DatabaseService` обязан автоматически создавать резервную копию `arc.db.pre-migrate-v<old>-to-v<new>.bak`. Для v1.0 достаточно безопасной проверки наличия новой версии через GitHub Releases API с уведомлением в `Settings` и ручным скачиванием установщика (без риска поломки нативных модулей фоновым автообновлением).

### 4.5. Протокол натурных испытаний на чистой Windows (`Hardware & Clean-OS Release QA`)
- **Требование**: Статические проверки (`lint`, `vitest`, `electron-vite build`) в Linux-контейнере являются необходимым, но **не достаточным** условием релиза. Финальный гейт перед публикацией v1.0 обязан включать чек-лист проверок на чистой ВМ/ПК с Windows 10 и Windows 11 (без установленных Python, Node.js, FFmpeg, Git и Visual C++ Redistributable).

---

## 5. Исправления приоритетов и зависимостей

Приоритеты задач пересмотрены и выстроены по степени реального риска для пользователя и его данных:

| Приоритет | Направление | Состав работ (Задачи обновлённого Roadmap) | Обоснование приоритета |
| :--- | :--- | :--- | :--- |
| **P0 (Blocker)** | **1. Целостность БД и защита от потери данных** | Защита от удаления БД при `SQLITE_BUSY`, атомарный бэкап `arc.db + wal + shm` при коррупции, миграции `PRAGMA user_version`, запрет тихого перехода на `JSONDatabase` в продакшене, фикс `DialogLogger` (`app.asar` → `userData/logs` + `maskSecrets`). | Потеря данных пользователя или падение при логировании в `app.asar` недопустимы ни в одной сборке. |
| **P0 (Blocker)** | **2. Упаковка Windows и нативные модули** | Включение `silero_server.py`, `silero_text_prep.py` в `extraResources`, `node-llama-cpp` в `asarUnpack`, исправление путей поиска `v5_5_ru.pt` в `silero_server.py`. | Без этого собранный `.exe` неработоспособен после установки. |
| **P0 (Blocker)** | **3. Стабильность AI-провайдеров и ключей** | Исправление передачи нерасшифрованного `enc:...` ключа в `ai.ipc.ts:357`, подключение `CredentialVaultService` (`safeStorage`/DPAPI) в `transcription.ipc.ts:123`, единый конфиг моделей для Vision/Transcription с проверкой доступности, стриминг в `ollama.provider.ts`. | Основное назначение продукта — работа ИИ-ядра и мультимодальных функций. |
| **P1 (High)** | **4. Голосовой контур и автономность TTS** | Работа `silero_server.py` без системного `ffmpeg` (`numpy/scipy` WAV fallback), портативная поставка/фоновая установка окружения Silero с мгновенным фолбэком на Edge TTS / SAPI, перевод `MacroExecutor` (`actions/speak`) на `ttsService`. | Голосовой интерфейс — ключевая продуктовая особенность A.R.C. |
| **P1 (High)** | **5. Единый источник истины Tasks и Objectives** | Перевод `Tasks` на гранулярный CRUD в SQLite вместо полной перезаписи `DELETE + INSERT`, синхронизация изменений от `TaskManagementTool`, реальная LLM-декомпозиция в `ObjectiveEngine` с валидацией схемы, дедупликацией и подтверждением (`approveRoute`). | Завершённость и надёжность ежедневных рабочих сценариев оператора. |
| **P1 (High)** | **6. Ликвидация бутафории и тупиков UI** | Удаление фейковых `42°C`/`46°C` из `system.ipc.ts`, закрытие 5 несуществующих вкладок в `ModulesView.vue`, привязка видеопотока в `VisionTabView.vue`, уборка глобального перехвата `console.*` в `useTranscription.ts`, персистентный планировщик макросов с обработкой сна ОС и реальный индексатор Лаунчера. | Достоверность интерфейса и соблюдение Конституции A.R.C. |
| **P1 (High)** | **7. First-Run Onboarding и диагностика** | 3-шаговый мастер первого запуска (раздельные сценарии Cloud vs Local), индикатор безопасного режима БД, экспорт обезличенного диагностического отчёта. | Позволяет обычному пользователю начать работу без чтения документации. |
| **P2 (Medium)** | **8. Профилирование и оптимизация слабых ПК** | Инструментальный замер потребления всех процессов (`Main + Renderer + GPU + STT + TTS`), ленивая загрузка резервного Whisper Small в `stt_worker.js`, адаптивный стартовый пресет графики. | Выполняется на основе реальных замеров после стабилизации P0/P1. |
| **P2 (Medium)** | **9. Архитектурная гигиена и Фаза 6 UI** | Погашение 19 литералов акцента (`docs/phase6-sweep-worklist.md`), разделение `check-file-sizes.js` на `PROTECTED_ARCHITECTURE_FILES` и `LEGACY_DEBT_ALLOWLIST`, плановая декомпозиция незащищённых файлов при их изменении. | Улучшение поддерживаемости без риска для защищённых зон. |
| **P0 (Release Gate)** | **10. Чистый Windows Release QA и дистрибуция** | Испытания установщика на чистой Windows 10/11 (без Python/Node/FFmpeg), проверка миграции данных при обновлении, проверка офлайн-режима, аудит лицензий (`THIRD_PARTY_NOTICES.md`). | Финальный фильтр перед публикацией релиза v1.0. |

---

## 6. Сводный перечень изменений, внесённых в `docs/PROJECT_RELEASE_ROADMAP.md`

На основании данного ревью основной документ `docs/PROJECT_RELEASE_ROADMAP.md` обновлён до редакции **v1.1 (Validated & Hardened)**:
1. **Раздел A и Раздел D**: Удалена субъективная оценка «72%»; введена система из **8 обязательных релизных гейтов (G1–G8)**. Сценарий «Zero-to-Core» разделён на быстрый старт мастера (≤ 60 с), мгновенный Cloud-режим и асинхронную фоновую подготовку Local-режима/Silero. Жёсткие константы RAM/GPU заменены на методику замера всего дерева процессов по 3 классам оборудования. Удалено требование «0 файлов в `IGNORE_FILES`» для защищённых зон.
2. **Раздел C и Раздел E**: Исправлена формулировка по Gemini (`ai.ipc.ts:357`, `transcription.ipc.ts:123`, `provider-manager.ts:85`); добавлены найденные во втором проходе критические дефекты: запись `DialogLogger` в `app.asar` (`dialog-logger.ts:23-31`), отсутствие пути `resources/models/silero-v5/v5_5_ru.pt` в `silero_server.py:25-31`, риск удаления БД при `SQLITE_BUSY` (`database.ts:418-433`) и имитация ИИ-декомпозиции в `useAiDecomp.ts:15-51`.
3. **Раздел F (Roadmap)**:
   - **Задача 1.1**: Добавлена защита от `SQLITE_BUSY`/`EBUSY`, комплексный бэкап `arc.db + wal + shm` и перевод в явный `DB_SAFE_MODE` вместо тихого `JSONDatabase`.
   - **Задача 1.2**: Вместо `saveAllTasks + tasks:changed` спроектирован переход на гранулярный CRUD с SQLite в качестве единого источника истины.
   - **Задача 1.3**: Убрано самодельное шифрование `machineDerivedKey`; зафиксировано использование системного `safeStorage` (DPAPI), миграция старых ключей, исправление `decryptApiKey` в `ai.ipc.ts:357` и `transcription.ipc.ts:123`, а также перенос `DialogLogger` в `userData/logs` с `maskSecrets`.
   - **Задача 2.1**: Добавлено исправление путей поиска `v5_5_ru.pt` в `silero_server.py`, безаварийный обход отсутствующего `ffmpeg` через `numpy/scipy` и стратегия поставки предсобранного Python Embeddable окружения.
   - **Задача 2.2**: Заменена механическая замена `gemini-3.5-flash` на создание единого резолвера мультимодальной модели с проверкой доступности через API и единым источником ключа.
   - **Задача 3.2**: В `ObjectiveEngine.decomposeObjective` добавлены схема валидации, дедупликация и двухфазное подтверждение пользователем (`DRAFT` → `approveRoute`).
   - **Задача 3.3**: Планировщик макросов дополнен персистентным журналом запусков, обработкой выхода Windows из сна (`powerMonitor`) и окном догоняющего запуска (`Catch-Up Window`).
   - **Задача 6.1 и 6.2**: Финальный этап разделён на техническую верификацию сборки/лицензий/обновлений (Задача 6.1) и полноценный протокол **Clean Windows 10/11 & Hardware Release QA** (Задача 6.2).
