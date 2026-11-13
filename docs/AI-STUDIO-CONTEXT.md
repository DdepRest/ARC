# A.R.C. — Контекст среды AI Studio (AI-STUDIO-CONTEXT.md)

> Данный документ фиксирует контекст исполнения, архитектурные границы и правила работы AI-агента внутри облачной среды Google AI Studio Build.

---

## 1. Что такое A.R.C.
**A.R.C. (Autonomous / Advanced Reactor Core)** — это локально-ориентированная персональная AI-среда под Windows, построенная вокруг «живого» кинетического 3D-реактора.  
A.R.C. — **не** типовой SaaS-дашборд, не клон ChatGPT и не монохромная админка. Это автономный инженерный компаньон с глубокой интеграцией в ОС (шелл, файлы, макросы, голосовой диалог, автономные цели и долговременная память).

---

## 2. Основная архитектура
Кодовая база разделена на три изолированных контура:

1. **`src/main/**` (Electron Main Process):**
   - Системные сервисы (`src/main/services/`): TTS/STT, LLM-провайдеры, песочница (`SandboxedFS`, `PolicyEngine`), автономные цели (`ObjectiveEngine`), память (`DatabaseService`).
   - Тонкие IPC-хэндлеры (`src/main/ipc/*.ipc.ts`): только валидация и делегирование в сервисы.
2. **`src/renderer/**` (Vue 3 + Pinia + Three.js):**
   - Модульные пространства (`src/renderer/features/`): `chat`, `tasks`, `settings`, `memory`, `commands`, `modules`, `transcription`, `vision`.
   - Общие компоненты и дизайн-система (`src/renderer/components/ui/`).
   - Композиция шелла (`CommandCenter.vue`, `BottomBar.vue`, `TitleBar.vue`).
3. **`src/shared/**` (Shared Contracts):**
   - Типы, IPC-каналы (`channels.ts`), утилиты санитайзинга и отказоустойчивости.

---

## 3. Роль 3D-Реактора (Reactor Core)
Центральный 3D-реактор Three.js (`ReactorCore.vue`, `useReactor3D.ts`, модули `reactor-*`) — это визуальное ядро, смысловой центр и аватар системы. Он динамически реагирует на голос, нагрузку CPU/RAM, мыслительные фазы LLM и системные статусы.  
**Запрет:** Любые попытки перевести реактор в 2D/SVG, вырезать шейдеры или заменить заглушками категорически запрещены.

---

## 4. Protected Areas (Неприкосновенные зоны)
Без прямого отдельного запроса архитектора запрещено модифицировать:
- Весь стек 3D Reactor (`src/renderer/components/reactor/**`, Three.js сцену).
- Голосовой FSM и аудио-тракт (`src/renderer/composables/useVoice.ts`).
- Локальный движок моделей (`src/main/services/built-in-llm.service.ts`).
- Редактор макросов (`src/renderer/features/commands/composables/useMacroEditor.ts`).
- Движок автономных целей (`src/main/services/objective/ObjectiveEngine.ts`).
- Нижнюю командную консоль (`src/renderer/components/panels/BottomBar.vue`).
- Стабильные пространства Chat и Tasks (**Scope Lock**).

---

## 5. Visual Constitution (Визуальная философия)
- **Фон:** Глубокий чёрный космос (`#000000`).
- **Стекло и глубина:** Тёмное стекло (`backdrop-blur-xl/2xl`), тонкие структурные кромки (`border-white/5`..`border-white/10`). Никаких глухих монолитных коробок.
- **Фирменный акцент:** A.R.C. RED (`#EF4444`) — используется строго для активных состояний, фокуса, ошибок и реакций ядра.
- **Слои:** Human Layer (чистый гротеск `Inter` для текста) vs Machine Layer (`JetBrains Mono` для таймингов, ID и телеметрии).
- **Честность данных:** Никакой бутафорской телеметрии или случайных шестнадцатеричных счётчиков (`0x0000`).

---

## 6. Специфика среды Google AI Studio
1. **Linux-контейнер vs Windows Target:**  
   Среда сборки AI Studio работает под Linux. Приложение спроектировано для Windows (Electron). Любые локальные Windows-инструкции (`.bat`, PowerShell, пути `C:\...`, `taskkill`) относятся к десктопному рантайму и **не являются инструкциями для исполнения в AI Studio**.
2. **Web-Preview и нативные аддоны:**  
   В браузере (web preview) отсутствуют нативные C++ модули (`better-sqlite3`, `sherpa-onnx-node`, `node-llama-cpp`) и Electron IPC. Для превью в браузере задействованы заглушки в `src/renderer/bootstrap/mock-database.ts`. Ошибки отсутствия нативных аддонов или WebGL-контекста в headless-браузере — это специфика среды, а не баг приложения.
3. **Верификация в AI Studio:**  
   - Проверка типов: `npm run lint` (`tsc --noEmit`).
   - Проверка лимитов размеров файлов (400 строк логика / 800 строк данные): `npm run check-sizes`.
   - Проверка сборки: `compile_applet`.

---

## 7. Где искать актуальную документацию
- `docs/00-index.md` — Главный индекс проектной документации.
- `docs/current-state.md` — Канонический источник текущего состояния системы (активные фичи, релизы, история).
- `docs/architecture.md` — Архитектурные слои, паттерны и правила именования.
- `docs/STATISTICS.md` — Метрики soak-тестов стабильности и Voice DSP.
- `docs/profiling-guide.md` — Инструкция по профилированию в DevTools.
- `docs/ui-inventory/` — Консолидированный реестр пространств и `settings-registry.json`.
- `docs/ui-etalon/` — Визуальная конституция и снимки эталонов.
- `docs/windows-local-dev.md` — Справочник для локальной Windows-разработки (НЕ для AI Studio).
- `docs/archive/` — Исторические материалы (завершённые роадмапы, старые спецификации).
