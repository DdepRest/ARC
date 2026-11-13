# A.R.C. — Agent Instructions

## 1. Role

You are working on an existing project: **A.R.C. (Autonomous Reactor Core)**.

A.R.C. is a local-first Windows AI environment built around a living 3D Reactor. It is **not** a generic SaaS dashboard, a clone of ChatGPT, or a conventional admin UI.

Primary rule:

> **Preserve the existing A.R.C. architecture, identity, and behavior unless the user explicitly asks to change them.**

Do not redesign, refactor, or "improve" unrelated parts of the project while working on a specific task.

---

## 2. How to Work

Follow this lightweight cycle:

**Understand → Inspect relevant context → Plan → Change → Verify → Report**

Before changing code:
- Identify the files and subsystem actually involved.
- Read the relevant current documentation and nearby code.
- Check existing patterns before introducing new ones.
- For non-trivial changes, state a short plan before editing.

Do **not** scan or rewrite the entire repository unless the task requires it.

After changes:
- Verify imports/references and relevant tests or checks when available.
- Do not claim a build/test passed unless it was actually run.
- Report changed files, checks performed, and any remaining risks.

---

## 3. Protected Areas — DO NOT CHANGE WITHOUT EXPLICIT REQUEST

### Reactor

The 3D Reactor is an established visual and architectural core of A.R.C.

Do not redesign, replace, simplify, or convert it to 2D/SVG.

Protected area includes:
- `src/renderer/components/reactor/**`
- `ReactorCore.vue`
- `useReactor3D.ts`
- reactor geometry/materials/lighting/particles/postfx/state-driver/theme
- related Reactor tests and rendering logic

Preview/WebGL limitations are environment issues. Do not replace the Reactor with a fake or flat implementation to work around preview limitations.

> **Зафиксированный долг по логотипу ядра**: Размытость читаемости логотипа A.R.C. — известный долг, НЕ регрессия; чинится отдельным ТЗ по профилю рендера/фильтрации текстур, НЕ в рамках заморозки защищённой зоны и НЕ самодеятельно. Защищённая зона заморожена до живого дампа `flag=false`.

### Other protected components

Do not modify these without a direct, explicit task:
- `src/renderer/composables/useVoice.ts`
- `src/main/services/built-in-llm.service.ts`
- `src/renderer/features/commands/composables/useMacroEditor.ts`
- `src/main/services/objective/ObjectiveEngine.ts`
- `src/renderer/components/panels/BottomBar.vue`
- VoiceFSM / critical voice state logic
- Pinia stores when the task does not require them

### Scope-locked workspaces

Do not redesign or refactor Chat or Tasks unless the user explicitly asks for it:
- Chat workspace
- Tasks workspace
- their core views, composables, and supporting components

---

## 4. Architecture Rules

Respect the existing separation:

- `src/main/**` — Electron/main-process logic, IPC, services
- `src/renderer/**` — Vue/UI/client logic
- `src/shared/**` — shared contracts, types, utilities

IPC handlers belong in `src/main/ipc/` and should remain thin, delegating real work to services.

Use Pinia for genuine shared/global state. Use composables for local state or encapsulated UI/business logic.

Do not duplicate the same source of truth across multiple stores.

Follow existing project patterns and primitives before introducing new abstractions.

Do not change dependencies, package versions, build tooling, or architecture unless explicitly requested.

---

## 5. Code Size / Modularity

Keep new logic modular.

Target limits from the project:
- Logic/UI components/services/composables/utilities: **≤ 400 lines**
- Data/registry/store/config files: **≤ 800 lines**

Do not perform unrelated refactors merely to satisfy these limits. When creating new code, structure it so the limits are respected from the start.

---

## 6. A.R.C. Visual Constitution

Preserve the established visual DNA:

- deep black space background;
- living 3D Reactor as the central visual/core element;
- restrained A.R.C. red;
- dark glass and layered depth;
- precise technical / sci-fi HUD character;
- Human Layer: readable sans-serif typography;
- Machine Layer: restrained monospace technical metadata;
- no generic SaaS-card composition;
- no blue gaming-neon aesthetic;
- no redesign into a generic AI/admin dashboard.

CORE, CHAT, TASKS, OBJECTIVES, FILES, MEMORY, COMMANDS, AUDIO/VISION, MODULES, and SETTINGS should retain their existing functional character and hierarchy.

