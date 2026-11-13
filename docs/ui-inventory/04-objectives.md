# Инвентаризация пространства: OBJECTIVES (ЦЕЛИ) (04-objectives.md)

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

---

## 1. Секция: Верхняя навигация и создание (ObjectivesHeaderNav)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.nav.section_goals` | Objectives → Nav → Goals | ЦЕЛИ И ВЕХИ | button | Переключение в режим иерархии целей и плана выполнения | `ObjectivesHeaderNav.vue:15` | - | daily |
| `objectives.nav.section_topology` | Objectives → Nav → Topology | ТОПОЛОГИЯ СЕТИ | button | Переключение в 2D граф взаимосвязей узлов и зависимостей | `ObjectivesHeaderNav.vue:24` | - | weekly |
| `objectives.nav.section_diagnostics` | Objectives → Nav → Diagnostics | ДИАГНОСТИКА & ЭНТРОПИЯ | button | Анализ стабильности, энтропии решений и когерентности системы | `ObjectivesHeaderNav.vue:33` | - | weekly |
| `objectives.nav.create_button` | Objectives → Nav → New Objective | + СФОРМИРОВАТЬ НАМЕРЕНИЕ | button | Открытие формы создания новой стратегической цели | `ObjectivesHeaderNav.vue:48` | - | daily |

---

## 2. Секция: Метрики системы целей (ObjectivesMetricsRow)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.metrics.total` | Objectives → Metrics → Total | ВСЕГО ЦЕЛЕЙ | readonly-info | Общее число стратегических векторов в системе | `ObjectivesMetricsRow.vue:12` | - | daily |
| `objectives.metrics.health` | Objectives → Metrics → Health Index | ИНДЕКС ЗДОРОВЬЯ СИСТЕМЫ | readonly-info | Расчет когерентности и отсутствия тупиковых путей (%) | `ObjectivesMetricsRow.vue:28` | - | daily |
| `objectives.metrics.progress` | Objectives → Metrics → Avg Progress | СРЕДНИЙ ПРОГРЕСС | readonly-info | Доля выполненных подзадач и шагов по всем активным целям | `ObjectivesMetricsRow.vue:44` | - | daily |

---

## 3. Секция: Список целей (ObjectivesList)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.list.select_item` | Objectives → List → Objective Card | [Карточка цели] | button | Выбор цели для детального изучения в правом холсте | `ObjectivesList.vue:35` | - | daily |
| `objectives.list.filter_status` | Objectives → List → Status Filter | Все / В процессе / Завершены | select / tabs | Фильтрация целей по жизненному циклу | `ObjectivesList.vue:18` | - | daily |

---

## 4. Секция: Холст деталей и маршрута (ObjectiveDetailsWorkspace)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.workspace.approve_route` | Objectives → Workspace → Approve Route | ПРИНЯТЬ МАРШРУТ | button | Подтверждение предложенного LLM плана решения | `ObjectiveDetailsWorkspace.vue:85` | - | daily |
| `objectives.workspace.modify_route` | Objectives → Workspace → Modify Route | СКОРРЕКТИРОВАТЬ | button | Ручное редактирование промежуточных вех | `ObjectiveDetailsWorkspace.vue:98` | - | weekly |
| `objectives.workspace.decline_route` | Objectives → Workspace → Decline Route | ОТКЛОНИТЬ ПЛАН | button | Сброс сгенерированного дерева шагов | `ObjectiveDetailsWorkspace.vue:112` | - | weekly |
| `objectives.workspace.decompose` | Objectives → Workspace → Decompose | ДЕКОМПОЗИРОВАТЬ | button | Запуск генерации подграфа действий через агента | `ObjectiveDetailsWorkspace.vue:134` | - | daily |
| `objectives.workspace.rollback` | Objectives → Workspace → Rollback | ОТКАТ ЦЕЛИ (ROLLBACK) | button | Вызов протокола отката изменений и действий цели | `ObjectiveDetailsWorkspace.vue:150` | - | weekly |

---

## 5. Секция: Топология и Диагностика (TopologySection & DiagnosticsSection)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.topology.node_click` | Objectives → Topology → Node | Клик по узлу графа | button (SVG node) | Выбор узла графа и центрирование графа топологии | `TopologySection.vue:42` | - | weekly |
| `objectives.diagnostics.auto_approve` | Objectives → Diagnostics → Auto Approve | АВТОУТВЕРЖДЕНИЕ ШАГОВ | toggle | Включение автономного выполнения шагов без запроса пользователя | `DiagnosticsSection.vue:62` | `settings.safety` | weekly |
| `objectives.diagnostics.coherence_chart` | Objectives → Diagnostics → Coherence Chart | График когерентности | readonly-info | Динамика стабильности логических связей системы во времени | `DiagnosticsSection.vue:95` | - | weekly |

---

## 6. Секция: Диалог отката (ObjectiveRollbackDialog)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `objectives.rollback.confirm` | Objectives → Rollback Dialog → Confirm | ПОДТВЕРДИТЬ ОТКАТ | button | Вызов `ObjectiveEngine.rollbackObjective` с обратными действиями | `ObjectiveRollbackDialog.vue:55` | - | weekly |
| `objectives.rollback.cancel` | Objectives → Rollback Dialog → Cancel | ОТМЕНА | button | Закрытие диалога отката без выполнения действий | `ObjectiveRollbackDialog.vue:68` | - | weekly |
