# A.R.C. — Worklist Sweep Фазы 6 (Ликвидация остаточного долга)

> **Статус документа: HISTORICAL / SUPERSEDED (21.11.2026).** Плановый sweep Фазы 6 завершён; актуальный аудит `npm run check-visual-constitution` фиксирует **0 нарушений** по всем счётчикам в незащищённых файлах. Документ сохранён в истории согласно `ARC_RELEASE_HARDENING_TZ.md` §10.

Документ фиксирует реестр остаточных литералов (`literalAccentClasses` и `coloredStatusFills`) по 20 файлам после механического разведения УСЛОВИЯ 5 (Чанк 6).

В Фазе 6 после снятия Scope Lock с пространств Chat и Tasks и планового sweep-а в Settings, Commands, Memory, Files, Modules, эти счётчики сводятся строго к **0**.

---

## 1. Сводный реестр файлов (20 файлов)

| № | Файл | Подсистема / Зона | `literalAccentClasses` | `coloredStatusFills` | Статус / План Фазы 6 |
|---|---|---|:---:|:---:|---|
| 1 | `src/renderer/components/debug/FpsOverlay.vue` | Debug / Оверлеи | 12 | 4 | Sweep на `var(--status-*)` и `var(--accent)` |
| 2 | `src/renderer/components/debug/PerformanceProfiler.vue` | Debug / Оверлеи | 9 | 1 | Sweep на `var(--status-*)` |
| 3 | `src/renderer/components/reactor/AssistantActionTimeline.vue` | Reactor / HUD | 8 | 1 | Sweep на `var(--status-*)` и `var(--accent)` |
| 4 | `src/renderer/components/reactor/SmartRouterDiagram.vue` | Reactor / Устаревший | 7 | 2 | **МЁРТВ** (orphan): заменён на `RoutingWidget.vue`, подлежит удалению (−7 / −2) |
| 5 | `src/renderer/components/security/ApprovalDialog.vue` | Security / Модалки | 8 | 1 | Sweep danger-кнопок на `var(--status-err)` без заливки |
| 6 | `src/renderer/components/ui/ArcBadge.vue` | UI Primitives | 4 | 3 | Sweep бейджей на `var(--status-*)` с точкой 6px |
| 7 | `src/renderer/components/ui/DownloadNotificationDock.vue` | UI / Док загрузок | 7 | 9 | Sweep прогресс-баров на `var(--accent)` и `var(--status-*)` |
| 8 | `src/renderer/components/ui/StatusBadge.vue` | UI Primitives | 5 | 3 | Sweep статусов на светодиодные токены |
| 9 | `src/renderer/components/voice/VoiceQuickPanel.vue` | Voice HUD | 12 | 11 | Sweep панели микрофона на токены `var(--status-*)` |
| 10 | `src/renderer/features/settings/.../ModelManagerSection.vue` | Settings | 4 | 8 | Sweep секции моделей на токены статуса |
| 11 | `src/renderer/features/tasks/components/CategoryModal.vue` | Tasks (Scope Lock) | 1 | 1 | Sweep модалки категорий |
| 12 | `src/renderer/features/tasks/components/KanbanBoard.vue` | Tasks (Scope Lock) | 1 | 1 | Sweep канбан-доски |
| 13 | `src/renderer/features/tasks/components/RecurrenceModal.vue` | Tasks (Scope Lock) | 1 | 3 | Sweep модалки повторений |
| 14 | `src/renderer/features/tasks/components/SearchFiltersPanel.vue` | Tasks (Scope Lock) | 3 | 2 | Sweep фильтров задач |
| 15 | `src/renderer/features/tasks/components/TaskItem.vue` | Tasks (Scope Lock) | 2 | 4 | Sweep карточки задачи |
| 16 | `src/renderer/features/tasks/components/TaskLinksManager.vue` | Tasks (Scope Lock) | 2 | 1 | Sweep менеджера связей |
| 17 | `src/renderer/features/tasks/components/TaskSubtasksList.vue` | Tasks (Scope Lock) | 2 | 1 | Sweep подзадач |
| 18 | `src/renderer/features/tasks/composables/useCategories.ts` | Tasks (Scope Lock) | 2 | 3 | Sweep палитры категорий |
| 19 | `src/renderer/features/tasks/stores/tasks.store.ts` | Tasks (Scope Lock) | 2 | 2 | Sweep дефолтных цветов стора |
| 20 | `src/renderer/features/vision/components/VisionTabView.vue` | Vision (Чанк 6) | 2 → **0** | 2 → **0** | **Ликвидировано в Чанке 6** |

---

## 2. Итог пересчёта и цели Фазы 6

1. В Чанке 6 файл №20 (`VisionTabView.vue`) полностью зачищается до **0** литералов и **0** статусных плашек.
2. Файл №4 (`SmartRouterDiagram.vue`) является мёртвым кодом (не импортируется) — его плановое удаление в Фазе 6 автоматически спишет 7 литералов акцента и 2 плашки статуса.
3. Оставшиеся файлы (UI примитивы, VoiceQuickPanel, Tasks и Settings) последовательно очищаются в Фазе 6 до достижения абсолютного нуля:
   - `literalAccentClasses` → **0**
   - `coloredStatusFills` → **0**
