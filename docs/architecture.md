# Архитектура и Структура (A.R.C. Core)

## 1. Паттерны и Слои
- **Главный процесс (Main)**:
  - `src/main/services/`: Изолированные классы-сервисы, отвечающие за одну бизнес-область.
  - `src/main/ipc/`: Обработчики IPC (Inter-Process Communication), регистрирующие мосты между UI и системными сервисами.
  - Паттерн *Провайдер* (LLM): Интерфейс `AiProvider` и `ProviderManager` управляют LLM-запросами, разделяя логику вендоров.
- **Интерфейс (Renderer)**:
  - `src/renderer/features/`: Модульная структура, каждая папка (chat, tasks, settings, commands) содержит свои `components`, `stores`, `composables`, `utils` и `types`.
  - `src/renderer/components/`: Общие переиспользуемые UI-компоненты (например, UI-кит A.R.C., кнопки, инпуты).
  - Паттерн *Модульный Bootstrap*: Инициализация плагинов Vue и Pinia разнесена по папкам `plugins/` и `mocks/`.
- **Shared layer** — `src/shared/`:
  - Общие TypeScript-типы и интерфейсы.
  - Контракты данных.
  - IPC channel definitions (`channels.ts`).
  - Общие системные константы.
  - Утилиты валидации и другие контракты, используемые Main и Renderer.

## 2. Модульность и Размеры (Strict Limits)
- Любой файл с логикой (components, composables, main services) не должен превышать **400 строк**.
- Любой файл с данными (registry, config, interfaces) не должен превышать **800 строк**.
- Не создавайте "файлы-мусорки". Вместо этого разделяйте на `xxx.registry.ts` (данные), `xxx.utils.ts` (чистые функции), `useXxx.ts` (логика связывания).

## 3. Правила Именования
- Компоненты Vue: `PascalCase` (напр., `MusicCapsuleWidget.vue`, `ProvidersSection.vue`).
- Composables: `camelCase`, начинаются с `use` (напр., `useVoiceCommands.ts`, `useReactor3D.ts`).
- Сервисы (Main): `kebab-case` + `.service.ts` или `camelCase` если это класс-синглтон (напр., `ai.service.ts`, `MacroExecutor.ts`).
- Сторы (Pinia): `kebab-case` + `.store.ts` (напр., `tasks.store.ts`).
