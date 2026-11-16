# A.R.C. — техническое задание на доведение проекта до Release Ready

**Тип документа:** Master Technical Specification / Release Hardening Work Plan  
**Версия ТЗ:** 1.0  
**Дата:** 16 ноября 2026 года  
**Репозиторий:** https://github.com/DdepRest/ARC  
**Базовый аудит:** `ARC_RELEASE_READINESS_AUDIT.md`  
**Зафиксированный в аудите commit:** `98098327e9b8761ecf855d0566e2c1f6c9b265c4`  
**Версия приложения на момент аудита:** `1.0.12`

---

# 0. Назначение и обязательные входные материалы

Это ТЗ является рабочей инструкцией для AI-кодера. Оно определяет **как именно** доводить A.R.C. до проверяемой релизной версии: в какой последовательности работать, какие изменения допустимы, какие тесты обязательны, как подтверждать результат и когда останавливаться.

Кодер должен получить два документа:

1. **`ARC_RELEASE_READINESS_AUDIT.md`** — технический аудит. В нём находятся архитектурная карта, доказательства, точные проблемные места, ссылки на исходники и первичный реестр дефектов.
2. **`ARC_RELEASE_HARDENING_TZ.md`** — настоящий документ. В нём находятся порядок исполнения, ограничения, декомпозиция работ и критерии приёмки.

Оба документа обязательны к прочтению целиком до начала изменений.

## 0.1. Иерархия источников истины

При работе использовать следующий порядок:

1. **Текущий исходный код и текущий `HEAD` репозитория** — фактическое состояние реализации.
2. `AGENTS.md` и действующие архитектурные контракты проекта — обязательные ограничения разработки.
3. `ARC_RELEASE_READINESS_AUDIT.md` — карта найденных проблем на конкретном commit.
4. Настоящее ТЗ — порядок работ и критерии готовности.
5. Остальная документация — контекст и история проекта.

Аудит зафиксирован на commit `98098327…`. Кодер обязан сначала сравнить его с актуальным `HEAD`. **Нельзя исправлять проблему повторно, если она уже исправлена после аудита.** В таком случае нужно проверить исправление, найти тест/evidence, предложить статус `ALREADY_FIXED` и не переписывать код ради формального выполнения ТЗ.

Если актуальный код противоречит аудиту, кодер фиксирует расхождение и объясняет его. Если текущая реализация показывает новый дефект, которого нет в аудите, его можно добавить в отдельный backlog с доказательством, но нельзя незаметно расширять текущую задачу.

## 0.2. Цель проекта

Довести текущий A.R.C. до состояния, в котором:

- Windows CI надёжно создаёт отдельные NSIS и Portable артефакты без неявной публикации;
- установка, запуск, обновление и работа с пользовательскими данными проверены на чистой Windows;
- секреты не теряются при ошибках записи и не раскрываются в логах/архивах;
- файловые и shell-операции ограничены реальными проверяемыми политиками;
- задачи, память и настройки не показывают ложный статус сохранения;
- голосовые сервисы и модели корректно устанавливаются, проверяются, отменяются и деградируют;
- локальный режим не отправляет текст во внешний TTS без отдельного согласия;
- системные статусы, прогресс и телеметрия отражают реальное состояние, а не статические предположения;
- UI сохраняет индивидуальность A.R.C., остаётся понятным и устойчивым на небольших разрешениях;
- эксплуатационная стабильность подтверждена тестами и реальным Windows QA, а не только TypeScript и unit-тестами.

**Не является целью:** переписать приложение с нуля, заменить весь стек, построить новые roadmap-функции или провести глобальный редизайн.

---

# 1. Обязательный протокол работы кодера

## 1.1. Работать строго по одной задаче

Весь документ представляет собой Master Work Plan, а не разрешение внести все изменения одним большим коммитом.

Правило исполнения:

- В каждый момент времени существует только **одна активная задача**.
- Сначала кодер исследует задачу и присылает план реализации.
- До получения явного решения владельца `approve` кодер не начинает менять код.
- После `approve` кодер реализует только согласованную задачу.
- По окончании присылает полный отчёт и останавливается.
- Следующая задача начинается только после проверки результата и отдельного задания/разрешения.

Не объединять несколько задач только потому, что они затрагивают один и тот же файл. Объединение допустимо лишь тогда, когда без него невозможно получить корректный атомарный результат; это нужно объяснить до реализации.

## 1.2. С чего начать

**Первая активная задача — `S0-01: Windows packaging pipeline`.**

Кодер должен сначала:

1. Прочитать оба документа.
2. Получить актуальный `HEAD`, ветку и незакоммиченные изменения.
3. Проверить текущее состояние `package.json`, `.github/workflows/ci.yml` и фактические последние GitHub Actions runs.
4. Подтвердить, что причина CI failure из аудита ещё актуальна или уже устранена.
5. Составить план `S0-01` с точным перечнем изменяемых файлов, команд сборки, тестов и рисков.
6. Остановиться и ждать решения владельца.

**Не приступать сразу к Secret Vault, Sandbox, TTS или UI.** До закрытия packaging gate остальные этапы не начинать.

## 1.3. Статусы задач

Для каждой задачи использовать только один из статусов:

- `NOT_STARTED` — работа не начиналась.
- `PLAN_READY` — проверка и план представлены владельцу.
- `APPROVED` — план принят, можно реализовывать.
- `IMPLEMENTED` — код изменён, но результат ещё не доказан полностью.
- `VERIFIED` — критерии приёмки подтверждены тестами/evidence.
- `ALREADY_FIXED` — проблема отсутствовала на актуальном HEAD и это доказано.
- `BLOCKED` — дальнейшая работа невозможна без решения/доступа/окружения.
- `REJECTED` — реализация не прошла ревью и требует изменения.

Нельзя ставить `VERIFIED` только потому, что код компилируется или тест, написанный тем же изменением, проходит.

## 1.4. Перед каждой задачей: обязательная разведка

До правки кода кодер должен:

1. Найти все импорты, вызовы, dynamic `require`, IPC handlers/callers, preload methods и event listeners, относящиеся к изменяемому компоненту.
2. Проверить persisted data: SQLite schema, JSON config, secrets, cache, local files, model directories и migration compatibility.
3. Проверить все платформенные ветки, особенно Windows: separators, drive letters, junction/reparse points, DPAPI, PowerShell, process tree, file locks и packaging paths.
4. Найти существующие тесты и тестовые doubles, чтобы не плодить параллельные harnesses.
5. Проверить `AGENTS.md` и защищённые зоны.
6. Сформулировать root cause. Не лечить симптом, не понимая первопричину.
7. Указать, что именно может регрессировать.

В отчёте разведки обязательно различать:
- подтверждённый дефект;
- потенциальный риск;
- уже исправленное поведение;
- невозможность проверки без физической Windows-машины.

## 1.5. После каждой задачи: обязательная проверка

Минимальный набор проверок выбирается по затронутой подсистеме, но всегда включает:

- целевые unit/integration tests;
- негативные тесты (ошибка, отмена, timeout, повреждённый ввод, отсутствие прав, перезапуск — в зависимости от задачи);
- `npm run lint`;
- `npm test`;
- `npm run check-sizes`;
- `npm run check-visual-constitution`, если затронут Renderer/UI;
- `npm run build`;
- Windows CI/build, если затронут packaging, native modules, пути, процессы, DPAPI, SAPI, STT/TTS или платформенное поведение.

Если часть проверок не запускалась, написать `NOT RUN` и причину. Не подменять фактические результаты ожидаемыми.

---

# 2. Жёсткие архитектурные и продуктовые ограничения

