# A.R.C. — Инженерный аудит, стабилизация и готовность к релизу (Engineering Audit Report)

**Дата аудита:** 07.11.2026  
**Целевой репозиторий:** `DdepRest/A.R.C` (ветка `main`, версия `1.0.12`)  
**Основание:** `docs/Analyz.md` (Master Technical Task — Comprehensive Engineering Audit, Stabilization & Release Readiness)

---

## 1. Исполнительное резюме и статус готовности

| Контур проверки | Статус | Подтверждение |
|---|---|---|
| **P0: GitHub Actions CI & Unit-тесты (`ai.ipc.test.ts`, `cache.service.test.ts`)** | **ЗАКРЫТО (PASS)** | Ленивая инициализация `CacheService`, 0 операций ФС при импорте и в конструкторе, graceful degradation при `EACCES`/`EROFS` |
| **P1: `TTSService.isBusy()` & мигрирование `piper`/`kokoro`** | **ЗАКРЫТО (PASS)** | Гарантированный сброс `activeAbortController = null` в `try / finally`; `piper` и `kokoro` помечены `Planned (v1.1)` в UI и мигрируют в `'auto'` |
| **P1: Path Containment в `CacheService` & `Speed Tier` резерв** | **ЗАКРЫТО (PASS)** | Валидация `isSafeCacheFilePath` (`path.resolve` + `path.relative`), белый список `Speed Tier` с резервом 20 МБ из 100 МБ |
| **P2: Атомарный транзакционный импорт `memory:import`** | **ЗАКРЫТО (PASS)** | Предварительная валидация пачки + `db.transaction()` в `memory-batch-import.ts` |
| **P2: Устранение дублирования нормализации URL** | **ЗАКРЫТО (PASS)** | Единый модуль `src/shared/utils/url-normalizer.ts` подключён в 4 точках (`system-classifier`, `commands.registry`, `MacroExecutor`, `media-classifier`) |
| **Синхронизация документации, `SECURITY.md`, `STATISTICS.md`, `package-lock.json`** | **ЗАКРЫТО (PASS)** | Версии `1.0.12`, Node `>=22.12.0`, честная классификация `soak-test.js --mode=simulation`, реальное описание `SecretVaultService` |
| **Сборка и smoke-тест Windows-инсталлятора (`ARC-Setup-1.0.12.exe`) на живой ОС Windows** | **NOT VERIFIED (Ограничение среды Linux AI Studio)** | Сконфигурирована job `package-win` (`windows-latest`) в `.github/workflows/ci.yml`; физический запуск `.exe` в Linux-контейнере невозможен |

---

## 2. Подтверждённые и устранённые дефекты (P0 / P1 / P2)

### 2.1 [P0] Падение `src/main/ipc/ai.ipc.test.ts` на non-root раннерах (`EACCES: mkdir '/mock'`)
- **Первопричина:** В `ai.ipc.test.ts` путь `app.getPath('userData')` замокан как `'/mock/app/userdata'`. Цепочка импортов `ai.ipc.ts → tts.service.ts → cache.service.ts` создавала синглтон `export const cacheService = new CacheService()` во время загрузки модуля и синхронно вызывала `fs.mkdirSync('/mock/app/userdata/audio-cache', { recursive: true })`. В Linux-контейнере с root-правами каталог `/mock` создавался в корне `/`, а на стандартном non-root раннере GitHub Actions выбрасывалось необработанное исключение `EACCES: permission denied, mkdir '/mock'`.
- **Решение:** В `src/main/services/cache.service.ts` удалены все дисковые операции из конструктора и верхнего уровня модуля. Инициализация переведена в ленивый метод `ensureInitialized()`, перехватывающий `EACCES`/`EROFS`/`EPERM` с переводом кэша в `initialized = false` (bypass-режим) и автоматическим восстановлением при следующем вызове или `setConfig({ customPath })`.

### 2.2 [P1] Зависание `TTSService.isBusy() === true` при Cache HIT и сбоях синтеза
- **Первопричина:** В `src/main/services/tts.service.ts` поле `this.activeAbortController = new AbortController()` устанавливалось в начале `speak()`, но при раннем `return` (попадание в `CacheService`, недоступность Python-сервера без ухода в `fetch`, либо исключение в `speakSapi`) не очищалось. Поскольку `PythonServerService` пропускает перезапуск зависшего сервера при `ttsService.isBusy() === true`, первое же попадание в кэш навсегда отключало watchdog.
- **Решение:** Весь блок выполнения `speak()` после инициализации `this.activeAbortController` обёрнут в `try / finally`, гарантирующий `this.activeAbortController = null` при любом возврате или ошибке.

### 2.3 [P1] Path Traversal через повреждённый `metadata.json` и размывание `Speed Tier` в `CacheService`
- **Первопричина:**
  1. `metadata.json` хранит имя файла `item.filePath`. Без проверки `path.relative(this.cacheDir, resolved)` строка вида `"../../important.txt"` позволяла `get()` прочитать или `evictIfNeeded()` удалить файл вне директории кэша.
  2. Эвристика `text.length < 40` помечала любые короткие реплики как `isSpeedTier: true`, вымывая базовые системные фразы.
