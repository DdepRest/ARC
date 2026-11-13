# MASTER TECHNICAL TASK — A.R.C. v1.0.13
## DEEP RUNTIME AUDIT, SUBSYSTEM INTERACTION & PRODUCTION VALIDATION

**Проект:** A.R.C. (Autonomous Reactor Core)  
**Целевая версия:** `1.0.13` (база: стабилизированный срез `1.0.12`)  
**Режим работы:** Независимый глубокий инженерный аудит рантайма → точечное исправление только доказанных дефектов → воспроизводимая верификация  
**Правило дисциплины:** «Одна задача — одно ТЗ». Запрещено переписывать работающие модули «для красоты» или добавлять новые продуктовые функции.

---

## 0. БАЗОВЫЕ АКСИОМЫ И ОГРАНИЧЕНИЯ ДЛЯ ИСПОЛНИТЕЛЯ

1. **Аудит прежде изменений (Audit-First Principle)**:
   - Запрещено модифицировать код подсистемы до того, как проведён её статический и динамический анализ, выявлена конкретная уязвимость или гонка состояний и сформулирован воспроизводимый сценарий отказа.
   - Если проверка показывает, что узел работает корректно — зафиксировать это в отчёте с указанием файла, строк кода и покрывающего теста, **не меняя код**.

2. **Доказательства вместо самоаттестации (Evidence Over Self-Certification)**:
   - Собственный текстовый отчёт агента **не является доказательством**.
   - Каждое утверждение о состоянии кода или исправлении обязано сопровождаться:
     - точным диапазоном строк и цитатой кода (`файл:строки`);
     - воспроизводимым автоматическим тестом (`vitest`);
     - дословным выводом команд проверки (`Grep Verbatim Rule` из `AGENTS.md`).
   - Всё, что невозможно проверить в Linux-контейнере AI Studio (установка NSIS `.exe`, живой Windows DPAPI, Windows SAPI, WASAPI/GPU драйверы Windows), обязано получать явный статус **`NOT VERIFIED (Linux Container Boundary)`**.

3. **Неприкосновенность защищённых зон (`AGENTS.md` §3)**:
   - Строго запрещено изменять без отдельного прямого поручения:
     - `src/renderer/components/reactor/**`, `ReactorCore.vue`, `useReactor3D.ts`;
     - `src/renderer/composables/useVoice.ts`;
     - `src/main/services/built-in-llm.service.ts`;
     - `src/renderer/features/commands/composables/useMacroEditor.ts`;
     - `src/main/services/objective/ObjectiveEngine.ts`;
     - `src/renderer/components/panels/BottomBar.vue`;
     - заблокированные пространства `Chat` и `Tasks` (кроме случая, если в ходе аудита обнаружен критический P0-дефект потери данных/падения — в этом случае сначала запросить разрешение с доказательством).

4. **Архитектурные лимиты и конституция (`AGENTS.md` §5–6)**:
   - Файлы логики/сервисов/компонентов: **≤ 400 строк** (`npm run check-sizes`).
   - Файлы данных/сторов/реестров: **≤ 800 строк**.
   - Визуальная конституция: **0 новых нарушений** (`npm run check-visual-constitution`), строгая синхронизация `visual-constitution-baseline.json`.

---

## 1. КОНТУР 1 (P0): ВЗАИМОДЕЙСТВИЕ МЕХАНИЗМОВ RECOVERY, RETRY И FAILOVER

Отдельные механизмы восстановления могут работать штатно в изоляции, но при наложении создавать штормы перезапусков (retry storms), гонки состояний или игнорировать отмену операции пользователем.

### Что необходимо проверить по коду и подтвердить тестами:
1. **Связка `PythonServerService` ↔ `TTSService`**:
   - Файлы: `src/main/services/python_server.service.ts`, `src/main/services/tts.service.ts`.
   - Сценарий A: пользователь вызывает `ttsService.stop()` (или второй `speak()` вытесняет первый) во время ожидания `waitForPythonServer()` или активного HTTP-запроса в `127.0.0.1:8002/tts`. Прекращается ли ожидание немедленно без ложного перехода в фолбэк `Edge TTS -> SAPI` для отменённого запроса?
   - Сценарий B: `PythonServerService` выполняет health-check `/status` каждые N секунд. Проверить, нет ли ситуации, при которой одновременный сбой `/tts` и таймаут `/status` запускают два параллельных процесса перезапуска `silero_server.py` (гонка `restart()` / дублирование дочерних процессов Python).
   - Сценарий C: лимит перезапусков `PythonServerService` (`maxRestarts` / backoff). Что происходит при перманентно битом окружении Python — уходит ли сервис в бесконечный цикл рестартов или переходит в контролируемый терминальный статус с уведомлением UI?

