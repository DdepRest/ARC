# Общий обзор, глоссарий и fallback-пространства (01-overview-and-glossary.md)

> **Объединяет:** `00-overview.md`, `12-fallback-spaces.md`, `routing-glossary.md`.
> **Статус:** Актуален для версии v1.0.12.
> **Основа:** `TAB_REGISTRY` (`src/shared/types/ui.ts`), `HolographicProjectionPanel.vue`, `useSettingsNav.ts`, `WidgetsLayer.vue`, `BottomBar.vue`.
> **Принцип:** Никаких изменений кода во время инвентаризации. Фиксация фактического состояния интерфейса перед редизайном.

---

## Часть I. Сводная таблица пространств A.R.C.

| Пространство (`TabName`) | Лейбл в UI | Статус реализации | Главный компонент | Количество секций / подвкладок | Количество контролов |
|---|---|---|---|---|---|
| `core` | ЯДРО | Активно (Core 3D Canvas) | `ReactorCore.vue`, `BottomBar.vue`, `WidgetsLayer.vue` | 4 слоя (Ядро, Док, Виджеты, Оверлеи) | 18 |
| `chat` | ЧАТ | Активно (Scope Lock) | `ChatView.vue` | 4 секции (Сайдбар сессий, Статусбар, Лента, Инпут-зона) | 16 |
| `tasks` | ЗАДАЧИ | Активно (Scope Lock) | `TasksView.vue` | 5 режимов (List, Matrix, Kanban, Sprint, History) + 3 модалки | 24 |
| `objectives` | ЦЕЛИ | Активно | `ObjectivesView.vue` | 3 секции (Цели, Топология, Диагностика) + 2 модалки | 19 |
| `commands` | КОМАНДЫ | Активно | `CommandsView.vue` | 3 вкладки (Навыки/Макросы, Лаунчер, Настройки) | 17 |
| `memory` | ПАМЯТЬ | Активно | `MemoryView.vue` | 3 блока (Тулбар поиска/фильтров, Сетка узлов, Модалки CRUD) | 14 |
| `modules` | МОДУЛИ | Активно (Системная карта) | `ModulesView.vue` | 2 секции (Активные ядра, Модули в калибровке) + фильтр | 5 |
| `files` | ФАЙЛЫ | Активно | `FilesTabView.vue` | 2 панели (Файловый проводник, Панель предпросмотра) | 6 |
| `transcription`| АУДИО | Активно | `TranscriptionView.vue` | 2 колонки (Конфигурация/GPU/Модели, Консоль/Таймлайн) | 12 |
| `vision` | КАМЕРА | Активно (Фаза 1: Оптика) | `VisionTabView.vue` | 2 блока (Видеопоток с HUD, Статус распознавания) | 2 |
| `settings` | НАСТРОЙКИ | Активно (Центр управления) | `SettingsPanel.vue` | 4 группы, 13 секций | 88 |
| `orchestrator` | ОРКЕСТРАТОР | Fallback-заглушка | `FallbackTabView.vue` | 1 экран ("Модуль в разработке") | 0 |
| `agents` | АГЕНТЫ | Fallback-заглушка | `FallbackTabView.vue` | 1 экран ("Модуль в разработке") | 0 |
| `tools` | ИНСТРУМЕНТЫ | Fallback-заглушка | `FallbackTabView.vue` | 1 экран ("Модуль в разработке") | 0 |
| `skills` | НАВЫКИ | Fallback-заглушка | `FallbackTabView.vue` | 1 экран ("Модуль в разработке") | 0 |
| `architecture` | АРХИТЕКТУРА | Fallback-заглушка | `FallbackTabView.vue` | 1 экран ("Модуль в разработке") | 0 |
| `scenarios` | СЦЕНАРИИ | Fallback-заглушка | `FallbackTabView.vue` | 1 экран ("Модуль в разработке") | 0 |
| `observability` | МОНИТОРИНГ | Fallback-заглушка | `FallbackTabView.vue` | 1 экран ("Модуль в разработке") | 0 |
| `sandbox` | ПЕСОЧНИЦА | Fallback-заглушка | `FallbackTabView.vue` | 1 экран ("Модуль в разработке") | 0 |

---

## Часть II. Глобальные структурные оверлеи и компоненты окружения

| Оверлей / Слой | Компонент | Назначение | Количество контролов |
|---|---|---|---|
| Command Glass Dock | `BottomBar.vue`, `TabBar.vue` | Главная навигация, микрофон/PTE, системные индикаторы | 12 |
| Виджеты рабочего стола | `WidgetsLayer.vue` | 6 плавающих/доковых виджетов (HUD, таймлайн, граф роутинга, плеер, профайлер, FPS) | 8 |
| Быстрая панель голоса | `VoiceQuickPanel.vue` | Всплывающая панель статуса микрофона, VAD и уровня сигнала | 1 |
| Spotlight Search | `SpotlightSearch.vue` | Модальное окно глобального быстрого поиска по приложению | 3 |
| Тосты уведомлений | `CommandCenter.vue` | Стек всплывающих алертов и статусов (success, error, warning) | 0 (только чтение) |
| Диалог подтверждения Shell | `ApprovalDialog.vue` | Модальное окно подтверждения выполнения SHELL_RUN (v1.0.12) | 2 |

---

## Часть III. Пространства в разработке (Fallback Tab Stubs)

> **Файл реализации:** `src/renderer/components/ui/FallbackTabView.vue`
> **Принцип честности данных:** При переходе в эти пространства отображается честное системное сообщение `EmptyState`: «Модуль [ИМЯ]. Модуль в разработке. Доступ будет открыт в следующих обновлениях.». Никаких псевдо-декораций или фейковых счетчиков.

### Реестр fallback-пространств

| Вкладка (`TabName`) | Системный лейбл | Отображаемый заголовок заглушки | Назначение в архитектурном плане |
|---|---|---|---|
| `orchestrator` | ОРКЕСТРАТОР | `МОДУЛЬ ORCHESTRATOR` | Оркестрация многоагентных контуров и параллельных цепочек рассуждений |
| `agents` | АГЕНТЫ | `МОДУЛЬ AGENTS` | Реестр автономных специализированных саб-агентов (Planner, Coder, Researcher) |
| `tools` | ИНСТРУМЕНТЫ | `МОДУЛЬ TOOLS` | Каталог MCP-серверов и системных инструментов выполнения |
| `skills` | НАВЫКИ | `МОДУЛЬ SKILLS` | Библиотека процедурных навыков и декларативных схем действий |
| `architecture` | АРХИТЕКТУРА | `МОДУЛЬ ARCHITECTURE` | Интерактивный инспектор связей модулей ядра |
| `scenarios` | СЦЕНАРИИ | `МОДУЛЬ SCENARIOS` | Комплексные сценарии автоматизации и пайплайны задач |
| `observability` | МОНИТОРИНГ | `МОДУЛЬ OBSERVABILITY` | Трассировка вызовов LLM, задержек шины IPC и потребления памяти |
| `sandbox` | ПЕСОЧНИЦА | `МОДУЛЬ SANDBOX` | Изолированная среда выполнения ненадежного кода |

---

## Часть IV. Глоссарий терминов маршрутизации AI

> **Статус:** Техническое описание архитектуры роутинга на основе `src/main/services/llm/ai.router.ts`, `src/main/services/llm/request-executor.ts` и `provider-health.ts`.
> **Цель документа:** Однозначная фиксация инженерного смысла каждого термина в UI для устранения двусмысленности при редизайне.

### 1. Умный маршрут (Smart Routing)
- **Техническая реализация:** Флаг `smartRoutingEnabled` в настройках роутера.
- **Что делает под капотом:**
  Перед отправкой запроса эвристический классификатор (`classifyQueryComplexity` в `request-executor.ts`) анализирует длину входного текста, наличие блоков кода, системных инструкций и вложений.
  - **Простые запросы (`simple`):** Направляются на легковесные, сверхбыстрые модели (например, Flash, Mini, Haiku или локальную Small LLM), экономя токены и снижая TTFT (Time To First Token) до <200 мс.
  - **Сложные запросы (`heavy`):** Автоматически эскалируются на старшие флагманские модели (Pro, Sonnet, GPT-4o, DeepSeek-Reasoner) с расширенным окном рассуждений (CoT).
- **В интерфейсе:** Тумблер в `Settings → Intelligence → Routing` («Умный маршрут»).

### 2. Эксклюзивный режим (Exclusive Mode)
- **Техническая реализация:** Флаг `exclusiveMode: boolean` + `exclusiveProvider: string` в `ai.router.ts`.
- **Что делает под капотом:**
  Жестко привязывает исполнение всех входящих запросов исключительно к одному выбранному пользователем провайдеру (например, только `gemini` или только `ollama`).
  - Полностью **отключает автоматический фолбек** на запасные модели при ошибках сети, исчерпании квот (429) или недоступности сервера (503).
  - Если эксклюзивный провайдер падает, пользователь получает честную ошибку с кодом сбоя без невидимых переключений.
- **В интерфейсе:** Тумблер в `Settings → Intelligence → Routing` («Эксклюзивный режим») и выпадающий список выбора провайдера.

### 3. Фолбек цепочка (Fallback Chain)
- **Техническая реализация:** Массив провайдеров в порядке приоритета в `ai.router.ts`.
- **Что делает под капотом:**
  Если активный провайдер возвращает ошибку соединения (ECONNREFUSED, ETIMEDOUT), лимит квоты (HTTP 429) или серверный сбой (HTTP 5xx):
  1. Текущий сбойный провайдер временно помечается в менеджере здоровья (`providerHealthManager`).
  2. Запрос прозрачно перенаправляется на следующий доступный по цепочке провайдер согласно приоритету (например: `Gemini` → `DeepSeek` → `OpenAI` → `Local Llama`).
  3. Если запрос успешно выполнен запасным провайдером, в ответе выставляется метаданные `fallbackUsed: true`, отображаемые в виджете `SmartRouterDiagram`.
- **В интерфейсе:** Виджет `SmartRouterDiagram.vue` на рабочем столе и индикатор в `ChatStatusBar`.

### 4. Первая доступная (First Available)
- **Техническая реализация:** Базовый алгоритм обхода доступных провайдеров (`getNextAvailableProvider`).
- **Что делает под капотом:**
  Роутер берет статический список сконфигурированных провайдеров (у которых введен валидный API-ключ или запущен локальный сокет) и выбирает самый верхний из них, который в данный момент **не находится в карантине**.
- **В интерфейсе:** Стандартное поведение роутинга при выключенном «Умном маршруте» и выключенном «Эксклюзивном режиме».

### 5. Локально / Облако (Local vs Cloud Hybrid Strategy)
- **Техническая реализация:** Параметры `useLocalLLM: boolean` и селектор предпочтения среды выполнения.
- **Что делает под капотом:**
  - **«Только локально» (Strict Offline):** Запросы не покидают компьютер пользователя, трафик идет строго в `127.0.0.1:11434` (Ollama) или встроенный движок Llama.cpp. Гарантирует 100% приватность.
  - **«Гибридный режим» (Hybrid):** Локальная сеть обрабатывает базовые команды ОС, системные макросы и классификацию, а облачные модели подключаются для объемного кодинга и работы с большими файлами.
  - **«Только облако» (Cloud First):** Приоритет отдается производительным удаленным API с широким контекстным окном (до 1M токенов).