## 2.1. Что запрещено делать без отдельного разрешения

Не менять и не переписывать без явного разрешения владельца:

- `ReactorCore.vue`;
- `src/renderer/composables/useVoice.ts`;
- `src/main/services/built-in-llm.service.ts`;
- защищённые 3D/WebGL/GLSL зоны Reactor и связанные с ними файлы;
- другие зоны, помеченные protected/Scope Lock в `AGENTS.md`.

Если задача кажется невозможной без изменения защищённого файла, сначала объяснить почему и запросить отдельное разрешение. Нельзя обходить ограничение через переименование, перенос или изменение экспортируемых контрактов защищённой зоны.

## 2.2. Запрещённый объём работ

Без отдельного ТЗ не делать:

- общий редизайн всего интерфейса;
- переписывание Electron → другой desktop framework;
- замену Vue/Pinia/SQLite;
- внедрение нового state manager или второй базы данных;
- добавление новых крупных runtime dependencies «на всякий случай»;
- активацию Piper, Kokoro, MCP, Agent Swarm и прочих функций, обозначенных как Planned;
- удаление моделей STT только потому, что они частично дублируют функции друг друга;
- перенос или изменение голосового pipeline в protected-зоне;
- удаление старых файлов без глобального поиска ссылок и проверки upgrade compatibility.

## 2.3. Сохранить уже работающие решения

Не переписывать без доказанной причины:

- Main / Preload / Renderer / Shared разделение;
- `contextBridge` API и `contextIsolation`;
- SQLite WAL и recovery/quarantine path;
- Online Backup API и verified database snapshot;
- отдельный STT worker, heartbeat и fallback logic;
- TTS `try/finally` lifecycle и AbortController;
- существующий AI provider manager, retry/quarantine и health tracking;
- Task upsert/diff architecture;
- Settings Provider Master–Detail и draft state machine;
- текущую Visual Constitution и design tokens.

Исправлять подтверждённые дефекты точечно. Не заменять работающую подсистему новым аналогом ради эстетики архитектуры.

## 2.4. Визуальная конституция A.R.C.

Интерфейс должен оставаться «живой консолью вокруг Reactor», а не типовым SaaS dashboard.

Обязательные ограничения:
- тёмная графитовая/чёрная основа;
- сдержанный Reactor Red, без декоративного синего gaming neon;
- не добавлять случайные стеклянные карточки, лишние pill badges и большие цветные плашки;
- не менять общую навигационную модель без usability evidence;
- сохранять читаемость на 1366×768 и масштабировании Windows 125%;
- статусы `ready`, `active`, `configured`, `tested`, `selected`, `loaded`, `degraded`, `unavailable` не смешивать.

Визуальный lint с нулевыми нарушениями уже существует. Он обязателен, но его зелёный результат не заменяет визуальный QA на реальном окне.

## 2.5. Лимиты и стиль кода

Соблюдать `AGENTS.md`:
- logic/UI components/services/composables/utilities — до 400 строк;
- data/registry/store/config — до 800 строк;
- не дробить файл механически ради счётчика; разбиение должно соответствовать ответственности;
- не расширять текущие исключения без объяснения.

TypeScript types не заменяют runtime validation входящих IPC payloads. На границах Main/Renderer валидировать данные в runtime.

---

# 3. Очерёдность этапов и релизные gates

Работы выполняются строго в следующем порядке. Переход на следующий этап разрешён только после закрытия exit criteria предыдущего этапа.

| Этап | Приоритет | Направление | Условие перехода |
|---|---|---|---|
| Sprint 0 | P0 | Windows packaging и артефакты | CI выдаёт два отдельных EXE и сохраняет их как artifacts |
| Sprint 1 | P1 | Секреты, sandbox, shell, approvals, Tasks persistence | Негативные тесты проходят; данные не теряются; sandbox не выходит за границу |
| Sprint 2 | P1 | TTS/STT packaging, downloads, privacy, onboarding | Установленная версия корректно работает с голосом и загрузками |
| Sprint 3 | P1/P2 | DB migrations, Electron hardening, truthful states, export | Диагностика и persisted behavior честны; безопасность усилена без регрессий |
| Sprint 4 | P0 Release Gate | Натурный Windows QA, process-tree soak, лицензии | Пройден Release Acceptance Checklist |

---

# 4. Sprint 0 — Release Pipeline (P0)

**Цель:** превратить текущий Windows job из «попытки собрать» в воспроизводимый pipeline, который без GitHub Release token строит два самостоятельных артефакта.

## S0-01. Убрать неявную публикацию из обычного CI

**Основные файлы:**
- `package.json`;
- `.github/workflows/ci.yml`.

**Проблема из аудита:** electron-builder автоматически переходит к publishing при обнаружении CI и пытается использовать отсутствующий `GH_TOKEN`. NSIS успевает собраться, но job падает при Portable; последующие checks и artifact upload пропускаются.

**Что сделать:**
1. Разобрать, какой именно npm script вызывается в Windows job и какие electron-builder targets он запускает.
2. Явно запретить publishing в обычной CI-сборке (`--publish never` либо эквивалент, корректный для используемой версии electron-builder).
3. Убедиться, что PR и push в `main` не пытаются создавать GitHub Release.
4. Не добавлять фальшивый `GH_TOKEN`, не использовать PAT владельца для обычного artifact build.
5. Не менять релизный workflow так, чтобы публикация стала происходить на каждый push.
6. Сохранить существующие Linux validation checks.

**Критерии приёмки:**
- CI выполняет packaging без `GH_TOKEN`.
- В логах отсутствует попытка implicit publish.
- NSIS/Portable packaging не зависит от прав на GitHub Releases.
- TypeScript, tests, build, size guard и visual constitution остаются зелёными.

## S0-02. Развести NSIS и Portable артефакты

**Файл:** `package.json` build configuration.

**Что сделать:**
1. Проверить актуальную схему electron-builder 26.x, поддерживающую разные artifact names для разных targets.
2. Задать разные, однозначные имена для NSIS и Portable.
3. Не полагаться на порядок переименования после сборки, если target-specific naming можно задать в builder config.
4. Если сборка обоих targets одним запуском приводит к коллизии, запускать targets отдельными командами.
5. Убедиться, что Portable не перезаписывает NSIS и наоборот.

**Критерии приёмки:**
- В `dist/` находятся два разных EXE.
- По имени понятно, какой файл NSIS, какой Portable.
- SHA-256 файлов различаются.
- Оба файла имеют ненулевой и разумный размер.
- Проверка содержимого показывает корректные Windows executable artifacts.

## S0-03. Сделать artifact verification обязательным

**Файл:** `.github/workflows/ci.yml`.

**Что сделать:**
1. После сборки проверить наличие обоих файлов по точным ожидаемым именам.
2. Проверить размер каждого файла; нулевой/аномально маленький файл — fail.
3. Проверить, что файлы не совпадают по SHA-256.
4. Сгенерировать `SHA256SUMS.txt` с точным именем и checksum каждого EXE.
5. Загружать оба EXE и checksum через `actions/upload-artifact`.
6. При отсутствии любого ожидаемого файла завершать job ошибкой.
7. Добавить в workflow вывод версий Node, npm, Electron и electron-builder для воспроизводимой диагностики.

**Критерии приёмки:**
- Artifact upload выполняется только после успешных checks.
- В GitHub Actions run доступны оба EXE и checksum file.
- Нет тихого пропуска одного из targets.

## S0-04. Разделить CI validation и Release publishing