- **Решение:**
  1. Внедрена функция `isSafeCacheFilePath(fileName)`: разрешены только базовые имена файлов без разделителей директорий, строго принадлежащие `this.cacheDir`.
  2. `isSpeedTier` ограничен контролируемым белым списком системных фраз с выделенным резервом `20 МБ` (`MAX_SPEED_TIER_SIZE_BYTES`) внутри общего лимита `100 МБ`, а также добавлены реальные персистентные счётчики `hits`, `misses`, `evictions`.

### 2.4 [P1] Нереализованные TTS-провайдеры `piper` и `kokoro`
- **Первопричина:** В типах `TTSProvider` присутствовали `'piper'` и `'kokoro'`, но в `TTSService` их реализация отсутствует.
- **Решение:** В `TTSSection.vue` пункты `Piper ONNX (Planned v1.1)` и `Kokoro 82M (Planned v1.1)` отображаются с атрибутом `disabled`. В `settings.store.ts` и IPC-обработчике `tts:set-provider` (`voice.ipc.ts`) добавлена безопасная автомиграция устаревших значений `'piper'`/`'kokoro'` в `'auto'`.

### 2.5 [P2] Отсутствие транзакционности при пакетном импорте JSON в `MemoryView.vue`
- **Первопричина:** `MemoryView.vue` вызывал `store.importEntries(data)`, который в цикле `for ... of` поодиночке отправлял `memory:set`. Сбой на N-м элементе оставлял предыдущие N−1 записей в БД.
- **Решение:** Создан модуль `src/main/services/memory/memory-batch-import.ts` (`validateAndNormalizeMemoryBatch` + `importMemoryBatchAtomic` внутри `db.transaction()`), проброшенный через `memory:import` (`preload.ts` → `memory.store.ts` → `MemoryView.vue`).

---

## 3. Аудит дублирования, мёртвого кода и зависимостей

### 3.1 Устранённое дублирование кода
| Область | Затронутые файлы | Выполненная консолидация |
|---|---|---|
| Словарь доменов (`KNOWN_SITE_DOMAINS`) и нормализация URL (`stripTrailingUrlPunctuation`, `normalizeMacroExternalUrl`, `resolveSiteQueryToUrl`) | `src/main/services/classifiers/system-classifier.ts`, `src/renderer/features/commands/commands.registry.ts`, `src/main/services/MacroExecutor.ts`, `src/main/services/classifiers/media-classifier.ts` | Вынесено в единый shared-модуль `src/shared/utils/url-normalizer.ts` с полным покрытием unit-тестами (`url-normalizer.test.ts`) |

### 3.2 Очистка подтверждённых неиспользуемых зависимостей (v1.0.13 Контур 4)
По результатам эмпирического аудита (`grep` по `src/**`, `scripts/**`, конфигам сборки и проверка встроенных типов в `node_modules`) из `package.json` удалены 3 пакета с нулевым использованием:
1. **`glob` (`^13.0.6`)** в `dependencies`: **0 импортов** в `src/**`, `scripts/**` и конфигах.
2. **`@types/marked` (`^6.0.0`)** и **`@types/dompurify` (`^3.2.0`)** в `devDependencies`: пакеты `marked` (`./lib/marked.d.ts`) и `dompurify` (`./dist/purify.cjs.d.ts`) поставляют собственные актуальные декларации типов `.d.ts`.

---

## 4. Аудит безопасности (`npm audit`) и лицензий

### 4.1 Сводка `npm audit`
Все обнаруженные предупреждения `npm audit` находятся в транзитивных зависимостях инструментов сборки (`electron-builder` → `app-builder-lib` → `@malept/flatpak-bundler` / `tar`, а также dev-сервер `vite`) и **не входят в runtime-бандл приложения Windows**:
- `underscore` (`<=1.13.8`, High, GHSA-qpx9-hpmf-5gmw): транзитивная зависимость `@malept/flatpak-bundler` (используется только для сборки Linux Flatpak, не вызывается при `pack:win`).
- `tar` (`<=7.5.10`, High): транзитивная зависимость `app-builder-lib` / `@electron/rebuild` (используется только на этапе сборки из доверенных локальных артефактов).
- `vite` (`6.0.0 - 6.4.1`, High/Moderate): dev-сервер разработки (`localhost`), не входит в production-сборку Electron.
- `brace-expansion` / `minimatch` (Moderate): транзитивные зависимости сборщика.

*Рекомендация:* Не применять `npm audit fix --force` (так как он предлагает даунгрейд `electron-builder` до мажорной ветки `22.x`). Обновлять `electron-builder` и `vite` планово по мере выхода патч-релизов.

