# A.R.C. — TypeScript Strictness & Static Verification Roadmap (S3-11 / P2-11)

**Дата обновления:** 2026-11-21 *(baseline зафиксирован 2026-11-20)*  
**Инструментарий:** `typescript ~5.8.2`, `@vue/compiler-sfc` (встроен в `vue`), `scripts/check-static-boundaries.js` (без добавления новых npm-пакетов и без массового переформатирования легаси-кода).

---

## 1. Принятый подход к статической проверке

В соответствии с правилами `AGENTS.md` и `ARC_RELEASE_HARDENING_TZ.md` (§S3-11):
- **Без ESLint/Prettier big-bang churn:** проект не содержит существующей конфигурации ESLint/Prettier; их установка потребовала бы добавления десятков dev-зависимостей и массовых косметических правок в сотнях файлов.
- **Изолированный строгий профиль (`tsconfig.strict.json`):** запускается через `npm run lint:strict`, включён в `npm run gate`, `.github/workflows/ci.yml` и `.github/workflows/release.yml`. Проверяет `strict: true` (`strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `useUnknownInCatchVariables`, `alwaysStrict`) + `noImplicitOverride: true` для **195** исходных `.ts`-файлов в `src/` (**0 ошибок**).
- **Статическая проверка границ Vue + TS + IPC (`scripts/check-static-boundaries.js`):** запускается через `npm run check-boundaries` и проверяет:
  1. Парсинг, `<script>`/`<script setup>` и `<template>` компиляцию всех 209 Vue SFC в `src/renderer/**/*.vue` через `@vue/compiler-sfc`.
  2. Полное соответствие IPC-каналов между `src/main/preload*.ts` (`ipcRenderer.invoke`, `send`, `on`) и зарегистрированными обработчиками/эмиттерами в `src/main/**`.
  3. Анти-регрессионные правила для укреплённых модулей (запрет `child_process.exec`/`execSync`, запрет возврата устаревшего SHA `9048f71`, целостность packaging-метаданных и иконок A.R.C.).

---

## 2. Измеренный срез Typing Debt (динамика 2026-11-20 → 2026-11-21)

Замер выполнен напрямую на полном проекте через `tsc --noEmit` с отдельными флагами строгости:

| Флаг компилятора | Baseline (2026-11-20) | Текущее (2026-11-21) | Дельта | Основные оставшиеся зоны долга |
|---|---|---|---|---|
| `--strict` | **125** | **6** | **−119** | **0 ошибок во всём незащищённом коде (0 в production, 0 во всех 141 `.test.ts`)**; остаток: **6** ошибок исключительно в защищённых зонах (`built-in-llm.service.ts` [1], `useVoice.ts` [1], `features/tasks/composables/{useFocusSprint,usePresetTemplates,useRestTimer,useTaskCloning}.ts` [4]) |
| `--noImplicitAny` | **108** | **74** | **−34** | Оставшиеся неявные `any` вне строгого профиля (`--strict` уже не блокируется) |
| `--strictNullChecks` | **137** | **35** | **−102** | Защищённые зоны + нестрогие опциональные пути вне `--strict` |

*(В ходе Фаз A, B и Фазы C устранены все 33 ошибки `--strict` в незащищённом production-коде и все 54 ошибки `--strict` в тестовых файлах (`src/env.d.ts` ambient `better-sqlite3`, `RouteApproval.test.ts`, `AtomicRollback.test.ts`, `ObjectiveEngine.decomp.test.ts`, `gigaam-sources.test.ts`, `storage-manager.service.test.ts`) при полной заморозке production-рантайма RC v1.0.12. Защищённые зоны `Reactor`, `useVoice.ts`, `built-in-llm.service.ts`, `ObjectiveEngine`, `Chat`, `Tasks` и орфанный `src/main/windows/mainWindow.ts` не затрагивались.)*

---

## 3. Поэтапная дорожная карта внедрения строгого TypeScript

| Фаза | Область покрытия | Флаги | Статус |
|---|---|---|---|
| **Фаза A (S3-11)** | `src/shared/{config,types,utils}/**`, `src/main/utils/**`, `src/main/services/security/**`, `system-tts.util.ts`, `storage-reset.util.ts`, `database-migrations*.ts`, `database-engine-metadata.ts`, `database-recovery.types.ts`, `approval.service.ts`, `approval.ipc.ts` | `strict: true`, `strictNullChecks: true`, `noImplicitAny: true`, `noImplicitOverride: true` | **Выполнена** (`npm run lint:strict` = 0 ошибок, в CI и `gate`) |
| **Фаза B (S3-11 / v1.0.12 RC)** | Незащищённые `src/main/ipc/*.ts` (`app`, `approval`, `files`, `launcher`, `memory`, `settings`, `skills`, `tools`, `transcription`), `database.ts`, `diagnostics.service.ts`, `eco.service.ts`, `files.service.ts`, `launcher-indexer.service.ts`, `modules-capability.evaluators.ts`, `tasks.service.ts`, `sandbox/**`, `commands/**`, `memory/**`, `tools/**`, `decomposition-validator.ts`, `tts*.ts`, `python_*.ts`, `model-*.ts`, `voice-setup.service.ts`, `sherpa-*.ts`, `gigaam-sources.service.ts`, `stt*.ts`, `llm/{endpoint-normalizer,model-name.util,sse-stream-parser,thinking-cleaner,tools-utils}.ts`, `llm/providers/{provider-health,provider-manager}.ts`, `database-recovery.util.ts`, `database-snapshot.service.ts`, `dialog-logger.ts`, `cache.service.ts`, `storage-manager.service.ts` | `strict: true`, `noImplicitOverride: true` | **Выполнена для незащищённых модулей Main** (`0` ошибок); остаток — только модули с транзитивным импортом защищённого `built-in-llm.service.ts` (`ai/voice/dialog/macros/objective/system/tasks.ipc.ts`, `MacroExecutor.ts`, `request-executor.ts`, `ollama/openai.provider.ts`) |
| **Фаза C (v1.0.12 RC — полностью закрыта вне защищённых зон)** | Подключены незащищённые `src/renderer/stores/{aiConfig,eco,performance,system,terminal,ui}.ts`, `src/renderer/services/hotkeys*.ts`, `src/renderer/features/settings/{logic,composables}/**`, `src/renderer/components/onboarding/{utils,composables}/**`, `src/renderer/features/modules/logic/module-presentation.ts`, `src/renderer/bootstrap/**/*.ts`, `src/renderer/layouts/**/*.ts`, `src/renderer/utils/**/*.ts`, `src/renderer/audio/**/*.ts`, `src/renderer/features/commands/commands.{registry,utils}.ts`; закрыты все 33 production-ошибки и все 54 ошибки в `.test.ts` | `strict: true`, `noImplicitOverride: true` | **Выполнена:** **195** файлов под `tsconfig.strict.json` (**0 ошибок**); во всём незащищённом коде и во всех 141 `.test.ts` — **0** ошибок `--strict` |
| **Фаза D (v1.1 / v1.2)** | Согласованное снятие 6 оставшихся ошибок в защищённых зонах (`built-in-llm.service.ts`, `useVoice.ts`, 4 Tasks composables), затем глобальный `strict: true` и `noUncheckedIndexedAccess: true` / `exactOptionalPropertyTypes: true` | `strict: true` (глобально), затем `noUncheckedIndexedAccess` | Запланирована после Windows QA handoff и отдельного согласования правок в защищённых зонах |

---

## 4. Правило невозврата долга

1. Любой новый файл в `src/shared/**`, `src/main/utils/**`, `src/main/services/{security,sandbox,commands,memory,tools}/**`, `src/renderer/{bootstrap,layouts,utils,audio}/**`, `src/renderer/features/settings/{logic,composables}/**` и `src/renderer/components/onboarding/{utils,composables}/**` автоматически попадает под `tsconfig.strict.json` (`npm run lint:strict`).
2. При добавлении нового IPC-канала в `src/main/preload*.ts` сборка CI блокируется до появления соответствующего обработчика/эмиттера в `src/main/**` (`npm run check-boundaries`).
3. Послабление существующих проверок (`npm run lint`, `npm run lint:strict`, `npm run check-boundaries`) запрещено.
