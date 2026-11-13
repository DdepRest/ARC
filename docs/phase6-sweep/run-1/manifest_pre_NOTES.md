# Run 1 — manifest_pre: примечание о scope-expansion

## Файлы в исходном manifest_pre.sha256 (до правок)
- src/renderer/components/debug/FpsOverlay.vue
- src/renderer/components/debug/PerformanceProfiler.vue
- src/renderer/utils/arcGhostTrapScope.test.ts

## Файлы, добавленные в scope в середине прогона
- src/renderer/utils/arcGhostTrap.ts

## Причина
В тесте arcGhostTrapScope.test.ts первой версии обнаружена tautology:
inline-копия маппинга внутри теста проверяла сама себя, а не production-код.
Исправление потребовало извлечь mapViolationReasonToPrefix() в production-модуль
arcGhostTrap.ts и импортировать её в тест. Это расширило scope.

## Потеря провенанса
Pre-хэш arcGhostTrap.ts НЕ зафиксирован: файл изменён (extraction) до того,
как попал в scope. Восстановление невозможно — в контейнере AI Studio нет .git.

## Верификация текущего состояния
Пост-хэш (после extraction): 1a2ab1b0e28f3f8b39a3e49131ba19e8b7f7777fc764a0d959a8ecfe9a803830
Верифицировано через sha256sum на дату 2026-10-11.

## Falsifiability-подтверждение
При временной замене soft loss префикса на 'GHOST 2D-wrong:' тест
arcGhostTrapScope.test.ts ПАДАЕТ (verbatim вывод приложен в отчёте Q16).
Значит тест защищает production-логику, а не самого себя.