**Что сделать:**
1. Обычный CI: validate + build artifacts + upload-artifact.
2. Публикация GitHub Release выполняется только отдельным явно определённым процессом (tag `v*` или отдельный manual workflow).
3. Для publishing workflow задать минимально необходимые permissions и явный publish mode.
4. Не хранить/не выводить токены в логах.
5. Не делать публикацию обязательным условием для PR/обычного push.

**Критерии приёмки:**
- Push в `main` не публикует release.
- Release tag workflow можно запустить отдельно.
- Отсутствие release token не ломает обычный CI.

## S0-05. Подтвердить packaging на чистой Windows

Это QA-задача; она не может быть закрыта только unit tests.

**Проверить отдельно оба артефакта:**
- NSIS installer;
- Portable executable.

**Тестовая среда:** чистая Windows 10 и Windows 11 x64, обычная учётная запись без обязательных административных прав, без предварительной установки Python/FFmpeg/моделей.

**Критерии приёмки:**
- NSIS устанавливается в пользовательский каталог при стандартной конфигурации.
- Portable запускается из отдельной директории без инсталляции.
- Оба варианта создают корректный user data directory.
- `better-sqlite3` native binding загружается; нет необъяснимого `DB_SAFE_MODE`.
- Main, Renderer и preload стартуют без crash loop.
- Основные workspace открываются.
- Путь с пробелами и кириллицей проверен.
- Uninstall по умолчанию не удаляет пользовательские данные, если это текущая заявленная политика.

**Выход Sprint 0:** ссылка на успешный CI run, два скачиваемых EXE, SHA256SUMS и QA-отчёт. Без этого Sprint 0 не закрыт.

---

# 5. Sprint 1 — Data Integrity и Security (P1)

**Цель:** устранить ситуации, когда A.R.C. сообщает об успехе при неуспешной записи, допускает обход файловых границ или выполняет команды шире, чем разрешено политикой.

## S1-01. Secret Vault: атомарная запись и подтверждённая миграция

**Файл:** `src/main/services/security/secret-vault.service.ts`.

**Обязательное поведение:**
1. `setSecret()` возвращает `success:true` только после фактической записи и проверочного чтения нового vault.
2. Ошибка `writeVaultFileV2()` никогда не игнорируется вызывающим методом.
3. Запись выполняется в staging/temp file в той же директории, с безопасными правами, затем атомарно заменяет основной файл.
4. Где платформа позволяет, обеспечить flush/sync перед rename. Не обещать гарантии fsync там, где API/Windows их не предоставляет.
5. После записи выполнить parse/schema validation/read-back; для DPAPI проверить возможность расшифровать сохранённое значение.
6. При миграции legacy secrets исходный файл не удалять до успешной проверки всех перенесённых записей.
7. При неудаче миграции legacy source оставить нетронутым и выдать диагностический статус без значений ключей.
8. Определить один канонический способ хранения Gemini key; legacy aliases поддерживать только в migration/compatibility path.
9. Никогда не включать plaintext secret в logs, exceptions, toast, crash report или diagnostic export.
10. Сохранить понятную семантику `dpapi` vs `session_memory_only`; session-only не выдавать за durable storage.

**Обязательные тесты:** write failure, `EACCES`, `EROFS`, `ENOSPC`, повреждённый JSON, оборванный temp file, crash между temp и rename, migration failure, migration success, restart + DPAPI decrypt, safeStorage unavailable.

**Acceptance:** ни один сценарий отказа не возвращает ложный success; legacy ключи не теряются; после перезапуска durable key доступен; session-only status честный.

## S1-02. Sandbox: закрыть symlink/junction/reparse-point escape

**Файлы:**
- `src/main/services/sandbox/SandboxedFS.ts`;
- `src/main/services/files.service.ts`;
- `src/main/ipc/files.ipc.ts`.

**Что сделать:**
1. Исследовать все sandbox/file operations и все места, где используются `resolvePath()`/`isPathAllowed()`.
2. Сделать единый path guard с canonical root и правилами для существующего и создаваемого пути.
3. Проверять реальные filesystem components через `lstat`; на Windows учитывать junction/reparse points.
4. Для существующих файлов/директорий использовать `realpath` и сравнение canonical target с canonical root.
5. Для нового файла валидировать canonical parent; не считать несуществующий leaf доказательством безопасности.
6. Перед write/delete/rename/copy повторно валидировать границы непосредственно перед операцией.
7. Не разрешать пользовательскому custom root менять границу sandbox через ссылку.
8. Документировать residual TOCTOU limits. Не заявлять абсолютную атомарность, если используемые Node APIs её не обеспечивают.
9. Где возможно использовать no-follow/handle-based подход; если это требует platform-specific native code, сначала оценить цену и совместимость.

**Обязательные тесты:** `../`, symlink на внешний файл, вложенная ссылка, parent link, destination link при rename/copy, broken link, Windows junction/reparse point, нормальные in-root операции.

**Acceptance:** все операции, которые пересекают root через ссылки, отклоняются; обычная работа внутри sandbox сохраняется.

## S1-03. Shell execution: заменить слабую проверку на строгий контракт

**Файлы:**
- `src/main/services/sandbox/PolicyEngine.ts`;
- `src/main/services/commands/shell-executor.ts`;
- `src/main/services/security/shell-approval.service.ts`.

**Что сделать:**
1. Проверить всех callers `executeShellCommand()` и определить, какие вызовы можно перевести на структурированный payload `{ executable, args, cwd, purpose }`.
2. Для allowlisted операций использовать `spawn`/`execFile` с `shell:false`.
3. Allowlist сравнивает точное имя/путь executable, а не подстроку через `includes()`.
4. `nodeevil`, `mygit`, `npm-helper` и похожие названия не должны проходить как разрешённые `node/git/npm`.
5. Неизвестное действие по умолчанию deny. Отсутствие правила не должно давать разрешение на выполнение.
6. Произвольная shell-строка — отдельный опасный режим с обязательным approval и явным интерфейсом последствий.
7. Ввести timeout, AbortSignal/cancel, ограничение stdout/stderr, закрытие ресурсов и kill всего process tree.
8. Не писать секреты и неограниченный shell output в журнал.
9. Передавать команду/аргументы в approval preview так, чтобы пользователь видел реальную цель, executable, cwd и последствия.

**Тесты:** allowlist exact match, command spoofing, shell metacharacters, injection, timeout, abort, child process tree, output limit, reject approval, unknown binary.

**Acceptance:** allowlist является реальным ограничением, а не косметическим фильтром строки; отказ или timeout не приводит к запуску/оставшемуся процессу.

## S1-04. Approval IPC: доверять только ожидаемому renderer sender

**Файлы:**
- `src/main/ipc/approval.ipc.ts`;
- `src/main/services/approval.service.ts`;
- `src/main/preload.ts`;
- тесты ApprovalDialog/IPC.

**Что сделать:**
1. Найти все renderer windows и все источники ответа на approval.
2. В Main проверить `event.sender` against current trusted main window `webContents` и разрешённый origin.
3. Проверять, что `id` существует в pending approvals и ещё не истёк.
4. Повторный, просроченный или неизвестный ответ отклонять.
5. Удалить дублирующий IPC alias только после поиска всех callers и миграции на единый канал.
6. Не позволять произвольному Renderer или webContents разрешать системные действия.
7. Сохранять принцип default reject при закрытии окна/timeout.

**Тесты:** trusted sender, untrusted sender, stale ID, duplicate answer, timeout, close window, approval queue concurrency.

**Acceptance:** системное действие может быть разрешено только валидным pending approval от доверенного UI.

## S1-05. Tasks store: подтверждать sync только после ACK от SQLite