- **В интерфейсе:** Тумблер в быстрых настройках (`QuickCoreSection.vue:72`) и детальный селектор в `RoutingSection.vue:110`.

### 6. Карантин провайдера (Provider Quarantine & Health Circuit Breaker)
- **Техническая реализация:** `providerHealthManager` в `src/main/services/llm/provider-health.ts`.
- **Что делает под капотом:**
  При получении сетевого тайм-аута или 5xx ошибок провайдер помещается в карантин на заданный интервал (по умолчанию 2-5 минут), чтобы система не тратила время на повторные заведомо сбойные запросы.
  - **Важное правило гигиены (из AGENTS.md):** Ошибки клиента 400 и 404 (неверный промпт или не найдена удаленная модель) **никогда не приводят к карантину** всего провайдера.
  - **Мгновенный сброс:** При сохранении новых настроек или успешном нажатии кнопки «Проверить соединение» в `ProviderCard.vue` карантин сбрасывается немедленно.
- **В интерфейсе:** Красный статус и зачеркнутый бейдж в `ProviderCard.vue` и красный узел в виджете `SmartRouterDiagram.vue`.

### 7. Деградация / Эскалация сложности (Complexity Tier Scaling)
- **Техническая реализация:** Функция сортировки кандидатов `sortModelsByTier(models, complexity)` в `request-executor.ts`.
- **Что делает под капотом:**
  Динамически перестраивает список активных моделей на лету в зависимости от задачи:
  - Короткие реплики в диалоге, системные ответы, приветствия → низший tier (минимальная задержка).
  - Генерация кода, многостраничный анализ файлов, решение архитектурных задач → высший tier (максимальная точность рассуждений).
- **В интерфейсе:** Отображается в строке состояния агента `ChatStatusBar` («Эскалация модели: Gemini Pro»).

# Инвентаризация пространств: CORE (ЯДРО) и CHAT (ЧАТ) (02-core-and-chat.md)

> **Объединяет:** `01-core.md`, `02-chat.md`.

---

# Пространство: CORE (ЯДРО)

> **Пространство:** `core`
> **Лейбл:** `ЯДРО`
> **Файлы реализации:**
> - `src/renderer/layouts/CommandCenter.vue`
> - `src/renderer/components/panels/BottomBar.vue`
> - `src/renderer/components/ui/TabBar.vue`
> - `src/renderer/components/widgets/WidgetsLayer.vue`
> - `src/renderer/components/voice/VoiceQuickPanel.vue`
> - `src/renderer/components/ui/SpotlightSearch.vue`
> - `src/renderer/components/dialogs/ApprovalDialog.vue`

## 1. Секция: 3D Reactor Core Canvas

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `core.canvas.click_target` | Core → Canvas → Target | Клик по Реактору | button (invisible target) | Клик по реактору закрывает открытую голографическую проекцию и возвращает фокус на ядро | `CommandCenter.vue:26` | - | daily |
| `core.canvas.backdrop` | Core → Canvas → Backdrop | Бэкдроп проекции | button (click-outside) | Клик вне активной панели проекции закрывает текущую вкладку и возвращает в Core | `CommandCenter.vue:51` | - | daily |

## 2. Секция: TabBar (Навигация вкладок)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `core.tabbar.tab_item` | Core → TabBar → Tab Item | [Имя вкладки из TAB_REGISTRY] | button | Переключение активной вкладки (`uiStore.setActiveTab`). Повторный клик по активной вкладке закрывает проекцию | `TabBar.vue:18` | `ModulesView.vue:115` | daily |
| `core.tabbar.settings_toggle` | Core → TabBar → Settings | НАСТРОЙКИ | button | Открытие/закрытие панели настроек | `TabBar.vue:35` | `SettingsPanel` | daily |

## 3. Секция: BottomBar (Командный док)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `core.bottombar.mic_toggle` | Core → BottomBar → Voice Mic | Иконка микрофона / статус голоса | button | Включение/отключение микрофона (режимы WAKE_WORD / ACTIVE_DIALOGUE / MUTE) | `BottomBar.vue:42` | `VoiceQuickPanel.vue` | daily |
| `core.bottombar.pte_indicator` | Core → BottomBar → PTE Bar | Индикатор PTE (Push-To-Talk) | readonly-info | Визуализатор уровня входящего сигнала микрофона при удержании Space | `BottomBar.vue:56` | - | daily |
| `core.bottombar.status_badge` | Core → BottomBar → Status | Статус системы (Готов / Думает / Говорит) | readonly-info | Индикатор состояния VoiceFSM / ReactorState | `BottomBar.vue:74` | `ChatStatusBar.vue` | daily |
| `core.bottombar.spotlight_trigger` | Core → BottomBar → Spotlight | Поиск (Ctrl+K) | button | Вызов оверлея быстрого поиска Spotlight | `BottomBar.vue:89` | Горячая клавиша Ctrl+K | daily |
| `core.bottombar.eco_indicator` | Core → BottomBar → Eco | ECO / LIVE индикатор | readonly-info | Отображение текущего режима энергосбережения EcoService (Active/Passive/Sleep) | `BottomBar.vue:104` | - | daily |

## 4. Секция: WidgetsLayer (Виджеты рабочего пространства)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `core.widgets.dock_collapse_left` | Core → Widgets → Left Dock Toggle | Свернуть/развернуть левую панель | button | Сворачивает левый стек виджетов (медиа, таймлайн, роутер) | `WidgetsLayer.vue:16` | `settings.widgets.leftDockCollapsed` | daily |
| `core.widgets.dock_collapse_right` | Core → Widgets → Right Dock Toggle | Свернуть/развернуть правую панель | button | Сворачивает правый стек виджетов (HUD реактора, FPS, профайлер) | `WidgetsLayer.vue:43` | `settings.widgets.rightDockCollapsed` | daily |
| `core.widgets.music_play_pause` | Core → Widgets → Music Capsule | Play / Pause | button | Управление воспроизведением трека VK Music / Web Audio | `MusicCapsuleWidget.vue:48` | - | daily |
| `core.widgets.music_prev` | Core → Widgets → Music Capsule | Предыдущий трек | button | Переключение на предыдущую дорожку | `MusicCapsuleWidget.vue:39` | - | daily |
| `core.widgets.music_next` | Core → Widgets → Music Capsule | Следующий трек | button | Переключение на следующую дорожку | `MusicCapsuleWidget.vue:58` | - | daily |
| `core.widgets.smart_router_diagram` | Core → Widgets → Router Diagram | Граф активного маршрута LLM | readonly-info | Интерактивная диаграмма цепочки провайдеров и статуса (зеленый/красный карантин) | `SmartRouterDiagram.vue:12` | `RoutingSection.vue` | daily |
| `core.widgets.action_timeline` | Core → Widgets → Action Timeline | Таймлайн действий ассистента | readonly-info | Список последних выполненных операций и NLU команд | `AssistantActionTimeline.vue:15` | `ChatStatusBar.vue` | daily |
| `core.widgets.reactor_hud` | Core → Widgets → Reactor HUD | Телеметрия реактора (CPU/GPU/FPS) | readonly-info | Техническая телеметрия рендеринга Three.js и системных ресурсов | `ReactorTechnicalHUD.vue:20` | `settings.system.diagnostics` | daily |
| `core.widgets.fps_overlay` | Core → Widgets → FPS Overlay | FPS счетчик | readonly-info | Счетчик кадров в секунду для экрана и WebGL | `FpsOverlay.vue:10` | `settings.quick.showFpsOverlay` | debug-only |
| `core.widgets.profiler` | Core → Widgets → Profiler | Performance Profiler | readonly-info | Монитор задержек IPC, TTS и инференса | `PerformanceProfiler.vue:18` | `settings.quick.showPerformanceProfiler` | debug-only |

## 5. Секция: Диалоги безопасности и подтверждений

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `core.dialogs.shell_approval.confirm` | Core → Dialogs → Shell Run → Confirm | ПОДТВЕРДИТЬ ВЫПОЛНЕНИЕ | button | Запуск разрешенного шелл-макроса (таймаут отмены, горячая клавиша Enter) | `ApprovalDialog.vue:76` | - | weekly |
| `core.dialogs.shell_approval.cancel` | Core → Dialogs → Shell Run → Cancel | ОТМЕНИТЬ | button | Блокировка и отмена выполнения шелл-скрипта (Esc, клик по вуали) | `ApprovalDialog.vue:85` | - | weekly |

---

# Пространство: CHAT (ЧАТ)

> **Пространство:** `chat`
> **Лейбл:** `ЧАТ`
> **Статус:** Scope Lock (окончательно зафиксировано)
> **Файлы реализации:**
> - `src/renderer/features/chat/components/ChatView.vue`
> - `src/renderer/features/chat/components/SessionSidebar.vue`
> - `src/renderer/features/chat/components/ChatStatusBar.vue`
> - `src/renderer/features/chat/components/MessageBubble.vue`
> - `src/renderer/features/chat/components/ChatInputZone.vue`

## 1. Секция: Сайдбар сессий диалогов (SessionSidebar)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `chat.sessions.new` | Chat → Sessions → New Session | + НОВЫЙ ДИАЛОГ | button | Создание новой сессии диалога с очисткой контекста | `SessionSidebar.vue:32` | - | daily |
| `chat.sessions.search` | Chat → Sessions → Search | Поиск по диалогам... | input | Фильтрация сохраненных бесед по заголовку и содержимому | `SessionSidebar.vue:46` | - | daily |
| `chat.sessions.select_item` | Chat → Sessions → Session Item | [Название сессии] | button | Переключение активного контекста диалога | `SessionSidebar.vue:75` | - | daily |
| `chat.sessions.delete_item` | Chat → Sessions → Delete Session | Иконка корзины | button | Удаление выбранной истории диалога из SQLite | `SessionSidebar.vue:98` | - | weekly |

## 2. Секция: Статусная строка агента (ChatStatusBar)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `chat.status.agent_state` | Chat → StatusBar → Agent State | READY / PLANNING / EXECUTING | readonly-info | Текущее когнитивное состояние оркестратора | `ChatStatusBar.vue:15` | `core.bottombar.status_badge` | daily |
| `chat.status.active_model` | Chat → StatusBar → Active Model | [Имя провайдера/модели] | readonly-info | Название активной LLM (Локальная / Облачная) | `ChatStatusBar.vue:34` | `settings.routing.activeProvider` | daily |

## 3. Секция: Лента сообщений (Messages Flow & MessageBubble)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `chat.messages.empty_chips` | Chat → Welcome → Quick Chips | [Быстрые промпты] | button (chips) | Вставка и мгновенная отправка шаблонного промпта | `ChatView.vue:53` | - | daily |
| `chat.messages.speak` | Chat → Message → Speak TTS | Иконка звука | button | Озвучивание текста ответа через Silero TTS | `MessageBubble.vue:45` | `settings.voice.tts` | daily |
| `chat.messages.regenerate` | Chat → Message → Regenerate | Иконка регенерации | button | Повторный запрос к LLM с генерацией альтернативного ответа | `MessageBubble.vue:56` | - | daily |
| `chat.messages.delete` | Chat → Message → Delete Message | Иконка удаления | button | Удаление конкретного сообщения из ветки | `MessageBubble.vue:67` | - | weekly |
| `chat.messages.copy` | Chat → Message → Copy Code / Text | Копировать | button | Копирование содержимого сообщения или блока кода в буфер обмена | `MessageBubble.vue:92` | - | daily |

