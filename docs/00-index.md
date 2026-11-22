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

## 4. Release Hardening, Безопасность и Windows QA
1. [Каноническая дорожная карта релиза (PROJECT_RELEASE_ROADMAP.md)](./PROJECT_RELEASE_ROADMAP.md) — сводка Release Gates G1–G8 и история стабилизации.
2. [Модель угроз и Electron Security Boundary (security.md)](./security.md) — CSP, `trustedFileRoot`, sandbox, shell allowlist и Secret Vault.
3. [Дорожная карта TypeScript Strictness (typescript-strictness-roadmap.md)](./typescript-strictness-roadmap.md) — базовый замер typing debt и фазы A–D (`tsconfig.strict.json`).
4. [Протокол живого Windows QA (WINDOWS-RELEASE-QA-PROTOCOL.md)](./WINDOWS-RELEASE-QA-PROTOCOL.md) — чек-листы S4-01..S4-04 (soak, upgrade, Clean OS Win10/11, UX-матрица).
5. [Пошаговый пакет передачи Windows QA (WINDOWS-QA-HANDOFF.md)](./WINDOWS-QA-HANDOFF.md) — пошаговые PowerShell-команды, сверка снимков и чек-лист сбора доказательств для владельца.
6. [Машинно-читаемый реестр статусов релиза (release-status-registry.json)](./release-status-registry.json) — единый JSON-реестр задач Sprint 0–4 и дефектов аудита P0–P2 (Аудит §7.4).
7. [Release Notes v1.0.12 RC (release-notes-v1.0.12-rc.md)](./release-notes-v1.0.12-rc.md) — состав RC-комплекта, политика Silero `CC BY-NC-SA 4.0`, статус подписи `UNSIGNED` и форма sign-off.

## 5. Архив (archive/)
Завершённые дорожные карты, чек-листы ранних версий и исторические спецификации перенесены в [папку архива](./archive/).