### 4.2 Аудит лицензий (`THIRD_PARTY_NOTICES.md`)
- Проект распространяется под лицензией **MIT**.
- Прямые и нативные зависимости (`Electron`, `Vue 3`, `Pinia`, `Three.js`, `better-sqlite3`, `node-llama-cpp`, `lucide-vue-next`, `Silero TTS v5.5` — MIT; `Sherpa-ONNX` — Apache-2.0; `Python` — PSF) полностью совместимы с коммерческой и open-source дистрибуцией под MIT. Copyleft-зависимостей (GPL/AGPL) в runtime-коде не обнаружено.

---

## 5. Этап v1.0.13 — Deep Runtime Audit, Subsystem Interaction & Production Validation

Основание: `docs/MASTER_TZ_v1.0.13_DEEP_RUNTIME_AUDIT.md`.

| Контур ТЗ v1.0.13 | Результат аудита | Внесённые точечные исправления и тесты |
|---|---|---|
| **Контур 1 (P0): Recovery / Retry / Failover / Cancellation** | Выявлены: (1) отсутствие защиты от параллельного `PythonServerService.start()` и отсутствие верхнего предела перезапусков при перманентном сбое Python; (2) ожидание полного таймера backoff (до 5.5 с) при отмене LLM-запроса пользователем во время паузы retry в `request-executor.ts`. | В `PythonServerService` добавлены флаг `isStarting` и circuit breaker `MAX_AUTO_RESPAWNS = 5` со сбросом при успешном `/status`. В `request-executor.ts` внедрён `abortableDelay(ms, abortController.signal)`, мгновенно прерывающий ожидание retry без штрафа `providerHealthManager`. |
| **Контур 2 (P1): IPC-контракты, таймауты и жизненный цикл `BrowserWindow`** | Выявлены вызовы `win.webContents.send(...)` без проверки `!win.isDestroyed()` в `tts.service.ts` (`stop`, `speakWithSileroTTS`, `playAudio`), `python_server.service.ts` и `event.sender.send` в `ai.ipc.ts`. | Во всех точках `tts.service.ts`, `python_server.service.ts` (`sendWin`) и `ai.ipc.ts` (`safeSend`) добавлена проверка `!win.isDestroyed() && !win.webContents?.isDestroyed()`. В `playAudio()` фильтрация уничтоженных окон выполняется до создания 30-секундного ожидания `voice:play-audio-done`. |
| **Контур 3 (P1): Секреты, логи, временные файлы и TOCTOU симлинков** | Выявлены: (1) утечка временных файлов `temp_speech_*.wav` в `os.tmpdir()` после каждого успешного синтеза `speakWithSileroTTS` и нечистящийся `temp_tts_system.txt` в `speakWithSystemTTS`; (2) отсутствие маскирования URL query-параметров (`?key=...`, `&token=...`) и заголовков `x-api-key` / `x-goog-api-key`, а также прямой вывод в `logger.ts` без `maskSecrets`; (3) окно TOCTOU при прямом `copyFileSync` в `CacheService.put()`. | В `speakWithSileroTTS` добавлен блок `finally` с удалением `tempFile`; в `speakWithSystemTTS` — уникальный файл `temp_tts_system_<ts>_<id>.txt` с удалением в колбэке. В `log-sanitizer.ts`, `logger.ts` и `diagnostics.service.ts` добавлено маскирование URL-ключей (`?key=***`, `&api_key=***`), `x-api-key`, `hf_`, `ghp_` и URL внутри `AxiosError.config`. В `CacheService.put()` внедрена атомарная запись через staging-файл `.tmp.<pid>.<ts>` с проверкой `lstatSync` перед `renameSync`. |
| **Контур 4 (P2): Эмпирическая ревизия зависимостей** | Подтверждено `0` использований `glob`, `@types/marked`, `@types/dompurify` и наличие встроенных `.d.ts` у `marked` и `dompurify`. | Три пакета удалены из `package.json`, `tsc --noEmit` и `npm run build` проходят с 0 ошибок. |
| **Контур 5 (P0/P1): Межмодульный интеграционный тест** | Создан `src/main/services/runtime-integration.audit.test.ts` (6 интеграционных сценариев). | Покрыты: LLM failover + отмена во время retry без карантина, `DB_SAFE_MODE` write-lock, очистка `temp_speech_*.wav` + устойчивость к `isDestroyed() === true`, защита `PythonServerService.start()`, сквозное маскирование секретов в URL/заголовках/логах. |
| **Контур 6 (P0 Release Gate): Приёмка Windows 10/11 x64 (`W-1..W-8`)** | Чек-лист `W-1..W-8` зафиксирован в `docs/MASTER_TZ_v1.0.13_DEEP_RUNTIME_AUDIT.md`. | Статус для Linux-контейнера AI Studio: **`NOT VERIFIED (Linux Container Boundary)`** — требует прогона на целевой машине Windows 10/11 x64 перед финальным тегом релиза. |