**Файл:** `src/renderer/features/tasks/stores/tasks.store.ts` и связанный IPC/service код.

**Что сделать:**
1. Сохранить текущую upsert/diff архитектуру. Не возвращать full-table delete/reinsert.
2. Не обновлять `lastSyncedSnapshotMap` до подтверждения Main/DB.
3. Держать dirty/pending state до позитивного ack.
4. `success:false`, throw, timeout, renderer close или потеря связи не должны очищать dirty state.
5. Удаление помечать синхронизированным только после успешного delete acknowledgement.
6. Конфликтующие upsert/delete для одного task ID сериализовать или защищать revision/version token.
7. На ошибке показывать честный статус сохранения и возможность retry; не показывать «Сохранено».
8. После запуска перечитывать authoritative state из SQLite и корректно reconciliation local pending changes, если такой механизм предусмотрен.

**Тесты:** upsert success/failure, delete success/failure, IPC throw, timeout, race update/delete, два конкурентных изменения одного ID, restart after failed write, server response mismatch.

**Acceptance:** не подтверждённая БД операция остаётся dirty; после рестарта пользователь не теряет успешно подтверждённые данные и не видит ложную синхронизацию.

**Выход Sprint 1:** все пять задач verified; отказные сценарии покрыты; существующая архитектура не заменена.

---

# 6. Sprint 2 — Runtime Packaging, Voice и Model Supply Chain (P1)

**Цель:** обеспечить предсказуемый первый запуск, правильную работу Python TTS в packaged app, настоящую отмену загрузок и осознанную передачу данных внешним сервисам.

## S2-01. Исправить физический путь TTS dictionaries в packaged app

**Файлы:**
- `tts_dict_loader.py`;
- `silero_server.py`;
- `src/main/services/python_server.service.ts`;
- `src/main/services/python_sync.util.ts`;
- `package.json` build config.

**Что сделать:**
1. Убрать неявную зависимость от `os.getcwd()/Voice/dicts`.
2. Вычислять абсолютный путь к словарям в одном helper на стороне Main.
3. Передавать Python path через явный environment variable (например, `ARC_TTS_DICTS_DIR`) или typed startup config.
4. Упаковать словари в физическую директорию, доступную Python вне `app.asar`.
5. Не дублировать копирование одних и тех же файлов в несколько мест без причины.
6. При запуске Python loader выдаёт диагностические сведения: directory, доступность файлов, число записей по каждому словарю, ошибки загрузки.
7. Отсутствие необязательного словаря не ломает весь TTS, но должно давать degraded pronunciation state.
8. Учитывать обновления и read-only installation directory: словари, предназначенные для редактирования пользователем, должны храниться в userData; bundled defaults — read-only resources.

**Тесты:** dev run, unpacked Windows app, NSIS installed app, Portable app, отсутствующий словарь, некорректный JSON, тестовая запись реально применяется к тексту.

**Acceptance:** установленное приложение загружает те же bundled dictionaries, что и dev; путь подтверждён в диагностике.

## S2-02. Python dependencies: сделать readiness контракт точным

**Файлы:**
- `src/main/services/python_deps.util.ts`;
- `src/main/services/python_server.service.ts`;
- `requirements-silero.txt`;
- diagnostics/UI при необходимости.

**Что сделать:**
1. Разделить обязательные зависимости ядра TTS и optional DSP/accent dependencies.
2. Не возвращать один `success:true`, если обязательный пакет отсутствует.
3. Возвращать детальную карту состояний: `coreReady`, `dspReady`, `accentReady`, `ffmpegReady`, `pythonRuntime`, `errors`.
4. Определить, где отсутствие `onnxruntime` или `ruaccent` допустимо; соответствующее degraded behavior должно существовать и быть протестировано.
5. Согласовать compatible/pinned dependency versions и Python version; проверить wheel compatibility для Windows x64.
6. Ограничить установку зависимостей timeout/wall-clock cap и процессным cancellation.
7. Не запускать второй pip installer одновременно.
8. FFmpeg проверять отдельно от required core и не сообщать о DSP failure, если соответствующий этап не используется.
9. Не подменять провал обязательной зависимости успешной проверкой только части импортов.

**Тесты:** required import failure, optional import failure, pip failure, timeout, cancellation, package conflict, no Python, no FFmpeg, restart after partial install.

**Acceptance:** diagnostics точно объясняет, какая функция доступна/недоступна; `success` не вводит в заблуждение.

## S2-03. Sherpa model downloads: реализовать реальную отмену

**Файл:** `src/main/services/sherpa-downloader.service.ts` (+ GigaAM adapter если используется).

**Что сделать:**
1. Для каждой модели хранить `AbortController`, active request, response stream, file stream, temp path и state.
2. `cancelDownload(modelId)` реально прекращает все связанные сетевые и файловые операции.
3. Добавить отдельную команду cancel all, не смешивать её с cancel одного model.
4. Не очищать active map до завершения cleanup/finally.
5. На cancel закрывать stream/request, ждать завершения, удалять staging files.
6. Финальный model filename не должен существовать/меняться до полной проверки файла.
7. Явно отличать `cancelled` от `failed/network error`.
8. Повторная загрузка после отмены должна начинаться из чистого состояния.

**Тесты:** cancel Zipformer, Whisper, VAD, GigaAM, redirect, timeout, network loss, write failure, cancel during stream, rapid cancel/retry, cleanup idempotency.

**Acceptance:** после cancel нет фонового network transfer, растущего temp file, частичного итогового файла или зависшего Promise.

## S2-04. Supply-chain integrity: manifest, hash и redirect allowlist

**Файлы:**
- `src/main/services/sherpa-downloader.service.ts`;
- `src/main/services/python_sync.util.ts`;
- `src/main/services/stt-config.helper.ts`;
- `src/main/services/python_server.service.ts`;
- manifest/diagnostics files.

**Что сделать:**
1. Ввести единый model/resource manifest с полями: `id`, `source`, immutable revision, filenames, expected size, SHA-256, license URL, locale, engine/runtime compatibility.
2. Найти exact upstream revisions и официальные checksums. Если upstream checksum отсутствует — самостоятельно зафиксировать проверенный digest из доверенного получения и задокументировать метод. Не придумывать хеши и не брать checksum из того же непроверенного ответа, что и сам бинарный файл.
3. Каждый redirect hop ограничить HTTPS и allowlisted host. Запретить downgrade HTTPS→HTTP.
4. Писать загрузку только в staging, проверять expected size и SHA-256, затем атомарно перемещать в final path.
5. Для Silero TTS перейти от проверки только `size > 10 MB` к checksum verification.
6. Для Python resources использовать SHA-256, не MD5 как доказательство целостности.
7. Не запускать/загружать модель до завершения verification.
8. Сохранять локальный provenance record: источник, revision, checksum, license, verifiedAt, verification status.
9. Не ломать пользовательские модели, добавленные вручную: их статус должен быть `unverified/manual`, а не `verified`.

**Тесты:** wrong hash, wrong size, redirect to disallowed host, HTTP downgrade, truncated download, tampered file, atomic replace, retry, existing valid file, manual model.

**Acceptance:** автоматически загруженные assets не активируются, пока их размер и checksum не совпали с manifest.

## S2-05. Cloud TTS fallback — только с явным согласием

**Файл:** `src/main/services/tts.service.ts` + settings store/UI + tests.

**Продуктовое правило:** A.R.C. — local-first. В локальном/private режиме текст речи не должен уходить во внешний TTS автоматически.