### Правило защёлки (Surface Tokens Latch Rule)

Литеральные hex и rgb в стилях компонентов запрещены для фонов поверхностей.
Цвета поверхностей задаются исключительно через `var(--токен)` из `tokens.css` (непрозрачная лестница v3.0: `--arc-frame: #070707`, `--arc-plane: #0A0A0A`, `--arc-block: #101010`, `--arc-rail: #080808`; токены пузырей чата, статические светлоты 16/18, граница: только MessageBubble).
Нарушение = падение сборки (скрипт `check-visual-constitution.js` проверяет соблюдение правила).

### Правило защёлки акцента (Accent Tokens Latch Rule)

В компонентах запрещены литеральные Tailwind-классы и hex/rgb красного акцента (`text-red-[0-9]`, `border-red-[0-9]`, `bg-red-[0-9]`, `ring-red-[0-9]`, `rgba(239, 68, 68, ...)`, `#ef4444` вне whitelist).
Акцент задается исключительно через `var(--accent)`, `var(--accent-rgb)` или `var(--arc-text-primary)` (для активного нейтрала). Статусные цвета — строго `var(--status-*)`.
Счётчик `literalAccentClasses` в `scripts/check-visual-constitution.js` блокирует сборку при любом росте.
Остаточный долг в уже принятых пространствах (Settings, Commands, Memory, Files, Modules) гасится плановым sweep-ом Фазы 6; до Фазы 6 переключение темы даёт локальную радугу в непроведённых узлах — это известный зафиксированный долг, не регресс.
В каждом новом чанке Фазы 5 число литералов акцента в файлах чанка обязано быть строго равно 0, а бейзлайн `literalAccentClasses` снижается на дельту чанка.

### Конституционная директива синхронизации baseline

Файл `visual-constitution-baseline.json` пересинхронизируется с живым сканом в конце КАЖДОГО прогона (чанк или хотфикс). Отставание baseline-файла от фактического замера запрещено. Расхождение «живой скан ≠ baseline-файл» = провал приёмки, сборка не подписывается.

### Конституционное правило стекла (Glass & Matte Rule)

«Стекло живёт над статикой и на кромках; мат живёт над анимацией и под текстом».
Любая будущая правка стекла сверяется с ней:
- blur и альфа запрещены над canvas в плоскости чтения, строках и блоках настроек;
- вложенная прозрачность глубже одного уровня запрещена;
- одновременно живых backdrop-filter ≤ 6.

### Правило шкалы Hero-показания прибора (Hero Metric Scale Rule, v3.4)

Шкала hero-показания прибора: `26px/600 mono`, единица `11px mono hint` с обязательным пробелом (например, «60 fps», «14 ms»).
Разрешено не более одного hero-показания на прибор и только при одиночном числовом ответе на главный вопрос прибора (ЯДРО: частота кадров FPS; МАРШРУТ: задержка latency).
Амандмент шкалы (Focus Sprint): `focus-display 48px mono tabular`, граница: только FocusSprintView в режиме активного спринта (обоснование: фуллскрин-концентрация оператора, часы таймера = главный интерфейс спринта).
Остальные метрики прибора оформляются вторичной шкалой: 16px secondary с тиками (`ArcTickBar`) либо 14px/12px текстом.
Приборы без одиночного числового фокуса (ГОЛОС, СОБЫТИЯ, МЕДИА, СРЕДА) hero-показание не получают.
Единственность на экран сохраняется: по-прежнему одна цифра FPS и одна задержка на весь интерфейс; hero не создаёт дублирования.

Do not change a component merely because it could look different. Every UI change must solve a concrete UX problem.

---

## 7. UX Principles

Prefer:
- clear functional boundaries;
- obvious controls;
- strong information hierarchy;
- calm visual density;
- meaningful negative space;
- real data instead of decorative/fake telemetry;
- existing A.R.C. primitives and design tokens.

Avoid:
- unnecessary floating widgets;
- decorative pseudo-data;
- heavy borders;
- visual noise;
- generic dashboard patterns;
- changes that obscure or diminish the Reactor.

For UI work, work screen-by-screen rather than redesigning many spaces at once.

### Продуктовое правило приборов дока

