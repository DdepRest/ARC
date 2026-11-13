# Схема и Архитектура Блока Настроек (A.R.C. Settings)

---

## 1. Архитектура и Топология Интерфейса

Подсистема Настроек и **все рабочие пространства A.R.C.** (`settings`, `chat`, `tasks`, `objectives`, `files`, `memory`, `commands`, `modules`, `transcription`, `vision`) монтируются как **полноэкранные воркспейсы** (`edge-to-edge` в плоскости `var(--arc-plane)` без плавающей рамки проектора `1240x860` и уголков) в `HolographicProjectionPanel.vue`.

### Иерархия слоёв и вертикальное выравнивание под `TitleBar`:
- **Системный `TitleBar.vue`** (высота 38px, `z-index: 100000`): располагается фиксированно в самом верху приложения (`top: 0`).
- **Контейнер проекции `HolographicProjectionPanel.vue`**: настроен со смещением `top-[38px]`, полноэкранные воркспейсы монтируются непосредственно под `TitleBar` без дублирующей 48px шапки.
- **Единая система возврата к 3D-Ядру**:
  1. *Локальные кнопки в боковых панелях и тулбарах*: закрепительный футер `← К 3D-Ядру [Esc]` в `SettingsMenu.vue`, `SessionSidebar.vue`, а также встроенные кнопки в тулбарах `FilesTabView.vue`, `ModulesView.vue`, `TaskHeaderBar.vue`, `MemoryToolbar.vue`, `CommandsView.vue`, `ObjectivesHeaderNav.vue`.
  2. *Логотип `TitleBar.vue`*: клик по логотипу A.R.C. при активном воркспейсе (`activeTab !== 'core'`) переключает режим обратно на 3D-Реактор.
  3. *Горячая клавиша `Esc`*: закрывает текущий воркспейс из любой точки системы.

Интерфейс Настроек построен по двухпанельной схеме с боковой навигационной рельсой (`SettingsMenu.vue`) и реактивной правой панелью контента (`SettingsPanel.vue`).

### W3C WAI-ARIA Топология:
- **`SettingsMenu.vue` (`role="tablist"`)**: 
  - Навигационная рельса содержит 4 главные категории-аккордеона (`core`, `intelligence`, `voice`, `system`) с элементами `role="tab"`, управляемыми атрибутами `aria-selected` и `aria-controls="panel-{tabId}"`.
  - Внизу рельсы расположен закреплённый футер с кнопкой быстрого выхода `← К 3D-Ядру [Esc]`.
  - Встроенный локальный поиск настроек с фокусом по горячей клавише `/` (`Slash`) и быстрой фильтрацией по атрибутам `data-search`.
- **`SettingsPanel.vue` (`role="tabpanel"`)**: 
  - 4 независимых контейнера с атрибутами `role="tabpanel"`, `:id="'panel-' + activeTab"` и `:aria-labelledby="'tab-' + activeTab"`.
  - Непрерывный вертикальный рендер секций внутри активной категории с ограничением ширины потока `max-w-[880px]` и унифицированным межсекционным ритмом `gap-8`.
  - Двусторонняя синхронизация скролла через `IntersectionObserver` с точным расчётом смещения `top = targetEl.offsetTop - scrollContainer.offsetTop - 24` и аппаратной защитой `isProgrammaticScroll` во время вызова `scrollTo`.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│              A.R.C. SETTINGS WORKSPACE (Edge-to-Edge in var(--arc-plane))               │
