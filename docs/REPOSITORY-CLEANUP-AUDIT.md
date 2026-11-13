# A.R.C. — Отчёт об очистке репозитория и аудите агентской системы

**Дата:** 27 сентября 2026 г.  
**Контекст:** Санитарная очистка репозитория, архивирование завершённых этапов и дубликатов, аудит агентских инструкций (`AGENTS.md`, `GEMINI.md`, `AGENTS-WINDOWS-LOCAL.md`, `docs/AI-STUDIO-CONTEXT.md`).  
**Статус исходного кода:** Исходный код `src/**`, системные сервисы, тесты, IPC, реестры и 3D Reactor не изменялись (0 диффов в `src/**`).

---

## 1. Cleanup (Очистка репозитория)

Все файлы перед действиями классифицированы по статусам (`CURRENT / REFERENCE / HISTORICAL / DUPLICATE / OBSOLETE / UNKNOWN`). Принцип: *«Очистить проект, но не потерять его память. Сначала доказать, что файл устарел, затем удалять/архивировать»*.

### 1.1 Что удалено (OBSOLETE / TRASH / DEAD STUBS)
Удалены исключительно подтверждённые одноразовые патч-скрипты, отладочный мусор и пустые файлы-заглушки:

1. `/chat_response.txt` — Одноразовый текстовый артефакт вывода предыдущего агента (отчёт по оптимизациям v1.0.2-d5). Не используется ни кодом, ни документацией.
2. `/replace.js` — Временный Node.js скрипт однократной текстовой замены в `PresetCatalog.vue` (нарушал прямой запрет на патч-скрипты).
3. `/find_empty_catches.js` — Одноразовый вспомогательный скрипт поиска `catch`-блоков.
4. `/update_textures.py` — Одноразовый Python-скрипт замены цветов в `reactorTextures.ts`.
5. `/search-node-llama.mjs` — Разовый отладочный скрипт поиска строки ошибки в `node_modules`.
6. `/docs/UI-MASTER-TZ.md` — Пустая заглушка из 2 строк вида `[СЮДА ВСТАВЬ ТЕКСТ МАСТЕР-ТЗ...]`. Не содержала полезных данных.
7. `/app/` (директория целиком) — Заброшенная вложенная структура `/app/applet/app/...`, содержащая только файлы `README.md` с текстом `# НЕ РАБОЧАЯ КОПИЯ, заморожена` и устаревшую копию `check-file-sizes.js`.

### 1.2 Что архивировано в `docs/archive/` (HISTORICAL / COMPLETED / DUPLICATES)
Полезные исторические документы, завершённые дорожные карты и дубликаты перенесены в архив для сохранения преемственности:

1. `/voice-rework-spec.md` → `docs/archive/voice-rework-spec-f5tts.md`
   - *Обоснование:* Спецификация F5-TTS на 852 строки, официально заменённая Silero v5.5 (статус `Superseded`, отражено в `CHANGELOG.md` и `docs/adr/tts-replacement-spec.md`). Перенесена из корня в архив.
2. `/PROGRESS.md` → `docs/archive/PROGRESS-v1.2.0-ui.md`
   - *Обоснование:* Полностью завершённый чек-лист спринта «Стекло и живая рама» (100% пунктов отмечены `[x]`).
3. `/docs/ui-etalon/PROGRESS.md` → `docs/archive/ui-etalon-PROGRESS-template.md`
   - *Обоснование:* Незаполненный шаблонный каркас таблицы чанков («Чанк 2 Не начат» и т.д.), потерявший смысл после завершения этапа.
4. `/README_LLM.md` → `docs/archive/README_LLM.md`
   - *Обоснование:* Краткая историческая заметка об обновлении `node-llama-cpp`.
5. `/soak-results.csv` → `docs/archive/soak-results.csv`
   - *Обоснование:* Исходные CSV-замеры soak-теста от 10.09.2026. Все данные полностью сохранены и оформлены в каноническом документе `docs/STATISTICS.md`.
6. `/docs/RELEASE-v1.0.0-checklist.md` → `docs/archive/RELEASE-v1.0.0-checklist.md`
   - *Обоснование:* Чек-лист верификации релиза v1.0.0 (текущая версия системы v1.0.12 / v3.0-ui).