**Что сделать:**
1. Добавить явную настройку `allowCloudTtsFallback` (или эквивалентный единый контракт).
2. По умолчанию — `false`.
3. При disabled: Silero unavailable → разрешённый локальный/system fallback (например SAPI на Windows), иначе понятная ошибка; Edge TTS не вызывается.
4. При enabled: явно объяснить, что текст будет отправлен стороннему TTS provider.
5. В UI/diagnostics отображать текущий engine: Silero/local, Edge/cloud, SAPI/system, unavailable.
6. Не отправлять cloud fallback молча из других путей: проверить macros, alerts, onboarding, task speech и voice commands.
7. Сохранить существующий `try/finally`, AbortController и concurrency behavior.
8. Не логировать полный приватный текст.

**Тесты:** local-only never calls Edge, opt-in may call Edge, fallback order, cancel during first engine prevents subsequent fallback, setting persistence, migration default false.

**Acceptance:** отсутствие настройки/старое значение не включает cloud TTS неожиданно; пользовательский opt-in сохраняется и действует одинаково во всех call sites.

## S2-06. Первый запуск: прекратить неожиданные тяжёлые загрузки

**Файлы:**
- `src/main/index.ts`;
- `src/main/services/stt.service.ts`;
- `src/main/services/stt-config.helper.ts`;
- `src/main/services/python_server.service.ts`;
- onboarding steps/components.

**Что сделать:**
1. Найти все автоматические загрузки моделей/создание Python venv, которые происходят при startup без явного действия пользователя.
2. Убрать неожиданный массовый auto-download после `ready-to-show`.
3. Разделить открытие окна и настройку голосовых ресурсов: приложение должно стать интерактивным до начала тяжёлой загрузки.
4. В onboarding предложить ясные действия: `Настроить голос сейчас`, `Позже`, `Продолжить без голоса/системный fallback`.
5. Показать список компонентов, фактический источник, размер/диапазон загрузки, требуемое место и необходимость сети.
6. Не выдавать приблизительный размер как точное значение. Если размер неизвестен — показывать `неизвестен` или получать его с источника.
7. Прогресс считать по реальным bytes received / bytes total. ETA показывать только при достаточном фактическом измерении скорости.
8. Показать `pause/cancel/retry` там, где backend это поддерживает.
9. Не блокировать UI, не запускать параллельно несколько установщиков одной зависимости.
10. Пользователь должен иметь возможность закрыть onboarding и продолжить без установки голосового контура.

**Acceptance:** чистый первый запуск без моделей и сети не зависает, не скачивает гигабайты без согласия и честно сообщает, какие функции пока недоступны.

## S2-07. Единая state machine для voice/model setup

**Что сделать:** определить и использовать единый словарь состояний:

`unknown → checking → missing → consent_required → downloading → verifying → ready`

Дополнительные терминальные/деградированные состояния:

`cancelled`, `degraded`, `unavailable`, `failed`, `incompatible`.

Не все переходы применимы каждому компоненту; они должны быть типизированы и описаны.

**Критерии:**
- отсутствие ресурса не отображается как ошибка работающего компонента;
- `downloaded` не равно `verified`;
- `verified` не равно `loaded`;
- `loaded` не равно `active`;
- cancel не остаётся в `downloading`;
- failed не превращается в зелёный `ready`;
- при повторном открытии настроек состояние корректно восстанавливается из фактического runtime/manifest.

**Выход Sprint 2:** Windows packaged TTS loads dictionaries; dependencies report real status; model downloads are cancellable and verified; cloud TTS is opt-in; no surprise first-run downloads.

---

# 7. Sprint 3 — Database, Electron hardening и честные состояния (P1/P2)

## S3-01. Versioned database migrations

**Файлы:** `src/main/services/database.ts`, recovery utils, migration tests.

**Что сделать:**
1. Инвентаризировать текущую схему и все inline migrations.
2. Ввести один version mechanism: `PRAGMA user_version` или `schema_migrations`.
3. Каждой миграции присвоить постоянный номер и immutable purpose.
4. Проверять current version, выполнять migrations последовательно и идемпотентно.
5. Перед upgrade делать verified backup/snapshot.
6. Миграции выполнять транзакционно там, где это поддерживает операция.
7. На ошибке не помечать версию завершённой; не удалять/обнулять user DB.
8. Для старых DB versions сделать fixtures и migration tests.
9. Сохранить существующий recovery/SAFE_MODE механизм.

**Acceptance:** database любого поддерживаемого старого schema version переходит на текущую без потери данных; повторный запуск не повторяет миграцию некорректно.

## S3-02. JSONDatabase: честно описать режим хранения

**Файл:** `src/main/services/database.ts` + diagnostics UI.

**Что сделать:**
1. Не выдавать JSON engine за SQLite.
2. Разделить persisted JSON fallback и volatile read-only diagnostic fallback.
3. Использовать явный `engine` и `storageStatus`, не сочетать `engine: json-test` с `PERSISTENT_SQLITE`.
4. Не сообщать, что JSONDatabase имеет полноценную транзакционность/rollback, если реализация этого не гарантирует.
5. В packaged production продолжать строгое поведение `DB_SAFE_MODE` при отсутствии native SQLite driver; не создавать скрытый небезопасный fallback.
6. Уточнить, где JSONDatabase допустим: tests/dev only или ограниченный degraded mode.

**Acceptance:** экран диагностики сообщает реальный storage engine и реальные ограничения.

## S3-03. Electron security/origin boundary

**Файлы:**
- `src/shared/config/csp.config.ts`;
- `src/main/index.ts`;
- `src/main/windows/mainWindow.ts`, если относится к действующей window path;
- IPC origin/sender validators.

**Что сделать:**
1. Проверить, какой именно BrowserWindow factory реально используется. Не чинить неиспользуемый файл и не создавать второй конкурирующий путь.
2. `file://` в production не должен означать доверие любому локальному файлу. Принимать только canonical renderer entrypoint/известный renderer root.
3. Внешние URL парсить через `new URL`; разрешать только `http:` и `https:`.
4. DevTools в production отключить по умолчанию; доступ — только через явный debug build/flag.
5. Указать `sandbox:true`, `webSecurity:true`, `webviewTag:false` после проверки совместимости preload, node modules и runtime.
6. Пересмотреть CSP: `unsafe-eval`, широкие `https:`, `ws:`, `wss:` и `img-src https:`.
7. Не удалять CSP исключения вслепую. Сначала установить, какие функции (ONNX Web, LiteGraph, локальные endpoints, providers) от них зависят.
8. Свести network/model download, по возможности, в Main process с allowlist.
9. Удалить CORS wildcard rewrite для HuggingFace, если после переноса запросов в Main он не требуется; если требуется — обосновать узкий scope.
10. Добавить security rationale/threat model и тесты origin/permission decisions.

**Acceptance:** нет широкого доверия произвольным file URLs и произвольным webContents; приложение сохраняет необходимые AI/voice features; CSP/security exceptions перечислены и объяснены.

## S3-04. Единый capability registry для Modules

**Файлы:**
- `src/renderer/features/modules/components/ModulesView.vue`;
- `src/main/ipc/system.ipc.ts`;
- Shared/Main registry and health adapters.

**Что сделать:**
1. Устранить два независимых статических списка статусов.
2. Создать единую registry definition с типизированными полями: `id`, `name`, `description`, `lifecycleState`, `availability`, `health`, `entrypoint`, `dependencies`, `lastCheckedAt`, `reason`.
3. Разделить lifecycle (implemented/planned/disabled) и runtime health (checking/ready/degraded/unavailable/error/unknown).
4. Для реальных сервисов получать runtime health через adapters.
5. Для roadmap items явно показывать `planned`, не маскировать их под active.
6. Не показывать Agent Swarm/MCP/Sandbox как готовые пользовательские возможности, если их реальная implementation недоступна.
7. Обеспечить, чтобы UI и `system:modules` использовали одну registry/ответ.