2. **Связка `ai.service.ts` ↔ `ProviderManager` ↔ `providerHealthManager`**:
   - Файлы: `src/main/services/ai.service.ts`, `src/main/services/llm/providers/provider-manager.ts`, `src/main/services/llm/providers/provider-health.ts`.
   - Сценарий A: активный провайдер возвращает таймаут / HTTP 429 / 5xx. Как происходит переключение на следующий по приоритету провайдер? Не происходит ли повторного обращения к только что помеченному `unhealthy` провайдеру в рамках одного цикла запроса?
   - Сценарий B: отмена генерации пользователем (`AbortSignal`). Не помечается ли провайдер ошибочно как `unhealthy` в `providerHealthManager` при штатной отмене запроса пользователем (`AbortError`)? Прекращается ли цепочка failover немедленно после отмены?

3. **Связка `DatabaseService` (`createOrRecoverSqliteDatabase` / `DB_SAFE_MODE`) ↔ сервисы (`TasksService`, `LongTermMemory`, `LlmCacheService`)**:
   - Файлы: `src/main/services/database.ts`, `src/main/services/database-recovery.util.ts`.
   - Проверить: при переходе БД в `DB_SAFE_MODE` (read-only / карантин) не пытаются ли фоновые сервисы (`LlmCacheService`, `MacroSchedulerService`) циклически выполнять запись с необработанными исключениями каждую секунду.

---

## 2. КОНТУР 2 (P1): АУДИТ IPC-КОНТРАКТОВ, ТАЙМАУТОВ, СЕРИАЛИЗАЦИИ И ЖИЗНЕННОГО ЦИКЛА ОКОН

### Что необходимо проверить:
1. **Безопасность отправки событий в `BrowserWindow`**:
   - Проверить все вызовы `BrowserWindow.getAllWindows()` и `win.webContents.send(...)` в `src/main/**`.
   - Везде ли перед `win.webContents.send(...)` проверяется `!win.isDestroyed() && !win.webContents.isDestroyed()`? (Обратить особое внимание на `tts.service.ts`, `ai.ipc.ts`, `system.ipc.ts`, `tasks.ipc.ts`, `macro-scheduler.service.ts`). Вызов `webContents.send` на закрывающемся окне в Electron вызывает фатальное исключение `Object has been destroyed` в Main-процессе.
2. **Висящие промисы при закрытии/перезагрузке Renderer**:
   - В `tts.service.ts` метод `playAudio()` ждёт событие `ipcMain.once('voice:play-audio-done', done)` с таймаутом 30 с. Проверить, корректно ли очищаются слушатели и таймеры при `stop()`, а также нет ли утечки слушателей `ipcMain` в других IPC-каналах (`ApprovalService`, `requestFallbackConsent` в `ai.ipc.ts`).
3. **Валидация входных аргументов IPC**:
   - Проверить обработчики `ipcMain.handle` в `src/main/ipc/*.ts` на устойчивость к `null`/`undefined`/некорректным типам из renderer-процесса (возврат структурированной ошибки вместо необработанного `TypeError` в Main).

---

## 3. КОНТУР 3 (P1): СЕКРЕТЫ, ЛОГИ, ДИАГНОСТИКА, ВРЕМЕННЫЕ ФАЙЛЫ И TOCTOU В КЭШЕ

### Что необходимо проверить:
1. **Отсутствие утечек секретов во всех каналах вывода**:
   - Проверить `src/main/utils/logger.ts`, `src/main/services/dialog-logger.ts`, `src/main/services/diagnostics.service.ts`, `src/main/services/security/secret-vault.service.ts`.
   - Убедиться, что при ошибке HTTP-запроса Axios к провайдерам (OpenRouter, Gemini, OpenAI) в лог или стек-трейс **не попадает** объект `error.config.headers.Authorization` или URL-параметр `?key=AIza...`.
2. **Временные файлы на диске (`temp`)**:
   - Проверить создание и удаление временных файлов в `tts.service.ts` (`temp_speech_${Date.now()}.mp3`, `temp_speech_${Date.now()}.wav`, `temp_tts_system.txt`) и в сервисе скриншотов/Vision (`ai.ipc.ts`).
   - В `tts.service.ts`: удаляется ли `tempFile` в `speakWithSileroTTS` и `speakWithSystemTTS` в блоке `finally` после воспроизведения, или временные `.wav` и `temp_tts_system.txt` накапливаются в `os.tmpdir()`?
3. **Оценка и минимизация TOCTOU-риска в `CacheService`**:
   - Проанализировать окно между `isSafeCacheFilePath()` (`lstatSync` / `realpathSync`) и последующими операциями чтения/удаления в `src/main/services/cache.service.ts`.
   - Проверить: можно ли при чтении/удалении минимизировать окно гонки (например, повторная проверка дескриптора `fstatSync(fd)` при чтении или атомарная запись через `.tmp` + `renameSync` в `put()`) и зафиксировать честную модель угроз локального каталога `userData/audio-cache`.

---

## 4. КОНТУР 4 (P2): ДОКАЗАТЕЛЬНАЯ ОЧИСТКА ЗАВИСИМОСТЕЙ

### Алгоритм проверки для `glob`, `@types/marked`, `@types/dompurify`:
1. Выполнить поиск вхождений по всему репозиторию (`src/`, `scripts/`, `*.config.*`, `.github/`):
   ```bash
   grep -rnE "glob|@types/marked|@types/dompurify" src scripts electron.vite.config.ts vite.config.ts tsconfig*.json
   ```
