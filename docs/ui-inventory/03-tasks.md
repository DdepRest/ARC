# Инвентаризация пространства: TASKS (ЗАДАЧИ) (03-tasks.md)

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

---

## 1. Секция: Верхняя панель задач (TaskHeaderBar & RestTimer)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `tasks.header.analytics_button` | Tasks → Header → Analytics | АНАЛИТИКА / СТАТИСТИКА | button | Открытие модального окна подробной аналитики продуктивности | `TaskHeaderBar.vue:24` | `TaskContextRail.vue` | weekly |
| `tasks.header.completion_metric` | Tasks → Header → Completion Ratio | Прогресс выполнения % | readonly-info | Процент завершенных задач за сегодня и общий счетчик | `TaskHeaderBar.vue:42` | `TaskContextRail.vue` | daily |

---

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

---

## 3. Секция: Рабочая область (Views: List, Matrix, Kanban, Sprint)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `tasks.item.toggle_status` | Tasks → Item → Checkbox | Чекбокс завершения | button (checkbox) | Мгновенный перевод задачи в статус Done/Active | `TaskItem.vue:42` | Kanban drag/drop | daily |
| `tasks.item.decompose_ai` | Tasks → Item → AI Decompose | Декомпозиция AI | button | Автоматическое разделение сложной задачи на подпункты через LLM | `TaskItem.vue:64` | `EisenhowerMatrix.vue` | daily |
| `tasks.item.start_sprint` | Tasks → Item → Start Sprint | Начать спринт | button | Привязка задачи к таймеру Pomodoro и переход в режим фокуса | `TaskItem.vue:78` | `FocusSprintView.vue` | daily |
| `tasks.item.delete` | Tasks → Item → Delete Task | Удалить задачу | button | Удаление задачи из локальной базы | `TaskItem.vue:95` | - | daily |

---

## 4. Секция: Боковой инспектор (TaskContextRail)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `tasks.rail.subtasks_add` | Tasks → Rail → Add Subtask | + Добавить подзадачу | input / button | Добавление дочернего элемента к выбранной задаче | `TaskContextRail.vue:85` | - | daily |
| `tasks.rail.notes_edit` | Tasks → Rail → Task Notes | Заметки к задаче... | input (multiline) | Дополнительный контекст и описание задачи | `TaskContextRail.vue:120` | - | daily |

---

## 5. Секция: Модальные окна (Категории, Аналитика, Повторения)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `tasks.modals.category.create` | Tasks → Modals → Category → Add | Создать категорию | button | Сохранение новой категории с персональным цветом | `CategoryModal.vue:54` | - | weekly |
| `tasks.modals.category.delete` | Tasks → Modals → Category → Delete | Удалить категорию | button | Удаление категории и сброс меток у задач | `CategoryModal.vue:72` | - | weekly |
| `tasks.modals.recurrence.save` | Tasks → Modals → Recurrence → Save | Сохранить график | button | Применение правила повторения задачи | `RecurrenceModal.vue:65` | - | weekly |