**Acceptance:** одна capability имеет один `id` и одно согласованное описание состояния; ложных active/green статусов нет.

## S3-05. AI decomposition: сообщать реальный источник результата

**Файл:** `src/renderer/features/tasks/composables/useAiDecomp.ts` + IPC response/UI.

**Что сделать:**
1. Возвращать типизированный `source: 'llm' | 'local_template'` и причину fallback.
2. UI должен различать AI decomposition и deterministic local template.
3. Не показывать toast «ИИ декомпозиция завершена», если использован локальный шаблон.
4. Не добавлять повторно subtasks при повторном нажатии, если операция уже была выполнена, если это не выбранное ожидаемое поведение.
5. Сохранить маркировку локальных шаблонных шагов.

**Acceptance:** пользователь всегда понимает, использовалась ли модель.

## S3-06. First Run Wizard: дождаться сохранения перед закрытием

**Файл:** `src/renderer/components/onboarding/FirstRunWizardModal.vue` и wizard steps.

**Что сделать:**
1. Сделать `skipWizard()` асинхронным.
2. Дождаться `saveCurrentState()` всех полей, которые должны сохраняться при пропуске.
3. При ошибке не ставить wizard completed автоматически.
4. Разделить critical settings и optional settings; необязательные можно пропустить с понятным уведомлением.
5. Защитить от двойного клика/повторного submit во время сохранения.
6. Отображать `saving`, `saved`, `error` честно.

**Acceptance:** wizard не закрывается раньше завершения обязательных save operations; данные остаются после перезапуска.

## S3-07. ZIP export: fail closed при ошибке redaction

**Файл:** `src/main/utils/zip-writer.ts`.

**Что сделать:**
1. При ошибке parse provider config не возвращать исходный buffer.
2. Исключать некорректный provider config либо заменять его безопасной redacted placeholder записью.
3. Убедиться, что секреты не копируются из alternate fields (`apiKey`, `secret`, `token` и known provider secret fields).
4. Проверить nested structures и массивы.
5. Добавить expanded-size/file-count limits или документировать точные пределы.
6. Проверить, нужен ли streaming ZIP/ZIP64. Не вводить новую ZIP dependency без измерений и сравнения лицензий/поддержки.

**Тесты:** valid provider JSON, malformed/truncated JSON containing apparent key, nested key fields, huge file, too many entries, symlink skip, DB snapshot.

**Acceptance:** ошибка redaction никогда не приводит к включению исходного неподчищенного provider config в backup.

## S3-08. Reset semantics: привести интерфейс к реальному объёму удаления

**Файл:** `src/main/services/storage-manager.service.ts` + Storage Settings UI.

**Важно:** аудит фиксирует неоднозначность между обычным сбросом данных и factory reset. Это продуктовая политика; не расширять уничтожение данных по собственной инициативе.

**Без отдельного решения владельца:**
- не добавлять удаление Secret Vault, audit logs или пользовательских model files в существующий reset;
- не выполнять более разрушительную операцию, чем сейчас;
- сделать название и confirmation text честными относительно реального списка targets;
- вывести пользователю точный список того, что будет удалено и что сохранится.

**Если владелец отдельно утвердит Factory Reset:** реализовать его отдельным явным действием с повторным подтверждением и тестом точного списка удаления.

**Acceptance:** никакая категория пользовательских данных не удаляется неожиданно или без ясного предупреждения.

## S3-09. PowerShell/SAPI: безопасная передача пути

**Файл:** `src/main/services/tts.service.ts`.

**Что сделать:**
1. Не конкатенировать путь к temp text file в PowerShell source string.
2. Использовать безопасную передачу через argv/env/stdin и `execFile`/`spawn` с `shell:false`, где это возможно.
3. Валидировать exit code, timeout и cleanup.
4. Проверить пути с пробелами, кириллицей, апострофами и скобками.
5. Сохранить fallback semantics и остановку процесса.

**Acceptance:** SAPI работает с нестандартным Windows user profile path без command injection/ошибки quoting.

## S3-10. Build metadata: не подставлять устаревший commit SHA

**Файл:** `electron.vite.config.ts`.

**Что сделать:**
1. Release CI должен передавать точный `BUILD_COMMIT`.
2. Если SHA отсутствует в release build — использовать `unknown` или fail gate, но не hardcoded старый SHA.
3. Dev fallback допускается только как явно помеченный `unknown`/local.
4. Diagnostics показывают версию приложения и commit, из которого собран артефакт.

**Acceptance:** commit metadata EXE соответствует commit workflow run.

## S3-11. Постепенная статическая проверка TypeScript

**Файлы:** `tsconfig.json`, `package.json`, lint config.

**Что сделать:**
1. Ввести ESLint/format только после анализа существующих style/tooling и размера diff.
2. Добавить проверки для Vue + TS + IPC boundary.
3. Начинать strictness с Shared contracts, IPC schemas, новых/изменяемых файлов.
4. Вводить `strict`, `strictNullChecks`, `noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` поэтапно.
5. Не превращать release hardening в big-bang rewrite сотен файлов.
6. Зафиксировать отдельную roadmap по оставшемуся typing debt.

**Acceptance:** новые и изменяемые критичные контракты runtime/type-safe; существующий релизный gate не ухудшен.

## S3-12. Build packaging identity and metadata

**Файлы:** `package.json`, electron-builder resources, icon assets, third-party notices.

**Что сделать:**
1. Задать реальную application icon вместо default Electron icon.
2. Указать author/homepage/repository metadata, если их значения согласованы владельцем проекта.
3. Проверить product name, appId, file metadata, NSIS shortcuts и uninstall behavior.
4. Проверить цифровую подпись реального EXE через Windows tooling; лог `signing with signtool` сам по себе не является доказательством доверенной подписи.
5. Не утверждать, что installer signed, пока проверка сертификата/chain не выполнена.

**Acceptance:** артефакты имеют узнаваемую идентичность, метаданные корректны, статус подписи проверен и задокументирован.

**Выход Sprint 3:** честная DB/diagnostics state, hardened Electron boundary, unified Modules registry, safe exports, predictable reset и аккуратная build metadata.

---

# 8. Sprint 4 — Real Release QA (P0 Release Gate)

Это этап доказательства работоспособности. Его нельзя закрыть на основании только unit tests, CI build или обещания кодера.

## S4-01. Реальный multi-process soak test на Windows

Создать/доработать harness, который измеряет реальное дерево процессов A.R.C.:
- Electron Main;
- Chromium Renderer/GPU processes;
- Python TTS;
- STT worker;
- local LLM runtime, если включён;
- download workers/processes.

Измерять:
- PID, lifetime, restart count;
- private working set/RSS по каждому процессу и суммарно;
- CPU time/load;
- handles/threads;
- GPU memory/load, если доступно;
- renderer crashes/unhandled rejections;
- DB write latency, lock duration, WAL size;
- STT/TTS latency и аудио ошибки;
- загрузку моделей и скорость/отмену downloads.

**Минимальные сценарии:**
1. Idle 30 минут.
2. Chat streaming + repeated cancel.
3. STT активен 30 минут с микрофоном.
4. Повторные TTS generation/playback.
5. Chat + STT + TTS по утверждённой concurrency policy.
6. Minimized/background Eco mode.
7. Повторное открытие workspace/modals.
8. Provider outage → fallback → recovery.
9. Network loss во время model download.
10. Sleep/resume, screen lock/unlock.
11. Закрытие приложения с активным STT/TTS/download.