2. Проверить наличие встроенных деклараций типов в установленных версиях:
   - `node_modules/marked/lib/marked.d.ts` (или `package.json -> types`);
   - `node_modules/dompurify/dist/purify.es.d.ts` (или `package.json -> types`).
3. Только при **100% подтверждении нулевого использования** и успешном прохождении `tsc --noEmit` без этих пакетов — удалить подтверждённо ненужные зависимости и синхронизировать `package.json` / `package-lock.json`.

---

## 5. КОНТУР 5 (P0/P1): ИНТЕГРАЦИОННЫЕ ТЕСТЫ МЕЖМОДУЛЬНОГО ВЗАИМОДЕЙСТВИЯ

Поскольку синтетический `scripts/soak-test.js --mode=simulation` тестирует изолированные циклы в одном процессе, необходимо создать **реальный межмодульный интеграционный тест-сьют** (`src/main/services/runtime-integration.audit.test.ts`), проверяющий совместную работу реальных классов ядра:
1. **Сценарий 1 (Provider Failover & Cancellation)**:
   - Отказ основного провайдера (таймаут/503) → автоматический переход на резервный провайдер → запись состояния в `providerHealthManager`;
   - Отмена запроса через `AbortSignal` → отсутствие ложной блокировки провайдера и немедленная остановка перебора.
2. **Сценарий 2 (TTS Lifecycle, Preemption, Temp Cleanup & Destroyed Window Safety)**:
   - Конкурентный вызов `speak()` с прерыванием, проверка удаления временных файлов `.wav`/`.txt` после завершения/ошибки, безопасность при `win.isDestroyed() === true`.
3. **Сценарий 3 (Logger, Sanitizer & Axios Error Headers)**:
   - Передача объекта ошибки Axios с заголовком `Authorization: Bearer sk-secret-1234567890` и URL `?key=AIzaSySecretKey123456789` через `sanitizeError` / `DialogLogger` / `DiagnosticsService` — проверка 100% маскирования секрета.

---

## 6. КОНТУР 6 (P0 RELEASE GATE): РЕГЛАМЕНТ ПРИЁМКИ WINDOWS 10/11 x64

Запрещено объявлять версию готовой к релизу (`Release Ready`) без прохождения чеклиста на физическом хосте Windows 10/11 x64:

| Шаг | Проверка на Windows 10/11 x64 | Критерий приёмки |
|---|---|---|
| **W-1** | Прогон джобы `package-win` в GitHub Actions (`windows-latest`) | Зелёный статус, сформированы `ARC-Setup-1.0.13.exe`, portable `.exe` и `SHA256SUMS.txt` |
| **W-2** | Сверка хэшей `Get-FileHash -Algorithm SHA256` скачанного `.exe` с `SHA256SUMS.txt` | Полное совпадение SHA-256 |
| **W-3** | Чистая установка `ARC-Setup-1.0.13.exe` (NSIS) под стандартным пользователем Windows | Установщик проходит без ошибок, создаёт ярлыки, распаковывает `app.asar.unpacked` и `extraResources` (`python-embed`, `v5_5_ru.pt`) |
| **W-4** | Первый запуск, прохождение `FirstRunWizardModal` и проверка 3D-Реактора | 60 FPS, отсутствие `GHOST 2D`, сохранение настроек |
| **W-5** | Проверка `SecretVaultService` (Windows DPAPI) | Ввод API-ключа создаёт `userData/secrets.json` (schemaVersion: 2) с `ciphertextBase64`, в UI возвращается только маска `••••••••••••••••` |
| **W-6** | Автозапуск `PythonServerService` + синтез речи Silero v5.5 и фолбэк в Windows SAPI | Озвучивание фраз без зависания `isBusy()`, сохранение в `audio-cache`, штатный фолбэк при остановке Python |
| **W-7** | Многопроцессный 30-минутный прогон (`Main + Renderer + Python`) | Отсутствие зомби-процессов `python.exe` после закрытия A.R.C., рост RSS в пределах нормы |
| **W-8** | Деинсталляция через «Установка и удаление программ» | Корректное удаление бинарных файлов при сохранении/очистке `AppData` согласно настройке `deleteAppDataOnUninstall: false` |

---

## 7. ФОРМАТ ОТЧЁТА ПО ИТОГАМ АУДИТА v1.0.13

По завершении работы предоставить структурированный отчёт на русском языке:
1. **Результаты аудита по Контурам 1–5** (таблица: `Проверенный узел | Файл и строки | Статус (OK / Найдена проблема) | Доказательство`).
2. **Подтверждённые и исправленные дефекты** (только реально найденные баги с описанием первопричины и диффа).
3. **Новые интеграционные тесты** (`runtime-integration.audit.test.ts` и результаты их прогона).
4. **Дословные выводы команд верификации** (`npm run lint`, `npm test`, `npm run check-sizes`, `npm run check-visual-constitution`, `npm run build`, `grep`).
5. **Статус Windows Release Gate (Контур 6)** и список оставшихся эксплуатационных блокеров.
