# Индекс проектной документации A.R.C.

Добро пожаловать в проектную документацию автономной системы A.R.C.

## 1. Канонические документы системы
1. [Текущее состояние системы (current-state.md)](./current-state.md) — актуальные версии компонентов, активные фичи, история релизов и правила исключений.
2. [Архитектура и структура (architecture.md)](./architecture.md) — слои приложения, сервисы, IPC, модульность и правила 400/800 строк.
3. [AI Самоконтроль (11-ai-self-control-and-autodocumentation.md)](./11-ai-self-control-and-autodocumentation.md) — требования к автономному контролю, циклы работы агента и поддержание документации.
4. [Контекст среды AI Studio (AI-STUDIO-CONTEXT.md)](./AI-STUDIO-CONTEXT.md) — специфика облачной среды AI Studio, песочницы, моков и правила выполнения.
5. [Инструкция AI-Архитектора (ARCHITECT_INSTRUCTIONS.md)](./ARCHITECT_INSTRUCTIONS.md) — регламент и системный промпт для DeepSeek (Tech Lead).
6. [Справочник локальной Windows-разработки (windows-local-dev.md)](./windows-local-dev.md) — руководство по окружению для локальных разработчиков на Windows (не является инструкцией для AI Studio).

## 2. Производительность, аудио и профилирование
1. [Метрики и статистика (STATISTICS.md)](./STATISTICS.md) — результаты soak-тестов стабильности, утечек памяти и физические замеры Voice DSP.
2. [Инструкция по профилированию (profiling-guide.md)](./profiling-guide.md) — снятие трейсов FPS, аудио и STT в Chrome DevTools.
3. [Анализ оптимизации FPS (fps-optimization-analysis.md)](./fps-optimization-analysis.md) — композитор, fillrate, bloom и очистка GPU-памяти.
4. [Спецификация TTS Silero (adr/tts-replacement-spec.md)](./adr/tts-replacement-spec.md) — архитектурное решение по переходу на Silero TTS v5.5.

## 3. Дизайн-система и инвентаризация UI
1. [Инвентаризация UI (ui-inventory/)](./ui-inventory/01-overview-and-glossary.md) — реестр пространств, глоссарий и машиночитаемый `settings-registry.json`.
2. [Схема и архитектура Настроек (settings-architecture.md)](./settings-architecture.md) — полная карта 4 категорий, 17 секций, файлов, примитивов и навигации.
3. [Эталоны визуальной конституции (ui-etalon/)](./ui-etalon/README.md) — спецификации эталонных кадров и бейслайны дизайн-системы.

## 4. Архив (archive/)
Завершённые дорожные карты, чек-листы ранних версий и исторические спецификации перенесены в [папку архива](./archive/).

