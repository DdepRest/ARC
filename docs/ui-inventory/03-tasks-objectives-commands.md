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