## 4. Секция: Зона ввода и прикрепления файлов (ChatInputZone)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `chat.input.textarea` | Chat → Input → Prompt Input | Введите сообщение для A.R.C... | input (multiline) | Основное поле текстового ввода с авто-высотой и отправкой по Enter | `ChatInputZone.vue:38` | - | daily |
| `chat.input.attach_file` | Chat → Input → Attach File | Скрепка / Добавить файл | button (file dialog) | Прикрепление документов, изображений или кода к запросу | `ChatInputZone.vue:62` | Dropzone overlay | daily |
| `chat.input.remove_attachment` | Chat → Input → Remove Attached File | Крестик удаления файла | button | Удаление вложения из очереди отправки | `ChatInputZone.vue:78` | - | daily |
| `chat.input.send` | Chat → Input → Send Button | Стрелка отправки | button | Отправка сообщения и запуск стриминга инференса | `ChatInputZone.vue:95` | Enter в поле ввода | daily |
| `chat.input.stop_stream` | Chat → Input → Abort Stream | Иконка Stop | button | Прерывание текущего стриминга ответа LLM | `ChatInputZone.vue:104` | - | daily |


# Инвентаризация пространств: TASKS (ЗАДАЧИ), OBJECTIVES (ЦЕЛИ), COMMANDS (КОМАНДЫ) (03-tasks-objectives-commands.md)

> **Объединяет:** `03-tasks.md`, `04-objectives.md`, `05-commands.md`.

---

# Пространство: TASKS (ЗАДАЧИ)

> **Пространство:** `tasks`
> **Лейбл:** `ЗАДАЧИ`
> **Статус:** Scope Lock (окончательно зафиксировано)
> **Файлы реализации:**
> - `src/renderer/features/tasks/components/TasksView.vue`
> - `src/renderer/features/tasks/components/TaskHeaderBar.vue`
> - `src/renderer/features/tasks/components/TaskConsole.vue`
> - `src/renderer/features/tasks/components/TaskList.vue`
> - `src/renderer/features/tasks/components/EisenhowerMatrix.vue`
> - `src/renderer/features/tasks/components/KanbanBoard.vue`
> - `src/renderer/features/tasks/components/FocusSprintView.vue`
> - `src/renderer/features/tasks/components/TaskHistoryView.vue`
> - `src/renderer/features/tasks/components/TaskContextRail.vue`
> - `src/renderer/features/tasks/components/modals/TaskAnalyticsModal.vue`
> - `src/renderer/features/tasks/components/modals/CategoryModal.vue`
> - `src/renderer/features/tasks/components/modals/RecurrenceModal.vue`

## 1. Секция: Верхняя панель задач (TaskHeaderBar & RestTimer)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `tasks.header.analytics_button` | Tasks → Header → Analytics | АНАЛИТИКА / СТАТИСТИКА | button | Открытие модального окна подробной аналитики продуктивности | `TaskHeaderBar.vue:24` | `TaskContextRail.vue` | weekly |
| `tasks.header.completion_metric` | Tasks → Header → Completion Ratio | Прогресс выполнения % | readonly-info | Процент завершенных задач за сегодня и общий счетчик | `TaskHeaderBar.vue:42` | `TaskContextRail.vue` | daily |

## 2. Секция: Консоль управления и добавления (TaskConsole)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `tasks.console.view_mode_list` | Tasks → Console → View Mode → List | Список | button | Переключение в режим тактического списка задач | `TaskConsole.vue:18` | - | daily |
| `tasks.console.view_mode_matrix` | Tasks → Console → View Mode → Matrix | Матрица | button | Переключение в режим матрицы Эйзенхауэра 2x2 | `TaskConsole.vue:25` | - | daily |
| `tasks.console.view_mode_kanban` | Tasks → Console → View Mode → Kanban | Канбан | button | Переключение в доску со статусами (Backlog / In Progress / Done) | `TaskConsole.vue:32` | - | daily |
| `tasks.console.view_mode_sprint` | Tasks → Console → View Mode → Sprint | Фокус-спринт | button | Запуск Pomodoro/таймера высокой концентрации | `TaskConsole.vue:39` | - | daily |
| `tasks.console.view_mode_history` | Tasks → Console → View Mode → History | История | button | Просмотр архива завершенных задач по дням | `TaskConsole.vue:46` | - | weekly |
| `tasks.console.input_text` | Tasks → Console → Add Input | Новая задача... | input | Ввод текста новой задачи | `TaskConsole.vue:68` | - | daily |
| `tasks.console.category_select` | Tasks → Console → Category Picker | [Категория] | select / dropdown | Выбор категории или вызов менеджера категорий | `TaskConsole.vue:85` | - | daily |
| `tasks.console.priority_select` | Tasks → Console → Priority Picker | [Приоритет: Низкий/Средний/Высокий/Критический] | select | Установка веса и срочности задачи | `TaskConsole.vue:102` | - | daily |
| `tasks.console.due_date_picker` | Tasks → Console → Due Date | [Срок / Календарь] | input (date) | Дата дедлайна задачи | `TaskConsole.vue:118` | - | daily |
| `tasks.console.recurrence_button` | Tasks → Console → Recurrence | График повторения | button | Вызов модального окна настройки циклов повторения (daily/weekly) | `TaskConsole.vue:135` | - | weekly |
| `tasks.console.submit_button` | Tasks → Console → Add Task Button | + ДОБАВИТЬ | button | Добавление сформированной задачи в базу SQLite | `TaskConsole.vue:152` | Enter в поле ввода | daily |
| `tasks.console.search_input` | Tasks → Console → Search Tasks | Поиск задачи... | input | Фильтрация отображаемых задач по тексту | `TaskConsole.vue:170` | - | daily |
| `tasks.console.clear_completed` | Tasks → Console → Clear Completed | Очистить завершенные | button | Массовый перенос всех выполненных задач в архив | `TaskConsole.vue:195` | - | daily |

## 3. Секция: Рабочая область (Views: List, Matrix, Kanban, Sprint)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `tasks.item.toggle_status` | Tasks → Item → Checkbox | Чекбокс завершения | button (checkbox) | Мгновенный перевод задачи в статус Done/Active | `TaskItem.vue:42` | Kanban drag/drop | daily |
| `tasks.item.decompose_ai` | Tasks → Item → AI Decompose | Декомпозиция AI | button | Автоматическое разделение сложной задачи на подпункты через LLM | `TaskItem.vue:64` | `EisenhowerMatrix.vue` | daily |
| `tasks.item.start_sprint` | Tasks → Item → Start Sprint | Начать спринт | button | Привязка задачи к таймеру Pomodoro и переход в режим фокуса | `TaskItem.vue:78` | `FocusSprintView.vue` | daily |
| `tasks.item.delete` | Tasks → Item → Delete Task | Удалить задачу | button | Удаление задачи из локальной базы | `TaskItem.vue:95` | - | daily |

## 4. Секция: Боковой инспектор (TaskContextRail)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `tasks.rail.subtasks_add` | Tasks → Rail → Add Subtask | + Добавить подзадачу | input / button | Добавление дочернего элемента к выбранной задаче | `TaskContextRail.vue:85` | - | daily |
| `tasks.rail.notes_edit` | Tasks → Rail → Task Notes | Заметки к задаче... | input (multiline) | Дополнительный контекст и описание задачи | `TaskContextRail.vue:120` | - | daily |

## 5. Секция: Модальные окна (Категории, Аналитика, Повторения)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `tasks.modals.category.create` | Tasks → Modals → Category → Add | Создать категорию | button | Сохранение новой категории с персональным цветом | `CategoryModal.vue:54` | - | weekly |
| `tasks.modals.category.delete` | Tasks → Modals → Category → Delete | Удалить категорию | button | Удаление категории и сброс меток у задач | `CategoryModal.vue:72` | - | weekly |
| `tasks.modals.recurrence.save` | Tasks → Modals → Recurrence → Save | Сохранить график | button | Применение правила повторения задачи | `RecurrenceModal.vue:65` | - | weekly |

---

# Пространство: OBJECTIVES (ЦЕЛИ)

> **Пространство:** `objectives`
> **Лейбл:** `ЦЕЛИ`
> **Файлы реализации:**
> - `src/renderer/features/objectives/components/ObjectivesView.vue`
> - `src/renderer/features/objectives/components/ObjectivesHeaderNav.vue`
> - `src/renderer/features/objectives/components/ObjectivesMetricsRow.vue`
> - `src/renderer/features/objectives/components/ObjectivesList.vue`
> - `src/renderer/features/objectives/components/ObjectiveDetailsWorkspace.vue`
> - `src/renderer/features/objectives/components/TopologySection.vue`
> - `src/renderer/features/objectives/components/DiagnosticsSection.vue`
> - `src/renderer/features/objectives/components/CreateObjectiveForm.vue`
> - `src/renderer/features/objectives/components/ObjectiveRollbackDialog.vue`

## 1. Секция: Верхняя навигация и создание (ObjectivesHeaderNav)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.nav.section_goals` | Objectives → Nav → Goals | ЦЕЛИ И ВЕХИ | button | Переключение в режим иерархии целей и плана выполнения | `ObjectivesHeaderNav.vue:15` | - | daily |
| `objectives.nav.section_topology` | Objectives → Nav → Topology | ТОПОЛОГИЯ СЕТИ | button | Переключение в 2D граф взаимосвязей узлов и зависимостей | `ObjectivesHeaderNav.vue:24` | - | weekly |
| `objectives.nav.section_diagnostics` | Objectives → Nav → Diagnostics | ДИАГНОСТИКА & ЭНТРОПИЯ | button | Анализ стабильности, энтропии решений и когерентности системы | `ObjectivesHeaderNav.vue:33` | - | weekly |
| `objectives.nav.create_button` | Objectives → Nav → New Objective | + СФОРМИРОВАТЬ НАМЕРЕНИЕ | button | Открытие формы создания новой стратегической цели | `ObjectivesHeaderNav.vue:48` | - | daily |

## 2. Секция: Метрики системы целей (ObjectivesMetricsRow)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.metrics.total` | Objectives → Metrics → Total | ВСЕГО ЦЕЛЕЙ | readonly-info | Общее число стратегических векторов в системе | `ObjectivesMetricsRow.vue:12` | - | daily |
| `objectives.metrics.health` | Objectives → Metrics → Health Index | ИНДЕКС ЗДОРОВЬЯ СИСТЕМЫ | readonly-info | Расчет когерентности и отсутствия тупиковых путей (%) | `ObjectivesMetricsRow.vue:28` | - | daily |
| `objectives.metrics.progress` | Objectives → Metrics → Avg Progress | СРЕДНИЙ ПРОГРЕСС | readonly-info | Доля выполненных подзадач и шагов по всем активным целям | `ObjectivesMetricsRow.vue:44` | - | daily |