├──────────────────────────────┬──────────────────────────────────────────────────────────┤
│ SETTINGS MENU (role="tablist")│ SETTINGS PANEL (role="tabpanel", max-w-[880px], gap-8)  │
│ ┌──────────────────────────┐ │ ┌──────────────────────────────────────────────────────┐ │
│ │ 🔍 Поиск (клавиша "/")   │ │ │ Global Conflict Banner (если есть активные правила)  │ │
│ └──────────────────────────┘ │ └──────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────┐ │ ┌──────────────────────────────────────────────────────┐ │
│ │ 🎛️  ОБЩИЕ (role="tab")    │ │ │ [panel-core] -> GeneralSettingsSection.vue           │ │
│ │   ├─ Быстрые настройки   │ │ │  ├── QuickCoreSection.vue                              │ │
│ │   ├─ Внешний вид          │ │ │  ├── AppearanceSection.vue                            │ │
│ │   ├─ Навигация           │ │ │  ├── TabNavigationSection.vue                         │ │
│ │   ├─ Панели и виджеты    │ │ │  ├── WidgetControlsSection.vue                        │ │
│ │   ├─ Горячие клавиши     │ │ │  ├── HotkeysSection.vue                               │ │
│ │   └─ Интеграции          │ │ │  └── VkIntegrationsSection.vue                       │ │
│ │                          │ │ │                                                      │ │
│ │ 🧠 ИНТЕЛЛЕКТ (role="tab") │ │ │ [panel-intelligence] -> AiSettings.vue               │ │
│ │   ├─ Маршрутизация ИИ    │ │ │  ├── RoutingSection.vue                               │ │
│ │   ├─ Облачные провайдеры │ │ │  ├── ProvidersSection.vue                              │ │
│ │   ├─ Локальный ИИ        │ │ │  ├── LocalAISection.vue                               │ │
│ │   └─ Модели и загрузки   │ │ │  └── ModelManagerSection.vue                         │ │
│ │                          │ │ │                                                      │ │
│ │ 🎙️ ГОЛОС (role="tab")     │ │ │ [panel-voice] -> VoiceSettings.vue                   │ │
│ │   ├─ Распознавание (STT) │ │ │  ├── STTSection.vue                                   │ │
│ │   ├─ Синтез речи (TTS)   │ │ │  ├── TTSSection.vue                                   │ │
│ │   └─ Микрофон и звук     │ │ │  └── VoiceAudioSection.vue (sections/voice/)        │ │
│ │                          │ │ │                                                      │ │
│ │ 💻 СИСТЕМА (role="tab")   │ │ │ [panel-system] -> PerformanceSettings.vue            │ │
│ │   ├─ Данные и хранилище  │ │ │  ├── StorageDataSection.vue                           │ │
│ │   ├─ Безопасность        │ │ │  ├── SafetySecuritySection.vue                        │ │
│ │   ├─ Диагностика         │ │ │  ├── DiagnosticsSection.vue                           │ │
│ │   └─ Производительность  │ │ │  └── PerformanceOptionsSection.vue                   │ │
│ └──────────────────────────┘ │ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────┴──────────────────────────────────────────────────────────┘
```

---

## 2. Иерархическая Карта: 4 Категории и 17 Секций

Всего в системе настроек **4 глобальные категории** (`SettingsTab`) и **17 активных секций**.

| Категория (`SettingsTab`) | Название RU / EN | Иконка Lucide | ID Секции (`sectionId`) | Компонент Vue |
|---|---|---|---|---|
| **`core`** | Общие / General | `SlidersHorizontal` | `section-general` | `QuickCoreSection.vue` |
| | | | `section-appearance` | `AppearanceSection.vue` |
| | | | `section-navigation` | `TabNavigationSection.vue` |
| | | | `section-widgets` | `WidgetControlsSection.vue` |
| | | | `section-shortcuts` | `HotkeysSection.vue` |
| | | | `section-integrations` | `VkIntegrationsSection.vue` |
| **`intelligence`** | Интеллект / Intelligence | `BrainCircuit` | `section-router` | `RoutingSection.vue` |
| | | | `section-providers` | `ProvidersSection.vue` |
| | | | `section-local` | `LocalAISection.vue` |
| | | | `section-models` | `ModelManagerSection.vue` |
| **`voice`** | Голос / Voice | `Mic` | `section-stt` | `STTSection.vue` |
| | | | `section-tts` | `TTSSection.vue` |
| | | | `section-audio` | `VoiceAudioSection.vue` |
| **`system`** | Система / System | `Cpu` | `section-storage` | `StorageDataSection.vue` |
| | | | `section-safety` | `SafetySecuritySection.vue` |
| | | | `section-diagnostics` | `DiagnosticsSection.vue` |
| | | | `section-performance` | `PerformanceOptionsSection.vue` |

---

## 3. Файловая Дерево-Структура (File Map)

```
src/renderer/features/settings/
├── components/
│   ├── SettingsMenu.vue              # Левая навигационная рельса (список табов, поиск)
│   ├── SettingsPanel.vue             # Правая главная панель с переключением табов
│   ├── SettingsSectionHeader.vue     # Единый конституционный заголовок секции
│   ├── GeneralSettingsSection.vue    # Контейнер таба "Общие" (core)
│   ├── AiSettings.vue                # Контейнер таба "Интеллект" (intelligence)
│   ├── VoiceSettings.vue             # Контейнер таба "Голос" (voice)
│   ├── PerformanceSettings.vue       # Контейнер таба "Система" (system)
│   │
│   ├── primitives/                   # Единые стилистические примитивы (Design System)
│   │   ├── SettingsBlock.vue         # Карточка-контейнер (bg-[var(--arc-block)])
│   │   ├── SettingsRow.vue           # Строка параметра (заголовок, описание, инпут)
│   │   ├── CrossLink.vue             # Компонент безнавигационной ссылки на другой раздел
│   │   ├── ConflictBanner.vue        # Баннер предупреждения о конфликтах настроек
│   │   ├── DangerZone.vue            # Блок сброса и опасных операций
│   │   ├── RoleCard.vue              # Карточка выбора роли ИИ
│   │   ├── SchemeView.vue            # Просмотр схемы маршрутизации
│   │   ├── StatusBadge.vue           # Статусный индикатор
│   │   └── StepChecklist.vue         # Чеклист шагов подготовки (Ollama/CUDA)
│   │
│   └── sections/                     # Компоненты 17 секций настроек
│       ├── general/                  # Секции таба "Общие"
│       │   ├── QuickCoreSection.vue  # Быстрые настройки (громкость, автозапуск, эко)
│       │   ├── AppearanceSection.vue # Внешний вид (тема, свечение, анимация)
│       │   ├── TabNavigationSection.vue # Позиция бара и закрепленные табы
│       │   ├── WidgetControlsSection.vue # Виджеты, пресеты, фиксация и сброс
│       │   ├── HotkeysSection.vue    # Справочник горячих клавиш
│       │   └── VkIntegrationsSection.vue # Интеграция VK Music и плеер
│       │
│       ├── localAI/                  # Дочерние карточки локального ИИ
│       │   ├── BuiltinModelCard.vue
│       │   └── OllamaEngineCard.vue
│       ├── providers/                 # Дочерние модальные окна и карточки провайдеров
│       │   ├── FallbackRulesSection.vue
│       │   ├── GeminiKeyModal.vue
│       │   ├── ManualIpModal.vue
│       │   ├── PresetCatalog.vue
│       │   ├── ProviderCard.vue
│       │   ├── ProviderManualIpBlock.vue
│       │   ├── ProviderModelCatalog.vue
│       │   └── WhereToThinkSelector.vue
│       │
│       ├── voice/                    # Секции таба "Голос"
│       │   └── VoiceAudioSection.vue # Микрофон, тест, VAD и рестарт сервера
│       ├── STTSection.vue            # Распознавание речи (Whisper / Sherpa)
│       ├── TTSSection.vue            # Синтез речи (Silero TTS)
│       ├── RoutingSection.vue        # Умный маршрутизатор ИИ
│       ├── ProvidersSection.vue      # Список облачных провайдеров (OpenAI/Gemini)
│       ├── LocalAISection.vue        # Управление Ollama и встроенным движком
│       ├── ModelManagerSection.vue   # Менеджер загрузки GGUF/Whisper моделей
│       │
│       └── system/                   # Секции таба "Система"
│           ├── StorageDataSection.vue# Очистка памяти и БД
│           ├── SafetySecuritySection.vue # Подтверждение команд и песочница
│           ├── DiagnosticsSection.vue# Логи и диагностический отчёт
│           └── PerformanceOptionsSection.vue # Графика, VSync, целевой FPS
│
├── composables/
│   ├── useSettingsNav.ts             # Управление переключением табов, поиска и скролла
│   ├── useSettingsVisibility.ts      # Lazy-load и видимость элементов
│   ├── useCollapsedSections.ts       # Состояние сворачивания секций
│   └── useLocalAIEngine.ts           # Управление процессами Ollama / Llama.cpp
│
└── stores/
    └── settings.store.ts             # Единое Pinia-хранилище всех настроек A.R.C.
