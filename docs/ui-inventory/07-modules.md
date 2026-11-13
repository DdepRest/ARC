# Инвентаризация пространства: MODULES (МОДУЛИ) (07-modules.md)

> **Пространство:** `modules`  
> **Лейбл:** `МОДУЛИ`  
> **Файл реализации:** `src/renderer/features/modules/components/ModulesView.vue`

---

## 1. Секция: Верхняя панель и фильтрация

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `modules.header.search` | Modules → Header → Search | Поиск модуля... | input | Текстовый фильтр модулей и подсистем по названию и описанию | `ModulesView.vue:26` | - | daily |
| `modules.header.filter_all` | Modules → Header → Filter All | Все (10) | button (tab) | Отображение полного списка архитектурных модулей | `ModulesView.vue:38` | - | daily |
| `modules.header.filter_active` | Modules → Header → Filter Active | Работающие (7) | button (tab) | Фильтр только готовых к работе модулей со статусом ONLINE | `ModulesView.vue:44` | - | daily |
| `modules.header.filter_calibrating`| Modules → Header → Filter Calibrating | Калибровка (3) | button (tab) | Фильтр модулей, находящихся в процессе интеграции | `ModulesView.vue:52` | - | daily |

---

## 2. Секция: Карточки модулей и прямой переход

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `modules.grid.open_module` | Modules → Grid → Module Card → Action | Открыть модуль (Открыть вкладку) | button | Прямой переход в соответствующее пространство приложения (`uiStore.setActiveTab(targetTab)`) | `ModulesView.vue:115` | `TabBar.vue:18` | daily |

> **Примечание:** `ModulesView` выполняет роль интерактивной системной карты архитектуры A.R.C. Кнопки «Открыть модуль» вызывают те же действия перехода, что и верхний/нижний `TabBar`.