## 3. Секция: Список целей (ObjectivesList)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.list.select_item` | Objectives → List → Objective Card | [Карточка цели] | button | Выбор цели для детального изучения в правом холсте | `ObjectivesList.vue:35` | - | daily |
| `objectives.list.filter_status` | Objectives → List → Status Filter | Все / В процессе / Завершены | select / tabs | Фильтрация целей по жизненному циклу | `ObjectivesList.vue:18` | - | daily |

## 4. Секция: Холст деталей и маршрута (ObjectiveDetailsWorkspace)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.workspace.approve_route` | Objectives → Workspace → Approve Route | ПРИНЯТЬ МАРШРУТ | button | Подтверждение предложенного LLM плана решения | `ObjectiveDetailsWorkspace.vue:85` | - | daily |
| `objectives.workspace.modify_route` | Objectives → Workspace → Modify Route | СКОРРЕКТИРОВАТЬ | button | Ручное редактирование промежуточных вех | `ObjectiveDetailsWorkspace.vue:98` | - | weekly |
| `objectives.workspace.decline_route` | Objectives → Workspace → Decline Route | ОТКЛОНИТЬ ПЛАН | button | Сброс сгенерированного дерева шагов | `ObjectiveDetailsWorkspace.vue:112` | - | weekly |
| `objectives.workspace.decompose` | Objectives → Workspace → Decompose | ДЕКОМПОЗИРОВАТЬ | button | Запуск генерации подграфа действий через агента | `ObjectiveDetailsWorkspace.vue:134` | - | daily |
| `objectives.workspace.rollback` | Objectives → Workspace → Rollback | ОТКАТ ЦЕЛИ (ROLLBACK) | button | Вызов протокола отката изменений и действий цели | `ObjectiveDetailsWorkspace.vue:150` | - | weekly |

## 5. Секция: Топология и Диагностика (TopologySection & DiagnosticsSection)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.topology.node_click` | Objectives → Topology → Node | Клик по узлу графа | button (SVG node) | Выбор узла графа и центрирование графа топологии | `TopologySection.vue:42` | - | weekly |
| `objectives.diagnostics.auto_approve` | Objectives → Diagnostics → Auto Approve | АВТОУТВЕРЖДЕНИЕ ШАГОВ | toggle | Включение автономного выполнения шагов без запроса пользователя | `DiagnosticsSection.vue:62` | `settings.safety` | weekly |
| `objectives.diagnostics.coherence_chart` | Objectives → Diagnostics → Coherence Chart | График когерентности | readonly-info | Динамика стабильности логических связей системы во времени | `DiagnosticsSection.vue:95` | - | weekly |

## 6. Секция: Диалог отката (ObjectiveRollbackDialog)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.rollback.confirm` | Objectives → Rollback Dialog → Confirm | ПОДТВЕРДИТЬ ОТКАТ | button | Вызов `ObjectiveEngine.rollbackObjective` с обратными действиями | `ObjectiveRollbackDialog.vue:55` | - | weekly |
| `objectives.rollback.cancel` | Objectives → Rollback Dialog → Cancel | ОТМЕНА | button | Закрытие диалога отката без выполнения действий | `ObjectiveRollbackDialog.vue:68` | - | weekly |

---

# Пространство: COMMANDS (КОМАНДЫ)

> **Пространство:** `commands`
> **Лейбл:** `КОМАНДЫ`
> **Файлы реализации:**
> - `src/renderer/features/commands/components/CommandsView.vue`
> - `src/renderer/features/commands/components/commandsView/SkillsTab.vue`
> - `src/renderer/features/commands/components/commandsView/LauncherTab.vue`
> - `src/renderer/features/commands/components/commandsView/CommandSettingsTab.vue`
> - `src/renderer/features/commands/components/commandsView/UndoDeleteToast.vue`

## 1. Секция: Верхние подвкладки (CommandsView Sub-Tabs)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `commands.nav.skills` | Commands → Nav → Skills | НАВЫКИ И МАКРОСЫ | button (tab) | Просмотр встроенных навыков NLU и кастомных макросов | `CommandsView.vue:26` | - | daily |
| `commands.nav.launcher` | Commands → Nav → Launcher | ЛАУНЧЕР | button (tab) | Настройка проиндексированных папок и ярлыков быстрого запуска | `CommandsView.vue:26` | - | weekly |
| `commands.nav.settings` | Commands → Nav → Settings | НАСТРОЙКИ | button (tab) | Параметры безопасности и подтверждения команд | `CommandsView.vue:26` | `SettingsPanel.vue` | setup-once |

## 2. Секция: Навыки и Макросы (SkillsTab)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `commands.skills.search` | Commands → Skills → Search | Поиск навыка или команды... | input | Фильтрация системных навыков и пользовательских макросов | `SkillsTab.vue:22` | - | daily |
| `commands.skills.import_all` | Commands → Skills → Import | ИМПОРТ МАКРОСОВ | button | Импорт конфигурации макросов из внешнего JSON файла | `SkillsTab.vue:45` | - | setup-once |
| `commands.skills.export_all` | Commands → Skills → Export | ЭКСПОРТ ВСЕХ | button | Экспорт библиотеки макросов в JSON файл резервной копии | `SkillsTab.vue:55` | - | setup-once |
| `commands.skills.macro_add` | Commands → Skills → New Macro | + СОЗДАТЬ МАКРОС | button | Вызов редактора нового составного макроса | `SkillsTab.vue:72` | - | weekly |
| `commands.skills.macro_clone` | Commands → Skills → Clone | Дублировать | button | Клонирование существующего макроса с новым ID | `SkillsTab.vue:98` | - | weekly |
| `commands.skills.macro_delete` | Commands → Skills → Delete | Удалить макрос | button | Удаление макроса (с возможностью быстрой отмены через UndoToast) | `SkillsTab.vue:112` | - | weekly |
| `commands.skills.macro_add_trigger`| Commands → Skills → Add Trigger | + Добавить фразу | input / button | Добавление синонима или голосового триггера для запуска действия | `SkillsTab.vue:135` | - | weekly |

## 3. Секция: Лаунчер (LauncherTab)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `commands.launcher.add_folder` | Commands → Launcher → Add Folder | + ДОБАВИТЬ ПАПКУ | button | Выбор директории Windows для индексации приложений и ярлыков | `LauncherTab.vue:35` | - | setup-once |
| `commands.launcher.remove_folder`| Commands → Launcher → Remove Folder | Иконка корзины | button | Удаление каталога из списка сканирования лаунчера | `LauncherTab.vue:52` | - | setup-once |
| `commands.launcher.reindex` | Commands → Launcher → Reindex | ПЕРЕИНДЕКСИРОВАТЬ | button | Принудительное пересканирование директорий и обновление кэша .lnk/.exe | `LauncherTab.vue:70` | - | weekly |

## 4. Секция: Настройки команд (CommandSettingsTab)

> **Внимание (Дубликаты):** Обе настройки этой секции полностью дублируют параметры в настройках ядра `settings.quick`.

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `commands.settings.voice_feedback` | Commands → Settings → Voice Feedback | Озвучивать выполнение команд | toggle | Использовать TTS для подтверждения действий (`settingsStore.voiceFeedback`) | `CommandSettingsTab.vue:12` | `settings.quick.voiceFeedback` (`QuickCoreSection.vue:56`) | setup-once |
| `commands.settings.require_confirm`| Commands → Settings → Require Confirm | Требовать подтверждение | toggle | Запрашивать ответ перед удалением файлов или завершением процессов (`settingsStore.requireConfirm`) | `CommandSettingsTab.vue:23` | `settings.quick.requireConfirm` (`QuickCoreSection.vue:64`) | setup-once |

## 5. Секция: Всплывающее уведомление отмены (UndoDeleteToast)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `commands.undo.restore` | Commands → Toast → Undo Delete | ОТМЕНИТЬ УДАЛЕНИЕ | button | Восстановление только что удаленного макроса из буфера | `UndoDeleteToast.vue:18` | - | daily |
| `commands.undo.dismiss` | Commands → Toast → Finalize | Закрыть / Крестик | button | Окончательное подтверждение удаления | `UndoDeleteToast.vue:26` | - | daily |


# Сервисные пространства и SETTINGS + карта дубликатов (04-service-spaces-and-settings.md)

> **Объединяет:** `06-memory.md`, `07-modules.md`, `08-files.md`, `09-transcription.md`, `10-vision.md`, `11-settings.md`, `duplicates.md`.
> **Примечание:** Документация инвентаризации консолидирована в 4 файла; машиночитаемый реестр параметров настроек ведется отдельно в `settings-registry.json`.

---

# Пространство: MEMORY (ПАМЯТЬ)

> **Пространство:** `memory`
> **Лейбл:** `ПАМЯТЬ`
> **Файлы реализации:**
> - `src/renderer/features/memory/components/MemoryView.vue`
> - `src/renderer/features/memory/components/MemoryToolbar.vue`
> - `src/renderer/features/memory/components/MemoryGrid.vue`
> - `src/renderer/features/memory/components/MemoryDetailModal.vue`
> - `src/renderer/features/memory/components/MemoryFormModal.vue`

## 1. Секция: Панель управления и фильтров (MemoryToolbar)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `memory.toolbar.search_query` | Memory → Toolbar → Search | Поиск в долговременной памяти... | input | Текстовый или семантический поиск по сохраненным фактам | `MemoryToolbar.vue:24` | - | daily |
| `memory.toolbar.semantic_toggle` | Memory → Toolbar → Semantic Search | Семантический поиск (векторный) | toggle / button | Переключение между точным текстовым сопоставлением и векторными эмбеддингами | `MemoryToolbar.vue:38` | - | daily |
| `memory.toolbar.category_filter` | Memory → Toolbar → Category | [Все / Факты / Настройки / Персона] | select / dropdown | Фильтрация сущностей памяти по категории | `MemoryToolbar.vue:56` | - | daily |
| `memory.toolbar.sort_by` | Memory → Toolbar → Sort | [Сначала новые / Высокая достоверность] | select | Порядок сортировки записей памяти | `MemoryToolbar.vue:74` | - | weekly |
| `memory.toolbar.create_button` | Memory → Toolbar → Create Memory | + СОЗДАТЬ ЗАПИСЬ | button | Вызов модального окна добавления нового факта вручную | `MemoryToolbar.vue:92` | - | weekly |
| `memory.toolbar.export_json` | Memory → Toolbar → Export JSON | ЭКСПОРТ JSON | button | Экспорт базы знаний в JSON-файл | `MemoryToolbar.vue:105` | - | setup-once |
| `memory.toolbar.import_json` | Memory → Toolbar → Import JSON | ИМПОРТ JSON | button | Загрузка внешнего файла знаний в SQLite | `MemoryToolbar.vue:118` | - | setup-once |
| `memory.toolbar.clear_all` | Memory → Toolbar → Clear All | ОЧИСТИТЬ ВСЮ ПАМЯТЬ | button | Вызов защитного диалога очистки всей когнитивной памяти | `MemoryToolbar.vue:132` | `settings.system.dbReset` | setup-once |
| `memory.toolbar.refresh` | Memory → Toolbar → Refresh | Обновить | button | Принудительная перезагрузка записей из базы данных | `MemoryToolbar.vue:145` | - | daily |

