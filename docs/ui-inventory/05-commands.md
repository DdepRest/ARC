# Инвентаризация пространства: COMMANDS (КОМАНДЫ) (05-commands.md)

> **Пространство:** `commands`  
> **Лейбл:** `КОМАНДЫ`  
> **Файлы реализации:**  
> - `src/renderer/features/commands/components/CommandsView.vue`  
> - `src/renderer/features/commands/components/commandsView/SkillsTab.vue`  
> - `src/renderer/features/commands/components/commandsView/LauncherTab.vue`  
> - `src/renderer/features/commands/components/commandsView/CommandSettingsTab.vue`  
> - `src/renderer/features/commands/components/commandsView/UndoDeleteToast.vue`

---

## 1. Секция: Верхние подвкладки (CommandsView Sub-Tabs)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `commands.nav.skills` | Commands → Nav → Skills | НАВЫКИ И МАКРОСЫ | button (tab) | Просмотр встроенных навыков NLU и кастомных макросов | `CommandsView.vue:26` | - | daily |
| `commands.nav.launcher` | Commands → Nav → Launcher | ЛАУНЧЕР | button (tab) | Настройка проиндексированных папок и ярлыков быстрого запуска | `CommandsView.vue:26` | - | weekly |
| `commands.nav.settings` | Commands → Nav → Settings | НАСТРОЙКИ | button (tab) | Параметры безопасности и подтверждения команд | `CommandsView.vue:26` | `SettingsPanel.vue` | setup-once |

---

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

---

## 3. Секция: Лаунчер (LauncherTab)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `commands.launcher.add_folder` | Commands → Launcher → Add Folder | + ДОБАВИТЬ ПАПКУ | button | Выбор директории Windows для индексации приложений и ярлыков | `LauncherTab.vue:35` | - | setup-once |
| `commands.launcher.remove_folder`| Commands → Launcher → Remove Folder | Иконка корзины | button | Удаление каталога из списка сканирования лаунчера | `LauncherTab.vue:52` | - | setup-once |
| `commands.launcher.reindex` | Commands → Launcher → Reindex | ПЕРЕИНДЕКСИРОВАТЬ | button | Принудительное пересканирование директорий и обновление кэша .lnk/.exe | `LauncherTab.vue:70` | - | weekly |

---

## 4. Секция: Настройки команд (CommandSettingsTab)

> **Внимание (Дубликаты):** Обе настройки этой секции полностью дублируют параметры в настройках ядра `settings.quick`.

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `commands.settings.voice_feedback` | Commands → Settings → Voice Feedback | Озвучивать выполнение команд | toggle | Использовать TTS для подтверждения действий (`settingsStore.voiceFeedback`) | `CommandSettingsTab.vue:12` | `settings.quick.voiceFeedback` (`QuickCoreSection.vue:56`) | setup-once |
| `commands.settings.require_confirm`| Commands → Settings → Require Confirm | Требовать подтверждение | toggle | Запрашивать ответ перед удалением файлов или завершением процессов (`settingsStore.requireConfirm`) | `CommandSettingsTab.vue:23` | `settings.quick.requireConfirm` (`QuickCoreSection.vue:64`) | setup-once |

---

## 5. Секция: Всплывающее уведомление отмены (UndoDeleteToast)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `commands.undo.restore` | Commands → Toast → Undo Delete | ОТМЕНИТЬ УДАЛЕНИЕ | button | Восстановление только что удаленного макроса из буфера | `UndoDeleteToast.vue:18` | - | daily |
| `commands.undo.dismiss` | Commands → Toast → Finalize | Закрыть / Крестик | button | Окончательное подтверждение удаления | `UndoDeleteToast.vue:26` | - | daily |