**Продолжительность:** минимум 2 часа; целевой прогон 4 часа.

**Критерии:**
- нет необработанных fatal exceptions;
- нет orphan Python/STT child processes после закрытия;
- нет бесконечных restart loops;
- нет устойчивого линейного роста памяти после warmup;
- нет постоянного CPU load в скрытом/idle режиме без причины;
- cancel действительно останавливает операции;
- реальные p50/p95 latency записаны;
- лимиты памяти задаются по low-end hardware baseline, а не придумываются.

## S4-02. Upgrade/data preservation QA

Проверить переход с предыдущей поддерживаемой версии на release candidate:
- пользовательская SQLite DB;
- WAL/SHM при корректном shutdown/restart;
- provider configs;
- Secret Vault / DPAPI;
- macros/tasks/memory;
- model directories;
- user preferences.

**Критерии:** upgrade не теряет данные; migration logs корректны; uninstall не удаляет user data по умолчанию; backup/restore проверены.

## S4-03. Clean OS matrix

Проверить NSIS и Portable минимум на:
- Windows 10 x64;
- Windows 11 x64;
- обычной учётной записи без admin;
- профиле пользователя с кириллицей/пробелами;
- системе без Python;
- системе без FFmpeg;
- системе без ранее загруженных моделей;
- offline/slow network.

Зафиксировать для каждого сценария: OS build, hardware, artifact SHA, шаги, фактический результат, логи и screenshot/error details.

## S4-04. UX / accessibility matrix

Проверить в реальном окне:
- 1920×1080, 100%;
- 1366×768, 100%;
- 1366×768, 125%;
- 1280×720;
- 390×844 — только если mobile/tablet поддержка реально заявлена.

Проверить:
- первый экран и видимость primary actions;
- overflow/scroll traps/clipped panels;
- modal focus trap и возврат фокуса;
- Esc semantics;
- keyboard navigation/tab order;
- reduced motion;
- contrast/text readability;
- состояния empty/error/offline/cancelled/degraded;
- Settings Provider draft save/switch/discard;
- truthful module/voice/provider/model states.

**Не делать новый дизайн ради отчёта.** Вносить только конкретные адресные изменения по воспроизводимой проблеме.

## S4-05. Supply chain, licenses и release provenance

1. Проверить все bundled models/weights по exact upstream revision.
2. Перепроверить Silero TTS v5.6 license; `THIRD_PARTY_NOTICES.md` сообщает CC BY-NC-SA 4.0 / non-commercial restriction.
3. До коммерческой дистрибуции получить необходимые права или исключить несовместимый bundled weight и обеспечить альтернативный законный delivery path.
4. Проверить licenses npm/Python dependencies, fonts, icons, images, audio assets и model/tokenizer files.
5. Сгенерировать npm + Python SBOM (CycloneDX или SPDX) и сохранить в release artifacts.
6. Для каждого model manifest указать source/revision/hash/license.
7. Не выдавать приложение за коммерчески пригодное на основе лицензии `package.json` MIT, если bundled assets имеют отдельные ограничения.

## S4-06. Release candidate bundle

Перед публикацией подготовить:
- NSIS EXE;
- Portable EXE;
- SHA256SUMS;
- SBOM;
- release notes/changelog;
- third-party notices;
- проверенную версию и commit SHA;
- Windows QA report;
- known issues и support/diagnostic instructions.

GitHub Release создаётся только после явного release approval владельца и успешного прохождения gates.

---

# 9. UX/UI и продуктовая полировка — только адресно

## 9.1. Что сохранить

- существующий A.R.C. design language;
- split navigation/workspace model;
- Master–Detail провайдеров;
- единые Settings primitives;
- текущую цветовую лестницу surface tokens;
- Visual Constitution checks.

## 9.2. Что исправлять, когда воспроизведено

- ложный зелёный/active status;
- loading state, который не завершается после failure/cancel;
- отсутствие различия `unknown`, `checking`, `ready`, `degraded`, `unavailable`, `error`;
- ошибки сохранения, скрытые под success toast;
- клиппинг панелей и primary actions на 1366×768/125%;
- пустые состояния без объяснения следующего действия;
- недостаточно понятный ApprovalDialog (инициатор, executable, cwd, target, последствия, timeout);
- excessive repeated summary strips/cards, если они вытесняют главное действие на первом экране.

## 9.3. Что не делать

- не перестраивать все настройки единым массовым коммитом;
- не добавлять badges/colored fills ради «визуального богатства»;
- не увеличивать плотность карточек без usability теста;
- не менять Reactor design/protected zones;
- не выводить status из наличия компонента в статическом массиве.

Каждая UI-задача должна содержать: screenshot до, точную проблему, screenshot после и список разрешений/состояний, которые проверены.

---

# 10. Удаление legacy, дубли и repository hygiene

Удаление файлов не является самоцелью. До удаления каждого кандидата выполнить глобальный поиск:

- static imports;
- dynamic `import()`/`require()`;
- string-based file paths;
- package/build config;
- postinstall scripts;
- Python imports;
- documentation links;
- user data upgrade/migration.

Кандидаты из аудита для исследования (не автоматическое удаление):

| Кандидат | Что проверить |
|---|---|
| `myload/english_pronunciation_dict.py` | Использование TTS dictionary generation/runtime; не удалять до поиска всех ссылок |
| `screeninfo/` | Ссылки из README/docs; перенести нужные screenshots в canonical docs assets |
| `public/assets/aistudio/` | Vite public references/runtime assets; не удалять только по названию |
| Legacy Vosk files/resources/cleanup code | imports, old user data migration, scripts, compatibility; удалить только при доказанном отсутствии потребителей |
| `docs/archive/`, `docs/phase6-*` и старые plans | Сохранить историю, пометить superseded; не удалять инженерные решения |
| Wrapper `src/renderer/components/ui/ApprovalDialog.vue` | Проверить импорты; тонкий wrapper не считать отдельной реализацией |

Дополнительно:
- `docs/00-index.md` ссылается на отсутствующий `docs/AI-STUDIO-CONTEXT.md`; восстановить либо исправить ссылку.
- `docs/current-state.md` должен отражать актуальное состояние CI и новые подтверждённые изменения.
- `docs/STATISTICS.md` должен и дальше честно отличать synthetic test от real process-tree soak.
- `docs/PROJECT_RELEASE_ROADMAP.md` — обновлять как каноническую дорожную карту, не создавать конкурирующую.
- Сохранять единую запись статусов задач с commit, тестом, датой и evidence.

---

# 11. Производительность и поддержка слабых ПК

A.R.C. должен оставаться пригодным для менее мощных Windows-машин. Оптимизацию делать по замерам, а не по догадкам.

**Обязательное:**
- измерять дерево процессов целиком;
- отдельно учитывать Electron Main, Renderer/GPU, Python TTS, STT worker и local LLM;
- проверить Eco/background mode;
- проверить lazy loading тяжёлых views/workers;
- анализировать initial bundle и route chunks;
- измерить cold startup и warm startup;
- проверить RAM/VRAM/CPU на low-end baseline.

Bundle log показывает крупные raw chunks (`index` около 3.93 MB, SettingsPanel около 749 KB, Whisper worker около 1.43 MB). Это основание для bundle analysis, но не автоматическое основание для переписывания. Сначала проверить compressed size, initial dependency graph, lazy loading и реальную загрузку.

Не назначать произвольный общий RAM cap до фиксации тестового hardware baseline. Вместо этого зафиксировать p50/p95, plateau после warmup, пиковые показатели и поведение Eco mode.

