# Инвентаризация пространства: FILES (ФАЙЛЫ) (08-files.md)

> **Пространство:** `files`  
> **Лейбл:** `ФАЙЛЫ`  
> **Файл реализации:** `src/renderer/features/files/components/FilesTabView.vue`

---

## 1. Секция: Панель навигации по директориям

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `files.toolbar.navigate_up` | Files → Toolbar → Up Button | Стрелка назад / Вверх | button | Переход на один уровень каталога вверх (`..`) | `FilesTabView.vue:5` | - | daily |
| `files.toolbar.current_path` | Files → Toolbar → Path Display | [Текущий путь] | readonly-info | Текстовое отображение текущей директории в файловой системе | `FilesTabView.vue:8` | - | daily |
| `files.toolbar.refresh` | Files → Toolbar → Refresh Button | Иконка обновления | button | Принудительное пересканирование содержимого текущей папки | `FilesTabView.vue:11` | - | daily |

---

## 2. Секция: Список файлов и сетка элементов

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `files.list.item_click` | Files → List → File/Directory Item | [Имя файла / Папки] | button | Открытие вложенной папки или выбор файла для предпросмотра | `FilesTabView.vue:40` | - | daily |
| `files.list.return_to_root` | Files → List → Root Button | Вернуться в корень | button | Сброс пути в корень проекта при ошибке чтения директории | `FilesTabView.vue:28` | - | weekly |

---

## 3. Секция: Панель предпросмотра файла (File Preview)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `files.preview.close` | Files → Preview → Close Button | Иконка крестика | button | Закрытие панели предпросмотра файла | `FilesTabView.vue:59` | - | daily |
| `files.preview.content` | Files → Preview → Text Content | [Текст файла] | readonly-info / textarea | Отображение текстового содержимого выбранного файла (readonly) | `FilesTabView.vue:72` | - | daily |