7. `/docs/release-notes-v1.0.0.md` → `docs/archive/release-notes-v1.0.0.md`
   - *Обоснование:* Памятка первого стабильного релиза v1.0.0.
8. `/docs/roadmap.md` → `docs/archive/roadmap-sprints-1-4.md`
   - *Обоснование:* Старая дорожная карта (Спринты 1–4: интеграция метрик ядра, менеджер моделей, RAG-память, песочница целей, адаптивный FPS). Все задачи полностью реализованы в кодовой базе.
9. 15 разрозненных файлов инвентаризации в `docs/ui-inventory/` → `docs/archive/ui-inventory-split/`:
   `00-overview.md`, `01-core.md`, `02-chat.md`, `03-tasks.md`, `04-objectives.md`, `05-commands.md`, `06-memory.md`, `07-modules.md`, `08-files.md`, `09-transcription.md`, `10-vision.md`, `11-settings.md`, `12-fallback-spaces.md`, `duplicates.md`, `routing-glossary.md`.
   - *Обоснование:* Являются точными дубликатами 4 консолидированных документов (`01-overview-and-glossary.md`, `02-core-and-chat.md`, `03-tasks-objectives-commands.md`, `04-service-spaces-and-settings.md`).

### 1.3 Что оставлено специально (CURRENT & REFERENCE)
- `docs/00-index.md` — Актуализирован, устранены висячие ссылки, сформирована структурированная карта документации.
- `docs/current-state.md` — Канонический источник текущего состояния системы (v3.0-ui).
- `docs/architecture.md` — Каноническая архитектура, лимиты 400/800 строк, правила именования.
- `docs/11-ai-self-control-and-autodocumentation.md` — Правила AI-самоконтроля.
- `docs/STATISTICS.md` — Замеры производительности и физические метрики Voice DSP.
- `docs/profiling-guide.md` — Руководство по профилированию DevTools.
- `docs/fps-optimization-analysis.md` — Анализ композитора и рендеринга.
- `docs/adr/tts-replacement-spec.md` — Действующее архитектурное решение по Silero TTS v5.5.
- `docs/ui-inventory/settings-registry.json` — **Критично:** импортируется кодом в `useSettingsSearch.ts`, `useSettingsVisibility.ts` и юнит-тестах. Не перемещался.
- `docs/ui-inventory/01-..` по `04-..` — 4 канонических консолидированных документа инвентаризации.
- `docs/ui-etalon/*` (включая скриншоты `before/` и `debt-baseline.json`) — Используются проверочными скриптами конституции (`scripts/generate_etalons.js`, `check-visual-constitution.js`).
- `user_tampermonkey_script.js` — Интеграционный скрипт для VK Music (зафиксирован в правилах).
- `scripts/*` — Все скрипты сборки, проверки размеров, валидации и симуляции сохранены.
- Корневые файлы конфигурации и запуска Windows (`arc.bat`, `open_latest_log.bat`, `start_app.bat`, `silero_*.py`, `tts_dict_loader.py`).

---

## 2. Agent System Audit (Аудит инструкций)

В соответствии с заданием, файлы `AGENTS.md`, `GEMINI.md` и `AGENTS-WINDOWS-LOCAL.md` в этой итерации **не изменялись**. Ниже приведён подробный анализ выявленных проблем, их причин и конкретных рекомендаций.

### 2.1 Проблемы `AGENTS.md` (в репозитории `AGENTS.MD`)

1. **Проблема:** Фантомная ссылка на несуществующий файл `docs/AI-STUDIO-CONTEXT.md` (строка 175).  
   **Почему:** В разделе 9 «Documentation» указано: *«Treat these as primary project context: ... - docs/AI-STUDIO-CONTEXT.md»*. Однако этого файла физически нет в репозитории. Любой агент, пытающийся следовать инструкции, получает ошибку отсутствия файла.  
   **Что изменить:** Либо создать компактный файл контекста AI Studio (`docs/AI-STUDIO-CONTEXT.md`), либо удалить упоминание из списка обязательных источников.  
   **Приоритет:** ВЫСОКИЙ (P1).