## 2. Секция: Сетка карточек памяти (MemoryGrid & MemoryCard)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `memory.grid.card_click` | Memory → Grid → Card Item | [Карточка памяти] | button | Открытие детального просмотра факта и истории доступа | `MemoryGrid.vue:42` | - | daily |
| `memory.grid.card_edit` | Memory → Grid → Edit Card | Иконка карандаша | button | Быстрое открытие формы редактирования записи | `MemoryGrid.vue:64` | `MemoryDetailModal` | weekly |
| `memory.grid.card_delete` | Memory → Grid → Delete Card | Иконка корзины | button | Удаление факта из памяти | `MemoryGrid.vue:78` | `MemoryDetailModal` | weekly |

## 3. Секция: Модальные окна (Detail, Form, ConfirmClear)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `memory.modals.form.save` | Memory → Modals → Form → Save | СОХРАНИТЬ | button | Валидация и запись факта в память | `MemoryFormModal.vue:85` | - | weekly |
| `memory.modals.clear_confirm` | Memory → Modals → Clear → Confirm | ОЧИСТИТЬ | button | Окончательное безвозвратное удаление всех записей памяти | `MemoryView.vue:71` | - | setup-once |

---

# Пространство: MODULES (МОДУЛИ)

> **Пространство:** `modules`
> **Лейбл:** `МОДУЛИ`
> **Файл реализации:** `src/renderer/features/modules/components/ModulesView.vue`

## 1. Секция: Верхняя панель и фильтрация

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `modules.header.search` | Modules → Header → Search | Поиск модуля... | input | Текстовый фильтр модулей и подсистем по названию и описанию | `ModulesView.vue:26` | - | daily |
| `modules.header.filter_all` | Modules → Header → Filter All | Все (10) | button (tab) | Отображение полного списка архитектурных модулей | `ModulesView.vue:38` | - | daily |
| `modules.header.filter_active` | Modules → Header → Filter Active | Работающие (7) | button (tab) | Фильтр только готовых к работе модулей со статусом ONLINE | `ModulesView.vue:44` | - | daily |
| `modules.header.filter_calibrating`| Modules → Header → Filter Calibrating | Калибровка (3) | button (tab) | Фильтр модулей, находящихся в процессе интеграции | `ModulesView.vue:52` | - | daily |

## 2. Секция: Карточки модулей и прямой переход

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `modules.grid.open_module` | Modules → Grid → Module Card → Action | Открыть модуль (Открыть вкладку) | button | Прямой переход в соответствующее пространство приложения (`uiStore.setActiveTab(targetTab)`) | `ModulesView.vue:115` | `TabBar.vue:18` | daily |

> **Примечание:** `ModulesView` выполняет роль интерактивной системной карты архитектуры A.R.C. Кнопки «Открыть модуль» вызывают те же действия перехода, что и верхний/нижний `TabBar`.

---

# Пространство: FILES (ФАЙЛЫ)

> **Пространство:** `files`
> **Лейбл:** `ФАЙЛЫ`
> **Файл реализации:** `src/renderer/features/files/components/FilesTabView.vue`

## 1. Секция: Панель навигации по директориям

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `files.toolbar.navigate_up` | Files → Toolbar → Up Button | Стрелка назад / Вверх | button | Переход на один уровень каталога вверх (`..`) | `FilesTabView.vue:5` | - | daily |
| `files.toolbar.current_path` | Files → Toolbar → Path Display | [Текущий путь] | readonly-info | Текстовое отображение текущей директории в файловой системе | `FilesTabView.vue:8` | - | daily |
| `files.toolbar.refresh` | Files → Toolbar → Refresh Button | Иконка обновления | button | Принудительное пересканирование содержимого текущей папки | `FilesTabView.vue:11` | - | daily |

## 2. Секция: Список файлов и сетка элементов

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `files.list.item_click` | Files → List → File/Directory Item | [Имя файла / Папки] | button | Открытие вложенной папки или выбор файла для предпросмотра | `FilesTabView.vue:40` | - | daily |
| `files.list.return_to_root` | Files → List → Root Button | Вернуться в корень | button | Сброс пути в корень проекта при ошибке чтения директории | `FilesTabView.vue:28` | - | weekly |

## 3. Секция: Панель предпросмотра файла (File Preview)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `files.preview.close` | Files → Preview → Close Button | Иконка крестика | button | Закрытие панели предпросмотра файла | `FilesTabView.vue:59` | - | daily |
| `files.preview.content` | Files → Preview → Text Content | [Текст файла] | readonly-info / textarea | Отображение текстового содержимого выбранного файла (readonly) | `FilesTabView.vue:72` | - | daily |

---

# Пространство: TRANSCRIPTION (АУДИО)

> **Пространство:** `transcription`
> **Лейбл:** `АУДИО`
> **Файл реализации:** `src/renderer/features/transcription/components/TranscriptionView.vue`

## 1. Секция: Загрузчик и прослушивание аудиофайла

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.upload.dropzone` | Transcription → Upload → Dropzone | ПЕРЕТАЩИТЕ АУДИО ФАЙЛ | input (file drag-drop) | Выбор аудио/видео файла для транскрибации (MP3, WAV, M4A, OGG, FLAC) | `TranscriptionView.vue:38` | - | daily |
| `transcription.upload.clear_file` | Transcription → Upload → Reset File | Сбросить файл | button | Очистка выбранного аудиофайла и результатов | `TranscriptionView.vue:71` | - | daily |
| `transcription.preview.player` | Transcription → Preview → Audio Player | Плеер источника | custom (audio player) | Предварительное прослушивание загруженного аудиофайла | `TranscriptionView.vue:85` | - | daily |

## 2. Секция: Выбор интеллектуальной модели STT

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.model.select` | Transcription → Model → Select Model | [Карточка модели STT] | select / radio | Выбор модели распознавания (Whisper Small, Whisper Large-v3, Gemini 3.5 Flash) | `TranscriptionView.vue:105` | `settings.voice.stt` | daily |
| `transcription.model.download` | Transcription → Model → Download | Скачать ([размер]) | button | Фоновое скачивание локальной модели Whisper с HuggingFace | `TranscriptionView.vue:127` | `settings.voice.stt.download` | setup-once |

## 3. Секция: Аппаратное ускорение (GPU Boost / Acceleration)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.gpu.device_cpu` | Transcription → GPU → Device CPU | ЦП (WASM) | button (radio) | Инференс на процессоре без использования дискретной видеокарты | `TranscriptionView.vue:150` | `settings.models.device` | weekly |
| `transcription.gpu.device_cuda` | Transcription → GPU → Device CUDA | NVIDIA CUDA | button (radio) | Аппаратное ускорение на видеокартах NVIDIA GeForce | `TranscriptionView.vue:167` | `settings.models.device` | weekly |
| `transcription.gpu.device_dml` | Transcription → GPU → Device DirectML | DIRECTML (GPU) | button (radio) | Универсальное ускорение DirectML для AMD / Intel / Apple | `TranscriptionView.vue:185` | `settings.models.device` | weekly |

## 4. Секция: Запуск, логи и экспорт результатов

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.actions.start` | Transcription → Actions → Start Button | Запустить расшифровку | button | Запуск полного процесса декодирования аудиодорожки в текст | `TranscriptionView.vue:279` | - | daily |
| `transcription.actions.toggle_logs`| Transcription → Actions → Toggle Debug | [Показать / скрыть логи системы] | button | Отображение консоли логов пайплайна транскрипции | `TranscriptionView.vue:291` | - | debug-only |
| `transcription.actions.search` | Transcription → Actions → Search Text | ПОИСК В ТЕКСТЕ... | input | Быстрая фильтрация по таймлайну и сегментам расшифровки | `TranscriptionView.vue:324` | - | daily |
| `transcription.actions.save_txt` | Transcription → Actions → Save TXT | СОХРАНИТЬ TXT | button | Экспорт распознанного текста с таймкодами в текстовый файл | `TranscriptionView.vue:330` | - | daily |

---

# Пространство: VISION (КАМЕРА)

> **Пространство:** `vision`
> **Лейбл:** `КАМЕРА`
> **Файл реализации:** `src/renderer/features/vision/components/VisionTabView.vue`

## 1. Секция: Оптический видеопоток (Optical Feed Canvas)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `vision.camera.enable` | Vision → Camera → Enable Button | ВКЛЮЧИТЬ КАМЕРУ | button | Запрос доступа к веб-камере через `navigator.mediaDevices.getUserMedia` и запуск видеопотока | `VisionTabView.vue:29` | - | daily |
| `vision.camera.disable` | Vision → Camera → Disable Button | ОТКЛЮЧИТЬ | button | Остановка видеопотока камеры и освобождение видеоустройства | `VisionTabView.vue:36` | - | daily |

## 2. Секция: Статус когнитивного распознавания

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `vision.status.recognition_info` | Vision → Status → Diagnostic Info | Распознавание не подключено (фаза 2) | readonly-info | Честная индикация состояния детекции объектов (согласно принципу честности данных) | `VisionTabView.vue:48` | - | setup-once |

---

# Пространство: SETTINGS (НАСТРОЙКИ)

> **Пространство:** `settings`
> **Лейбл:** `НАСТРОЙКИ`
> **Файлы реализации:** `src/renderer/features/settings/components/SettingsPanel.vue`, `useSettingsNav.ts`, а также все секции в `src/renderer/features/settings/components/sections/`.

## Группа 1: ОБЩИЕ (General)

### 1.1 Секция `quick` (Быстрые настройки ядра — QuickCoreSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.quick.voice_feedback` | Settings → General → Quick → Voice Feedback | Голосовая обратная связь (TTS) | toggle | Озвучивать выполнение команд и статусы системы (`settingsStore.voiceFeedback`) | `QuickCoreSection.vue:56` | `commands.settings.voice_feedback` | setup-once |
| `settings.quick.require_confirm` | Settings → General → Quick → Require Confirm | Подтверждение опасных действий | toggle | Запрашивать подтверждение перед удалением или перезагрузкой (`settingsStore.requireConfirm`) | `QuickCoreSection.vue:64` | `commands.settings.require_confirm` | setup-once |
| `settings.quick.use_local_llm` | Settings → General → Quick → Use Local LLM | Локальная нейросеть (Offline) | toggle | Переключение инференса на локальный движок Ollama/LlamaCpp (`settingsStore.useLocalLLM`) | `QuickCoreSection.vue:72` | `settings.localai.toggle`, `settings.routing` | weekly |
| `settings.quick.music_capsule` | Settings → General → Quick → Music Capsule | Музыкальная капсула (VK / Audio) | toggle | Отображение плавающего виджета музыкального плеера (`settingsStore.showMusicWidget`) | `QuickCoreSection.vue:80` | `settings.widgets.showMusicWidget` | daily |
| `settings.quick.tab_bar_pos` | Settings → General → Quick → TabBar Pos | Расположение меню вкладок | select / toggle | Выбор позиции навигации: Сверху (top) или Снизу (bottom) | `QuickCoreSection.vue:88` | `settings.appearance.tabBarPosition` | setup-once |
| `settings.quick.widget_layout` | Settings → General → Quick → Layout Mode | Режим виджетов | select (dock / float) | Переключение между боковым доком и плавающими карточками | `QuickCoreSection.vue:96` | `settings.widgets.widgetLayoutMode` | weekly |

