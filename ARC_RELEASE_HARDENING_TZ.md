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

**Статус этапа Sprint 0:**
- `S0-01`: **VERIFIED** — [Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756) (`commit a3cd3ec`, [Windows job](https://github.com/DdepRest/ARC/actions/runs/43931936756/job/133527116076))
- `S0-02`: **VERIFIED** — [Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756) (`ARC-Setup-1.0.12-x64.exe` и `ARC-Portable-1.0.12-x64.exe`)
- `S0-03`: **VERIFIED** — [Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756) (`scripts/verify-win-artifacts.ps1` + `-SelfTest` + `SHA256SUMS.txt` + upload-artifact)
- `S0-04`: **IMPLEMENTED** — разделены `.github/workflows/ci.yml` и `.github/workflows/release.yml` (ожидает CI-прогона на GitHub Actions)
- `S0-05`: **BLOCKED** — требуется натурный ручной QA владельца на чистой Windows 10/11 по артефактам [Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756)

## S0-01. Убрать неявную публикацию из обычного CI — [VERIFIED — Run #8]

**Основные файлы:**
- `package.json`;
- `.github/workflows/ci.yml`.

**Проблема из аудита:** electron-builder автоматически переходит к publishing при обнаружении CI и пытается использовать отсутствующий `GH_TOKEN`. NSIS успевает собраться, но job падает при Portable; последующие checks и artifact upload пропускаются.

**Что сделать:**
1. [x] Разобрать, какой именно npm script вызывается в Windows job и какие electron-builder targets он запускает.
2. [x] Явно запретить publishing в обычной CI-сборке (`--publish never` в `dist:win` и `pack:win`).
3. [x] Убедиться, что PR и push в `main` не пытаются создавать GitHub Release.
4. [x] Не добавлять фальшивый `GH_TOKEN`, не использовать PAT владельца для обычного artifact build.
5. [x] Не менять релизный workflow так, чтобы публикация стала происходить на каждый push.
6. [x] Сохранить существующие Linux validation checks.

**Критерии приёмки:**
- [x] CI выполняет packaging без `GH_TOKEN` ([Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756)).
- [x] В логах отсутствует попытка implicit publish.
- [x] NSIS/Portable packaging не зависит от прав на GitHub Releases.
- [x] TypeScript, tests, build, size guard и visual constitution остаются зелёными ([Linux job `133526372152`](https://github.com/DdepRest/ARC/actions/runs/43931936756/job/133526372152)).

## S0-02. Развести NSIS и Portable артефакты — [VERIFIED — Run #8]

**Файл:** `package.json` build configuration.

**Что сделать:**
1. [x] Проверить актуальную схему electron-builder 26.x (`26.15.3`), поддерживающую разные artifact names для разных targets.
2. [x] Задать разные, однозначные имена для NSIS (`ARC-Setup-${version}-${arch}.${ext}`) и Portable (`ARC-Portable-${version}-${arch}.${ext}`).
3. [x] Не полагаться на порядок переименования после сборки, использовать target-specific naming в builder config.
4. [x] Исключить коллизию и перезапись между targets.
5. [x] Убедиться, что Portable не перезаписывает NSIS и наоборот.

**Критерии приёмки:**
- [x] В `dist/` находятся два разных EXE (`ARC-Setup-1.0.12-x64.exe` и `ARC-Portable-1.0.12-x64.exe`).
- [x] По имени понятно, какой файл NSIS, какой Portable.
- [x] SHA-256 файлов различаются (подтверждено верификатором в [Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756)).
- [x] Оба файла имеют ненулевой и валидный размер/overlay (общий zip-артефакт Run #8: `476 900 615` байт).
- [x] Проверка содержимого показывает корректные Windows PE executable artifacts.

## S0-03. Сделать artifact verification обязательным — [VERIFIED — Run #8]

**Файлы:** `.github/workflows/ci.yml`, `scripts/verify-win-artifacts.ps1`.

**Что сделать:**
1. [x] После сборки проверять наличие обоих файлов по точным ожидаемым именам.
2. [x] Заменить произвольный абсолютный порог размера на проверку PE-структуры, границ секций, архитектуры (`0x014C`/`0x8664` для обёрток, строго `0x8664` для `dist/win-unpacked/A.R.C.exe`), непустого PE overlay и `.blockmap` для NSIS (+ `-SelfTest` с негативными тестами).
3. [x] Проверить, что файлы не совпадают по SHA-256.
4. [x] Сгенерировать `SHA256SUMS.txt` (UTF-8 без BOM) с точным именем и checksum каждого EXE.
5. [x] Загружать оба EXE, NSIS `.blockmap` и `SHA256SUMS.txt` через `actions/upload-artifact@v4` по точным путям из `$env:GITHUB_OUTPUT`.
6. [x] При отсутствии любого ожидаемого файла завершать job ошибкой.
7. [x] Добавить в workflow вывод версий Node, npm, Electron и electron-builder для воспроизводимой диагностики.

**Критерии приёмки:**
- [x] Artifact upload выполняется только после успешных checks ([Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756/job/133527116076)).
- [x] В GitHub Actions run доступны оба EXE, `.blockmap` и checksum file (`arc-windows-x64-a3cd3ecb6d249eabd354023e0e5e1c220db74bb0`).
- [x] Нет тихого пропуска одного из targets.

## S0-04. Разделить CI validation и Release publishing — [IMPLEMENTED — ожидает CI run]

**Файлы:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`.

**Что сделать:**
1. [x] Обычный CI (`ci.yml`): validate + build artifacts + upload-artifact только на `push`/`pull_request` в `main`/`master` (`permissions: contents: read`).
2. [x] Публикация GitHub Release вынесена в отдельный `release.yml` (триггер по тегу `v*` и ручной `workflow_dispatch`).
3. [x] Для `release.yml` заданы минимальные top-level права `contents: read` и `contents: write` только на job `release-win`, сборка идёт с `--publish never`, публикация выполняется явным шагом `gh release create/upload` только после `verify-win-artifacts.ps1`.
4. [x] Токены не хранятся и не выводятся в логах.
5. [x] Публикация не является условием для PR/обычного push.

**Критерии приёмки:**
- [ ] Push в `main` не публикует release (ожидает подтверждения на следующем run после `a3cd3ec`).
- [ ] Release tag workflow (`release.yml`) проверен запуском по тегу `v*` или `workflow_dispatch`.
- [x] Отсутствие release token не ломает обычный CI ([Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756)).

## S0-05. Подтвердить packaging на чистой Windows — [BLOCKED — требуется ручной Windows QA]

Это QA-задача; она не может быть закрыта только unit tests. Заблокирована в Linux-контейнере до ручной проверки артефактов [Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756) (`ARC-Setup-1.0.12-x64.exe`, `ARC-Portable-1.0.12-x64.exe`) владельцем на Windows 10 и Windows 11.

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

## S1-01. Secret Vault: атомарная запись и подтверждённая миграция — [IMPLEMENTED — unit-тесты Linux пройдены; Windows DPAPI / CI `NOT RUN`]

**Файлы:** `src/main/services/security/secret-vault.service.ts`, `src/main/services/security/secret-vault.storage.ts`, `src/main/services/security/secret-vault.migration.ts`, `src/main/ipc/settings.ipc.ts`, `src/main/services/llm/providers/provider-manager.ts`, `src/main/ipc/ai.ipc.ts`.

**Статус:** реализация и unit/негативные тесты (Vitest на Linux с mock DPAPI) выполнены; финальный статус `VERIFIED` требует прогона `windows-latest` CI и проверки под реальным Windows DPAPI.

**Обязательное поведение:**
1. [x] `setSecret()` возвращает `success:true` только после фактической записи и проверочного чтения нового vault (при доступном DPAPI отказ диска возвращает `success: false` без fallback в RAM).
2. [x] Ошибка `writeVaultFileV2()` никогда не игнорируется вызывающим методом (`setSecret`, `deleteSecret`, `setProviderApiKey`, `deleteProviderApiKey`, `handleSetKey`, `saveProvider`, `ai:save-provider`).
3. [x] Запись выполняется в staging/temp file (`secrets.json.tmp.<pid>.<ts>.<seq>`, `0o600`) в той же директории, затем атомарно заменяет основной файл через `renameSync` (повреждённый существующий файл предварительно сохраняется в `.corrupt.<ts>.bak`).
4. [x] Где платформа позволяет, обеспечить `fsyncSync` перед `renameSync` (допуская только `EINVAL`/`ENOTSUP`/`ENOSYS` на ФС без поддержки fsync).
5. [x] После записи staging-файла до `renameSync` выполняются parse/schema v2 validation/read-back и DPAPI `decryptString` round-trip проверка, а после `renameSync` — подтверждение целевого файла на диске.
6. [x] При миграции legacy secrets (`secrets.json` v1, `config/secure-keys.json`, `ai-providers.json`) исходный файл/ключ не удаляется до подтверждённой записи и проверки всех перенесённых записей.
7. [x] При неудаче миграции или пропуске нечитаемых записей legacy source остаётся нетронутым и возвращается безопасная диагностика без значений ключей.
8. [x] Определён единый канонический ключ Gemini (`gemini_api_key`); legacy aliases (`provider:gemini:api_key`, `provider:<id>:api_key`) поддерживаются в compatibility/migration path и консолидируются в `gemini_api_key`.
9. [x] Plaintext secret и сырые ошибки с путями/содержимым не включаются в `error`, toast и логи (`formatSafeDiskError` + `sanitizeError`).
10. [x] Сохранена честная семантика `dpapi` vs `session_memory_only`; при доступном DPAPI ошибка диска не подменяется RAM-кэшем.

**Обязательные тесты (Vitest на Linux, mock `safeStorage`):**
- [x] write failure (`EACCES`, `EROFS`, `ENOSPC`);
- [x] повреждённый/усечённый JSON (`.corrupt.*.bak` карантин);
- [x] оборванный temp file и сбой/crash между write temp и `renameSync` (`EIO`);
- [x] ошибка read-back DPAPI верификации до `renameSync`;
- [x] migration failure и частичные нечитаемые записи (legacy source сохраняется);
- [x] verified migration success + канонизация Gemini (`config/secure-keys.json` удаляется только после проверки);
- [x] restart + DPAPI decrypt;
- [x] `safeStorage` unavailable (`session_memory_only`).
- [ ] Реальный Windows DPAPI + `windows-latest` CI прогон (`NOT RUN` в Linux-контейнере).

**Acceptance:** ни один сценарий отказа в unit-тестах не возвращает ложный success; legacy ключи не теряются; после перезапуска durable key доступен; session-only status честный (полная приёмка `VERIFIED` — после прогона на Windows).

## S1-02. Sandbox: закрыть symlink/junction/reparse-point escape — [IMPLEMENTED — unit-тесты Linux пройдены; Windows CI `NOT RUN`]

**Файлы:**
- `src/main/services/sandbox/path-guard.ts` *(новый модуль)*;
- `src/main/services/sandbox/sandbox-audit.helper.ts` *(новый модуль)*;
- `src/main/services/sandbox/SandboxedFS.ts`;
- `src/main/services/files.service.ts`;
- `src/main/ipc/files.ipc.ts`;
- `src/main/services/sandbox/SandboxedFS.test.ts`;
- `src/main/services/files.service.test.ts`;
- `src/main/ipc/files.ipc.test.ts`.

**Что сделать:**
- [x] 1. Исследовать все sandbox/file operations и все места, где используются `resolvePath()`/`isPathAllowed()`.
- [x] 2. Сделать единый path guard (`path-guard.ts`) с canonical root и правилами для существующего и создаваемого пути.
- [x] 3. Проверять реальные filesystem components через `lstatSync`; на Windows учитывать junction/reparse points.
- [x] 4. Для существующих файлов/директорий использовать `realpathSync` и сравнение canonical target с canonical root (включая проверку совпадения относительного пути от `canonicalRoot`).
- [x] 5. Для нового файла валидировать canonical parent; не считать несуществующий leaf доказательством безопасности.
- [x] 6. Перед write/delete/rename/copy повторно валидировать границы непосредственно перед операцией (после `approvalService.requestApproval` и `mkdir`).
- [x] 7. Не разрешать пользовательскому custom root менять границу sandbox через ссылку (`validateSandboxRootSync`).
- [x] 8. Документировать residual TOCTOU limits в `path-guard.ts`. Не заявлять абсолютную атомарность там, где высокоуровневые Node APIs её не обеспечивают.
- [x] 9. Использовать `O_NOFOLLOW` при открытии дескрипторов на POSIX (`readFileNoFollow`, `writeFileNoFollow`) и проверку `lstat` перед созданием backup-копий.

**Обязательные тесты (`21/21` пройдены на Linux):**
- [x] `../` и Windows absolute paths (`C:\...`, UNC);
- [x] symlink на внешний файл (read/write/delete);
- [x] вложенная ссылка;
- [x] parent link (включая запись нового файла через родительскую ссылку);
- [x] destination link при rename/copy;
- [x] broken link (dangling symlink);
- [x] эмуляция Windows junction/reparse point (`realpathSync` уводит путь наружу при `isSymbolicLink() === false`);
- [x] отклонение custom symlink root и запрет удаления самой root-директории;
- [x] нормальные in-root операции;
- [ ] прогон на `windows-latest` CI с реальными NTFS junction (`NOT RUN` в Linux-контейнере).

**Acceptance:** все операции, которые пересекают root через ссылки, отклоняются; обычная работа внутри sandbox сохраняется (полная приёмка `VERIFIED` — после прогона на `windows-latest` CI).

## S1-03. Shell execution: заменить слабую проверку на строгий контракт — [IMPLEMENTED — unit-тесты Linux пройдены; Windows CI `NOT RUN`]

**Файлы:**
- `src/main/services/commands/shell-command.parser.ts` *(новый модуль)*;
- `src/main/services/commands/shell-process.helper.ts` *(новый модуль)*;
- `src/main/services/sandbox/types.ts`;
- `src/main/services/sandbox/PolicyEngine.ts`;
- `src/main/services/commands/shell-executor.ts`;
- `src/main/services/security/shell-approval.service.ts`;
- `src/main/services/MacroExecutor.ts`;
- `src/shared/utils/log-sanitizer.ts`;
- `src/main/services/sandbox/PolicyEngine.test.ts`, `src/main/services/commands/shell-executor.test.ts`, `src/main/services/security/shell-approval.service.test.ts`, `src/main/services/MacroExecutor.test.ts`.

**Что сделать:**
- [x] 1. Проверить всех callers `executeShellCommand()` и поддержать структурированный payload `{ executable, args, cwd, purpose }` (включая `actions/shell` в `MacroExecutor.ts` и безопасную argv-токенизацию для legacy-строк).
- [x] 2. Для allowlisted операций использовать `spawn` с `shell: false` и блокировкой shell-метасимволов (`;`, `|`, `&`, `>`, `<`, `` ` ``, `$(`, `${`, `\n`, `\0`).
- [x] 3. Allowlist сравнивает точное имя executable (с учётом стандартных Windows-расширений `.exe`/`.cmd`/`.bat`), без `includes()` и без произвольных path-префиксов.
- [x] 4. `nodeevil`, `mygit`, `npm-helper`, `/tmp/node`, `.\git` не проходят как разрешённые `node/git/npm`.
- [x] 5. Неизвестное действие по умолчанию deny (`allowed: false`, `reason: 'no_matching_rule'`). Пустой `allowedBinaries` также отклоняет запуск.
- [x] 6. Произвольная shell-строка вынесена в fail-closed режим `unsafe_raw_shell` с обязательным caller opt-in, принудительным approval и предупреждением о последствиях.
- [x] 7. Введены timeout (`30_000` мс по умолчанию), `AbortSignal`, ограничение `stdout`/`stderr` (`64 KB` на поток с `outputTruncated`), закрытие потоков и kill process tree (`taskkill /T /F` на Windows / process group kill на POSIX).
- [x] 8. Секреты и неограниченный вывод не пишутся в журнал (маскировка через `maskSecrets()` с защитой от ReDoS + ограничение сниппетов до 256 символов + SHA-256 hash команды).
- [x] 9. Команда, `executable`, `args`, `cwd`, `purpose`, режим и последствия передаются в structured approval preview (`target`, `reason`, `metadata`).

**Тесты (`46/46` пройдены по целевым файлам на Linux):**
- [x] allowlist exact match (+ `.exe`/`.cmd`/`.bat`) и блокировка path-prefixed бинарников;
- [x] command spoofing (`nodeevil`, `mygit`, `npm-helper`);
- [x] shell metacharacters & injection;
- [x] default-deny для неизвестного `ActionType`;
- [x] timeout, `AbortSignal`, kill дочернего process tree, лимит буфера 64 KB и маскировка секретов;
- [x] reject approval не запускает процесс, `MacroExecutor` вызывает `spawn(..., { shell: false })` без `exec()`;
- [ ] натурный прогон на `windows-latest` CI (`NOT RUN` в Linux-контейнере).

**Acceptance:** allowlist является реальным ограничением, а не косметическим фильтром строки; отказ или timeout не приводит к запуску/оставшемуся процессу (полная приёмка `VERIFIED` — после прогона на `windows-latest` CI).

## S1-04. Approval IPC: доверять только ожидаемому renderer sender — [IMPLEMENTED — unit-тесты Linux пройдены; Windows CI `NOT RUN`]

**Файлы:**
- `src/main/ipc/approval.ipc.ts`;
- `src/main/services/approval.service.ts`;
- `src/main/index.ts`;
- `src/main/preload.ts`;
- `src/renderer/stores/security.store.ts`;
- `src/renderer/components/security/ApprovalDialog.vue`;
- тесты `src/main/ipc/approval.ipc.test.ts`, `src/main/services/approval.service.test.ts`, `src/renderer/components/security/ApprovalDialog.test.ts`.

**Что сделать:**
- [x] 1. Проверены все renderer windows и источники ответа на approval (`src/main/index.ts`, `preload.ts`, `security.store.ts`, `ApprovalDialog.vue`, удалён неиспользуемый канал).
- [x] 2. В Main (`ApprovalService.isTrustedSender` + `approval.ipc.ts`) проверяется `event.sender` против `trustedWindow.webContents`, `mainFrame` и `isTrustedOrigin`.
- [x] 3. Проверяется, что `id` существует в `pendingApprovals`, не истёк (`Date.now() <= expiresAt`) и совпадает по `expectedWebContentsId`.
- [x] 4. Повторный, небулевый, просроченный или неизвестный ответ отклоняется (`UNKNOWN_OR_EXPIRED_APPROVAL_ID`, `APPROVAL_EXPIRED`, `INVALID_PAYLOAD`).
- [x] 5. Удалён дублирующий IPC alias `ui:approval-resolve` после проверки callers; `ui:approval-response` сохранён как единственный канонический канал.
- [x] 6. Произвольный Renderer/webContents или subframe не может разрешать системные действия (`UNTRUSTED_SENDER_WEBCONTENTS`, `UNTRUSTED_SUBFRAME`, `UNTRUSTED_ORIGIN`).
- [x] 7. Сохраняется принцип default reject при закрытии окна (`closed`), уничтожении/падении `webContents`, навигации главного фрейма и timeout; в `security.store.ts` добавлена FIFO-очередь конкурентных запросов.

**Тесты (`22/22` пройдены по целевым файлам на Linux):**
- [x] trusted sender;
- [x] untrusted sender (чужой `webContents`, subframe, недоверенный origin);
- [x] stale/unknown ID и non-boolean payload;
- [x] duplicate answer;
- [x] timeout / expired ID;
- [x] close window / destroyed webContents / main-frame navigation auto-reject;
- [x] approval queue concurrency (FIFO очередь в `security.store.ts`).

**Acceptance:** системное действие может быть разрешено только валидным pending approval от доверенного UI (полная приёмка `VERIFIED` — после прогона на `windows-latest` CI).

## S1-05. Tasks store: подтверждать sync только после ACK от SQLite — [IMPLEMENTED — unit-тесты Linux пройдены; живой Electron/Windows QA `NOT RUN`]

**Файлы:**
- `src/renderer/features/tasks/utils/tasks-sync.helper.ts` *(новый модуль)*;
- `src/renderer/features/tasks/stores/tasks.store.ts`;
- `src/renderer/features/settings/stores/settings.store.ts`;
- `src/renderer/components/ui/SyncToast.vue`;
- тесты `src/renderer/features/tasks/stores/tasks.store.test.ts`, `src/renderer/components/ui/SyncToast.test.ts`, `src/main/ipc/tasks.ipc.test.ts`, `src/main/services/tasks.service.test.ts`.

**Что сделать:**
- [x] 1. Сохранена текущая two-pass upsert/diff архитектура без возврата full-table delete/reinsert.
- [x] 2. `lastSyncedSnapshotMap` обновляется только после позитивного подтверждения Main/SQLite и проверки совпадения `task.id`.
- [x] 3. Dirty/pending state (`dirtyUpsertIds`, `pendingDeleteIds`, `pendingClearAll`, журнал `arc_tasks_pending_ops_v1`) удерживается до позитивного ACK.
- [x] 4. `{ success: false }`, throw, `IPC_TIMEOUT`, `server response mismatch`, `beforeunload`/`pagehide` и недоступность IPC не очищают dirty state.
- [x] 5. Удаление помечается синхронизированным только после успешного delete ACK и защищено от воскрешения через stale `tasks:changed` broadcast.
- [x] 6. Конфликтующие upsert/delete по одному task ID сериализуются через `perTaskQueueMap` и защищаются монотонным `taskRevisionMap`.
- [x] 7. На ошибке UI не показывает `✦ SYNCED`; `SyncToast` переключается в `variant: 'error'` (`✦ ОШИБКА БД` / `✦ SYNC FAIL`) с кнопкой `Повторить` / `Retry`, а автоматические повторы ограничены `MAX_AUTO_RETRIES = 3` с exponential backoff.
- [x] 8. После запуска перечитывается authoritative state из SQLite (`tasksList`) и выполняется reconciliation/replay сохранённого dirty-журнала.

**Тесты (пройдены на Linux по целевым файлам):**
- [x] upsert success (toast только после ACK);
- [x] upsert failure (`{ success: false }`) и `server response mismatch`;
- [x] delete success/failure и блокировка воскрешения через broadcast;
- [x] IPC throw и `IPC_TIMEOUT`;
- [x] race update/delete и два конкурентных изменения одного ID;
- [x] `beforeunload` flush + restart after failed write (reconciliation & replay);
- [x] ограниченный exponential backoff retry и честный UI-статус в `SyncToast.test.ts`;
- [ ] живой прогон Electron + SQLite на Windows (`NOT RUN` в Linux-контейнере).

**Acceptance:** не подтверждённая БД операция остаётся dirty; после рестарта пользователь не теряет данные и не видит ложную синхронизацию (полная приёмка `VERIFIED` — после прогона на `windows-latest` CI и живого Windows QA).

**Выход Sprint 1:** все пять задач (`S1-01`..`S1-05`) реализованы и подтверждены unit/негативными тестами на Linux (`IMPLEMENTED`); для статуса `VERIFIED` требуются прогон `windows-latest` CI и натурное Windows QA.

---

# 6. Sprint 2 — Runtime Packaging, Voice и Model Supply Chain (P1)

**Цель:** обеспечить предсказуемый первый запуск, правильную работу Python TTS в packaged app, настоящую отмену загрузок и осознанную передачу данных внешним сервисам.

## S2-01. Исправить физический путь TTS dictionaries в packaged app — [IMPLEMENTED — unit/Python тесты пройдены; Windows packaged QA `NOT RUN`]

**Файлы:**
- `tts_dict_loader.py`, `silero_server.py`;
- `src/main/services/python_server.service.ts`, `src/main/services/python_sync.util.ts`;
- `src/main/ipc/voice.ipc.ts`, `src/main/preload.ts`;
- `src/renderer/features/settings/logic/voice-status.ts`, `src/renderer/features/settings/components/sections/TTSSection.vue`;
- `package.json` build config;
- тесты `src/main/services/python_server.paths.test.ts`, `src/renderer/features/settings/logic/voice-status.test.ts`.

**Что сделать:**
1. [x] Убрать неявную зависимость от `os.getcwd()/Voice/dicts` (`tts_dict_loader.py` разрешает пути через `_resolve_paths()` по env и `_SCRIPT_DIR`).
2. [x] Вычислять абсолютный путь к словарям в одном helper на стороне Main (`resolveTtsDictsPaths` / `ensureTtsDictsWritableDirs` / `prepareTtsDictsSpawnEnv` в `python_sync.util.ts` + `PythonServerService.resolveTtsDictsPaths()`).
3. [x] Передавать Python path через явные environment variables (`ARC_TTS_DICTS_DIR`, `ARC_TTS_USER_DICTS_DIR`, `ARC_TTS_LOGS_DIR`).
4. [x] Упаковать словари в физическую директорию вне `app.asar` (`package.json` `build.extraResources -> Voice/dicts`).
5. [x] Исключить дублирование (`Voice/dicts/**/*` убран из `build.asarUnpack` и исключён через `!Voice/dicts/**/*` из `build.files`).
6. [x] При запуске, в `/status` и `/reload_dicts` Python loader выдаёт диагностику (`state`: `READY` / `DEGRADED` / `ERROR`, директории, счётчики файлов/записей, ошибки загрузки), передаваемую через IPC в `TTSSection.vue`.
7. [x] Отсутствие необязательного словаря или битый пользовательский JSON не ломает TTS, сохраняет рабочие комплектные записи и переводит диагностику в `DEGRADED` (или `ERROR` при отсутствии директории).
8. [x] Разделены read-only bundled resources (`resources/Voice/dicts`, SQLite `?immutable=1` + `PRAGMA query_only=ON`) и записываемые `userData/tts_dicts` + `userData/logs` (overlay, пересоздание повреждённой пользовательской БД с WAL и `tts_unknown_words.log`).

**Тесты:**
- [x] Dev layout, mock packaged (`resources/Voice/dicts`, compat `app.asar.unpacked`), read-only bundled dir, user override conflict/merge, битый JSON, отсутствующий словарь/директория, реальное применение правил к тексту (`silero_text_prep.normalize_text`), UI статусы `READY`/`DEGRADED`/`ERROR`;
- [ ] Живой прогон `win-unpacked`, NSIS installed и Portable на Windows (вкл. HTTP Flask `/status` и `/reload_dicts`) (`NOT RUN` в Linux-контейнере).

**Acceptance:** установленное приложение загружает те же bundled dictionaries, что и dev; путь и состояние подтверждены в диагностике (полная приёмка `VERIFIED` — после прогона на Windows).

## S2-02. Python dependencies: сделать readiness контракт точным — [IMPLEMENTED — unit/Python probe тесты пройдены на Linux; Windows x64 pip/runtime QA `NOT RUN`]

**Файлы:**
- `src/main/services/python_deps.contract.ts` *(новый модуль контракта готовности, probe-команды и парсера `requirements-silero.txt`)*;
- `src/main/services/python_deps.util.ts`;
- `src/main/services/python_server.service.ts`;
- `src/main/ipc/voice.ipc.ts`;
- `silero_server.py`;
- `requirements-silero.txt`;
- `src/renderer/features/settings/logic/voice-status.ts`, `src/renderer/features/settings/components/sections/TTSSection.vue`;
- тесты `src/main/services/python_deps.util.test.ts`, `src/main/services/python_server.service.test.ts`, `src/renderer/features/settings/logic/voice-status.test.ts`.

**Что сделать:**
1. [x] Разделить обязательные зависимости ядра TTS и optional DSP/accent dependencies (`CORE_REQUIRED_MODULES`, `DSP_PYTHON_MODULES`, `OPTIONAL_ACCENT_MODULES`, разделение `requirements-silero.txt` на Core и Optional Accent).
2. [x] Не возвращать один `success:true`, если обязательный пакет отсутствует (`success: coreReady`).
3. [x] Возвращать детальную карту состояний: `coreReady`, `dspReady`, `accentReady`, `ffmpegReady`, `pythonRuntime`, `installedPackages`, `missingCore`, `missingOptional`, `errors` (+ экспозиция через `silero_server.py /status`, IPC `tts:server-status` и `TTSSection.vue`).
4. [x] Определено, что отсутствие `onnxruntime` или `ruaccent` (или `scipy`/`ffmpeg`) допустимо в режиме `DEGRADED` (`coreReady: true`, `accentReady: false`); `silero_server.py` безопасно запускается без `scipy.signal` и без `ruaccent`, а поведение протестировано.
5. [x] Согласованы совместимые диапазоны версий (`torch>=2.0.0,<2.6.0`, `torchaudio>=2.0.0,<2.6.0`, `Flask>=2.2.0,<3.2.0`, `scipy>=1.10.0,<1.15.0`, `onnxruntime>=1.16.0,<1.21.0`, `ruaccent>=1.4.0,<1.6.0`) и проверка runtime Python 3.10–3.12 + 64-bit `win32` с диагностикой несовместимости wheel/ABI `onnxruntime`.
6. [x] Установка ограничена idle timeout (`300s` / `ARC_PIP_IDLE_TIMEOUT_SEC`), wall-clock cap (`1800s` / `ARC_PIP_WALL_TIMEOUT_SEC`) и процессной отменой `cancelDependencyInstall()` (`treeKill(..., 'SIGKILL')`, интегрировано в `PythonServerService.stop()`).
7. [x] Добавлена single-flight блокировка `installer.promise`: повторные конкурентные вызовы переиспользуют активный Promise без запуска второго `pip`.
8. [x] FFmpeg проверяется отдельно (`probeFfmpegAsync`) и не срывает Core/установку при отсутствии, формируя честный статус `DEGRADED` (`dspReady: false`).
9. [x] Двухэтапная установка и пост-установочная проверка импортов никогда не подменяют провал обязательного модуля успехом (`import_check_failed` -> `ERROR`, `coreReady: false`).

**Тесты:**
- [x] required import failure, pip failure, post-pip `import_check_failed`, optional `onnxruntime`/`ruaccent` import/pip failure -> `DEGRADED`, restart after partial install, unsupported Python `3.13`/`win32` 32-bit, `pip_unavailable`, idle/wall timeout, `cancelDependencyInstall()` + `PythonServerService.stop()`, no FFmpeg, single-flight concurrency, UI статусы `READY`/`DEGRADED`/`ERROR`/`INSTALLING`, реальный `buildPythonProbeCommand` на Linux `python3`;
- [ ] Реальная установка `requirements-silero.txt` через `pip` на Windows 10/11 x64 (Python 3.10–3.12, `win_amd64` wheels, `ruaccent`, `ffmpeg`) (`NOT RUN` в Linux-контейнере).

**Acceptance:** diagnostics точно объясняет, какая функция доступна/недоступна; `success` не вводит в заблуждение (полная приёмка `VERIFIED` — после прогона на Windows).

## S2-03. Sherpa model downloads: реализовать реальную отмену — **IMPLEMENTED**

**Файлы:** `src/main/services/sherpa-downloader.service.ts`, `src/main/services/sherpa-download-task.helper.ts`, `src/main/services/sherpa-http-download.util.ts`, `src/main/services/gigaam-sources.service.ts`, `src/main/services/hf-rate-limiter.service.ts`, `src/main/services/sherpa-validator.util.ts`, `src/main/services/built-in-whisper.service.ts`, `src/main/services/stt-config.helper.ts`, `src/main/services/stt.service.ts`, `src/main/ipc/voice.ipc.ts`, `src/main/preload.ts`, `src/env.d.ts`, `src/renderer/features/modelDownload/stores/modelDownload.store.ts`, `src/renderer/components/voice/VoiceQuickPanel.vue`, `src/renderer/features/settings/composables/useModelHubSession.ts`.

**Что сделано:**
- [x] Per-model `ActiveDownloadTask` с собственным `AbortController`, трекингом активных `ClientRequest` / `IncomingMessage` / `fs.WriteStream`, состоянием (`downloading` / `verifying` / `cancelling` / `cancelled` / `completed` / `failed`) и снятием из `activeTasks` строго в `finally` после завершения cleanup (`sherpa-download-task.helper.ts`, `sherpa-downloader.service.ts`).
- [x] Targeted `cancelDownload(modelId): Promise<boolean>` (изоляция параллельных загрузок, неизвестный ID не затрагивает другие загрузки) и `cancelAllDownloads(): Promise<void>`; единый IPC `stt:cancel-download` с опциональным `modelId` и preload/API контрактом; отмена pending `load-*` в `BuiltInWhisperService.abort(modelId?)`.
- [x] Isolated staging `<modelDir>/.staging/<session>/*.part` (c prune сиротских `.staging` после сбоя), проверка полноты комплекта и sacrificial validation (с `AbortSignal` / `SIGKILL`) до атомарной публикации (`publishStagedFiles`) и записи `download_meta.json`, сохранение ранее рабочей версии модели при отмене или сбое.
- [x] Явный контракт отмены `{ success: false, cancelled: true, status: 'cancelled' }` и событие прогресса `status: 'cancelled'` (без `status: 'error'` и error toast в UI), корректная повторная загрузка сразу после отмены.

**Проверки:**
- [x] Реальные локальные HTTP/FS-тесты и unit-тесты на Linux (`sherpa-downloader.service.test.ts`, `sherpa-downloader-cancellation.test.ts`, `gigaam-sources.test.ts`, `modelDownload.store.test.ts`): `zipformer-ru`, `whisper-small`, `silero-vad`, `gigaam-ctc`, targeted vs global cancel, HTTP 302 redirect, retry backoff, HF 429 cooldown abort, сохранность рабочей модели, orphaned `.staging` + немедленный повтор;
- [ ] Живой прогон отмены против HuggingFace / `hf-mirror` и Windows file locking (`EBUSY`) в Electron UI (`NOT RUN` в Linux-контейнере).

**Acceptance:** после cancel нет фонового network transfer, растущего temp file, частичного итогового файла или зависшего Promise (финальный статус `VERIFIED` — после живого Windows/HF QA).

## S2-04. Supply-chain integrity: manifest, hash и redirect allowlist — [IMPLEMENTED — unit/HTTP/FS/Python SHA-256 тесты пройдены на Linux; живой Windows/HF QA `NOT RUN`]

**Файлы:**
- `src/shared/types/model-integrity.ts`, `src/shared/types/index.ts`;
- `src/main/services/model-supply-chain.manifest.ts`, `src/main/services/model-integrity.util.ts`, `src/main/utils/network-security.util.ts`;
- `src/main/services/sherpa-http-download.util.ts`, `src/main/services/sherpa-downloader.service.ts`, `src/main/services/gigaam-sources.service.ts`, `src/main/services/sherpa-paths.util.ts`, `src/main/services/stt-config.helper.ts`, `src/main/services/stt-models-list.helper.ts`;
- `src/main/services/python_integrity.util.ts`, `src/main/services/python_sync.util.ts`, `src/main/services/python_server.service.ts`, `src/main/ipc/voice.ipc.ts`;
- `scripts/download_models.js`;
- `src/env.d.ts`, `src/renderer/features/settings/components/sections/model-hub.registry.ts`, `src/renderer/features/settings/composables/useModelHubSession.ts`, `src/renderer/features/settings/components/sections/ModelManagerSection.vue`, `src/renderer/features/settings/components/sections/models/ModelCard.vue`, `src/renderer/components/voice/VoiceQuickPanel.vue`;
- тесты: `src/main/services/supply-chain-integrity.test.ts`, `src/main/services/python_server.service.test.ts`, `src/main/services/python_server.paths.test.ts`, `src/main/services/sherpa-downloader-cancellation.test.ts`, `src/main/services/sherpa-downloader.service.test.ts`, `src/main/services/gigaam-sources.test.ts`.

**Что сделано:**
1. [x] Единый supply-chain manifest (`model-supply-chain.manifest.ts`) с `manifestId`, `source`, immutable `revision` (pinned git commits / GitHub release tags), `files` (exact `size` и 64-char `sha256`), `licenseUrl`, `locale`, `engineCompatibility` для `zipformer-ru`, `whisper-small`, `gigaam-ctc` (v3 & v2), `silero-vad`, `v5_6_ru.pt` и `PYTHON_TTS_BUNDLE_MANIFEST`.
2. [x] Подтверждённые upstream Git LFS SHA-256 и exact byte sizes (в т.ч. `v5_6_ru.pt`: `147664410` байт, `04cc9b1d...cbf50b2e`). Автоматические загрузки fail-closed при отсутствии или несовпадении SHA-256 / размера.
3. [x] HTTPS-only + exact-host `TRUSTED_MODEL_HOSTS` allowlist (`validateTrustedDownloadUrl`) + `createSsrfSafeLookup` (защита от SSRF/DNS rebinding, loopback/private/link-local/CGNAT/IPv6 ULA и IP-литералов) на исходном запросе и каждом `3xx` redirect hop (max 5), без downgrade и без retry на security-ошибках; то же в `scripts/download_models.js`.
4. [x] Загрузка строго в изолированный `.staging` (`*.part`), потоковый контроль `maxBytes` и `verifyStagedFileDigest` перед атомарной публикацией в final path с сохранением ранее рабочих файлов при сбое.
5. [x] Silero TTS `v5_6_ru.pt`: переход с `size > 10 MB` на strict SHA-256 проверку в `verifySileroModelOnDisk()` (при загрузке, резолве и старте `PythonServerService`), единый статус целостности передаётся через `tts:server-status`.
6. [x] Python TTS ресурсы: MD5 заменён на SHA-256 (`calculateHash`), добавлена pre-sync (`syncPythonFiles`) и pre-spawn (`PythonServerService.start`) проверка по `PYTHON_TTS_BUNDLE_MANIFEST`.
7. [x] Pre-load проверка перед hot-swap/выбором моделей (`attemptGigaamHotSwap`, `VoiceQuickPanel.vue`) + сохранение полного `download_meta.json` provenance (`origin`, `source`, `revision`, `licenseUrl`, `verifiedAt`, `integrity.status`).
8. [x] Ручные пользовательские модели получают честный статус `unverified_manual` (`provenance.origin: 'manual_local'`) без автоповышения до `'verified'` после sacrificial/runtime проверки; в UI (`ModelCard.vue`, `VoiceQuickPanel.vue`) отображаются статус SHA-256 / `UNVERIFIED / MANUAL` / `ЦЕЛОСТНОСТЬ НАРУШЕНА` и кнопка `Перекачать`.

**Проверки:**
- [x] Автоматические unit/HTTP/FS/Python SHA-256 тесты (`supply-chain-integrity.test.ts` + связанные STT/Python наборы на Linux): HTTPS/allowlist, disallowed redirect, HTTP downgrade, redirect loop, `maxBytes` stream guard, SSRF/DNS rebinding, wrong hash, truncated download, tampered file, atomic replace, retry, existing valid file skip, manual model non-promotion, Python bundle pre-spawn block, strict `v5_6_ru.pt` SHA-256 check;
- [ ] Натурное скачивание моделей с реального HuggingFace / Silero и проверка packaged Windows сборки (`NOT RUN` в Linux-контейнере).

**Acceptance:** автоматически загруженные assets не активируются, пока их размер и checksum не совпали с manifest (финальный статус `VERIFIED` — после живого Windows/HF QA).

## S2-05. Cloud TTS fallback — только с явным согласием — [IMPLEMENTED — unit/policy/UI-status тесты пройдены на Linux; живой Windows SAPI/Edge QA `NOT RUN`]

**Файлы:**
- `src/main/services/tts-policy.util.ts`, `src/main/services/tts-engines.util.ts`, `src/main/services/tts.service.ts`;
- `src/main/ipc/voice.ipc.ts`, `src/main/ipc/ai.ipc.ts`, `src/main/services/MacroExecutor.ts`, `src/main/preload-tts.ts`, `src/env.d.ts`;
- `src/renderer/bootstrap/plugins.ts`, `src/renderer/features/settings/stores/settings.store.ts`, `src/renderer/stores/ui.store.ts`, `src/renderer/features/commands/utils/macroNodes.ts`, `src/renderer/features/settings/logic/voice-status.ts`, `src/renderer/features/settings/components/sections/TTSSection.vue`, `src/renderer/features/settings/composables/useSettingsSearch.ts`;
- тесты: `src/main/services/tts-policy.util.test.ts`, `src/main/services/tts.service.test.ts`, `src/renderer/features/settings/logic/voice-status.test.ts` (+ `src/main/services/MacroExecutor.test.ts`).

**Продуктовое правило:** A.R.C. — local-first. В локальном/private режиме текст речи не должен уходить во внешний TTS автоматически.

**Что сделано:**
1. [x] Введён единый контракт TTS-политики (`tts-policy.util.ts`: `provider`, `allowCloudTtsFallback`, `forcedOfflineMode`, `resolveTtsExecutionPlan`) с хранением в `userData/tts-policy.json` (атомарная запись, fail-closed чтение повреждённого файла) и двусторонней синхронизацией с `settings.store.ts` (включая старт и `watch`), IPC `tts:set-policy` и `voice:speak`.
2. [x] По умолчанию `allowCloudTtsFallback = false`; при миграции / повреждении legacy-настроек (`persistencePlugin` в `plugins.ts` и `loadTtsPolicy`) значение строго нормализуется в `false` (`=== true`).
3. [x] При `allowCloudTtsFallback = false` в `auto` и `silero` резерв выполняется строго на локальный SAPI (`system`); при `forcedOfflineMode = true` облачный Edge TTS полностью заблокирован (в том числе при `provider === 'edge'` и включённом `allowCloudTtsFallback`), с фолбэком на `system`; добавлен defense-in-depth guard внутри `speakWithEdgeTTS`. При отказе всех разрешённых движков устанавливается `activeEngine = 'unavailable'` с причиной в `lastErrorReason`.
4. [x] В `TTSSection.vue` добавлен переключатель `tts.allow_cloud_fallback` («Разрешить облачный резерв (Edge TTS)», зарегистрирован в `useSettingsSearch.ts`) с блокировкой при `forcedOfflineMode` и явным предупреждением о передаче текста во внешний сервис Edge TTS; динамический label опции `Auto`.
5. [x] В `voice-status.ts` и `TTSSection.vue` отображается актуальный движок (`Silero (Локальный)`, `Edge TTS (Облачный)`, `SAPI (Системный)`, `Недоступен`) и статусы облачной отправки / офлайн-блокировки / причины отказа (`lastErrorReason`).
6. [x] Проверены все call sites из Main и Renderer (`voice.ipc.ts`, `ai.ipc.ts` `speakSystemResponse`, `MacroExecutor.ts`, `ollama.provider.ts`, `openai.provider.ts`, `ui.store.ts`) — все маршруты проходят через `TTSService` с применённой Main-политикой `tts-policy.json`.
7. [x] Сохранены существующие `try/finally`, `AbortController`, concurrency queue и `cancelCurrent()`.
8. [x] Приватный текст речи скрыт из логов TTS (`MacroExecutor.ts` логирует только длину и hash, `ui.store.ts` и `macroNodes.ts` — только длину текста).

**Проверки:**
- [x] Автоматические Vitest-тесты на Linux (`tts-policy.util.test.ts`, `tts.service.test.ts`, `voice-status.test.ts`, `MacroExecutor.test.ts`): default/corrupt migration `false`, local-only never calls Edge, opt-in calls Edge, `forcedOfflineMode` blocks Edge, `unavailable` engine + `isBusy() === false`, cancellation stops subsequent fallback, UI diagnostic statuses;
- [ ] Натурная проверка озвучки Windows SAPI / Edge TTS / Silero и UI-переключателя в Electron-сборке на Windows (`NOT RUN` в Linux-контейнере).

**Acceptance:** отсутствие настройки/старое значение не включает cloud TTS неожиданно; пользовательский opt-in сохраняется и действует одинаково во всех call sites (финальный статус `VERIFIED` — после живого Windows QA).

## S2-06. Первый запуск: прекратить неожиданные тяжёлые загрузки — [IMPLEMENTED — unit-тесты на Linux пройдены; живой первый запуск на чистой Windows `NOT RUN`]

**Файлы:**
- `src/main/index.ts`;
- `src/main/services/voice-setup.service.ts` *(новый оркестратор управляемой настройки голосового контура)*;
- `src/main/services/stt.service.ts`, `src/main/services/stt-config.helper.ts`;
- `src/main/services/python_server.service.ts`, `src/main/services/python_sync.util.ts`, `src/main/services/python_deps.util.ts`;
- `src/main/services/sherpa-downloader.service.ts`, `src/main/services/gigaam-sources.service.ts`;
- `src/main/ipc/voice.ipc.ts`, `src/main/preload-tts.ts`, `src/env.d.ts`;
- `src/renderer/features/modelDownload/stores/modelDownload.store.ts`, `src/renderer/components/ui/DownloadNotificationDock.vue`;
- `src/renderer/components/onboarding/steps/VoiceSetupCard.vue` *(новая карточка выбора режима и компонентов)*, `src/renderer/components/onboarding/steps/VoiceMicStep.vue`;
- тесты `src/main/services/voice-setup.service.test.ts`, `src/renderer/features/modelDownload/stores/modelDownload.store.test.ts`.

**Что сделать:**
1. [x] Найти и отключить все автоматические загрузки моделей и создание Python `venv` / `pip install`, которые происходили при startup (`ready-to-show`) и в `startListening` без явного действия пользователя (`PythonServerService.start(mainWindow, { allowProvisioning: false })`, `ensureDependenciesAsync(..., { allowInstall: false })`, `ensureSileroModelReady(..., { allowDownload: false })`, удаление `autoDownloadMissingModels(false)` из `src/main/index.ts` и `stt.service.ts`).
2. [x] Убрать неожиданный массовый auto-download после `ready-to-show`: на старте проверяется только наличие уже скачанных локальных моделей (`whisper` / `zipformer` / `gigaam`).
3. [x] Разделить открытие окна и настройку голосовых ресурсов: приложение становится интерактивным сразу без фоновой установки Python/моделей.
4. [x] В onboarding (`VoiceMicStep.vue` → `VoiceSetupCard.vue`) предложены явные действия: `Настроить голос сейчас`, `Позже`, `Продолжить без голоса / системный fallback` (`provider: 'native'`, отключение wake-word).
5. [x] Показан список компонентов с разделением на базовый контур (`silero-vad`, `zipformer-ru`, `silero-tts-v5`, `python-env`) и опциональные модели (`whisper-small`, `gigaam-ctc`), фактический источник, точный размер из манифеста (или `неизвестен` для `python-env`), требуемое место на диске и необходимость сети.
6. [x] Устранён фиктивный fallback `235 MB` в `modelDownload.store.ts`; если размер неизвестен (`totalBytes === 0`), в `DownloadNotificationDock.vue` и `VoiceSetupCard.vue` отображается `неизвестен`.
7. [x] Прогресс считается по реальным `bytes_done` / `total_bytes`. ETA отображается только после накопления минимум 2 реальных замеров скорости (`speedSampleCount >= 2`).
8. [x] Поддержаны `Пауза` / `Отменить` / `Повторить` (`voice:setup-start`, `voice:setup-pause`, `voice:setup-cancel`, `cancelSileroModelDownload()`, `sttService.cancelAllDownloads()`).
9. [x] Введена single-flight защита в `voiceSetupService.startSetup()` (повторный вызов возвращает активный промис без запуска второго инсталлятора).
10. [x] Пользователь может закрыть/пропустить onboarding и продолжить работу без установки голосового контура; отображаются честные статусы (`runtime_missing`, `dependencies_missing`, `model_missing`, `downloading`, `verifying`, `ready`, `degraded`, `failed`, `cancelled`).

**Тесты (пройдены на Linux):**
- [x] `voice-setup.service.test.ts`: запрет сетевой загрузки при `allowDownload: false`, инвентаризация `baseline` vs `optional` с точными размерами и `exactBytes: null` (`неизвестен`) для `python-env`, single-flight защита, `cancelSetup()` → `cancelled`, переход в `degraded` при `system_fallback`;
- [x] `modelDownload.store.test.ts`: отсутствие фейковых `235 MB` при неизвестном `total_bytes`, показ ETA только после `>= 2` замеров скорости;
- [ ] живой первый запуск без моделей и сети на чистой Windows 10/11 (`NOT RUN` в Linux-контейнере).

**Acceptance:** чистый первый запуск без моделей и сети не зависает, не скачивает гигабайты без согласия и честно сообщает, какие функции пока недоступны (финальный статус `VERIFIED` — после живого Windows QA).

## S2-07. Единая state machine для voice/model setup — [IMPLEMENTED — unit/integration тесты на Linux пройдены; живой Windows UI QA `NOT RUN`]

**Файлы:**
- `src/shared/utils/voice-model-state-machine.ts` *(новый единый контракт lifecycle-состояний и 4 слоёв готовности)*;
- `src/main/services/stt-models-list.helper.ts`, `src/main/services/stt.service.ts`, `src/main/services/voice-setup.service.ts`, `src/main/ipc/voice.ipc.ts`;
- `src/renderer/features/settings/composables/useSttStatus.ts`, `src/renderer/features/settings/composables/useModelHubSession.ts`;
- `src/renderer/features/settings/logic/voice-status.ts`, `src/renderer/features/settings/logic/tts-status.helper.ts`, `src/renderer/features/settings/logic/model-hub-state.helper.ts`;
- `src/renderer/features/settings/components/sections/models/ModelCard.vue`, `src/renderer/features/settings/components/sections/ModelManagerSection.vue`, `src/renderer/features/settings/components/sections/STTSection.vue`, `src/renderer/features/settings/components/sections/stt/SttEngineSelector.vue`, `src/renderer/features/settings/components/sections/TTSSection.vue`;
- тесты `src/shared/utils/voice-model-state-machine.test.ts`, `src/renderer/features/settings/composables/useModelHubSession.s2-07.test.ts`, `src/renderer/features/settings/logic/voice-status.test.ts`, `src/main/services/stt.service.test.ts`.

**Что сделано:**
1. [x] Определён и внедрён единый словарь состояний `VoiceModelSetupState`:
   `unknown → checking → missing → consent_required → downloading → verifying → ready`
   и терминальные/деградированные состояния: `cancelled`, `degraded`, `unavailable`, `failed`, `incompatible` с типизированными переходами (`ALLOWED_SETUP_STATE_TRANSITIONS`, прямой переход `failed → ready` запрещён) и матрицей применимости по видам компонентов (`COMPONENT_ALLOWED_STATES`).
2. [x] Lifecycle-состояние разделено со слоем готовности ресурса `ResourceReadinessLayer` (`none | downloaded | verified | loaded | active`) в `deriveResourceStateSnapshot()`.

**Критерии:**
- [x] отсутствие ресурса (`missing` / `consent_required`) не отображается как ошибка работающего компонента (в `stt.service.ts` `lastInitError` не заполняется при отсутствии моделей, `useSttStatus.ts` / `voice-status.ts` выводят warn-статус и CTA на установку в `STTSection.vue` / `TTSSection.vue`);
- [x] `downloaded` (`unverified_manual`, статус `Скачана · Не проверена`) не равно `verified` (`Проверена (на диске)`);
- [x] `verified` (на диске) не равно `loaded` (`Загружена` в памяти воркера/сервера);
- [x] `loaded` (standby/floor) не равно `active` (`Активен` выбранный движок);
- [x] `cancelled` немедленно выводит модель из `downloading` (в `useModelHubSession.ts` и `deriveResourceStateSnapshot()`);
- [x] `failed` / `tampered` не превращается в зелёный `ready` даже при устаревших флагах `downloaded`/`loaded`/`active`, а `transitionSetupState('failed', 'ready')` бросает ошибку;
- [x] при повторном открытии настроек состояние восстанавливается из live runtime + manifest/disk (`useSttStatus` запрашивает `getSttStatus()` на каждом `onMounted()`, `useModelHubSession.checkAllStatuses()` сверяет `ai:get-active-download`, `stt:status`, `stt:list-models`, `tts:server-status`, `tts:get-active-engine`, а `FALLBACK_STT_MODELS_LIST` при таймауте 1500 мс ставит `verificationPending: true`, `downloaded: false`, `setupState: 'checking'`);
- [ ] натурная проверка полного сценария открытия/переоткрытия Настроек, отмены загрузки и переключения STT/TTS в Electron-окне на Windows (`NOT RUN` в Linux-контейнере).

**Выход Sprint 2:** все задачи Sprint 2 (`S2-01`..`S2-07`) реализованы и проверены тестами в Linux (`IMPLEMENTED`); финальный статус `VERIFIED` — после живого Windows QA.

---

# 7. Sprint 3 — Database, Electron hardening и честные состояния (P1/P2)

## S3-01. Versioned database migrations — **IMPLEMENTED**

**Файлы:** `src/main/services/database.ts`, `src/main/services/database-migrations.registry.ts`, `src/main/services/database-migrations.validation.ts`, `src/main/services/database-migrations.backup.ts`, `src/main/services/database-migrations.runner.ts`, `src/main/services/database-recovery.types.ts`, `src/main/services/diagnostics.service.ts`, `src/main/services/database-migrations.test.ts`.

**Что сделано:**
1. Инвентаризированы все 17 таблиц, `messages_fts`, триггеры, индексы и все inline-миграции (`v1`–`v8` в `DATABASE_MIGRATIONS` с `LATEST_SCHEMA_VERSION = 8`).
2. Введён согласованный dual-источник версии: `PRAGMA user_version` + таблица аудита `schema_migrations` (`version`, `id`, `name`, `checksum`, `applied_at`, `execution_ms`, `status`). Оба обновляются атомарно внутри каждой транзакции миграции.
3. Реализована валидация состояния схемы (`validateMigrationState`): блокировка запуска в `DB_SAFE_MODE` при расхождении `user_version` и `schema_migrations` (`SQLITE_SCHEMA_DRIFT`), изменении контрольной суммы уже применённой миграции (`SQLITE_MIGRATION_CHECKSUM_MISMATCH`), неизвестной миграции (`SQLITE_UNKNOWN_MIGRATION`) или более новой версии БД (`SQLITE_UNSUPPORTED_SCHEMA_VERSION`).
4. Перед обновлением непустой существующей БД с неприменёнными миграциями и пройденным `PRAGMA integrity_check` создаётся и верифицируется снимок `VACUUM INTO` (`backups/pre-migration-v<from>-to-v<to>-<ts>/arc.db` + `migration-backup-meta.json` с SHA-256, `integrity_check=ok` и проверкой `user_version`). При провале бэкапа миграции не запускаются (`SQLITE_MIGRATION_BACKUP_FAILED` + `DB_SAFE_MODE`).
5. При ошибке на промежуточном шаге `k` транзакция шага откатывается, уже зафиксированная версия `k-1` сохраняется на диске, исходный файл и бэкап сохраняются, а runtime переходит в `DB_SAFE_MODE` с диагностикой.
6. Диагностический отчёт (`DiagnosticsService.collectReport()`) экспортирует фактический `storage.dbStatus.schemaVersion`.
7. Добавлены реальные SQLite fixture и failure/rollback-тесты в `src/main/services/database-migrations.test.ts`; на Linux пройдены, живой upgrade-прогон в Windows-окружении `NOT RUN`.

**Acceptance:** database любого поддерживаемого старого schema version переходит на текущую (`v8`) без потери данных; повторный запуск идемпотентен (`CURRENT`, 0 лишних бэкапов); расхождения и ошибки переводят систему в `DB_SAFE_MODE`. *(IMPLEMENTED в коде и тестах на Linux; живой Windows QA `NOT RUN`)*

## S3-02. JSONDatabase: честно описать режим хранения — **IMPLEMENTED**

**Файлы:** `src/main/services/database-engine-metadata.ts`, `src/main/services/database-recovery.types.ts`, `src/main/services/database.ts`, `src/main/services/diagnostics.service.ts`, `src/env.d.ts`, `src/renderer/App.vue`, `src/renderer/features/settings/components/sections/system/storage-db-presentation.ts`, `src/renderer/features/settings/components/sections/system/StorageDataSection.vue`, `src/renderer/features/settings/components/sections/system/DiagnosticsSection.vue`, `src/main/services/database-json-semantics.test.ts`, `src/renderer/features/settings/components/sections/system/storage-db-presentation.test.ts`.

**Что сделано:**
1. [x] Исключена маскировка `JSONDatabase` под SQLite: разделены режимы `NORMAL` (`engine: 'sqlite'`, `storageStatus: 'PERSISTENT_SQLITE'`), ограниченный dev-режим без `arc.db` (`mode: 'DEGRADED'`, `engine: 'json-degraded'`, `storageStatus: 'PERSISTENT_JSON_DEGRADED'`), тестовый (`mode: 'TEST_MEMORY'`, `engine: 'json-test'`, `storageStatus: 'TEST_EPHEMERAL'`) и аварийный диагностический (`mode: 'DB_SAFE_MODE'`, `engine: 'json-safe-mode'`, `storageStatus: 'VOLATILE_STORAGE'`, `readOnly: true`).
2. [x] Разделены persisted JSON fallback и volatile read-only diagnostic fallback в `JSONDatabase.getStorageStatus()` и `DatabaseService.initWithConfig()`: при `isPackaged === true` или наличии существующего `arc.db` на диске (даже в dev без native-драйвера) активируется строгий read-only `DB_SAFE_MODE` без создания `_fallback.json` и split-brain.
3. [x] Для `JSONDatabase` явно зафиксированы `supportsTransactions = false`, `supportsRollback = false`, декларация возможностей `DatabaseEngineCapabilities` и список реальных ограничений `limitations[]` (`getDatabaseEngineMetadata`), проброшенные в `system:get-db-status` и `DiagnosticsService.collectReport()`.
4. [x] Стартовое уведомление (`App.vue`), раздел «Данные и хранилище» (`StorageDataSection.vue`) и раздел «Диагностика и логи» (`DiagnosticsSection.vue`) отображают фактический `engine`, `storageStatus`, поддержку ACID/rollback и список ограничений; экспорт архива (`StorageManagerService`) маркирует `PERSISTENT_JSON_DEGRADED` и `DB_SAFE_MODE` соответствующим образом.
5. [x] Unit- и UI SSR-тесты (`database-json-semantics.test.ts`, `storage-db-presentation.test.ts`) пройдены на Linux; натурная проверка packaged Windows build — `NOT RUN` в Linux-контейнере.

**Acceptance:** экран диагностики, настройки хранилища и `DiagnosticsReport` сообщают реальный storage engine, persistence-статус и реальные ограничения без маскировки под SQLite. *(IMPLEMENTED в коде и тестах на Linux; живой Windows QA `NOT RUN`)*

## S3-03. Electron security/origin boundary — **IMPLEMENTED**

**Файлы:**
- `src/shared/config/csp.config.ts`;
- `src/main/services/security/electron-security.util.ts` *(новый модуль security-проверок и window/session guards)*;
- `src/main/services/approval.service.ts`;
- `src/main/index.ts` *(активная `BrowserWindow` factory; неиспользуемый `src/main/windows/mainWindow.ts` и защищённый `src/renderer/composables/useVoice.ts` намеренно оставлены нетронутыми)*;
- `docs/security.md`;
- тесты: `src/shared/config/csp.config.test.ts`, `src/main/services/security/electron-security.util.test.ts`, `src/main/ipc/approval.ipc.test.ts`.

**Что сделано:**
1. [x] Подтверждено, что единственная активная `BrowserWindow` factory находится в `src/main/index.ts`; орфанный `src/main/windows/mainWindow.ts` не используется и не дублировался.
2. [x] Ужесточена `isTrustedOrigin()` и добавлена `isTrustedFileUrl()` в `src/shared/config/csp.config.ts`: в production `file://` принимается только в пределах канонического `trustedFileRoot` (`resolveTrustedRendererRoot(__dirname)` → `out/renderer`), с fail-closed при отсутствии root, блокировкой UNC host, null-byte/encoded traversal (`%00`, `%2e`, `%2f`, `%5c`, `..`, `\`) и sibling-prefix bypass (`/renderer-evil/`). `ApprovalService.isTrustedSender()` передаёт `this.trustedFileRoot` в `isTrustedOrigin()`.
3. [x] Внешние ссылки проверяются через `isSafeExternalHttpUrl()` (`new URL`, разрешены исключительно `http:` и `https:` без встроенных credentials); `setWindowOpenHandler` всегда возвращает `{ action: 'deny' }` и открывает только безопасные URL, а `will-navigate` и `will-attach-webview` блокируют неавторизованные переходы и webview.
4. [x] DevTools (`webPreferences.devTools`, `openDevTools()`, `F12` и `Ctrl+Shift+I` через `before-input-event`) по умолчанию отключены в packaged production; разрешаются только явным CLI-флагом `--debug` или переменной `ARC_ALLOW_DEVTOOLS=1` (`isDevToolsAllowed`).
5. [x] В `BrowserWindow` `webPreferences` явно заданы `sandbox: true`, `webSecurity: true`, `webviewTag: false`, `contextIsolation: true`, `nodeIntegration: false`; в собранном `out/preload/index.js` подтверждён единственный `require("electron")` без Node-модулей.
6. [x] Сужен `PROD_CSP` и `DEV_CSP`: удалены неиспользуемые `fonts.googleapis.com` / `fonts.gstatic.com` (шрифты локальные), убраны широкие wildcards `https:`, `ws:`, `wss:` из `connect-src`, `font-src`, `img-src`, `media-src`; добавлены `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` и HTTP-заголовок `frame-ancestors 'none'` (`getHttpCspPolicy`).
7. [x] Сохранены проверенные runtime-зависимости без поломки: `'unsafe-eval'` и `'wasm-unsafe-eval'` для `litegraph.js` and `onnxruntime-web`; `http://127.0.0.1:*` / `http://localhost:*` и домены HF для локальных LLM/TTS/STT probe и `whisper.worker.ts`; домены VK/CodeRadio в `img-src`/`media-src`.
8. [x] Области model/worker downloads в Main/Worker оставлены с сохранением защищённого `useVoice.ts`: HuggingFace CORS rewrite в `applySecurityResponseHeaders` / `shouldRewriteHuggingFaceCors` сужен с широкого wildcard на узкий HTTPS allowlist (`huggingface.co`, `hf.co`, `hf-mirror.com`) + проверку доверенного `webContentsUrl` / initiator.
9. [x] Задокументирована threat model, обоснование каждого исключения CSP и остаточный техдолг в `docs/security.md`.
10. [x] Пройдены unit и security-boundary тесты на Linux (`csp.config.test.ts` — 11, `electron-security.util.test.ts` — 10, `approval.ipc.test.ts` — 5; общий прогон 122 файла / 827 тестов).
11. [ ] Живая проверка в packaged Electron на Windows (`sandbox: true` c WebGL Реактором, AudioWorklet, `whisper.worker.ts`, DevTools gate, внешние ссылки) — `NOT RUN` в Linux-контейнере.

**Acceptance:** нет широкого доверия произвольным file URLs и произвольным webContents; внешние URL и навигация строго ограничены; `sandbox: true` и production DevTools gate включены; CSP/security exceptions и узкий HF CORS перечислены и объяснены в `docs/security.md`. *(IMPLEMENTED в коде и тестах на Linux; живой Electron/Windows QA `NOT RUN`)*

## S3-04. Единый capability registry для Modules — **IMPLEMENTED**

**Файлы:**
- `src/shared/config/modules-capability.registry.ts` (канонический реестр 14 capabilities, типы, инварианты, агрегация `summary` и `legacyStatusMap`, `createPendingCapabilitySnapshot`, `normalizeModulesCapabilityResponse`);
- `src/main/services/modules-capability.evaluators.ts` + `src/main/services/modules-capability.service.ts` (runtime health adapters с пассивным чтением кэшированного состояния и опциональным manual refresh-пробом без авто-скачивания/запуска Python);
- `src/main/ipc/system.ipc.ts` (`system:modules`), `src/main/preload.ts`, `src/shared/types/ipc.ts`, `src/env.d.ts`, `src/renderer/bootstrap/mock-database.ts`;
- `src/renderer/stores/system.store.ts`, `src/renderer/composables/useElectron.ts`, `src/renderer/features/modules/logic/module-presentation.ts`, `src/renderer/features/modules/components/ModulesView.vue`;
- Тесты: `src/main/services/modules-capability.service.test.ts` (7), `src/main/ipc/system.ipc.test.ts` (5), `src/renderer/features/modules/components/ModulesView.test.ts` (4).

**Что сделать:**
1. [x] Устранены два независимых статических списка статусов (`ModulesView.vue` больше не хранит локальный массив модулей/статусов, а `system:modules` больше не возвращает хардкод `{ Assistant: 'Active', ... }`).
2. [x] Создана единая registry definition (`MODULES_CAPABILITY_DEFINITIONS`, 14 модулей: 10 `implemented` + 4 `planned`) с типизированными полями: `id`, `name`, `description`, `subsystem`, `category`, `lifecycleState`, `availability`, `health`, `entrypoint`, `dependencies`, `lastCheckedAt`, `reason`.
3. [x] Разделены `lifecycleState` (`implemented` / `planned` / `disabled`), `availability` (`available` / `degraded` / `unavailable` / `unknown`) и `health` (`checking` / `ready` / `degraded` / `unavailable` / `error` / `unknown`).
4. [x] Для реальных сервисов runtime health вычисляется через fault-isolated adapters (`DatabaseService`, `providerManager`/`providerHealthManager`, `sttService`, `ttsService`, `PythonServerService`, `skillsStore`, `macroScheduler`, `ecoService`, `os.totalmem`) в пассивном режиме на poll и с явным manual refresh по кнопке «Обновить».
5. [x] Для roadmap items (`agents`, `tools-mcp`, `architecture`, `sandbox`) инвариантами `enforceCapabilityInvariants()` жёстко зафиксированы `lifecycleState: 'planned'`, `availability: 'unavailable'`, `health: 'unavailable'`, `entrypoint: null` и явная причина `v1.1`.
6. [x] Agent Swarm / MCP / Architecture / Sandbox отображаются строго как «Запланировано в v1.1» без кнопок перехода и никогда не маскируются под `active`/`ready`.
7. [x] `ModulesView.vue`, `system.store.ts`, `useElectron.ts` и `system:modules` используют единый `ModulesCapabilitySnapshot` (`schemaVersion: 1`, `checkedAt`, `capabilities[]`, `summary`, производный `legacyStatusMap`); браузерный `mock-database.ts` возвращает честный `unknown` вместо фейкового `online`.
8. [x] Пройдены unit, IPC и SSR-тесты на Linux (`modules-capability.service.test.ts` — 7, `system.ipc.test.ts` — 5, `ModulesView.test.ts` — 4; общий прогон 124 файла / 838 тестов, `check-sizes`, `check-visual-constitution` 0 нарушений, `lint`, `build`).
9. [ ] Живая визуальная и интерактивная проверка `ModulesView` в packaged Electron на Windows (ручной «Обновить», реальные состояния SQLite/STT/TTS/AI) — `NOT RUN` в Linux-контейнере.

**Acceptance:** одна capability имеет один `id` и одно согласованное описание состояния; ложных active/green статусов нет. *(IMPLEMENTED в коде и тестах на Linux; живой Windows Electron UI QA `NOT RUN`)*

## S3-05. AI decomposition: сообщать реальный источник результата — **IMPLEMENTED**

**Файлы:**
- `src/shared/types/models/task.ts`, `src/shared/types/ipc.ts`, `src/env.d.ts` (типизация `TaskDecompositionSource = 'llm' | 'local_template'`, `TaskDecompositionFallbackReason`, `TaskDecompositionResult`, `TasksAiDecomposeResponse`);
- `src/main/services/objective/objective-decomposer.service.ts`, `src/main/ipc/tasks.ipc.ts` (возврат реального `source` и `fallbackReason` из Main/IPC, runtime validation payload и защита от пустого `taskText`);
- `src/renderer/features/tasks/types.ts`, `src/renderer/features/tasks/utils/tasks-sync.helper.ts` (`SubTask.source`, сохранение/diff без смены SQLite schema v8);
- `src/renderer/features/settings/stores/settings.store.ts`, `src/renderer/components/ui/SyncToast.vue` (вариант `'warn'` с `✦ ЛОКАЛЬНЫЙ ШАБЛОН` и токенами `--status-warn`);
- `src/renderer/features/tasks/composables/useAiDecomp.ts`, `src/renderer/features/tasks/components/TaskContextRail.vue`, `src/renderer/features/tasks/components/TaskItem.vue`;
- Тесты: `src/main/ipc/tasks.ipc.test.ts` (6), `src/renderer/features/tasks/composables/useAiDecomp.test.ts` (8), `src/renderer/components/ui/SyncToast.test.ts` (4), `src/main/services/objective/ObjectiveEngine.decomp.test.ts` (4).

**Что сделано:**
1. [x] Возвращается типизированный `source: 'llm' | 'local_template'` и `fallbackReason` (`llm_timeout` / `llm_error` / `llm_invalid_response` / `llm_empty_steps` / `empty_task_text` / `ipc_unavailable` / `ipc_error` / `ipc_invalid_response`) из Main (`objective-decomposer.service.ts` + `tasks:ai-decompose`) и `useAiDecomp.ts`.
2. [x] UI (`SyncToast` `'synced'` vs `'warn'`, кнопки `AI` / `Повтор ИИ` / `LLM ✓`, компактный бейдж `Источник: LLM` / `Шаблон · ИИ офлайн` в `TaskContextRail.vue`, пункт меню в `TaskItem.vue`) явно различает реальную AI-декомпозицию и детерминированный локальный шаблон без нарушения Scope Lock.
3. [x] При локальном шаблоне никогда не показывается toast «ИИ декомпозиция завершена»: показывается `'warn'` toast с причиной fallback и кнопкой повторного запроса.
4. [x] Повторный клик после успешной LLM-декомпозиции блокируется без дублирования шагов и без вызова IPC; при состоянии `local_template` разрешён retry LLM (при успехе LLM заменяет только прежние шаги шаблона с сохранением ручных подзадач; при повторном офлайне сохраняет существующий шаблон без дублирования).
5. [x] Сохранена маркировка шагов локального шаблона `[Локальный шаблон — ИИ офлайн]`.
6. [x] Пройдены unit, IPC, toast и SFC template-compile тесты на Linux (общий прогон `npm test`: 124 файла / 845 тестов, `lint`, `check-sizes`, `check-visual-constitution` 0 нарушений, `build`).
7. [ ] Живой прогон в packaged Electron на Windows (реальный онлайн/офлайн LLM-провайдер + визуальный QA `TasksView`/`SyncToast`) — `NOT RUN` в Linux-контейнере.

**Acceptance:** пользователь всегда понимает, использовалась ли модель. *(IMPLEMENTED в коде и тестах на Linux; живой Windows Electron UI & LLM QA `NOT RUN`)*

## S3-06. First Run Wizard: дождаться сохранения перед закрытием — **IMPLEMENTED**

**Файлы:**
- `src/renderer/components/onboarding/utils/wizard-save.ts` (типы `WizardSavePhase`/`StepSaveResult`, немедленный verified flush `arc_state_settings` в `localStorage` с откатом при ошибке, критическое сохранение AI-выбора и синхронизация voice setup);
- `src/renderer/components/onboarding/composables/useFirstRunWizard.ts` (single-flight контроллер переходов `nextStep` / `finishWizard` / `skipWizard` / `prevStep` / `retryLastAction`, разделение critical vs optional и `'warn'` toast при пропуске опциональных шагов);
- `src/renderer/components/onboarding/utils/ai-step-persistence.ts` и `src/renderer/components/onboarding/steps/AiModeStep.vue` (проверка `{ success: false, error }` для Secret Vault `settingsSetKey` и `saveProvider`);
- `src/renderer/components/onboarding/utils/voice-setup-format.ts`, `src/renderer/components/onboarding/steps/VoiceSetupCard.vue`, `src/renderer/components/onboarding/steps/VoiceMicStep.vue`, `src/renderer/components/onboarding/steps/GraphicsStep.vue` (асинхронное `saveCurrentState()` с возвратом `StepSaveResult` и `optionalWarnings`);
- `src/renderer/components/onboarding/FirstRunWizardModal.vue` (async `skipWizard()` и `Escape`, блокировка кнопок во время сохранения, честные статусы `saving`/`saved`/`error` и баннер с кнопкой `Повторить`);
- `src/renderer/features/settings/stores/settings.store.ts`, `src/renderer/components/ui/SyncToast.vue` (опциональный `badgeLabel` для `'warn'` уведомлений `✦ ВНИМАНИЕ` / `✦ WARNING` без регрессии `S3-05`);
- `src/renderer/bootstrap/plugins.ts` (guard `typeof Node !== 'undefined'` в `toPlainObject` для стабильной сериализации snapshot в Node/Vitest);
- Тесты: `src/renderer/components/onboarding/FirstRunWizardModal.test.ts` (12), `src/renderer/components/ui/SyncToast.test.ts` (4).

**Что сделано:**
1. [x] `skipWizard()` (включая обработку `Escape`) сделан асинхронным и дожидается завершения `saveCurrentState()` активного шага и немедленной верифицированной записи `arc_state_settings` в `localStorage` до закрытия мастера.
2. [x] Разделены critical settings (введённый API-ключ / AI-провайдер на шаге 1 и запись флага `firstRunCompleted` / настроек в `localStorage`) и optional settings (синхронизация режима голоса/микрофона на шаге 2 и 3D-пресет графики на шаге 3).
3. [x] При ошибке критического сохранения (например, `settingsSetKey` / `saveProvider` или `QuotaExceededError` в `localStorage`) мастер остаётся открытым, `firstRunCompleted` откатывается в `false`, отображается честная ошибка и кнопка `Повторить` (`retryLastAction()`).
4. [x] При сбое опциональных настроек (голос/графика) пропуск и завершение разрешаются с явным `'warn'` уведомлением `SyncToast` (`✦ ВНИМАНИЕ`), перечисляющим пропущенные пункты и подсказывающим донастройку в Настройках.
5. [x] Введена single-flight блокировка против двойного клика, повторного `Escape` и гонки `nextStep`/`skipWizard`/`prevStep`, а также устранено дублирование сохранения шага 3 между `nextStep()` и `finishWizard()`.
6. [x] В UI честно отображаются состояния `saving`, `saved`, `error`; пройдены unit/SFC/Pinia-тесты на Linux (`npm test`: 124 файла / 854 теста, `lint`, `check-sizes`, `check-visual-constitution` 0 нарушений, `build`).
7. [ ] Живой прогон First Run Wizard с реальным Secret Vault и перезапуском packaged Electron на Windows — `NOT RUN` в Linux-контейнере.

**Acceptance:** wizard не закрывается раньше завершения обязательных save operations; данные остаются после перезапуска. *(IMPLEMENTED в коде и тестах на Linux; живой Windows Electron UI & restart QA `NOT RUN`)*

## S3-07. ZIP export: fail closed при ошибке redaction — **IMPLEMENTED**

**Файлы:**
- `src/main/utils/backup-redaction.util.ts` (fail-closed санитизация `config/ai-providers.json` и вложенных `ai-providers.json`: рекурсивная очистка объектов/массивов до глубины 32, сохранение `apiKey: ""`, сброс `hasApiKey: false`, удаление альтернативных секретных полей `secret`/`token`/`accessToken`/`refreshToken`/`clientSecret`/`password`/`privateKey`/`authorization`/`x-api-key`/`credentials` и др., очистка кредов/ключей в URL и `enc:`/`b64:`/`sk-`/`AIza`/`Bearer`-строк, безопасный redacted placeholder при `INVALID_JSON` / `INVALID_STRUCTURE` / `DEPTH_LIMIT_EXCEEDED` / `REDACTION_ERROR`);
- `src/main/utils/zip-codec.util.ts` (явные лимиты `ZIP_ARCHIVE_LIMITS` формата `zip32`: `maxEntries=2000`, `maxSingleFileBytes=256 MiB`, `maxTotalUncompressedBytes=512 MiB`, `maxArchiveBytes=512 MiB`; защита от ZIP32 overflow, проверка `CRC-32`, точного размера и `maxOutputLength` против ZIP-бомб в `readZipArchiveEntries`);
- `src/main/utils/zip-writer.ts` (проверка `lstat` против symlink-файлов/директорий и корневого `arc-performance-settings.json`, pre-read проверка `stat.size` до чтения в RAM, диагностические блоки `redaction` и `limits` в `manifest.json`);
- Тесты: `src/main/utils/zip-writer.test.ts` (7), `src/main/services/storage-manager.service.test.ts` (10), `src/main/services/database-json-semantics.test.ts` (7).

**Что сделано:**
1. [x] При ошибке `JSON.parse`, невалидной структуре верхнего уровня или превышении глубины вложенности исходный `Buffer` никогда не возвращается — файл заменяется безопасным redacted placeholder JSON без единого байта исходного содержимого, а предупреждение фиксируется в `manifest.json` (`redaction.warnings`, `redaction.placeholderEntries`).
2. [x] Рекурсивная очистка охватывает альтернативные поля секретов (`apiKey`, `secret`, `token`, `accessToken`, `refreshToken`, `clientSecret`, `password`, `privateKey`, `authorization`, `x-api-key`, `credentials` и т.д.), вложенные объекты, массивы, заголовки, встроенные креды/query-ключи в URL и legacy-префиксы `enc:`/`b64:`.
3. [x] Зафиксированы и принудительно проверяются лимиты `ZIP_ARCHIVE_LIMITS` (`maxEntries=2000`, `maxSingleFileBytes=256 MiB`, `maxTotalUncompressedBytes=512 MiB`, `maxArchiveBytes=512 MiB`) до чтения файлов в память (`lstat` + `stat.size`), а при чтении ZIP проверяются `CRC-32`, точный размер и `maxOutputLength` (`inflateRawSync`).
4. [x] Обоснован отказ от внешней streaming/ZIP64 зависимости: экспорт исключает `models/` и `cache/` и включает только DB-снимок, `config/`, `macros/` и метаданные; ограниченный ZIP32 без новых npm-зависимостей закрывает риски OOM и целостности.
5. [x] Пройдены unit и интеграционные тесты на Linux (valid provider JSON, malformed/truncated JSON с сырым ключом, nested/alternate секреты и depth-bomb, huge file pre-read без вызова `readFile`, too many entries, symlink skip, SQLite DB snapshot, CRC-32 tamper и ZIP-bomb; общий прогон `npm test`: 125 файлов / 861 тест, `lint`, `check-sizes`, `check-visual-constitution` 0 нарушений, `build`).
6. [ ] Живой прогон экспорта/распаковки бэкапа в packaged Electron на Windows — `NOT RUN` в Linux-контейнере.

**Acceptance:** ошибка redaction никогда не приводит к включению исходного неподчищенного provider config в backup. *(IMPLEMENTED в коде и тестах на Linux; живой Windows Electron backup QA `NOT RUN`)*

## S3-08. Reset semantics: привести интерфейс к реальному объёму удаления — **IMPLEMENTED**

**Файлы:**
- `src/shared/config/reset-policy.ts` *(новый единый декларативный контракт Варианта A: канонические списки удаляемых целей `APP_DATA_RESET_TARGETS`, защищённых активов `APP_DATA_RESET_PRESERVED_ASSETS`, runtime-валидатор `normalizeResetOptions()` и построители раскрытия для UI `getUiResetDisclosure()` / `getAppDataResetDisclosure()`)*;
- `src/main/services/storage-reset.util.ts` *(новый модуль выполнения сброса данных с защитой перекрытия путей `isPathSameOrParent`/`resolveSafeLegacyAppDataDirs` и честным отчётом об отказах `failedTargets` без тихого перезапуска при `EBUSY`/`EACCES`)*;
- `src/main/services/storage-manager.service.ts`, `src/main/ipc/app.ipc.ts`, `src/env.d.ts`;
- `src/renderer/features/settings/components/sections/system/SystemResetBlock.vue` *(новый компонент двух раздельных действий сброса в Визуальной конституции A.R.C.)*;
- `src/renderer/features/settings/components/sections/system/StorageDataSection.vue`, `src/renderer/features/settings/composables/useSettingsSearch.ts`, `src/renderer/features/settings/components/sections/general/SystemResourcesSection.vue` *(коррекция устаревшей подписи об удалении API-ключей)*;
- Тесты: `src/main/services/storage-reset.test.ts` (6), `src/main/ipc/app.ipc.test.ts` (10), `src/renderer/features/settings/components/sections/system/storage-db-presentation.test.ts` (4).

**Утверждённая владельцем политика (Вариант A):**
- [x] 1. Утверждён **Вариант A**: сброс данных не расширяет уничтожение на Secret Vault (`secrets.json`, `secrets.json.corrupt.*.bak`), журналы (`logs/`, `csp-violations.log`), резервные копии БД (`backups/`), пользовательские словари TTS (`tts_dicts/`), политику приватности облачного TTS (`tts-policy.json`) и (по умолчанию) скачанные модели (`models/`).
- [x] 2. В `StorageDataSection.vue` (группа 04 «Сброс настроек и данных», без вводящего в заблуждение «Сброс к заводским параметрам») разделены два явных действия:
  - **Сброс параметров интерфейса и кэшей** (`system.storage.reset.ui`, без перезапуска — только `settings.store` и оперативные кэши LLM/TTS);
  - **Сброс данных и конфигурации приложения (Вариант A)** (`system.storage.reset.data`, с перезапуском через `system:reset-data` и опциональным чекбоксом удаления `models/`, выключенным по умолчанию).
- [x] 3. В обоих блоках и в их модальных окнах подтверждения выводится точный синхронизированный с backend список «Будет удалено / сброшено» и «Сохранится без изменений» (динамически обновляется при переключении `clearModels`).
- [x] 4. В `system:reset-data` и `StorageManagerService.resetSystemData()` добавлена runtime-валидация payload (`normalizeResetOptions`), защита перекрытия путей `%APPDATA%` с активным `dataDir`, очистка `arc.db_fallback.json` и честный отказ `success: false` без перезапуска при ошибке удаления цели (`EBUSY`/`EACCES`).
- [x] 5. Пройдены unit, IPC и SSR-тесты на Linux (`storage-reset.test.ts` — 6, `app.ipc.test.ts` — 10, `storage-db-presentation.test.ts` — 4; общий прогон `npm test`: 126 файлов / 869 тестов, `lint`, `check-sizes`, `check-visual-constitution` 0 нарушений, `build`).
- [ ] 6. Живой прогон сброса данных и перезапуска в packaged Electron на Windows (`app.relaunch()`, файловые блокировки и проверка сохранности DPAPI `secrets.json`) — `NOT RUN` в Linux-контейнере.

**Acceptance:** никакая категория пользовательских данных не удаляется неожиданно или без ясного предупреждения. *(IMPLEMENTED в коде и тестах на Linux по утверждённому Варианту A; живой Windows Electron reset/relaunch QA `NOT RUN`)*

## S3-09. PowerShell/SAPI: безопасная передача пути — **IMPLEMENTED**

**Файлы:**
- `src/main/services/system-tts.util.ts` *(новый модуль безопасного запуска системного TTS: статический скрипт `WINDOWS_SAPI_POWERSHELL_SCRIPT` без интерполяции путей/текста, передача UTF-8 temp-файла строго через `env.ARC_TTS_TEXT_FILE` + `-LiteralPath`, прямой `spawn(..., { shell: false, windowsHide: true })` для `powershell.exe` / `say -f` / `espeak -f`, адаптивный таймаут `computeSystemTtsTimeoutMs` (`15s`–`180s`), проверка exit code и ограниченного stderr, безопасный `terminateChildProcessTree` через `execFile('taskkill', ['/pid', ..., '/t', '/f'])` и гарантированный cleanup temp-файла)*;
- `src/main/services/tts.service.ts` *(удалён `child_process.exec`, `speakWithSystemTTS` и `stop()` переведены на `runSystemTtsProcess` и `terminateChildProcessTree` с пробросом `AbortSignal` и сохранением цепочки фолбэков)*;
- `src/main/services/tts-engines.util.ts` *(удалён устаревший строковый `buildSystemTtsCommand`)*;
- Тесты: `src/main/services/system-tts.util.test.ts` (9), `src/main/services/tts.service.test.ts` (20).

**Что сделано:**
1. [x] Полностью исключена конкатенация пути temp-файла в PowerShell source string; скрипт `WINDOWS_SAPI_POWERSHELL_SCRIPT` статичен, запускается с `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command` и читает путь из `$env:ARC_TTS_TEXT_FILE` с проверкой `Test-Path -LiteralPath` и освобождением `$synth.Dispose()` в `finally`.
2. [x] Все вызовы системного TTS (`powershell.exe`, `say -f`, `espeak -f`) и остановки дерева процессов (`taskkill`) переведены на `spawn`/`execFile` с `shell: false` и `windowsHide: true`; `child_process.exec` удалён из `tts.service.ts`.
3. [x] Внедрён адаптивный таймаут по длине текста (`15s` минимум, `12s + length * 140ms`, верхняя граница `180s`), валидация ненулевого exit code / сигнала с усечённым stderr и идемпотентное удаление temp-файла при любом исходе (успех, ошибка, таймаут, `stop()`/`AbortSignal`).
4. [x] Автотестами проверены реальные пути с пробелами, кириллицей, апострофами (`'`), круглыми/квадратными скобками (`()`, `[]`), `$`, `;` и кавычками; сохранены политика фолбэков (`Silero → [Edge] → SAPI → unavailable`) и корректное прерывание речи.
5. [ ] Живой прогон Windows PowerShell/SAPI на профиле Windows с кириллицей, пробелами, апострофами и скобками — `NOT RUN` в Linux-контейнере.

**Acceptance:** SAPI работает с нестандартным Windows user profile path без command injection/ошибки quoting. *(IMPLEMENTED в коде и тестах на Linux; живой Windows PowerShell/SAPI QA `NOT RUN`)*

## S3-10. Build metadata: не подставлять устаревший commit SHA — **IMPLEMENTED**

**Файлы:**
- `src/shared/config/build-metadata.ts` *(единый runtime-модуль `getRuntimeBuildMetadata()`, `normalizeCommitSha()`, `formatBuildIdentity()` без устаревшего fallback-хэша)*;
- `src/shared/config/build-metadata.resolver.ts` *(build-time резолвер `resolveBuildMetadata()`: приоритет `BUILD_COMMIT` → `GITHUB_SHA` → `git rev-parse HEAD` через `execFileSync` → `.commit_hash`; строгий fail-closed отказ при `ARC_REQUIRE_BUILD_COMMIT=true` / `ARC_RELEASE_BUILD=true` без валидного SHA; явный `unknown` в dev-режиме без Git)*;
- `electron.vite.config.ts`, `vite.config.ts` *(удалён hardcoded `'9048f71'`, константы `__BUILD_COMMIT__`, `__BUILD_COMMIT_FULL__`, `__BUILD_COMMIT_SOURCE__`, `__APP_VERSION__` внедряются одновременно в `main` и `renderer`)*;
- `.github/workflows/ci.yml`, `.github/workflows/release.yml` *(передача `BUILD_COMMIT: ${{ github.sha }}` и `ARC_REQUIRE_BUILD_COMMIT: 'true'` в шаги `npm run build` и `npm run pack:win`)*;
- `src/env.d.ts`, `src/main/services/diagnostics.service.ts` *(поля `app.commit` и `app.commitSource` рядом с `app.version` в `DiagnosticsReport`)*;
- `src/renderer/main.ts`, `src/renderer/features/settings/config/releases.registry.ts`, `src/renderer/features/settings/components/sections/system/DiagnosticsSection.vue` *(строка `system.diag.build_meta` «Версия и сборка артефакта»)*, `src/renderer/features/settings/composables/usePerformanceTest.ts` *(удалён устаревший `v0.2.2-AI`, добавлены реальные `appVersion` и `buildCommit`)*;
- Тесты: `src/shared/config/build-metadata.test.ts` (8), `src/main/services/diagnostics.service.test.ts` (5), `src/renderer/features/settings/components/sections/system/storage-db-presentation.test.ts` (4).

**Что сделано:**
1. [x] CI и Release workflows (`.github/workflows/ci.yml`, `.github/workflows/release.yml`) передают `BUILD_COMMIT: ${{ github.sha }}` и `ARC_REQUIRE_BUILD_COMMIT: 'true'` в сборку и Windows-упаковку.
2. [x] Полностью удалён устаревший hardcoded SHA `'9048f71'` из `electron.vite.config.ts`, `vite.config.ts`, `src/renderer/main.ts` и `releases.registry.ts`; при отсутствии валидного SHA в CI/release режиме сборка падает fail-closed (`FAIL_CLOSED_EXIT=1`), а в локальном dev-режиме без Git явно подставляется `unknown`.
3. [x] Метаданные версии и коммита внедряются в оба бандла (`out/main/index.js` и `out/renderer/assets/*`), отображаются в `DiagnosticsSection.vue`, попадают в `DiagnosticsService.collectReport()` и отчёты `usePerformanceTest.ts`.
4. [x] Проверены unit/SSR-тесты, сборка с `BUILD_COMMIT` и fail-closed gate на Linux (`npm test`: 128 файлов / 887 тестов, `lint`, `check-sizes`, `check-visual-constitution` 0 нарушений, `build`).
5. [ ] Проверка соответствия commit metadata в собранном Windows EXE реальному GitHub Actions workflow run — `NOT RUN` в Linux-контейнере.

**Acceptance:** commit metadata EXE соответствует commit workflow run. *(IMPLEMENTED в коде, CI workflows и тестах на Linux; проверка на Windows EXE из GitHub Actions run `NOT RUN`)*

## S3-11. Постепенная статическая проверка TypeScript — **IMPLEMENTED**

**Файлы:**
- `tsconfig.strict.json` *(поэтапный строгий профиль компилятора Phase A + Phase B + Phase C для незащищённого production-кода: `strict: true`, `strictNullChecks: true`, `noImplicitAny: true`, `noImplicitOverride: true`, `useUnknownInCatchVariables: true` — **195** исходных `.ts`-файлов в `src/` с **0 ошибок**, включая `src/shared/**`, `src/main/utils/**`, незащищённые `src/main/ipc/*.ts`, `src/main/services/{security,sandbox,commands,memory,tools}/**`, `database.ts`, `diagnostics.service.ts`, `eco.service.ts`, `files.service.ts`, `launcher-indexer.service.ts`, `tasks.service.ts`, `provider-manager.ts`, `model-name.util.ts`, `tts*.ts`, `python_*.ts`, `model-*.ts`, `sherpa-*.ts`, `stt*.ts`, `storage-manager.service.ts`, а также незащищённые `src/renderer/stores/{aiConfig,eco,performance,system,terminal,ui}.ts`, `src/renderer/services/hotkeys*.ts`, `src/renderer/features/settings/{logic,composables}/**`, `src/renderer/components/onboarding/{utils,composables}/**`, `module-presentation.ts`, `src/renderer/{bootstrap,layouts,utils,audio}/**` и `src/renderer/features/commands/commands.{registry,utils}.ts`)*;
- `scripts/check-static-boundaries.js` *(проверщик границ Vue + TS + IPC без новых npm-зависимостей: парсинг и компиляция всех 209 Vue SFC через `@vue/compiler-sfc`, сверка паритета каналов Preload ↔ Main `invoke`/`send`/`on`, анти-регрессионная проверка запрета `child_process.exec` в укреплённых модулях и валидация packaging identity)*;
- `src/main/services/llm/model-name.util.ts` *(выделен чистый хелпер `sanitizeBuiltinModelName` для разрыва циклического импорта `prompt-builder.ts ↔ provider-manager.ts` без модификации защищённого `built-in-llm.service.ts`)*;
- `src/main/index.ts`, `src/renderer/bootstrap/mock-database.ts`, `src/renderer/features/commands/commands.registry.ts`, `src/renderer/layouts/composables/useCommandCenter.ts`, `src/renderer/composables/useVoiceCommands.ts`, `src/env.d.ts` (ambient `better-sqlite3`), 5 тестовых наборов (`RouteApproval`, `AtomicRollback`, `ObjectiveEngine.decomp`, `gigaam-sources`, `storage-manager.service`) + 14 ранее исправленных модулей Main/Renderer *(устранены все 33 ошибки `--strict` в незащищённом production-коде и все 54 ошибки `--strict` в `.test.ts` без затрагивания защищённых зон и без изменения замороженного production-рантайма RC)*;
- `package.json` (`lint:strict`, `check-boundaries`, обновлённый `gate`), `.github/workflows/ci.yml`, `.github/workflows/release.yml`;
- `docs/typescript-strictness-roadmap.md` *(измеренная динамика typing debt 2026-11-20 → 2026-11-21 и 4-фазная дорожная карта внедрения `strict`, `strictNullChecks`, `noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)*;
- Тесты: `src/shared/config/static-boundaries.test.ts` (4).

**Что сделано:**
1. [x] Проведён анализ tooling и размера diff: по решению владельца новые npm-зависимости (ESLint/Prettier) не добавлялись, чтобы не создавать шумный big-bang diff; использованы уже установленные `typescript ~5.8.2` и `@vue/compiler-sfc`.
2. [x] Добавлены автоматические проверки Vue + TS + IPC boundary (`npm run check-boundaries`): 209 Vue SFC, 182/186 `invoke` / 6 `send` / 41 `on` IPC-каналов, анти-регрессия `child_process.exec` и метаданных сборки.
3. [x] Введён и расширен (Phase A + Phase B + Phase C) строгий профиль `tsconfig.strict.json` (`npm run lint:strict`, **195** файлов в `src/`, **0 ошибок**) без затрагивания защищённых зон; устранён циклический импорт `prompt-builder.ts ↔ provider-manager.ts` и закрыты **все ошибки `--strict`** во всём незащищённом production-коде (`0`) и во всех 141 `.test.ts` (`0`).
4. [x] Все новые проверки интегрированы в `npm run gate`, `.github/workflows/ci.yml` и `.github/workflows/release.yml` без ослабления существующего релизного gate.
5. [x] Обновлена поэтапная дорожная карта Typing Debt (`docs/typescript-strictness-roadmap.md`): измеренный общепроектный долг снижен до абсолютного минимума вне защищённых зон (`--strict`: 125 → **6** [0 в незащищённом production, 0 в `.test.ts`, 6 в защищённых зонах], `--noImplicitAny`: 108 → **74**, `--strictNullChecks`: 137 → **35**).

**Acceptance:** новые и изменяемые критичные контракты runtime/type-safe; существующий релизный gate не ухудшен. *(IMPLEMENTED и проверено в Linux: `npm run gate` = 0 ошибок, 141 файл / 943 теста; RC-рантайм заморожен для Windows QA handoff; прогон на `windows-latest` CI ожидается при следующем push)*

## S3-12. Build packaging identity and metadata — **IMPLEMENTED**

**Файлы:**
- `build/icon.png` (512×512 PNG) и `build/icon.ico` (многоразмерный Windows ICO: 16, 24, 32, 48, 64, 128, 256 px) — фирменная иконка A.R.C.;
- `scripts/generate-arc-icons.cjs` *(воспроизводимый генератор PNG + многоразмерного ICO на базе `jimp` без новых пакетов)*;
- `src/main/utils/app-icon.util.ts`, `src/main/index.ts` *(подключение `BrowserWindow({ icon })` для dev и packaged режимов)*;
- `package.json` *(согласованные владельцем `author: "DdepRest"`, `homepage`, `repository`, `bugs`, `build.copyright`, `build.directories.buildResources: "build"`, `extraResources` для `icon.png`, `win.icon`, `win.publisherName`, `win.requestedExecutionLevel: "asInvoker"`, `win.verifyUpdateCodeSignature: false`, `nsis` `installerIcon`/`uninstallerIcon`/`installerHeaderIcon`/`shortcutName`/`uninstallDisplayName`/`deleteAppDataOnUninstall: false`)*;
- `THIRD_PARTY_NOTICES.md` *(синхронизирован с фактическими 20 runtime-зависимостями из `package.json`, удалён устаревший `glob`, сохранено уведомление Silero `CC BY-NC-SA 4.0`)*;
- `scripts/verify-win-signature.ps1`, `scripts/verify-win-artifacts.ps1` *(инспекция PE `FileVersionInfo` и честная проверка подписи через `Get-AuthenticodeSignature`: классификация `TRUSTED_SIGNED` / `UNSIGNED` / `INVALID_OR_UNTRUSTED`, флаг `-RequireSigned`, JSON-отчёт `ARTIFACT_VERIFICATION.json`, вывод `signing_status` и расширенный `-SelfTest`)*;
- Тесты: `src/shared/config/packaging-identity.test.ts` (6).

**Что сделано:**
1. [x] Создана и подключена фирменная многоразмерная иконка A.R.C. (`build/icon.ico` для NSIS/Portable/EXE и `build/icon.png` для `BrowserWindow` в dev/packaged).
2. [x] Прописаны утверждённые владельцем метаданные `author` (`DdepRest`), `homepage` (`https://github.com/DdepRest/ARC`), `repository`, `bugs` и `copyright`.
3. [x] Проверены и закреплены `productName: "A.R.C."`, `appId: "com.arc.cognitive"`, `requestedExecutionLevel: "asInvoker"`, `nsis.shortcutName`, `uninstallDisplayName`, `deleteAppDataOnUninstall: false` и синхронизирован `THIRD_PARTY_NOTICES.md`.
4. [x] Верификатор Windows-артефактов (`verify-win-artifacts.ps1` + `verify-win-signature.ps1`) дополнен проверкой PE `FileVersionInfo` и системного `Get-AuthenticodeSignature` с отказом считать сборку подписанной без статуса `Valid` и валидного `SignerCertificate` (при отсутствии сертификата честно фиксируется `UNSIGNED`).
5. [ ] Живая сборка Windows NSIS/Portable, запуск `verify-win-artifacts.ps1 -SelfTest` и `verify-win-artifacts.ps1` на Windows (`Get-AuthenticodeSignature` / PE `FileVersionInfo`), визуальная проверка иконки, ярлыков и uninstall behavior на чистой Windows — `NOT RUN` в Linux-контейнере (`pwsh` и Windows tooling отсутствуют).

**Acceptance:** артефакты имеют узнаваемую идентичность, метаданные корректны, статус подписи проверен и задокументирован. *(IMPLEMENTED в коде, ресурсах и тестах на Linux: 130 файлов / 897 тестов, `npm run gate` зелёный; живой Windows packaging/icon/Authenticode QA `NOT RUN`, текущий статус подписи честно зафиксирован как `UNSIGNED` до подключения сертификата)*

**Выход Sprint 3:** все задачи Sprint 3 (`S3-01`..`S3-12`) реализованы и проверены автотестами и `npm run gate` в Linux (`IMPLEMENTED`: честная DB/diagnostics state, hardened Electron boundary, unified Modules registry, truthful AI decomposition, verified onboarding save, fail-closed exports, Variant A reset, safe PowerShell/SAPI, accurate build metadata, staged strict TS/Vue/IPC boundary checks, A.R.C. packaging identity & honest Authenticode verifier); финальный статус `VERIFIED` — после живого Windows QA в Sprint 4.

---

# 8. Sprint 4 — Real Release QA (P0 Release Gate)

Это этап доказательства работоспособности. Его нельзя закрыть на основании только unit tests, CI build или обещания кодера.

## S4-01. Реальный multi-process soak test на Windows — **IMPLEMENTED (инструментарий) / NOT RUN (живой Windows прогон)**

**Файлы:**
- `scripts/windows-soak-harness.ps1` *(нативный PowerShell 5.1/7+ harness: обход дерева `Win32_Process` по `ParentProcessId`, классификация ролей `main`, `renderer_gpu`, `python_tts`, `stt_worker`, `local_llm`, `download_worker`, PID/lifetime/restarts, Private Working Set, CPU%, handles/threads, размеры `arc.db`/`arc.db-wal`, локаленезависимый CSV `InvariantCulture`, `scenario-marker.txt`, `-GracefulStopAtEnd` с проверкой orphan PID, `-SelfTest` и авто-вызов анализатора)*;
- `scripts/soak-report-analyzer.cjs` *(zero-dep Node-анализатор CSV + `soak-meta.json`: расчёт `p50`/`p95` задержек `dbWrite`/`stt`/`tts`, линейная регрессия роста памяти после warmup `MB/hr` + `R²`, idle/eco CPU p95 gate, restart loop gate, fatal exceptions gate, post-exit orphan PID gate и аудит покрытия всех 11 обязательных сценариев `REQUIRED_SOAK_SCENARIOS`)*;
- `docs/STATISTICS.md` *(раздел 1.4: явное разделение синтетического Node-бенчмарка `scripts/soak-test.js` и реального Windows multi-process soak harness со статусом живого прогона `NOT RUN`)*;
- `.github/workflows/ci.yml` *(шаг `windows-soak-harness.ps1 -SelfTest` в job `package-win`)*;
- Тесты: `src/shared/config/soak-analyzer.test.ts` (4).

**Что сделано:**
1. [x] Создан multi-process Windows soak harness (`scripts/windows-soak-harness.ps1`) и анализатор вердикта (`scripts/soak-report-analyzer.cjs`), покрывающие все 11 обязательных сценариев (`idle_30m` .. `shutdown_during_active_voice_download`) и метрики процесса/БД/задержек.
2. [x] В `docs/STATISTICS.md` закреплена граница между синтетическим прогоном и реальным multi-process soak на Windows.
3. [x] Позитивные и негативные тесты анализатора (2h plateau + `p50`/`p95`, линейная утечка памяти, orphan PID, restart loops, fatal errors, idle CPU spike) пройдены на Linux (`4/4`).
4. [ ] Реальный 2–4-часовой прогон на Windows с записью hardware baseline, `p50`/`p95`, WAL/RAM/CPU и post-exit orphan check — `NOT RUN` в Linux-контейнере.

## S4-02. Upgrade/data preservation QA — **IMPLEMENTED (протокол и сборщик) / NOT RUN (живой Windows прогон)**

**Файлы:**
- `scripts/windows-qa-preflight.ps1` *(режимы `preflight`, `snapshot-before`, `snapshot-after`, `compare-snapshots`: снимки SHA-256 и размеров `arc.db`, `arc.db-wal`, `arc.db-shm`, `secrets.json`, `tts-policy.json`, `config/ai-providers.json`, `macros`, `models`, `tts_dicts`, `backups`, `logs` и автоматическая сверка сохранности данных)*;
- `scripts/compare-qa-snapshots.cjs` *(zero-dep Node-компаратор снимков before/after для сценариев `upgrade` и `uninstall`: fail при исчезновении критичных файлов, обнулении до 0 байт, очистке непустой директории или непредусмотренной мутации `userData` при uninstall)*;
- `docs/WINDOWS-RELEASE-QA-PROTOCOL.md` *(раздел S4-02: пошаговый чек-лист upgrade с предыдущей версии, WAL/SHM, DPAPI, backup/restore и проверки сохранения данных при uninstall)*;
- `docs/WINDOWS-QA-HANDOFF.md` *(пошаговый runbook владельца для запуска всех Windows-проверок и сбора итогового пакета доказательств)*;
- Тесты: `src/shared/config/release-status-registry.test.ts` *(покрывает `compare-qa-snapshots.cjs` для upgrade PASS / truncation FAIL / deletion FAIL / uninstall mutation FAIL)*.

**Статус:** протокол, PowerShell-сборщик, автоматический компаратор снимков и runbook владельца подготовлены и покрыты unit-тестами на Linux; живой Windows upgrade / DPAPI / uninstall прогон — `NOT RUN`.

## S4-03. Clean OS matrix — **IMPLEMENTED (протокол и preflight) / NOT RUN (живой Windows прогон)**

**Файлы:**
- `scripts/windows-qa-preflight.ps1` *(фиксация OS build, CPU/RAM/GPU, non-admin, пробелов/кириллицы в профиле, наличия Python/FFmpeg, SHA-256 и `Get-AuthenticodeSignature` артефакта)*;
- `docs/WINDOWS-RELEASE-QA-PROTOCOL.md` *(раздел S4-03: таблица всех 8 обязательных Clean OS конфигураций Windows 10/11, non-admin, кириллица/пробелы, без Python, без FFmpeg, без моделей, offline/slow network — каждая строка честно отмечена `NOT RUN`)*.

**Статус:** матрица и preflight-сборщик подготовлены; живой прогон NSIS и Portable на чистых Windows 10/11 — `NOT RUN`.

## S4-04. UX / accessibility matrix — **IMPLEMENTED (протокол) / NOT RUN (живой Windows прогон)**

**Файлы:**
- `docs/WINDOWS-RELEASE-QA-PROTOCOL.md` *(раздел S4-04: чек-лист реального окна для 1920×1080@100%, 1366×768@100%, 1366×768@125%, 1280×720@100%, modal focus trap/Esc/Tab, reduced motion, contrast, empty/error/offline/cancelled/degraded, Settings Provider draft и truthful states — статус `NOT RUN`)*.

**Статус:** матрица подготовлена без спекулятивного редизайна; живой скриншот/accessibility прогон в окне Windows — `NOT RUN`.

## S4-05. Supply chain, licenses и release provenance — **IMPLEMENTED (SBOM, манифест и политика лицензий)**

**Файлы:**
- `scripts/generate-sbom.cjs` *(zero-dep детерминированный генератор CycloneDX 1.5 JSON `dist/sbom-cyclonedx.json`: `package-lock.json` + `package.json` = 432 prod npm-компонента, `requirements-silero.txt` = 11 Python-зависимостей, `src/main/services/model-supply-chain.manifest.ts` = 6 ML-моделей с source URL/revision/SHA-256/license/`arc:commercialUseAllowed`, 4 семейства локальных шрифтов `OFL-1.1` и 2 иконки A.R.C. = 455 компонентов всего)*;
- `THIRD_PARTY_NOTICES.md` *(добавлены таблицы Python Silero TTS зависимостей, локальных шрифтов `OFL-1.1`, иконок A.R.C. и раздел 6 «Non-Commercial Distribution Boundary» с явным ограничением `CC BY-NC-SA 4.0` для Silero `v5_6_ru.pt` — MIT в `package.json` не выдаётся за коммерческое разрешение на веса модели)*;
- `package.json` *(скрипт `"generate:sbom": "node scripts/generate-sbom.cjs"`)*;
- `.github/workflows/ci.yml`, `.github/workflows/release.yml` *(генерация и выгрузка `dist/sbom-cyclonedx.json` и `THIRD_PARTY_NOTICES.md`)*;
- Тесты: `src/shared/config/sbom-provenance.test.ts` (2).

**Утверждённая владельцем политика дистрибуции:** некоммерческий open-source релиз с Silero TTS v5.6 и явным ограничением `CC BY-NC-SA 4.0` (`arc:distributionPolicy = non-commercial-open-source`); для коммерческой дистрибуции требуется отдельное согласование лицензии Silero либо исключение весов `v5_6_ru.pt`.

## S4-06. Release candidate bundle — **IMPLEMENTED (RC-комплект и CI/Release workflow) / NOT RUN (Windows QA & Release Sign-Off)**

**Файлы:**
- `docs/release-notes-v1.0.12-rc.md` *(описание RC v1.0.12, сводка Sprint 0–3, манифест RC-комплекта, честное раскрытие статуса подписи `UNSIGNED`, ограничение Silero `CC BY-NC-SA 4.0`, известные ограничения, инструкции диагностики и форма sign-off владельца)*;
- `docs/WINDOWS-QA-HANDOFF.md` *(пошаговый runbook владельца для финального Windows QA прогона `S0-04`/`S0-05`/`S4-01`..`S4-06` с шагом автоматической проверки папки доказательств)*;
- `scripts/verify-windows-qa-bundle.cjs` + `scripts/windows-qa-preflight.ps1 -Mode verify-bundle` + `npm run verify:qa-bundle` *(zero-dep fail-closed 7-gate валидатор папки Windows QA доказательств `C:\ARC-QA\evidence\`: `ciArtifacts`, `cleanOsPreflight`, `diagnosticsProvenance`, `upgradePreservation`, `uninstallPreservation`, `multiProcessSoak`, `uxScreenshots` → `RELEASE_READY | BLOCKED`; тесты `src/shared/config/windows-qa-bundle-validator.test.ts` 6/6)*;
- `docs/release-status-registry.json` *(машинно-читаемый реестр всех 38 задач Release Hardening и Audit ID `P0-01`..`P2-12` по Аудиту §7.4 с тестами целостности `src/shared/config/release-status-registry.test.ts`)*;
- `CHANGELOG.md` *(секция `[1.0.12] - 2026-11-20 (Release Hardening RC)`)*;
- `.github/workflows/ci.yml` *(генерация SBOM, `windows-soak-harness.ps1 -SelfTest`, загрузка `dist/ARTIFACT_VERIFICATION.json` и `dist/sbom-cyclonedx.json` в workflow artifacts)*;
- `.github/workflows/release.yml` *(генерация SBOM, загрузка `NSIS EXE`, `Portable EXE`, `SHA256SUMS.txt`, `ARTIFACT_VERIFICATION.json`, `sbom-cyclonedx.json`, `THIRD_PARTY_NOTICES.md` в workflow artifacts и explicit manual/tag GitHub Release только после запуска владельцем)*.

**Выход Sprint 4:** вся инженерная подготовка Sprint 4 (`S4-01`..`S4-06`: Windows soak harness + analyzer, preflight/upgrade snapshot collector + `compare-qa-snapshots.cjs`, fail-closed 7-gate валидатор папки доказательств `verify-windows-qa-bundle.cjs` / `npm run verify:qa-bundle`, пошаговый runbook `docs/WINDOWS-QA-HANDOFF.md`, единый Windows QA протокол, машинно-читаемый реестр `docs/release-status-registry.json`, CycloneDX 1.5 SBOM на 455 компонентов, синхронизированный `THIRD_PARTY_NOTICES.md` с некоммерческой границей Silero `CC BY-NC-SA 4.0`, release notes RC v1.0.12, обновлённые `CHANGELOG.md`, `ci.yml` и `release.yml`) реализована и проверена на Linux (`IMPLEMENTED`, `npm run gate` = 141 файл / 943 теста). **Все живые Windows QA прогоны (`S4-01`..`S4-04`), подпись артефактов (`UNSIGNED`) и публикация GitHub Release остаются `NOT RUN` до выполнения на реальной Windows-машине и явного sign-off владельца.**

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

**Статус §9 (21.11.2026) — IMPLEMENTED (адресные исправления и тесты в Linux) / NOT RUN (живой Windows UX-скриншот QA):**
- [x] `ApprovalDialog.vue` + `approval-dialog.helpers.ts`: добавлен захват/возврат фокуса на предыдущий элемент при закрытии и размонтировании (`capturePreviousFocus`/`releasePreviousFocus`), полный trap `Tab`/`Shift+Tab` (включая возврат при уходе фокуса за пределы модалки), видимые focus-visible кольца на кнопках, структурированный блок метаданных (`Инициатор`/макрос, `Executable`, `Директория`, `Режим`), отображение `consequences` и динамический `timeoutMs` (вместо хардкода `60 сек`). Тесты: `src/renderer/components/security/ApprovalDialog.test.ts` (7/7) и `src/renderer/components/ui/ApprovalDialog.test.ts` (4/4).
- [x] `Provider Master–Detail draft/save/switch`: добавлен модульный тест `src/renderer/features/settings/composables/useProviderInspectorDraft.test.ts` (4/4: `clean → dirty → saving → saved`, сохранение `••••••••••••••••`, `cancelSwitch`/`discardAndSwitch`/`confirmSaveAndSwitch`, отказ при невалидном URL и ошибке IPC, изоляция `enabled` и 7-статусная классификация).
- [x] `npm run check-visual-constitution`: **0 нарушений** по всем 9 счётчикам в 393 незащищённых файлах; защищённые зоны не затрагивались.
- [ ] Визуальный скриншот-аудит разрешений `1920×1080`, `1366×768@100%/125%`, `1280×720` в окне Windows — `NOT RUN` (см. `docs/WINDOWS-RELEASE-QA-PROTOCOL.md` §S4-04).

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

Кандидаты из аудита — **проверенный результат (§10, 21.11.2026 — IMPLEMENTED):**

| Кандидат | Результат глобального поиска и действие |
|---|---|
| `myload/english_pronunciation_dict.py` (+ `myload/ARC_TTS_normalizer.py`) | **СОХРАНЁН:** активно импортируются генераторами словарей (`scripts/build_tts_pronunciation_db.py`, `scripts/extract_dicts.py`). |
| `screeninfo/` (2.0 МБ) | **УДАЛЁН:** подтверждено 0 входящих ссылок в `src/`, `scripts/`, `docs/`, `README.md`, `package.json`. |
| `public/assets/aistudio/` (17 МБ, 71 файл) | **УДАЛЁН:** подтверждено 0 ссылок во всём репозитории; ранее копировался Vite в каждый production-билд (`out/renderer/assets/aistudio/`). |
| Legacy Vosk (`src/main/services/vosk-tts.util.ts` и guards) | **УДАЛЁН** `src/main/services/vosk-tts.util.ts` (0 импортов в `src/` и `scripts/`); **СОХРАНЕНЫ** защитные исключения `!**/*vosk*` в `package.json` и зачистка в `scripts/postinstall-check.js` / `scripts/exorcise.js` для upgrade-гигиены. |
| `docs/archive/`, `docs/phase6-*` и старые plans | **СОХРАНЕНЫ:** история сохранена, `docs/phase6-sweep-worklist.md` помечен как `HISTORICAL / SUPERSEDED`. |
| Wrapper `src/renderer/components/ui/ApprovalDialog.vue` | **СОХРАНЁН:** тонкий 8-строчный compatibility wrapper над `../security/ApprovalDialog.vue`, покрытый тестом `ui/ApprovalDialog.test.ts`. |
| `src/main/windows/mainWindow.ts` | **СОХРАНЁН (по решению владельца):** неиспользуемый legacy-helper не удалялся в рамках текущего прогона. |

Дополнительные пункты §10:
- [x] `docs/00-index.md`: проверено наличие `docs/AI-STUDIO-CONTEXT.md` (существует), добавлен раздел «4. Release Hardening, Безопасность и Windows QA» (`PROJECT_RELEASE_ROADMAP.md`, `security.md`, `typescript-strictness-roadmap.md`, `WINDOWS-RELEASE-QA-PROTOCOL.md`, `WINDOWS-QA-HANDOFF.md`, `release-status-registry.json`, `release-notes-v1.0.12-rc.md`).
- [x] `docs/release-status-registry.json`: создан канонический машинно-читаемый реестр статусов всех 38 задач Release Hardening и Audit ID `P0-01`..`P2-12` (Аудит §7.4), покрытый тестом целостности `src/shared/config/release-status-registry.test.ts`.
- [x] `docs/current-state.md`: обновлён до фактического состояния `v1.0.12 RC` (Sprint 0–4 + §§9–11, `npm run gate`, SBOM, `analyze:bundle`, исправлена устаревшая запись о `myload/ARC_TTS_normalizer.py`).
- [x] `docs/STATISTICS.md`: разделяет synthetic test и real Windows multi-process soak (§1.4) и фиксирует замеры бандла (§3).
- [x] `docs/PROJECT_RELEASE_ROADMAP.md`: синхронизирован заголовок статуса гейтов G1–G8 с Sprint 0–4 без создания конкурирующей карты.
- [x] Инварианты §10 закреплены тестами `src/shared/config/bundle-analyzer.test.ts` и `src/shared/config/release-status-registry.test.ts`.

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

**Статус §11 (21.11.2026) — IMPLEMENTED (инструментарий и замеры бандла в Linux) / NOT RUN (живой Windows hardware baseline):**
- [x] Создан zero-dep анализатор `scripts/analyze-bundle.cjs` (`npm run analyze:bundle` → `dist/bundle-report.json`) + тесты `src/shared/config/bundle-analyzer.test.ts` (2/2).
- [x] Зафиксированы реальные сжатые размеры в `docs/STATISTICS.md` §3 и свежем `dist/bundle-report.json` (53 файла в `out/`: `8 892.31 KB` raw / `2 014.81 KB` gzip / `1 848.73 KB` brotli; `index-*.js`: `3 963.23 KB` raw → `695.82 KB` brotli; `SettingsPanel`: `799.64 KB` raw → `124.60 KB` brotli; `whisper.worker`: `1 401.06 KB` raw → `230.37 KB` brotli; добавлены gzip/brotli всех 9 lazy-чанков).
- [x] Подтверждён lazy-loading всех 9 тяжёлых представлений и `whisper.worker` (`allHeavyViewsLazyLoaded: PASS`) и отсутствие 17 МБ мёртвых скриншотов в сборке (`zeroForbiddenDeadAssets: PASS`), без спекулятивного переписывания.
- [ ] Живой замер cold/warm startup, RAM/VRAM/CPU дерева процессов и Eco mode на целевом слабом Windows-ПК — `NOT RUN` (выполняется через `scripts/windows-soak-harness.ps1`).

---

# 12. Release Acceptance — итоговые условия готовности

Релиз не считается готовым, пока не выполнены все обязательные пункты.

## 12.1. Build / CI

- [x] Linux validation job green. — **VERIFIED** ([Run #8, job `133526372152`](https://github.com/DdepRest/ARC/actions/runs/43931936756/job/133526372152))
- [x] Windows validation job green. — **VERIFIED** ([Run #8, job `133527116076`](https://github.com/DdepRest/ARC/actions/runs/43931936756/job/133527116076))
- [x] NSIS packaging green. — **VERIFIED** ([Run #8, job `133527116076`](https://github.com/DdepRest/ARC/actions/runs/43931936756/job/133527116076))
- [x] Portable packaging green. — **VERIFIED** ([Run #8, job `133527116076`](https://github.com/DdepRest/ARC/actions/runs/43931936756/job/133527116076))
- [x] CI не требует `GH_TOKEN` для обычной сборки. — **VERIFIED** ([Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756))
- [x] NSIS/Portable имеют уникальные имена. — **VERIFIED** (`ARC-Setup-1.0.12-x64.exe`, `ARC-Portable-1.0.12-x64.exe`)
- [x] Оба EXE загружены как workflow artifacts. — **VERIFIED** ([Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756), `arc-windows-x64-a3cd3ecb6d249eabd354023e0e5e1c220db74bb0`)
- [x] SHA-256 записаны и проверены. — **VERIFIED** (`dist/SHA256SUMS.txt` в [Run #8](https://github.com/DdepRest/ARC/actions/runs/43931936756))
- [ ] Build commit SHA соответствует source commit. *(IMPLEMENTED в `S3-10`: `build-metadata.resolver.ts` + `build-metadata.ts` + `BUILD_COMMIT=${{ github.sha }}` + `ARC_REQUIRE_BUILD_COMMIT=true` в `ci.yml`/`release.yml`, удалён `'9048f71'`, `DiagnosticsService` и `DiagnosticsSection.vue` показывают версию и коммит; Linux-сборка/gate и 128 файлов / 887 тестов пройдены, проверка на Windows EXE из GitHub Actions `NOT RUN`)*
- [ ] Release publishing запускается только явно. *(IMPLEMENTED в `S0-04`: `.github/workflows/release.yml`, ожидает прогона на GitHub Actions)*

## 12.2. Установка / first run

- [ ] Clean Windows 10 test.
- [ ] Clean Windows 11 test.
- [ ] NSIS install/uninstall.
- [ ] Portable run.
- [ ] Paths with spaces/Cyrillic. *(IMPLEMENTED: `createVenvAsync` в `python_server.service.ts` переведён с `exec()` на shell-free `spawn(..., { shell: false, windowsHide: true })`, исключая слом кавычек/кириллицы в `cmd.exe`; `env-degradation-and-paths.test.ts` 8/8 подтверждает работу реального `python3` + `tts_dict_loader.py` (`immutable=1` без WAL/SHM), `better-sqlite3` миграций/`VACUUM INTO`, `path-guard` и `runSystemTtsProcess` в путях с пробелами и кириллицей; живой Windows QA `NOT RUN`)*
- [ ] No Python scenario. *(IMPLEMENTED: добавлен `recordPythonNotFound()` в `python_deps.util.ts` + вызов при `!resolvePythonExe()` в `python_server.service.ts`; зафиксирован структурированный `ERROR`/`python_not_found` без spawn, `VoiceSetupService` отдаёт `python-env: runtime_missing`, `env-degradation-and-paths.test.ts` + `python_server.service.test.ts` пройдены на Linux; живой Windows без Python `NOT RUN`)*
- [ ] No FFmpeg scenario. *(IMPLEMENTED: `probeFfmpegAsync` в `python_deps.util.ts` и `get_ffmpeg_bin()` в `silero_server.py` проверяют `isFile()` для `ARC_FFMPEG_PATH`, а `self_test_dsp()` использует `get_ffmpeg_bin()` и чисто переходит в raw WAV mode без ложного `selftest FAILED`; `ensureDependenciesAsync` возвращает `DEGRADED` с `coreReady: true` без блокировки запуска (`env-degradation-and-paths.test.ts` + `python_deps.util.test.ts` + `python_server.service.test.ts` на Linux); живой Windows без FFmpeg `NOT RUN`)*
- [ ] No models scenario. *(IMPLEMENTED в `S2-06`: `VoiceSetupCard.vue` + `voiceSetupService.getStatus()` показывают точные размеры/источники и не запускают фоновые загрузки без выбора пользователя (`voice-setup.service.test.ts` 5/5 на Linux); живой Windows QA `NOT RUN`)*
- [ ] Offline/slow network scenario. *(IMPLEMENTED: `offline-degraded-usability.test.ts` 4/4 подтверждает сохранение локальных модулей SQLite/Tasks/Memory/Objectives при офлайн AI и Voice, честный `local_template` fallback при `ENOTFOUND`/таймауте, блокировку Edge TTS в `forcedOfflineMode` и авто-восстановление карантина провайдера; живой сетевой сценарий на Windows `NOT RUN`)*
- [ ] No surprise large downloads. *(IMPLEMENTED в `S2-06`: отключены авто-скачивание STT и авто-создание Python venv/pip/Silero при `ready-to-show` и `startListening`; unit-тесты на Linux пройдены, живой Windows QA `NOT RUN`)*
- [ ] Download progress uses real values. *(IMPLEMENTED в `S2-06`: реальные `bytes_done`/`total_bytes`, удалён фейковый fallback `235 MB`, `неизвестен` при `totalBytes === 0`, ETA только после `>= 2` замеров скорости; unit-тесты пройдены на Linux)*
- [ ] Cancel leaves no partial final asset. *(IMPLEMENTED в `S2-03` / `S2-06`: staging + `AbortController` для STT и Silero TTS)*

## 12.3. Data / Security

- [ ] Secret Vault success only after durable verified write. *(IMPLEMENTED в `S1-01`: unit/негативные тесты пройдены на Linux, ожидает Windows CI / DPAPI)*
- [ ] Migration retains old vault until new vault verified. *(IMPLEMENTED в `S1-01`: unit/негативные тесты пройдены на Linux, ожидает Windows CI / DPAPI)*
- [ ] Sandbox blocks symlink/junction/reparse escapes. *(IMPLEMENTED в `S1-02`: unit/негативные тесты пройдены на Linux, ожидает Windows CI)*
- [ ] Shell allowlist exact; unknown actions deny. *(IMPLEMENTED в `S1-03`: unit/негативные тесты пройдены на Linux, ожидает Windows CI)*
- [ ] Shell timeout/cancel kills process tree. *(IMPLEMENTED в `S1-03`: unit/негативные тесты пройдены на Linux, ожидает Windows CI)*
- [ ] Approval validates sender and pending ID. *(IMPLEMENTED в `S1-04` + доусилено в `S3-03` каноническим `trustedFileRoot` и Electron origin/sandbox/CSP boundary: unit/негативные тесты пройдены на Linux, живой Electron/Windows QA `NOT RUN`)*
- [ ] Tasks retain dirty state until SQLite ACK. *(IMPLEMENTED в `S1-05`: unit/негативные тесты пройдены на Linux, ожидает живой Electron/Windows QA)*
- [ ] DB migrations tested from supported prior versions. *(IMPLEMENTED в `S3-01`: `database-migrations.registry.ts` (`v1`–`v8`), `PRAGMA user_version` + `schema_migrations`, verified `VACUUM INTO` snapshot, rollback/drift/`DB_SAFE_MODE` тесты на реальном `better-sqlite3` пройдены на Linux; живой Windows upgrade QA `NOT RUN`)*
- [ ] Corrupt DB recovery/safe mode does not silently erase data. *(IMPLEMENTED в WAL-quarantine + `S3-01`: карантин и pre-migration snapshot сохраняют исходные файлы и включают read-only `DB_SAFE_MODE`; живой Windows QA `NOT RUN`)*
- [ ] ZIP export never leaks raw secrets, even for malformed provider config. *(IMPLEMENTED в `S3-07`: fail-closed `backup-redaction.util.ts` с безопасным redacted placeholder и диагностикой в `manifest.json`, рекурсивная очистка nested/alternate секретов, pre-read лимиты `ZIP_ARCHIVE_LIMITS` + `lstat` symlink skip + `CRC-32`/ZIP-bomb защита в `zip-codec.util.ts`/`zip-writer.ts`; unit/SQLite тесты на Linux пройдены, живой Windows Electron QA `NOT RUN`)*
- [ ] Reset accurately describes its destructive scope. *(IMPLEMENTED в `S3-08` по утверждённому Варианту A: единый `reset-policy.ts`, раздельные действия сброса UI и данных приложения в `SystemResetBlock.vue` / `StorageDataSection.vue`, явные списки удаляемого и сохраняемого с защитой `secrets.json`/`logs/`/`csp-violations.log`/`backups/`/`tts_dicts/`/`tts-policy.json`, runtime-валидация `system:reset-data`, guard перекрытия `%APPDATA%` и честный отказ без перезапуска при `EBUSY`; 126 файлов / 869 тестов на Linux пройдены, живой Windows Electron QA `NOT RUN`)*

## 12.4. Voice / Models / Privacy

- [ ] TTS dictionaries load in packaged app. *(IMPLEMENTED в `S2-01`: unit + Python loader/text_prep тесты пройдены на Linux; живой Windows packaged `win-unpacked`/NSIS/Portable QA `NOT RUN`)*
- [ ] Python dependency readiness is truthful. *(IMPLEMENTED в `S2-02`: unit/integration + реальный Python probe тесты пройдены на Linux; живая Windows x64 `pip` установка / `win_amd64` runtime QA `NOT RUN`)*
- [ ] STT worker starts, recovers and stops correctly. *(IMPLEMENTED: добавлен идемпотентный `sttService.shutdown()` с вызовом из `window-all-closed` и `before-quit` в `src/main/index.ts` вместе с `sherpaDownloaderService.cancelAllDownloads()`, per-process `WeakSet` защиты от гонки `intentionalRestart`, очистка аудио-очереди и честный `setupState: 'failed'`/`lastInitError` при crash-loop (3 падения за 30с); проверено `stt-lifecycle.test.ts` 5/5 + `stt.service.test.ts` 10/10 на Linux, живой Windows worker QA `NOT RUN`)*
- [ ] STT fallback status is correct. *(IMPLEMENTED в `S2-07`: честная разница `missing`/`consent_required`/`checking`/`downloaded`/`verified`/`loaded`/`active` в `stt.service.ts` + `useSttStatus.ts` + `voice-status.ts`; живой Windows worker QA `NOT RUN`)*
- [ ] Model manifest/checksum verification passes. *(IMPLEMENTED в `S2-04`: `model-supply-chain.manifest.ts`, `verifyStagedFileDigest`, strict `v5_6_ru.pt` SHA-256, `PYTHON_TTS_BUNDLE_MANIFEST`, `unverified_manual` vs `verified` vs `tampered`; тесты на Linux пройдены; живой HF/Silero + Windows runtime QA `NOT RUN`)*
- [ ] Redirect allowlist enforced. *(IMPLEMENTED в `S2-04`: `TRUSTED_MODEL_HOSTS` HTTPS-only per-hop + SSRF/DNS rebinding guard; HTTP-тесты на Linux пройдены; живой HF/CDN QA `NOT RUN`)*
- [ ] Cancellation works for each model type. *(IMPLEMENTED в `S2-03`: реальные HTTP/FS-тесты отмены `zipformer-ru`, `whisper-small`, `silero-vad`, `gigaam-ctc`, targeted/global cancel и store `cancelled` пройдены на Linux; живая отмена в Windows Electron UI / реальном HF `NOT RUN`)*
- [ ] Cloud TTS fallback off by default and requires explicit opt-in. *(IMPLEMENTED в `S2-05`: `allowCloudTtsFallback` default/migration `false` в `userData/tts-policy.json` и `settings.store.ts`, `tts.allow_cloud_fallback` UI toggle с явным дисклеймером и sync в Main; unit-тесты на Linux пройдены, живой Windows SAPI/Edge QA `NOT RUN`)*
- [ ] Text does not leave device in local-only mode. *(IMPLEMENTED в `S2-05`: strict local fallback `Silero → SAPI`, блок Edge TTS при `allowCloudTtsFallback = false` и при `forcedOfflineMode = true`, отсутствие сырого текста в TTS-логах `MacroExecutor`/`ui.store`; unit-тесты на Linux пройдены, живой Windows QA `NOT RUN`)*

## 12.5. UX / Accessibility

- [ ] No false green/active states. *(IMPLEMENTED в `S2-07` для Voice/Model Setup и в `S3-04` для `ModulesView` / `system:modules` / `mock-database.ts`: единый `ModulesCapabilitySnapshot`, честный `unknown` при недоступном IPC, запрет `ready` для `planned`; живой Windows UI QA `NOT RUN`)*
- [ ] No infinite loading after failure/cancel. *(IMPLEMENTED в `S2-03` / `S2-07`: `cancelled` и `failed` выводят ресурс из `downloading`, timeout `FALLBACK_STT_MODELS_LIST` ставит `checking` до прихода `stt:models-updated`; живой Windows UI QA `NOT RUN`)*
- [ ] No misleading AI/template source label. *(IMPLEMENTED в `S3-05`: `source: 'llm' | 'local_template'` + `fallbackReason` в `objective-decomposer.service.ts`/`tasks:ai-decompose`/`useAiDecomp.ts`, `'warn'` `SyncToast`, блокировка повтора после LLM и retry поверх шаблона в `TaskContextRail.vue`/`TaskItem.vue`; живой Windows UI & LLM QA `NOT RUN`)*
- [ ] First Run Wizard awaits required saves. *(IMPLEMENTED в `S3-06`: async `skipWizard()`/`nextStep()`/`finishWizard()` с single-flight lock, разделением critical AI/storage vs optional voice/graphics, verified flush `arc_state_settings` с откатом при ошибке, честными статусами `saving`/`saved`/`error` + `Повторить` и `'warn'` toast; unit/SFC тесты на Linux пройдены, живой Windows Electron UI & restart QA `NOT RUN`)*
- [ ] Main workspaces verified at target resolutions/scaling. *(Протокол `docs/WINDOWS-RELEASE-QA-PROTOCOL.md` §S4-04 подготовлен; живой Windows прогон `NOT RUN`)*
- [ ] ApprovalDialog keyboard/focus flow verified. *(IMPLEMENTED в §9: focus save/restore, полный Tab/Shift+Tab trap, Escape, focus-visible кольца, структурированные `initiator`/`executable`/`cwd`/`shellMode`/`consequences` и реальный `timeoutMs`; `ApprovalDialog.test.ts` 7/7 + `ui/ApprovalDialog.test.ts` 4/4 на Linux; живая проверка в окне Windows `NOT RUN`)*
- [ ] Provider Master–Detail draft/save/switch behavior verified. *(IMPLEMENTED в §9: `useProviderInspectorDraft.test.ts` 4/4 покрывает `clean→dirty→saving→saved`, switch guard/discard/cancel/save, ошибки URL/IPC, сохранение `••••••••••••••••`, `enabled` merge и 7 статусов; живая проверка в окне Windows `NOT RUN`)*
- [ ] Modules state derives from a unified capability registry. *(IMPLEMENTED в `S3-04`: `modules-capability.registry.ts` + `ModulesCapabilityService` + `system:modules` + `system.store.ts` + `ModulesView.vue`; unit/IPC/SSR тесты пройдены на Linux, живой Windows UI QA `NOT RUN`)*

## 12.6. Stability / Distribution

- [ ] 2–4 hour real process-tree soak on Windows. *(Harness и анализатор `IMPLEMENTED` в `S4-01`: `scripts/windows-soak-harness.ps1` + `scripts/soak-report-analyzer.cjs`; живой 2–4ч прогон на Windows `NOT RUN`)*
- [ ] No orphan Python/STT process after close/restart. *(`sttService.shutdown()` + `sherpaDownloaderService.cancelAllDownloads()` + `PythonServerService.stop()` подключены в `window-all-closed`/`before-quit` в `src/main/index.ts`, проверка `-GracefulStopAtEnd` и analyzer gate `IMPLEMENTED` в `S4-01`; живой Windows прогон `NOT RUN`)*
- [ ] Memory reaches stable plateau after warmup. *(OLS slope gate `IMPLEMENTED` в `S4-01`; живой Windows прогон `NOT RUN`)*
- [ ] Sleep/resume tested. *(IMPLEMENTED в коде и тестах: `powerMonitor.on('resume'/'unlock-screen')` + `MacroSchedulerService` catch-up `<=15м` без дублирования и пропуск устаревших `>15м` проверены в `runtime-resilience.test.ts` на Linux; живой Windows sleep/resume QA `NOT RUN`)*
- [ ] Audio device disconnect/reconnect tested. *(IMPLEMENTED в коде и тестах: добавлены подписка `devicechange`, fallback при `OverconstrainedError`/`NotFoundError`, обработчик `track.onended` и освобождение Blob URL в `VoiceAudioSection.vue` и `useMicTest.ts`, проверено `useMicTest.test.ts` 3/3 на Linux; живое отключение USB-гарнитуры на Windows `NOT RUN`)*
- [ ] Network loss/recovery tested. *(IMPLEMENTED в коде и тестах: `runtime-resilience.test.ts` подтверждает выход `ProviderHealthManager` из 30с cooldown и 10м карантина без рестарта, а также реальный TCP-обрыв (`socket.destroy`) посреди загрузки модели без битого финального файла с успешным повтором после возврата сети; живой Windows QA `NOT RUN`)*
- [ ] Upgrade preserves user data. *(Сборщик `scripts/windows-qa-preflight.ps1` + компаратор `scripts/compare-qa-snapshots.cjs` + протокол `S4-02` `IMPLEMENTED`; живой Windows прогон `NOT RUN`)*
- [ ] Uninstall preserves user data according to declared policy. *(`deleteAppDataOnUninstall: false` в `package.json` + компаратор `scripts/compare-qa-snapshots.cjs` + протокол `S4-02`; живой Windows прогон `NOT RUN`)*
- [x] Licenses and model terms verified. *(IMPLEMENTED в `S4-05`: `THIRD_PARTY_NOTICES.md` с npm/Python/шрифтами `OFL-1.1`/иконками и явной некоммерческой границей Silero `CC BY-NC-SA 4.0`, проверено `sbom-provenance.test.ts`)*
- [x] SBOM generated. *(IMPLEMENTED в `S4-05`: `npm run generate:sbom` → CycloneDX 1.5 `dist/sbom-cyclonedx.json` на 455 компонентов: 432 npm, 11 Python, 6 ML-моделей, 6 локальных ассетов; интегрировано в `ci.yml` и `release.yml`)*
- [ ] Release notes, checksums, metadata and known issues prepared. *(IMPLEMENTED в `S4-06`: `docs/release-notes-v1.0.12-rc.md`, `docs/WINDOWS-QA-HANDOFF.md`, `docs/release-status-registry.json`, `CHANGELOG.md`, `ci.yml`, `release.yml`, честный статус `UNSIGNED`; финальная подпись, прикрепление живого Windows QA отчёта и release approval владельца `NOT RUN`)*

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