2. **Проблема:** Расхождение этапов жизненного цикла с `GEMINI.md`.  
   **Почему:** В `AGENTS.MD` описан 6-этапный цикл: *«Understand → Inspect relevant context → Plan → Change → Verify → Report»*, тогда как в `GEMINI.md` и `AGENTS-WINDOWS-LOCAL.md` строго регламентирован 8-этапный обязательный цикл: *«Intake → Context → Plan → Execute → Verify → Document → Memory → Report»* с требованием обязательного обновления `docs/current-state.md`. Это сбивает агентов при выборе структуры отчёта.  
   **Что изменить:** Синхронизировать жизненный цикл, явно утвердив единый 8-шаговый цикл A.R.C.  
   **Приоритет:** СРЕДНИЙ (P2).

3. **Проблема:** Устаревшие ссылки на «Stage 2 Scope», «Stage 4 & Stage 5 Scope Lock».  
   **Почему:** В коде уже давно внедрены фазы v1.2.0-ui и v3.0-ui. Ссылки на старые «Stage 2/4/5» из лета 2026 создают путаницу в том, какие границы актуальны сейчас.  
   **Что изменить:** Заменить устаревшие термины этапов на постоянное правило: *«Scope Lock: Рабочие пространства Chat и Tasks являются закрытыми стабильными контурами; их редизайн запрещён без прямого указания архитектора»*.  
   **Приоритет:** СРЕДНИЙ (P2).

### 2.2 Проблемы `GEMINI.md`

1. **Проблема:** Строгий конфликт директивы `Do NOT delete files without explicit confirmation` с задачами очистки и рефакторинга.  
   **Почему:** В разделе 4 указан категорический запрет на удаление любых файлов без отдельного подтверждения пользователя в диалоге. Когда пользователь сам даёт задачу на уборку мусора («Очистить репозиторий от мусора»), агент оказывается в смысловом тупике между пользовательским запросом и системным запретом.  
   **Что изменить:** Уточнить формулировку: *«Do NOT delete application source files (`src/**`), configs, or databases without explicit confirmation. Obsolete temporary artifacts and verified duplicates may be cleaned or archived when explicitly requested by user tasks»*.  
   **Приоритет:** ВЫСОКИЙ (P1).

2. **Проблема:** Отсутствие упоминания о разнице веб-контейнера AI Studio и нативного Windows-окружения.  
   **Почему:** В `GEMINI.md` предписан запуск `npm run build`, но нет предупреждения о том, что нативные C++ модули (`better-sqlite3`, `sherpa-onnx-node`, `node-llama-cpp`) и Python Silero не исполняются в обычном web-runtime без моков. Агенты иногда пытаются «чинить» падение WebGL или отсутствие Electron в браузере.  
   **Что изменить:** Внести краткое правило: *«Web-preview runs in browser sandbox. Native addons, Electron IPC, and WebGL fallbacks must rely on existing mocks (e.g. mock-database.ts); do not modify native core or 3D Reactor to fix sandbox-only limitations»*.  
   **Приоритет:** СРЕДНИЙ (P2).

### 2.3 Проблемы `AGENTS-WINDOWS-LOCAL.md`

1. **Проблема:** Дублирование с `AGENTS.MD` и конфликт языков/инструкций.  
   **Почему:** В корне одновременно существуют `AGENTS.MD` (на английском) и `AGENTS-WINDOWS-LOCAL.md` (на русском, с заголовком `# AGENTS.md`). При этом в `AGENTS-WINDOWS-LOCAL.md` содержатся захардкоженные команды для локальной Windows-машины (`cd C:\A.R.C.Gemini`, `taskkill /IM python.exe`, `.\silero_env\Scripts\Activate.ps1`), которые категорически не работают в Linux/AI Studio.  
   **Что изменить:** Переименовать заголовок `AGENTS-WINDOWS-LOCAL.md` в `# A.R.C. — Инструкция для локальной Windows-разработки (Local Desktop Dev)`, вынести его в документацию (например, `docs/windows-local-dev.md`), чтобы AI-агенты не читали его как основной системный контракт вместо `AGENTS.MD`.  
   **Приоритет:** ВЫСОКИЙ (P1).

