# Инвентаризация пространства: MEMORY (ПАМЯТЬ) (06-memory.md)

> **Пространство:** `memory`  
> **Лейбл:** `ПАМЯТЬ`  
> **Файлы реализации:**  
> - `src/renderer/features/memory/components/MemoryView.vue`  
> - `src/renderer/features/memory/components/MemoryToolbar.vue`  
> - `src/renderer/features/memory/components/MemoryGrid.vue`  
> - `src/renderer/features/memory/components/MemoryDetailModal.vue`  
> - `src/renderer/features/memory/components/MemoryFormModal.vue`

---

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

---

## 2. Секция: Сетка карточек памяти (MemoryGrid & MemoryCard)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `memory.grid.card_click` | Memory → Grid → Card Item | [Карточка памяти] | button | Открытие детального просмотра факта и истории доступа | `MemoryGrid.vue:42` | - | daily |
| `memory.grid.card_edit` | Memory → Grid → Edit Card | Иконка карандаша | button | Быстрое открытие формы редактирования записи | `MemoryGrid.vue:64` | `MemoryDetailModal` | weekly |
| `memory.grid.card_delete` | Memory → Grid → Delete Card | Иконка корзины | button | Удаление факта из памяти | `MemoryGrid.vue:78` | `MemoryDetailModal` | weekly |

---

## 3. Секция: Модальные окна (Detail, Form, ConfirmClear)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `memory.modals.form.save` | Memory → Modals → Form → Save | СОХРАНИТЬ | button | Валидация и запись факта в память | `MemoryFormModal.vue:85` | - | weekly |
| `memory.modals.clear_confirm` | Memory → Modals → Clear → Confirm | ОЧИСТИТЬ | button | Окончательное безвозвратное удаление всех записей памяти | `MemoryView.vue:71` | - | setup-once |
