# A.R.C. — Autonomous Reactor Core (Desktop AI Assistant)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI Gate](https://github.com/DdepRest/A.R.C/actions/workflows/ci.yml/badge.svg)](https://github.com/DdepRest/A.R.C/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D22.12.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-34.3.0-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue 3](https://img.shields.io/badge/Vue.js-3.5-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org/)

**A.R.C.** — высокопроизводительный локальный автономный ассистент нового поколения для настольных систем, объединяющий голосовой интерфейс реального времени, когнитивный диалог с LLM, исполнение макросов и многоуровневую изоляцию безопасности.

---

## 🛠 Технологический стек

- **Ядро приложения**: [Electron 34](https://www.electronjs.org/) (Main/Preload) + [TypeScript 5.8](https://www.typescriptlang.org/)
- **Пользовательский интерфейс**: [Vue 3.5](https://vuejs.org/) (Composition API) + [Pinia 2.3](https://pinia.vuejs.org/) + [Tailwind CSS 4](https://tailwindcss.com/)
- **Синтез речи (TTS)**: [Silero TTS v5.6](https://github.com/snakers4/silero-models) (`v5_6_ru.pt`) со студийным DSP-трактом (де-эссер, лимитер LUFS, реверберация) и каскадом фолбэков (`Silero → Edge TTS → Windows SAPI`)
- **Распознавание речи (STT)**: Нативный движок на базе Sherpa-ONNX (GigaAM CTC / Zipformer для русского языка + Whisper Small int8 для транскрипции файлов)
- **База данных**: [SQLite](https://sqlite.org/) через высокоскоростной драйвер `better-sqlite3` (WAL + карантин восстановления)

---

## 📁 Структура каталогов

```text
a.r.c/
├── src/
│   ├── main/           # Electron Main-процесс (IPC-хаб, сервисы, безопасность)
│   ├── preload/        # Preload-скрипты и contextBridge
│   ├── renderer/       # Vue 3 UI (пространства, компоненты, Pinia сторы)
│   └── shared/         # Общие типы, утилиты и конфигурации (CSP, Sanitizer, URL)
├── scripts/            # Вспомогательные скрипты (контроль размеров, конституция, soak-тест, воркеры)
├── docs/               # Документация (архитектура, текущее состояние, аудит)
├── Voice/              # Модели STT/TTS и фонетические словари
├── arc.bat             # Скрипт запуска Electron с ротацией логов в logs/
└── package.json        # Манифест проекта и зависимости
```

---

## 🚀 Системные требования

- **Операционная система**: Windows 10 / 11 (64-bit)
- **Оперативная память**: минимум 8 ГБ RAM (рекомендуется 16 ГБ)
- **Процессор**: 4+ ядер с поддержкой инструкций AVX2
- **Среда выполнения (для разработки)**: Node.js `>=22.12.0` (LTS 22.x), Python 3.10+ (для локальной отладки вне встроенного `python-embed`)

---

## 📦 Быстрый старт (Разработка)

### 1. Установка зависимостей
```bash
npm ci
```

### 2. Сервер синтеза речи (Silero TTS)
Сервис `PythonServerService` запускает и контролирует процесс `silero_server.py` **автоматически** при старте приложения (используя встроенный `resources/python-embed` или локальное окружение Python).  
При необходимости ручного запуска сервера для изолированной отладки:
```powershell
.\silero_env\Scripts\Activate.ps1
python silero_server.py
```

### 3. Запуск приложения
- **С логами в файл**: запустить `arc.bat` (скрывает лишний вывод консоли и сохраняет логи в `logs/`).
- **Режим разработки (Hot Reload)**:
```bash
npm run electron:dev
```

### 4. Сборка дистрибутива Windows
```bash
npm run pack:win
```
Собранный установщик (`ARC-Setup-1.0.12.exe`) и портативная версия сохраняются в папку `dist/`.

---

## 🛡️ Безопасность

Модель угроз, компенсирующие контроли для режима `sandbox: false` (`ShellApprovalService`, `SandboxedFS`, Dual-layer CSP, `SecretVaultService` на базе `safeStorage` DPAPI с fallback `session_memory_only`, `Log Sanitizer`) и регламент сообщений об уязвимостях подробно описаны в документе [SECURITY.md](SECURITY.md).

---

## 🧪 Гейт качества и тестирование

В проекте настроен локальный и CI гейт качества:
```bash
npm run gate
```
Команда последовательно выполняет: `lint` (TypeScript) → `check-visual-constitution` (токены дизайн-системы) → `test` (Unit/Vitest) → `build` (компиляция) → `check-sizes` (контроль лимита 400/800 строк). Падение любого шага немедленно прерывает процесс.

- **Стресс/Soak-тестирование (синтетический бенчмарк БД и буферов)**: `npm run test:soak` (или полный цикл: `node scripts/soak-test.js --duration=1800`)

---

## ⚠️ Известные особенности (Known Issues & Workarounds)

- **Audio Buffer Retain (WeakRef)**: При интенсивных многочасовых сессиях микрофона в голосовом режиме рекомендуется перезапуск приложения раз в 3–5 дней.
- **Barge-in (Прерывание)**: Калибровка порога отсечки голоса при фоновом воспроизведении находится в активной доработке.
- **Fallback-DB**: При аварийной блокировке диска SQLite активируется карантин и безопасный режим `DB_SAFE_MODE`.

---

## 📚 Документация и разработка

- [Руководство по участию в разработке (CONTRIBUTING.md)](CONTRIBUTING.md)
- [Политика безопасности (SECURITY.md)](SECURITY.md)
- [Уведомления о сторонних компонентах (THIRD_PARTY_NOTICES.md)](THIRD_PARTY_NOTICES.md)
- [Архитектура системы (docs/architecture.md)](docs/architecture.md)
- [Текущее состояние v1.0.12 (docs/current-state.md)](docs/current-state.md)
- [Инженерный аудит и стабилизация (docs/ENGINEERING_AUDIT_2026-11-07.md)](docs/ENGINEERING_AUDIT_2026-11-07.md)
- [Статистика нагрузки и DSP (docs/STATISTICS.md)](docs/STATISTICS.md)

---

## 📄 Лицензия

Проект распространяется под открытой лицензией MIT. Подробный текст лицензии доступен в файле [LICENSE](LICENSE).
