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