Виджет дока существует, только если отвечает на один из трёх вопросов:
1. Как себя чувствует ядро?
2. Что ядро делает сейчас?
3. К каким каналам подключено?

Иначе — это не прибор, а наклейка; он подлежит удалению.

### Правило инварианта фолбэка и детекции (Fallback & Live-Render Rule)

Инвариант фолбэка меряется по факту отрисовки (canvas/RAF), а не по значению флага.
Дамп призрака обязан переживать перезагрузку (персист в localStorage) и быть читаемым без консоли (HUD-бейдж на ядре).
Единое производное состояние «3D live» питает кольца, бейдж и ловушку — отдельных флагов-истин о рендере быть не должно.

### Правило замера поверхности (Surface Measurement Inset Rule)

Точки пипетки по чипам, бейджам и элементам берутся с фиксированным инсетом от границы элемента (центр тела), а не произвольными координатами.
Замер поверхности = центр тела с инсетом ≥2px от любой границы; попадание на 1px hairline-рамку = ошибка замера, не уровень лестницы.

---

## 8. Environment Compatibility

The canonical application targets Windows/Electron, but the AI development environment is Google AI Studio (Linux container).

Do **not** assume:
- `C:\...` paths;
- local Windows-only services;
- `.bat` files;
- PowerShell environments;
- local Python virtual environments;
- locally installed models;
- local runtime processes.

Do not execute or invent environment-specific setup steps unless the current task explicitly requires them and the environment supports them.

For AI Studio environment context and rules, consult `docs/AI-STUDIO-CONTEXT.md`.
For local Windows desktop development procedures, consult `docs/windows-local-dev.md`.

---

## 9. Documentation & Hierarchy

Document Priority Hierarchy:
1. `AGENTS.md` — rules of agent behavior and execution cycle.
2. `GEMINI.md` — project context, runtime constraints, and core directives.
3. `docs/AI-STUDIO-CONTEXT.md` — AI Studio-specific environment context.
4. Canonical documentation under `docs/` (`current-state.md`, `architecture.md`, `STATISTICS.md`, etc.).
5. Historical documents under `docs/archive/` (historical documents never supersede active canonical documents).

Local Windows desktop development procedures are in `docs/windows-local-dev.md` (developer reference manual, not an AI Studio execution instruction).

When documentation conflicts, prefer the most current/canonical project document and the actual current source code. Do not rewrite documentation merely to make it shorter.

Update documentation only when the task changes behavior, architecture, contracts, or an explicitly documented rule.

---

## 10. Safety and Scope

Never:
- delete or replace `.git`;
- remove files just because they look old without checking references;
- rewrite large portions of the project for convenience;
- change unrelated subsystems;
- remove tests to make changes easier;
- replace working behavior with placeholders unless explicitly requested.

Before deleting a file, check imports, dynamic references, registries, IPC names, configuration references, tests, and documentation references.

When uncertain, preserve the file and ask.

---

## 11. Self-Check

Before finalizing a change, verify:

1. Did I solve the requested problem?
2. Did I avoid unrelated changes?
3. Did I preserve A.R.C.'s architecture and identity?
4. Did I preserve protected areas?
5. Did I follow existing patterns?
6. Did I verify the relevant behavior?
7. Did I update documentation only when appropriate?

---

## 12. Final Report

At the end of each completed task, provide a concise report in Russian:

**Сделано**
- what was changed

**Проверки**
- tests/checks actually performed

**Риски**
- anything not verified or environment-limited

Do not invent successful checks.

### Правило отчётности (Grep Verbatim Rule)

Пункты приёмки, содержащие grep, принимаются ТОЛЬКО дословным выводом команды; prose-замена вывода = пункт не закрыт.

### Правило расчёта прогноза и отчётности дельт (Forecast Arithmetic Rule)

Прогноз дельт в ТЗ под-чанка = арифметическая сумма строк таблицы инвентаризации по файлам этого под-чанка, не оценка на глаз.
При расхождении факт ↔ прогноз по любому счётчику отчёт обязан отметить его явно с указанием причин расхождения, а не только рапортовать «сошёлся на 100%» по совпавшим.

---

## Core Principle

> **A.R.C. is an existing product, not a blank template.**
>
> Understand the existing system first. Make the smallest change that solves the user's actual request. Preserve the Reactor, architecture, product identity, and established UX philosophy.
