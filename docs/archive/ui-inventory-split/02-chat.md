# Инвентаризация пространства: CHAT (ЧАТ) (02-chat.md)

> **Пространство:** `chat`  
> **Лейбл:** `ЧАТ`  
> **Статус:** Scope Lock (окончательно зафиксировано)  
> **Файлы реализации:**  
> - `src/renderer/features/chat/components/ChatView.vue`  
> - `src/renderer/features/chat/components/SessionSidebar.vue`  
> - `src/renderer/features/chat/components/ChatStatusBar.vue`  
> - `src/renderer/features/chat/components/MessageBubble.vue`  
> - `src/renderer/features/chat/components/ChatInputZone.vue`

---

## 1. Секция: Сайдбар сессий диалогов (SessionSidebar)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `chat.sessions.new` | Chat → Sessions → New Session | + НОВЫЙ ДИАЛОГ | button | Создание новой сессии диалога с очисткой контекста | `SessionSidebar.vue:32` | - | daily |
| `chat.sessions.search` | Chat → Sessions → Search | Поиск по диалогам... | input | Фильтрация сохраненных бесед по заголовку и содержимому | `SessionSidebar.vue:46` | - | daily |
| `chat.sessions.select_item` | Chat → Sessions → Session Item | [Название сессии] | button | Переключение активного контекста диалога | `SessionSidebar.vue:75` | - | daily |
| `chat.sessions.delete_item` | Chat → Sessions → Delete Session | Иконка корзины | button | Удаление выбранной истории диалога из SQLite | `SessionSidebar.vue:98` | - | weekly |

---

## 2. Секция: Статусная строка агента (ChatStatusBar)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `chat.status.agent_state` | Chat → StatusBar → Agent State | READY / PLANNING / EXECUTING | readonly-info | Текущее когнитивное состояние оркестратора | `ChatStatusBar.vue:15` | `core.bottombar.status_badge` | daily |
| `chat.status.active_model` | Chat → StatusBar → Active Model | [Имя провайдера/модели] | readonly-info | Название активной LLM (Локальная / Облачная) | `ChatStatusBar.vue:34` | `settings.routing.activeProvider` | daily |

---

## 3. Секция: Лента сообщений (Messages Flow & MessageBubble)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `chat.messages.empty_chips` | Chat → Welcome → Quick Chips | [Быстрые промпты] | button (chips) | Вставка и мгновенная отправка шаблонного промпта | `ChatView.vue:53` | - | daily |
| `chat.messages.speak` | Chat → Message → Speak TTS | Иконка звука | button | Озвучивание текста ответа через Silero TTS | `MessageBubble.vue:45` | `settings.voice.tts` | daily |
| `chat.messages.regenerate` | Chat → Message → Regenerate | Иконка регенерации | button | Повторный запрос к LLM с генерацией альтернативного ответа | `MessageBubble.vue:56` | - | daily |
| `chat.messages.delete` | Chat → Message → Delete Message | Иконка удаления | button | Удаление конкретного сообщения из ветки | `MessageBubble.vue:67` | - | weekly |
| `chat.messages.copy` | Chat → Message → Copy Code / Text | Копировать | button | Копирование содержимого сообщения или блока кода в буфер обмена | `MessageBubble.vue:92` | - | daily |

---

## 4. Секция: Зона ввода и прикрепления файлов (ChatInputZone)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `chat.input.textarea` | Chat → Input → Prompt Input | Введите сообщение для A.R.C... | input (multiline) | Основное поле текстового ввода с авто-высотой и отправкой по Enter | `ChatInputZone.vue:38` | - | daily |
| `chat.input.attach_file` | Chat → Input → Attach File | Скрепка / Добавить файл | button (file dialog) | Прикрепление документов, изображений или кода к запросу | `ChatInputZone.vue:62` | Dropzone overlay | daily |
| `chat.input.remove_attachment` | Chat → Input → Remove Attached File | Крестик удаления файла | button | Удаление вложения из очереди отправки | `ChatInputZone.vue:78` | - | daily |
| `chat.input.send` | Chat → Input → Send Button | Стрелка отправки | button | Отправка сообщения и запуск стриминга инференса | `ChatInputZone.vue:95` | Enter в поле ввода | daily |
| `chat.input.stop_stream` | Chat → Input → Abort Stream | Иконка Stop | button | Прерывание текущего стриминга ответа LLM | `ChatInputZone.vue:104` | - | daily |