### 1.2 Секция `appearance` (Внешний вид и темы — AppearanceSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.appearance.theme` | Settings → General → Appearance → Theme | Цветовая тема | select | Выбор цветовой схемы: Красный (A.R.C. Red), Синий (Cyan/Blue), Изумрудный | `AppearanceSection.vue:24` | - | weekly |
| `settings.appearance.blur_intensity` | Settings → General → Appearance → Blur | Интенсивность размытия стекла | slider | Регулировка `backdrop-blur` (от 0 до 40px) для окон и панелей | `AppearanceSection.vue:42` | - | setup-once |
| `settings.appearance.font_size` | Settings → General → Appearance → Font Size | Масштаб интерфейса | select | Размер базового шрифта (90%, 100%, 110%) | `AppearanceSection.vue:60` | - | setup-once |

### 1.3 Секция `widgets` (Рабочий стол и виджеты — WidgetsSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.widgets.show_telemetry` | Settings → General → Widgets → Telemetry | HUD телеметрии реактора | toggle | Отображение виджета производительности Three.js | `WidgetsSection.vue:35` | - | daily |
| `settings.widgets.show_timeline` | Settings → General → Widgets → Timeline | Таймлайн действий | toggle | Отображение виджета истории действий ассистента | `WidgetsSection.vue:45` | - | daily |
| `settings.widgets.show_router_diagram` | Settings → General → Widgets → Diagram | Граф маршрутизатора AI | toggle | Отображение виджета цепочки провайдеров | `WidgetsSection.vue:55` | - | daily |
| `settings.widgets.show_music` | Settings → General → Widgets → Music | Музыкальная капсула | toggle | Виджет управления медиаплеером | `WidgetsSection.vue:65` | `settings.quick.music_capsule` | daily |
| `settings.widgets.reset_positions` | Settings → General → Widgets → Reset | Сбросить позиции виджетов | button | Возврат плавающих окон в исходные экранные координаты | `WidgetsSection.vue:85` | - | weekly |

### 1.4 Секция `shortcuts` (Горячие клавиши — ShortcutsSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.shortcuts.mic_hold` | Settings → General → Shortcuts → Mic Hold | Активация микрофона (PTE) | readonly-info | Удержание Space (Пробел) для мгновенного голосового ввода | `ShortcutsSection.vue:22` | - | daily |
| `settings.shortcuts.spotlight` | Settings → General → Shortcuts → Spotlight | Быстрый поиск | readonly-info | Комбинация Ctrl + K для вызова Spotlight | `ShortcutsSection.vue:35` | - | daily |

## Группа 2: ИНТЕЛЛЕКТ (Intelligence)

### 2.1 Секция `routing` (Маршрутизация моделей — RoutingSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.routing.smart_routing` | Settings → Intel → Routing → Smart Routing | Умный маршрут | toggle | Автоматический выбор модели на основе сложности промпта (`smartRoutingEnabled`) | `RoutingSection.vue:42` | - | weekly |
| `settings.routing.exclusive_mode` | Settings → Intel → Routing → Exclusive | Эксклюзивный режим | toggle | Запрет автоматического фолбека на другие модели при сбое (`exclusiveMode`) | `RoutingSection.vue:68` | - | weekly |
| `settings.routing.exclusive_provider` | Settings → Intel → Routing → Provider | Выбор эксклюзивного провайдера | select | Принудительная фиксация провайдера в эксклюзивном режиме | `RoutingSection.vue:85` | - | weekly |
| `settings.routing.cloud_preference` | Settings → Intel → Routing → Cloud Pref | Стратегия балансировки | select | Приоритет локальных или облачных нейросетей | `RoutingSection.vue:110` | `settings.quick.use_local_llm` | weekly |

### 2.2 Секция `providers` (Облачные провайдеры — ProvidersSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.providers.api_key_input` | Settings → Intel → Providers → API Key | Ключ API ([Провайдер]) | input (password) | Ввод и сохранение API-ключа провайдера (OpenAI, Gemini, Anthropic, DeepSeek, Groq) | `ProviderCard.vue:42` | - | setup-once |
| `settings.providers.test_connection`| Settings → Intel → Providers → Test | Проверить соединение | button | Отправка тестового запроса и немедленный сброс карантина провайдера | `ProviderCard.vue:65` | - | weekly |
| `settings.providers.fetch_models` | Settings → Intel → Providers → Fetch Models | Обновить список моделей | button | Запрос доступных моделей с сервера провайдера | `ProviderCard.vue:82` | - | monthly |

### 2.3 Секция `localAI` (Локальные нейросети — LocalAISection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.localai.builtin_engine` | Settings → Intel → LocalAI → Builtin Engine | Встроенный движок (Llama.cpp) | toggle | Использование нативного движка без сторонних серверов | `BuiltinModelCard.vue:35` | - | weekly |
| `settings.localai.ollama_endpoint` | Settings → Intel → LocalAI → Ollama URL | Адрес сервера Ollama | input | URL хоста Ollama (по умолчанию `http://127.0.0.1:11434`) | `OllamaEngineCard.vue:40` | - | setup-once |
| `settings.localai.refresh_ollama` | Settings → Intel → LocalAI → Refresh Ollama | Переподключиться | button | Проверка доступности запущенного сервиса Ollama | `OllamaEngineCard.vue:58` | - | daily |

### 2.4 Секция `models` (Менеджер моделей и Hub — ModelManagerSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.models.hw_scan` | Settings → Intel → Models → Hardware Scan | Сканирование оборудования | button | Анализ CPU/VRAM для расчета максимального размера контекста | `ModelManagerSection.vue:30` | `transcription.gpu` | setup-once |
| `settings.models.model_hub_download`| Settings → Intel → Models → Download Hub | Скачать модель GGUF | button | Фоновое скачивание квантованных моделей из репозитория | `ModelManagerSection.vue:85` | `transcription.model.download` | setup-once |

## Группа 3: ГОЛОС (Voice)

### 3.1 Секция `stt` (Распознавание речи — STTSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.stt.engine_select` | Settings → Voice → STT → Engine | Движок STT | select | Выбор движка: Sherpa-ONNX (Локально) / Web Speech API | `STTSection.vue:45` | - | setup-once |
| `settings.stt.auto_clear_cache` | Settings → Voice → STT → Auto Clear Cache | Автоочистка аудио-кэша | toggle | Автоматическое удаление временных WAV-файлов распознавания | `STTSection.vue:82` | `settings.tts.auto_clear_cache` | setup-once |
| `settings.stt.vad_sensitivity` | Settings → Voice → STT → VAD Sensitivity | Чувствительность детектора голоса | slider | Порог отсечения тишины и фонового шума | `STTSection.vue:110` | - | weekly |

### 3.2 Секция `tts` (Синтез речи — TTSSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.tts.engine_select` | Settings → Voice → TTS → Engine | Движок синтеза (TTS) | select | Выбор синтезатора: Silero TTS v5.5 (Локально) / Edge TTS / SAPI | `TTSSection.vue:52` | - | setup-once |
| `settings.tts.speaker_select` | Settings → Voice → TTS → Speaker | Голос диктора | select | Выбор голоса Silero (Aidan, Baya, Kseniya, Eugene, Xenia) | `TTSSection.vue:75` | - | weekly |
| `settings.tts.speech_rate` | Settings → Voice → TTS → Rate | Скорость речи | slider | Регулировка темпа воспроизведения ответа (0.8x - 1.5x) | `TTSSection.vue:102` | - | weekly |
| `settings.tts.speech_pitch` | Settings → Voice → TTS → Pitch | Высота тона | slider | Настройка тембра голоса | `TTSSection.vue:120` | - | weekly |
| `settings.tts.auto_clear_cache` | Settings → Voice → TTS → Auto Clear Cache | Автоочистка аудио-кэша | toggle | Удаление кэшированных сгенерированных реплик TTS | `TTSSection.vue:145` | `settings.stt.auto_clear_cache` | setup-once |

### 3.3 Секция `hotwords` (Ключевые фразы активации — HotwordsSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.hotwords.wake_word_input` | Settings → Voice → Hotwords → Wake Word | Фраза вызова системы | input | Настройка имени активации (по умолчанию «Арк», «А.Р.К.») | `HotwordsSection.vue:35` | - | setup-once |
| `settings.hotwords.stop_words` | Settings → Voice → Hotwords → Stop Words | Стоп-фразы прерывания | input | Список фраз мгновенного глушения ответа (хватит, молчи, стоп) | `HotwordsSection.vue:65` | - | setup-once |

## Группа 4: СИСТЕМА (System)

### 4.1 Секция `system` (Системные параметры и хранилище — SystemSection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.system.data_dir_display` | Settings → System → Storage → Data Dir | Путь к папке данных | readonly-info | Локальный изолированный каталог пользовательских данных (`data/`) | `SystemSection.vue:35` | - | setup-once |
| `settings.system.open_logs` | Settings → System → Storage → Open Logs | Открыть лог-файл | button | Открытие последнего файла сессии `logs/` в системном блокноте | `SystemSection.vue:55` | - | daily |
| `settings.system.reset_data` | Settings → System → Storage → Factory Reset | Полный сброс данных | button | Закрытие базы SQLite, удаление профилей и перезапуск приложения | `SystemSection.vue:85` | `memory.toolbar.clear_all` | setup-once |

### 4.2 Секция `safety` (Безопасность и разрешения — SafetySection.vue)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `settings.safety.shell_confirm` | Settings → System → Safety → Shell Confirm | Подтверждать Shell-скрипты | toggle | Принудительный запрос диалога ApprovalDialog перед `SHELL_RUN` | `SafetySection.vue:40` | `core.dialogs.shell_approval` | setup-once |
| `settings.safety.auto_save` | Settings → System → Safety → Auto Save | Автосохранение контекста | toggle | Периодическая запись рабочего состояния в локальное хранилище | `SafetySection.vue:65` | - | setup-once |

---

# Карта дубликатов и пересечений интерфейса

> **Статус:** Анализ фактического дублирования контролов и параметров по состоянию на v1.0.12
> **Определение дубликата:** Одна и та же настройка, состояние стора или действие доступны пользователю в двух или более независимых местах интерфейса.

## 1. Сводная таблица дубликатов настроек