```

---

## 4. Поток Данных и Навигация

### А. Навигация, Скролл и W3C WAI-ARIA синхронизация (`useSettingsNav.ts` & `SettingsPanel.vue`)
1. `SettingsMenu.vue` (`role="tablist"`): навигационная рельса с элементами `role="tab"` для 4 категорий (`core`, `intelligence`, `voice`, `system`), поддержка горячей клавиши `/` (`Slash`) для мгновенного фокуса в поле поиска.
2. При клике на пункт меню или использовании компонента `<CrossLink tab="..." sectionId="..." />` вызывается функция `navigateToSection(tab, sectionId)`.
3. `useSettingsNav` активирует нужную категорию (`activeTab.value = tab`) и переключает секцию (`activeSection.value = sectionId`).
4. В `SettingsPanel.vue` активная категория представлена контейнером с атрибутами `role="tabpanel"`, `:id="'panel-' + activeTab"` и `:aria-labelledby="'tab-' + activeTab"`. Секции внутри рендерятся единым потоком с шириной `max-w-[880px]` и отступом `gap-8`.
5. Правая панель автоматически выполняет плавный скролл (`scrollIntoView({ behavior: 'smooth' })`) к элементу с соответствующим `id="sectionId"`.
6. Синхронизация активной секции при ручном скролле осуществляется через `IntersectionObserver` с защитой флагом `isProgrammaticScroll`, предотвращающим дребезг активного пункта меню во время программного скролла.

### Б. Хранение состояния (`settings.store.ts`)
- Все значения настроек хранятся в реактивном Pinia-сторе `useSettingsStore()`.
- Изменения автоматически синхронизируются с `localStorage` Windows/Electron приложения.
- Для критических настроек (размеры виджетов, темы, языковые пакеты) генерируются SyncToast-уведомления.

### В. Межсекционные ссылки (`CrossLink.vue`)
Для устранения дублирования параметров в разных разделах применяется паттерн **CrossLink**:
- Настройка логически закрепляется за одной целевой секцией.
- В альтернативных местах отображается лаконичная кнопка-ссылка `<CrossLink>`, перенаправляющая пользователя прямо к целевому прибору.

```html
<!-- Пример в QuickCoreSection.vue для перехода в раздел Внешнего вида -->
<CrossLink tab="core" sectionId="section-appearance" label="Цветовая палитра" />
```

---

## 5. Индексация для поиска (`data-search` & `data-setting-id`)

Каждая строка параметра снабжена атрибутами:
- `data-search="..."` — текстовые ключевые слова на русском и английском для работы встроенной поисковой строки в `SettingsMenu.vue`.
- `data-setting-id="..."` — машиночитаемый идентификатор, соответствующий реестру `docs/ui-inventory/settings-registry.json`.

---

## 6. Базовые Принципы Дизайн-Системы Настроек (Visual Constitution)

1. **Цвета поверхностей**: только через системные переменные `var(--arc-frame)`, `var(--arc-plane)`, `var(--arc-block)`, `var(--arc-rail)`, `var(--arc-hover)`, `var(--arc-hairline)`. Литеральные цветные фоны запрещены.
2. **Акцентный цвет**: динамический `var(--accent)`, `var(--accent-text)`, `var(--accent-border)` без хардкодинга классов `text-red-500`.
3. **Единый вид контролов**:
   - `ArcToggle` — бинарные флаги (On/Off).
   - `ArcSlider` — непрерывные числовые значения (громкость, VAD, скорость).
   - `ArcSelect` — выбор из выпадающего списка.
   - `CrossLink` — межсекционные переходы.