---

# 12. Release Acceptance — итоговые условия готовности

Релиз не считается готовым, пока не выполнены все обязательные пункты.

## 12.1. Build / CI

- [ ] Linux validation job green.
- [ ] Windows validation job green.
- [ ] NSIS packaging green.
- [ ] Portable packaging green.
- [ ] CI не требует `GH_TOKEN` для обычной сборки.
- [ ] NSIS/Portable имеют уникальные имена.
- [ ] Оба EXE загружены как workflow artifacts.
- [ ] SHA-256 записаны и проверены.
- [ ] Build commit SHA соответствует source commit.
- [ ] Release publishing запускается только явно.

## 12.2. Установка / first run

- [ ] Clean Windows 10 test.
- [ ] Clean Windows 11 test.
- [ ] NSIS install/uninstall.
- [ ] Portable run.
- [ ] Paths with spaces/Cyrillic.
- [ ] No Python scenario.
- [ ] No FFmpeg scenario.
- [ ] No models scenario.
- [ ] Offline/slow network scenario.
- [ ] No surprise large downloads.
- [ ] Download progress uses real values.
- [ ] Cancel leaves no partial final asset.

## 12.3. Data / Security

- [ ] Secret Vault success only after durable verified write.
- [ ] Migration retains old vault until new vault verified.
- [ ] Sandbox blocks symlink/junction/reparse escapes.
- [ ] Shell allowlist exact; unknown actions deny.
- [ ] Shell timeout/cancel kills process tree.
- [ ] Approval validates sender and pending ID.
- [ ] Tasks retain dirty state until SQLite ACK.
- [ ] DB migrations tested from supported prior versions.
- [ ] Corrupt DB recovery/safe mode does not silently erase data.
- [ ] ZIP export never leaks raw secrets, even for malformed provider config.
- [ ] Reset accurately describes its destructive scope.

## 12.4. Voice / Models / Privacy

- [ ] TTS dictionaries load in packaged app.
- [ ] Python dependency readiness is truthful.
- [ ] STT worker starts, recovers and stops correctly.
- [ ] STT fallback status is correct.
- [ ] Model manifest/checksum verification passes.
- [ ] Redirect allowlist enforced.
- [ ] Cancellation works for each model type.
- [ ] Cloud TTS fallback off by default and requires explicit opt-in.
- [ ] Text does not leave device in local-only mode.

## 12.5. UX / Accessibility

- [ ] No false green/active states.
- [ ] No infinite loading after failure/cancel.
- [ ] No misleading AI/template source label.
- [ ] First Run Wizard awaits required saves.
- [ ] Main workspaces verified at target resolutions/scaling.
- [ ] ApprovalDialog keyboard/focus flow verified.
- [ ] Provider Master–Detail draft/save/switch behavior verified.
- [ ] Modules state derives from a unified capability registry.

## 12.6. Stability / Distribution

- [ ] 2–4 hour real process-tree soak on Windows.
- [ ] No orphan Python/STT process after close/restart.
- [ ] Memory reaches stable plateau after warmup.
- [ ] Sleep/resume tested.
- [ ] Audio device disconnect/reconnect tested.
- [ ] Network loss/recovery tested.
- [ ] Upgrade preserves user data.
- [ ] Uninstall preserves user data according to declared policy.
- [ ] Licenses and model terms verified.
- [ ] SBOM generated.
- [ ] Release notes, checksums, metadata and known issues prepared.

---

# 13. Формат отчётов AI-кодера

## 13.1. План до реализации

Для каждой задачи присылать:

```text
TASK: Sx-xx — <название>
CURRENT HEAD:
AUDIT STATUS: OPEN / ALREADY_FIXED / NEEDS_REPRO / NEW_FINDING
ROOT CAUSE:
CALL SITES / DEPENDENCIES:
FILES TO CHANGE:
FILES NOT TO CHANGE:
IMPLEMENTATION PLAN:
FAILURE CASES:
TEST PLAN:
WINDOWS-SPECIFIC RISKS:
DATA / MIGRATION COMPATIBILITY:
PROTECTED ZONES IMPACT:
EXPECTED ACCEPTANCE EVIDENCE:
BLOCKERS / QUESTIONS:
```

После этого кодер останавливается и ждёт `approve` или `change`.

## 13.2. Отчёт после реализации

```text
TASK: Sx-xx — <название>
STATUS: IMPLEMENTED / VERIFIED / BLOCKED
COMMIT:
CURRENT HEAD AFTER CHANGE:
ROOT CAUSE CONFIRMED:
CHANGED FILES:
BEHAVIOR BEFORE:
BEHAVIOR AFTER:
TESTS ADDED / UPDATED:
COMMANDS EXECUTED:
EXACT TEST RESULTS:
LINUX RESULT:
WINDOWS RESULT:
MANUAL QA EVIDENCE:
DATA MIGRATION / BACKWARD COMPATIBILITY:
SECURITY IMPACT:
PROTECTED FILES: untouched / separately approved
KNOWN LIMITATIONS:
REMAINING RISKS:
DOCUMENTATION UPDATED:
```

**Нельзя писать `VERIFIED`, если обязательный тест не запускался.** В таком случае статус `IMPLEMENTED`, а отсутствующая проверка указывается как `NOT RUN`.

## 13.3. Требования к доказательствам

Прикладывать по возможности:
- commit SHA;
- ссылку на GitHub Actions run;
- точные команды;
- test count и результат;
- логи relevant failure tests;
- screenshot UI до/после;
- SHA-256 артефактов;
- скриншоты/протокол чистой Windows;
- sample diagnostic report без секретов.

Не писать «всё работает» без доказательств. Не выдавать локальный mock за реальный Windows test. Не выдавать синтетическую нагрузку за real process-tree soak.

---

# 14. Что кодер должен сделать прямо сейчас

**Выполнить только подготовку к задаче `S0-01`. Код пока не менять.**

1. Прочитать `ARC_RELEASE_READINESS_AUDIT.md` целиком.
2. Прочитать настоящий Master TZ целиком.
3. Проверить актуальный `HEAD` и выяснить, какие выводы аудита ещё актуальны.
4. Проверить `package.json`, `.github/workflows/ci.yml` и последние Windows workflow logs.
5. Подготовить план исправления `S0-01`:
   - как будет отключена implicit publishing;
   - как будут разнесены NSIS/Portable filenames;
   - как будут собираться оба target;
   - как проверить наличие артефактов и SHA-256;
   - как сохранить артефакты в GitHub Actions без release token;
   - какие команды и тесты будут выполнены.
6. Указать точные файлы, которые планируется менять.
7. Назвать риски и критерии приёмки.
8. Остановиться и ждать решения владельца.

Не начинать Sprint 1–4 до отдельного разрешения. Не делать побочные улучшения, не менять UI, не обновлять версию и не публиковать Release в рамках первого этапа.

---

# 15. Финальная инструкция

Главный принцип этой работы: **не наращивать количество функций — доказывать надёжность уже существующих.**

A.R.C. не нуждается в переписывании с нуля. Требуется последовательно закрыть конкретные дефекты, улучшить обработку отказов, подтвердить Windows packaging и провести реальное эксплуатационное тестирование.

Порядок приоритетов неизменен:

**P0 Windows distribution → P1 data/security → P1 voice/download reliability/privacy → P1/P2 database/Electron/status semantics → real Windows QA → release approval.**

Одна задача за раз. Сначала план. После согласования — реализация. После реализации — доказательства. После проверки — только тогда переход к следующей задаче.