| # | Параметр в Pinia / Модель | Первое место (file:line) | Второе место (file:line) | Третье+ место | Анализ и рекомендация |
|---|---|---|---|---|---|
| **D1** | `voiceFeedback` (Озвучивать команды через TTS) | `QuickCoreSection.vue:56` | `CommandSettingsTab.vue:12` | - | **Критический дубликат.** Оба компонента читают и пишут в `settingsStore.voiceFeedback`. Рекомендация: оставить в Настройках (`General → Quick`), убрать вкладку Настройки из `CommandsView`. |
| **D2** | `requireConfirm` (Подтверждение опасных действий) | `QuickCoreSection.vue:64` | `CommandSettingsTab.vue:23` | `SafetySection.vue:40` (связанный `shell_confirm`) | **Критический дубликат.** Рекомендация: консолидировать параметры безопасности в секции `Settings → System → Safety`. |
| **D3** | `showMusicWidget` (Отображение виджета музыки) | `QuickCoreSection.vue:80` | `WidgetsSection.vue:65` | - | **Прямой дубликат.** Включение капсулы дублируется в «Быстрых» и в «Виджетах». Рекомендация: оставить управление виджетами в `WidgetsSection`. |
| **D4** | `voiceAutoClearCache` (Автоочистка аудио-кэша) | `STTSection.vue:82` | `TTSSection.vue:145` | - | **Скрытый дубликат ключа.** Обе секции биндятся на одну переменную стора `voiceAutoClearCache`. Переключение в STT незаметно меняет поведение TTS. Рекомендация: либо разделить на `sttAutoClearCache` и `ttsAutoClearCache`, либо вынести в `System → Storage`. |
| **D5** | `widgetLayoutMode` (Режим дока / плавающий) | `QuickCoreSection.vue:96` | `WidgetsSection.vue` | `WidgetsLayer.vue` | **Дубликат управления.** Переключение режима компоновки виджетов доступно и на экране быстрых настроек, и во вкладке виджетов. |
| **D6** | `tabBarPosition` (Позиция меню: сверху/снизу) | `QuickCoreSection.vue:88` | `AppearanceSection.vue` | - | **Дубликат кастомизации.** Рекомендация: оставить строго в `General → Appearance`. |
| **D7** | `useLocalLLM` (Переключение на локальную модель) | `QuickCoreSection.vue:72` | `RoutingSection.vue:110` | `LocalAISection.vue:35` | **Тройное пересечение.** Настройка переключает флаг `useLocalLLM`, но в `RoutingSection` есть отдельный селектор приоритета «Локально/Облако», а в `LocalAISection` — тумблер встроенного движка. Рекомендация: синхронизировать с `RoutingSection`. |

## 2. Сводная таблица пересечений действий (Action Overlaps)

| Действие | Где реализовано в UI | В чем пересечение | Рекомендация к оптимизации |
|---|---|---|---|
| **Сброс / очистка данных** | `SystemSection.vue:85` (Factory reset), `MemoryToolbar.vue:132` (Clear memory) | Пользователь может случайно стереть долговременную память из тулбара памяти, думая что чистит фильтр | Сделать явное разделение: «Очистить текущие фильтры» vs «Глобальное стирание базы знаний» |
| **Выбор аппаратного устройства (GPU / DirectML / CPU)** | `TranscriptionView.vue:148-200`, `ModelManagerSection.vue:30` | Выбор ускорителя для инференса транскрибации Whisper дублирует селектор оборудования для локальных LLM | Вынести единый детектор/селектор аппаратного ускорения в системную диагностику |
| **Скачивание весов моделей** | `TranscriptionView.vue:127` (Whisper), `ModelManagerSection.vue:85` (LLM GGUF), `STTSection.vue` (Sherpa) | Три независимых прогресс-бара и загрузчика с HuggingFace/внешних URL | Объединить в единый фоновый менеджер загрузок моделей |
| **Переход по вкладкам** | `TabBar.vue:18` (Dock/Top bar), `ModulesView.vue:115` (Карточки модулей) | Кнопки «Открыть модуль» в `ModulesView` полностью дублируют функционал системного таб-бара | Сохранить как архитектурную карту, так как `ModulesView` выполняет роль каталога |