2. **Проблема:** Описание устаревших багов в «Известные проблемы».  
   **Почему:** Строки 45–46 гласят: *«Python сервер: Отсутствует надежный механизм автозапуска Python-скрипта вместе с Electron»*. Однако в `python_server.service.ts` и `mainWindow.ts` автозапуск Silero TTS давно успешно внедрён и отслеживается по stdout маркерам `[SILERO SERVER BUILD]`.  
   **Что изменить:** Удалить решённые пункты из списка известных проблем.  
   **Приоритет:** НИЗКИЙ (P3).

### 2.4 Проблемы `docs/AI-STUDIO-CONTEXT.md`

1. **Проблема:** Файл полностью отсутствует в репозитории при наличии прямых ссылок в `AGENTS.MD` и пользовательском запросе.  
   **Почему:** Вероятно, предполагался как сводный контекст ограничений песочницы AI Studio (порт 3000, WebGL в iframe, отсутствие локального Python в браузере, необходимость использования `mock-database.ts`), но не был создан или был утерян.  
   **Что изменить:** Создать файл `docs/AI-STUDIO-CONTEXT.md` со следующим минимальным содержанием:
     - Специфика среды выполнения AI Studio (Linux-контейнер, отсутствие локального Windows Electron рантайма).
     - Правила работы с моками (`src/renderer/bootstrap/mock-database.ts` для IPC в web preview).
     - Запрет на «упрощение» Three.js реактора из-за ограничений виртуализации GPU в браузере.
     - Соответствие команд сборки: `npm run lint` (`tsc --noEmit`), `npm run check-sizes`, `npm run build`.  
   **Приоритет:** ВЫСОКИЙ (P1).

---

## 3. Verification (Проведённые проверки)

В ходе выполнения аудита и очистки были выполнены следующие реальные верификационные тесты:

1. **Проверка целостности исходного кода (`src/**`):**
   - Выполнена проверка Git: в каталогах `src/main`, `src/renderer`, `src/shared` ровно 0 изменённых или удалённых файлов.
   - Защищённые зоны (3D Reactor, Voice, LLM Services, Pinia stores, Tasks, Chat) полностью неприкосновенны.

2. **Проверка отсутствия битых ссылок (Dangling References Check):**
   - Проведён поиск по кодовой базе (`grep`) на предмет импортов удалённых или архивированных файлов.
   - Файл `settings-registry.json` остался на своём исходном месте в `docs/ui-inventory/settings-registry.json` (проверено: импортируется в `useSettingsSearch.ts`, `useSettingsVisibility.ts` и тестах).
   - Все 15 перемещённых split-файлов инвентаризации нигде не импортировались в коде (код использует только `settings-registry.json`).
   - Ссылка на `roadmap.md` в `docs/00-index.md` заменена на актуальную структуру.

3. **Проверка лимитов размеров файлов (`npm run check-sizes`):**
   - Запущен скрипт `scripts/check-file-sizes.js`.
   - Результат: **File size check passed (exit code 0)**.

4. **Проверка типов и синтаксиса TypeScript (`npm run lint`):**
   - Запущен компилятор `tsc --noEmit`.
   - Результат: **0 ошибок**.

---

## 4. Risks & Remaining Observations (Риски и открытые вопросы)

1. **Двойственность AGENTS.MD и AGENTS-WINDOWS-LOCAL.md:**  
   Пока файл `AGENTS-WINDOWS-LOCAL.md` лежит в корне проекта, новые агенты при чтении корня могут путать локальные правила Windows (PowerShell, пути `C:\...`) с кроссплатформенными требованиями. Рекомендуется перенести его в `docs/` на следующем этапе.
2. **Отсутствие физического файла `docs/AI-STUDIO-CONTEXT.md`:**  
   Так как в текущей итерации действовало строгое правило «не менять архитектуру инструкций без согласования», создание `docs/AI-STUDIO-CONTEXT.md` рекомендуется утвердить и выполнить отдельным точечным действием.
3. **Нативные зависимости при сборке в облаке:**  
   `npm run build` выполняет `electron-vite build && npm run check-sizes`. В среде без нативных заголовков Electron полный билд дистрибутива (`npm run pack:win`) требует Windows runner, что нормально для десктопного проекта A.R.C.