{
  "version": "1.0.12",
  "generatedAt": "2026-09-22T08:05:00Z",
  "description": "Единый машиночитаемый реестр всех параметров и контролов настроек A.R.C.",
  "documentation": {
    "note": "Документация инвентаризации UI консолидирована в 4 Markdown-файла. Поле docFile каждой записи указывает объединенный документ, docSection — раздел внутри него. Машиночитаемый реестр (этот файл) хранится отдельно рядом с документацией.",
    "files": [
      {
        "file": "01-overview-and-glossary.md",
        "title": "Общий обзор, глоссарий и fallback-пространства",
        "contains": [
          "Сводная таблица всех пространств A.R.C. (19 TabName)",
          "Глобальные структурные оверлеи и компоненты окружения",
          "Реестр fallback-пространств (orchestrator, agents, tools, skills, architecture, scenarios, observability, sandbox)",
          "Глоссарий терминов маршрутизации AI (Smart Routing, Exclusive Mode, Fallback Chain, First Available, Local/Cloud, Quarantine, Tier Scaling)"
        ]
      },
      {
        "file": "02-core-and-chat.md",
        "title": "Инвентаризация пространств CORE и CHAT",
        "contains": [
          "core: 3D Reactor Core Canvas, TabBar, BottomBar (командный док), WidgetsLayer, диалоги безопасности",
          "chat: SessionSidebar, ChatStatusBar, лента сообщений, ChatInputZone"
        ]
      },
      {
        "file": "03-tasks-objectives-commands.md",
        "title": "Инвентаризация пространств TASKS, OBJECTIVES, COMMANDS",
        "contains": [
          "tasks: TaskHeaderBar, TaskConsole, рабочие области (List/Matrix/Kanban/Sprint), TaskContextRail, модалки",
          "objectives: ObjectivesHeaderNav, метрики, список целей, детали/маршрут, топология и диагностика, диалог отката",
          "commands: подвкладки, SkillsTab, LauncherTab, CommandSettingsTab (дубликаты настроек), UndoDeleteToast"
        ]
      },
      {
        "file": "04-service-spaces-and-settings.md",
        "title": "Сервисные пространства, SETTINGS и карта дубликатов",
        "contains": [
          "memory: MemoryToolbar, MemoryGrid, модальные окна",
          "modules: панель фильтрации и карточки модулей (системная карта)",
          "files: навигация по директориям, список файлов, предпросмотр",
          "transcription: загрузчик, выбор модели STT, GPU-ускорение, запуск/логи/экспорт",
          "vision: оптический видеопоток, статус распознавания",
          "settings: 4 группы (General, Intelligence, Voice, System), 13 секций, 88 контролов",
          "Карта дубликатов D1-D7 и таблица пересечений действий (Action Overlaps)"
        ]
      }
    ]
  },
  "settings": [
    {
      "id": "settings.quick.voice_feedback",
      "path": "settings/general/quick/voiceFeedback",
      "label": "Голосовая обратная связь (TTS)",
      "type": "toggle",
      "storeKey": "voiceFeedback",
      "defaultValue": true,
      "description": "Озвучивать выполнение команд и статусы системы",
      "file": "src/renderer/features/settings/components/sections/QuickCoreSection.vue:56",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.1 Секция quick",
      "duplicates": ["commands.settings.voice_feedback"],
      "frequency": "setup-once"
    },
    {
      "id": "settings.quick.require_confirm",
      "path": "settings/general/quick/requireConfirm",
      "label": "Подтверждение опасных действий",
      "type": "toggle",
      "storeKey": "requireConfirm",
      "defaultValue": true,
      "description": "Запрашивать подтверждение перед удалением или перезагрузкой",
      "file": "src/renderer/features/settings/components/sections/QuickCoreSection.vue:64",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.1 Секция quick",
      "duplicates": ["commands.settings.require_confirm", "settings.safety.shell_confirm"],
      "frequency": "setup-once"
    },
    {
      "id": "settings.quick.use_local_llm",
      "path": "settings/general/quick/useLocalLLM",
      "label": "Локальная нейросеть (Offline)",
      "type": "toggle",
      "storeKey": "useLocalLLM",
      "defaultValue": false,
      "description": "Переключение инференса на локальный движок Ollama/LlamaCpp",
      "file": "src/renderer/features/settings/components/sections/QuickCoreSection.vue:72",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.1 Секция quick",
      "duplicates": ["settings.routing.cloud_preference", "settings.localai.builtin_engine"],
      "frequency": "weekly"
    },
    {
      "id": "settings.quick.music_capsule",
      "path": "settings/general/quick/showMusicWidget",
      "label": "Музыкальная капсула (VK / Audio)",
      "type": "toggle",
      "storeKey": "showMusicWidget",
      "defaultValue": false,
      "description": "Отображение плавающего виджета музыкального плеера",
      "file": "src/renderer/features/settings/components/sections/QuickCoreSection.vue:80",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.1 Секция quick",
      "duplicates": ["settings.widgets.show_music"],
      "frequency": "daily"
    },
    {
      "id": "settings.quick.tab_bar_pos",
      "path": "settings/general/quick/tabBarPosition",
      "label": "Расположение меню вкладок",
      "type": "select",
      "storeKey": "tabBarPosition",
      "defaultValue": "bottom",
      "description": "Выбор позиции меню: Сверху (top) или Снизу (bottom)",
      "file": "src/renderer/features/settings/components/sections/QuickCoreSection.vue:88",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.1 Секция quick",
      "duplicates": ["settings.appearance.tab_bar_pos"],
      "frequency": "setup-once"
    },
    {
      "id": "settings.quick.widget_layout",
      "path": "settings/general/quick/widgetLayoutMode",
      "label": "Режим виджетов",
      "type": "select",
      "storeKey": "widgetLayoutMode",
      "defaultValue": "dock",
      "description": "Переключение между боковым доком и плавающими карточками",
      "file": "src/renderer/features/settings/components/sections/QuickCoreSection.vue:96",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.1 Секция quick",
      "duplicates": ["settings.widgets.layout_mode"],
      "frequency": "weekly"
    },
    {
      "id": "settings.appearance.theme",
      "path": "settings/general/appearance/theme",
      "label": "Цветовая тема",
      "type": "select",
      "storeKey": "theme",
      "defaultValue": "red",
      "description": "Выбор цветовой палитры интерфейса (A.R.C. Red, Cyan, Emerald)",
      "file": "src/renderer/features/settings/components/sections/AppearanceSection.vue:24",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.2 Секция appearance",
      "duplicates": [],
      "frequency": "weekly"
    },
    {
      "id": "settings.appearance.blur_intensity",
      "path": "settings/general/appearance/blurIntensity",
      "label": "Интенсивность размытия стекла",
      "type": "slider",
      "storeKey": "blurIntensity",
      "defaultValue": 20,
      "description": "Регулировка backdrop-blur для окон и модальных панелей",
      "file": "src/renderer/features/settings/components/sections/AppearanceSection.vue:42",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.2 Секция appearance",
      "duplicates": [],
      "frequency": "setup-once"
    },
    {
      "id": "settings.appearance.font_size",
      "path": "settings/general/appearance/fontSizeScale",
      "label": "Масштаб интерфейса",
      "type": "select",
      "storeKey": "fontSizeScale",
      "defaultValue": 100,
      "description": "Размер базового шрифта (90%, 100%, 110%)",
      "file": "src/renderer/features/settings/components/sections/AppearanceSection.vue:60",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.2 Секция appearance",
      "duplicates": [],
      "frequency": "setup-once"
    },
    {
      "id": "settings.widgets.show_telemetry",
      "path": "settings/general/widgets/showTelemetryWidget",
      "label": "HUD телеметрии реактора",
      "type": "toggle",
      "storeKey": "showTelemetryWidget",
      "defaultValue": true,
      "description": "Отображение виджета производительности Three.js",
      "file": "src/renderer/features/settings/components/sections/WidgetsSection.vue:35",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.3 Секция widgets",
      "duplicates": [],
      "frequency": "daily"
    },
    {
      "id": "settings.widgets.show_timeline",
      "path": "settings/general/widgets/showActionTimelineWidget",
      "label": "Таймлайн действий",
      "type": "toggle",
      "storeKey": "showActionTimelineWidget",
      "defaultValue": true,
      "description": "Отображение виджета истории действий ассистента",
      "file": "src/renderer/features/settings/components/sections/WidgetsSection.vue:45",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.3 Секция widgets",
      "duplicates": [],
      "frequency": "daily"
    },
    {
      "id": "settings.widgets.show_router_diagram",
      "path": "settings/general/widgets/showRoutingDiagramWidget",
      "label": "Граф маршрутизатора AI",
      "type": "toggle",
      "storeKey": "showRoutingDiagramWidget",
      "defaultValue": true,
      "description": "Отображение виджета цепочки провайдеров",
      "file": "src/renderer/features/settings/components/sections/WidgetsSection.vue:55",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.3 Секция widgets",
      "duplicates": [],
      "frequency": "daily"
    },
    {
      "id": "settings.widgets.show_music",
      "path": "settings/general/widgets/showMusicWidget",
      "label": "Музыкальная капсула",
      "type": "toggle",
      "storeKey": "showMusicWidget",
      "defaultValue": false,
      "description": "Виджет управления медиаплеером",
      "file": "src/renderer/features/settings/components/sections/WidgetsSection.vue:65",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.3 Секция widgets",
      "duplicates": ["settings.quick.music_capsule"],
      "frequency": "daily"
    },
    {
      "id": "settings.widgets.reset_positions",
      "path": "settings/general/widgets/resetWidgetPositions",
      "label": "Сбросить позиции виджетов",
      "type": "button",
      "storeKey": "resetWidgetPositions",
      "defaultValue": null,
      "description": "Возврат плавающих окон в исходные экранные координаты",
      "file": "src/renderer/features/settings/components/sections/WidgetsSection.vue:85",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 1: ОБЩИЕ → 1.3 Секция widgets",
      "duplicates": [],
      "frequency": "weekly"
    },
    {
      "id": "settings.routing.smart_routing",
      "path": "settings/intelligence/routing/smartRoutingEnabled",
      "label": "Умный маршрут",
      "type": "toggle",
      "storeKey": "smartRoutingEnabled",
      "defaultValue": true,
      "description": "Автоматический выбор модели на основе сложности промпта",
      "file": "src/renderer/features/settings/components/sections/RoutingSection.vue:42",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 2: ИНТЕЛЛЕКТ → 2.1 Секция routing",
      "duplicates": [],
      "frequency": "weekly"
    },
    {
      "id": "settings.routing.exclusive_mode",
      "path": "settings/intelligence/routing/exclusiveMode",
      "label": "Эксклюзивный режим",
      "type": "toggle",
      "storeKey": "exclusiveMode",
      "defaultValue": false,
      "description": "Запрет автоматического фолбека на другие модели при сбое",
      "file": "src/renderer/features/settings/components/sections/RoutingSection.vue:68",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 2: ИНТЕЛЛЕКТ → 2.1 Секция routing",
      "duplicates": [],
      "frequency": "weekly"
    },
    {
      "id": "settings.routing.exclusive_provider",
      "path": "settings/intelligence/routing/exclusiveProvider",
      "label": "Выбор эксклюзивного провайдера",
      "type": "select",
      "storeKey": "exclusiveProvider",
      "defaultValue": "gemini",
      "description": "Принудительная фиксация провайдера в эксклюзивном режиме",
      "file": "src/renderer/features/settings/components/sections/RoutingSection.vue:85",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 2: ИНТЕЛЛЕКТ → 2.1 Секция routing",
      "duplicates": [],
      "frequency": "weekly"
    },
    {
      "id": "settings.routing.cloud_preference",
      "path": "settings/intelligence/routing/cloudPreference",
      "label": "Стратегия балансировки",
      "type": "select",
      "storeKey": "cloudPreference",
      "defaultValue": "hybrid",
      "description": "Приоритет локальных или облачных нейросетей",
      "file": "src/renderer/features/settings/components/sections/RoutingSection.vue:110",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 2: ИНТЕЛЛЕКТ → 2.1 Секция routing",
      "duplicates": ["settings.quick.use_local_llm"],
      "frequency": "weekly"
    },
    {
      "id": "settings.localai.builtin_engine",
      "path": "settings/intelligence/localAI/builtinEnabled",
      "label": "Встроенный движок (Llama.cpp)",
      "type": "toggle",
      "storeKey": "builtinLlamaCppEnabled",
      "defaultValue": false,
      "description": "Использование нативного движка без сторонних серверов",
      "file": "src/renderer/features/settings/components/sections/localAI/BuiltinModelCard.vue:35",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 2: ИНТЕЛЛЕКТ → 2.3 Секция localAI",
      "duplicates": ["settings.quick.use_local_llm"],
      "frequency": "weekly"
    },
    {
      "id": "settings.localai.ollama_endpoint",
      "path": "settings/intelligence/localAI/ollamaEndpoint",
      "label": "Адрес сервера Ollama",
      "type": "input",
      "storeKey": "ollamaEndpoint",
      "defaultValue": "http://127.0.0.1:11434",
      "description": "URL хоста локального демона Ollama",
      "file": "src/renderer/features/settings/components/sections/localAI/OllamaEngineCard.vue:40",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 2: ИНТЕЛЛЕКТ → 2.3 Секция localAI",
      "duplicates": [],
      "frequency": "setup-once"
    },
    {
      "id": "settings.stt.engine_select",
      "path": "settings/voice/stt/engine",
      "label": "Движок STT",
      "type": "select",
      "storeKey": "sttEngine",
      "defaultValue": "sherpa",
      "description": "Выбор движка распознавания речи (Sherpa-ONNX / WebSpeech)",
      "file": "src/renderer/features/settings/components/sections/STTSection.vue:45",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 3: ГОЛОС → 3.1 Секция stt",
      "duplicates": [],
      "frequency": "setup-once"
    },
    {
      "id": "settings.stt.auto_clear_cache",
      "path": "settings/voice/stt/autoClearCache",
      "label": "Автоочистка аудио-кэша",
      "type": "toggle",
      "storeKey": "voiceAutoClearCache",
      "defaultValue": true,
      "description": "Автоматическое удаление временных WAV-файлов распознавания",
      "file": "src/renderer/features/settings/components/sections/STTSection.vue:82",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 3: ГОЛОС → 3.1 Секция stt",
      "duplicates": ["settings.tts.auto_clear_cache"],
      "frequency": "setup-once"
    },
    {
      "id": "settings.stt.vad_sensitivity",
      "path": "settings/voice/stt/vadSensitivity",
      "label": "Чувствительность детектора голоса",
      "type": "slider",
      "storeKey": "vadSensitivity",
      "defaultValue": 0.5,
      "description": "Порог отсечения тишины и фонового шума для VAD",
      "file": "src/renderer/features/settings/components/sections/STTSection.vue:110",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 3: ГОЛОС → 3.1 Секция stt",
      "duplicates": [],
      "frequency": "weekly"
    },
    {
      "id": "settings.tts.engine_select",
      "path": "settings/voice/tts/engine",
      "label": "Движок синтеза (TTS)",
      "type": "select",
      "storeKey": "ttsEngine",
      "defaultValue": "silero",
      "description": "Выбор синтезатора: Silero TTS v5.5 (Локально) / Edge TTS / SAPI",
      "file": "src/renderer/features/settings/components/sections/TTSSection.vue:52",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 3: ГОЛОС → 3.2 Секция tts",
      "duplicates": [],
      "frequency": "setup-once"
    },
    {
      "id": "settings.tts.speaker_select",
      "path": "settings/voice/tts/speaker",
      "label": "Голос диктора",
      "type": "select",
      "storeKey": "ttsSpeaker",
      "defaultValue": "aidan",
      "description": "Выбор диктора Silero (Aidan, Baya, Kseniya, Eugene, Xenia)",
      "file": "src/renderer/features/settings/components/sections/TTSSection.vue:75",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 3: ГОЛОС → 3.2 Секция tts",
      "duplicates": [],
      "frequency": "weekly"
    },
    {
      "id": "settings.tts.speech_rate",
      "path": "settings/voice/tts/rate",
      "label": "Скорость речи",
      "type": "slider",
      "storeKey": "ttsRate",
      "defaultValue": 1.0,
      "description": "Регулировка темпа воспроизведения реплик (0.8x - 1.5x)",
      "file": "src/renderer/features/settings/components/sections/TTSSection.vue:102",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 3: ГОЛОС → 3.2 Секция tts",
      "duplicates": [],
      "frequency": "weekly"
    },
    {
      "id": "settings.tts.auto_clear_cache",
      "path": "settings/voice/tts/autoClearCache",
      "label": "Автоочистка аудио-кэша",
      "type": "toggle",
      "storeKey": "voiceAutoClearCache",
      "defaultValue": true,
      "description": "Удаление кэшированных сгенерированных реплик TTS",
      "file": "src/renderer/features/settings/components/sections/TTSSection.vue:145",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 3: ГОЛОС → 3.2 Секция tts",
      "duplicates": ["settings.stt.auto_clear_cache"],
      "frequency": "setup-once"
    },
    {
      "id": "settings.hotwords.wake_word_input",
      "path": "settings/voice/hotwords/wakeWord",
      "label": "Фраза вызова системы",
      "type": "input",
      "storeKey": "wakeWord",
      "defaultValue": "арк",
      "description": "Фраза активации микрофона в фоновом режиме (WAKE_WORD_ONLY)",
      "file": "src/renderer/features/settings/components/sections/HotwordsSection.vue:35",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 3: ГОЛОС → 3.3 Секция hotwords",
      "duplicates": [],
      "frequency": "setup-once"
    },
    {
      "id": "settings.safety.shell_confirm",
      "path": "settings/system/safety/requireShellApproval",
      "label": "Подтверждать Shell-скрипты",
      "type": "toggle",
      "storeKey": "requireShellApproval",
      "defaultValue": true,
      "description": "Принудительный запрос диалога ApprovalDialog перед выполнением SHELL_RUN",
      "file": "src/renderer/features/settings/components/sections/SafetySection.vue:40",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 4: СИСТЕМА → 4.2 Секция safety",
      "duplicates": ["core.dialogs.shell_approval", "settings.quick.require_confirm"],
      "frequency": "setup-once"
    },
    {
      "id": "settings.system.reset_data",
      "path": "settings/system/storage/resetSystemData",
      "label": "Полный сброс данных",
      "type": "button",
      "storeKey": "resetSystemData",
      "defaultValue": null,
      "description": "Закрытие базы SQLite, очистка папки data/ и перезапуск приложения",
      "file": "src/renderer/features/settings/components/sections/SystemSection.vue:85",
      "docFile": "04-service-spaces-and-settings.md",
      "docSection": "SETTINGS → Группа 4: СИСТЕМА → 4.1 Секция system",
      "duplicates": ["memory.toolbar.clear_all"],
      "frequency": "setup-once"
    }
  ]
}
