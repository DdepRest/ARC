# A.R.C. Performance & Soak Statistics

## 1. Soak-тест стабильности и памяти (`scripts/soak-test.js --mode=simulation`)

> **Классификация методологии (Engineering Audit 07.11.2026)**:  
> Скрипт `scripts/soak-test.js` по умолчанию работает в режиме **Synthetic Node.js / SQLite Benchmark (`--mode=simulation`)** внутри одного процесса Node.js. Реально измеряются `Main Process RSS` (`process.memoryUsage().rss`), `Heap Used` (`process.memoryUsage().heapUsed`) и пропускная способность транзакций `better-sqlite3` / сериализации JSON / Float32 PCM буферов. Дочерние процессы Electron Renderer и Python Silero в режиме `--mode=simulation` не запускаются (в `soak-results.csv` колонки `renderer_rss_mb` и `python_rss_mb` фиксируются как `N/A`; исторические значения в архиве `docs/archive/soak-results.csv` были получены расчётной формулой и не являются замерами живых процессов ОС).

### 1.1 Методология синтетического бенчмарка (`scripts/soak-test.js`)
Стресс-тестирование базовых примитивов ядра A.R.C. под непрерывной смешанной нагрузкой:
- **База данных**: 10 000 сообщений SQLite (`better-sqlite3`, пакетная транзакционная вставка диалогов, индексация).
- **Макросы (сериализация)**: 100 циклов сериализации и парсинга JSON-структур макросов.
- **Аудио / VAD (DSP-буферы)**: генерация и расчёт RMS по 512-сэмпловым PCM Float32 буферам.
- **Симуляция вызовов LLM / TTS**: 20 циклов формирования пейлоадов и 24 кГц Float32 массивов в памяти Node.js.

### 1.2 Критерии прохождения (Quality Gates — Main Node Process)
| Метрика | Порог допуска | Результат (Main Process) | Статус |
|---|---|---|---|
| Рост RSS Node/Main-процесса | ≤ 200 МБ за прогон | **+6.87 МБ** (30 мин) / **≤ 15 МБ** (`--quick`) | ✅ PASS |
| Утечки дескрипторов (EMFILE) | 0 дескрипторов | **0 утечек** | ✅ PASS |
| Необработанные исключения | 0 fatal exceptions | **0 ошибок** | ✅ PASS |
| Скорость пакетной вставки БД | > 500 оп/сек | **~1 850 оп/сек** | ✅ PASS |

### 1.3 Историческая таблица синтетического прогона (`docs/archive/soak-results.csv`)

*Примечание: `Main RSS` и `Heap Used` — реальные замеры `process.memoryUsage()` процесса Node.js; колонки `Renderer RSS` и `Python RSS` в актуальном `scripts/soak-test.js --mode=simulation` выведены в `N/A` во избежание подмены реальной телеметрии формулой.*

| Временная метка | Main RSS (МБ, реальный замер) | Renderer RSS (МБ, симуляция) | Python RSS (МБ, симуляция) | Heap Used (МБ, реальный замер) | Сообщений в БД |
|---|---|---|---|---|---|
| T+00:00 (Start) | 57.57 | N/A (ист. симуляция: 120.00) | N/A (ист. симуляция: 180.00) | 4.58 | 0 |
| T+05:00 | 60.65 | N/A (ист. симуляция: 126.67) | N/A (ист. симуляция: 181.00) | 4.65 | 1 668 |
| T+10:00 | 63.28 | N/A (ист. симуляция: 136.68) | N/A (ист. симуляция: 182.50) | 5.81 | 3 335 |
| T+15:00 | 64.70 | N/A (ист. симуляция: 146.68) | N/A (ист. симуляция: 184.00) | 6.25 | 5 000 |
| T+20:00 | 63.29 | N/A (ист. симуляция: 156.69) | N/A (ист. симуляция: 185.50) | 6.29 | 6 667 |
| T+25:00 | 64.30 | N/A (ист. симуляция: 166.70) | N/A (ист. симуляция: 187.00) | 7.15 | 8 334 |
| T+30:00 (End) | **64.44** | **N/A** (ист. симуляция: 170.00) | **N/A** (ист. симуляция: 190.00) | **7.20** | **10 000** |

**Вывод**: В однопроцессном синтетическом тесте Node.js + `better-sqlite3` отсутствуют признаки линейного накопления памяти (memory leak). Синтетический прогон **не заменяет** реальный многопроцессный Soak-тест на Windows.

### 1.4 Реальный многопроцессный Soak Harness на Windows (`S4-01`)
- **Инструментарий:** `scripts/windows-soak-harness.ps1` (живой мониторинг дерева процессов `Electron Main`, `Chromium Renderer/GPU`, `Python Silero TTS`, `STT Worker`, `Local LLM`, `Download Workers`, размеров `arc.db`/`arc.db-wal`, дескрипторов, потоков, перезапусков и post-exit проверки orphan-процессов) + `scripts/soak-report-analyzer.cjs` (расчёт `p50`/`p95` задержек, линейного наклона памяти после warmup в МБ/час и полноты 11 обязательных сценариев).
- **Статус живого 2–4-часового прогона на Windows 10/11:** **`NOT RUN`** (выполняется владельцем на целевом Windows-оборудовании; лимиты RAM фиксируются по фактическому low-end hardware baseline из `soak-meta.json`).

---

## 2. Статистика Voice DSP Pipeline (Silero TTS v5.5)

Контрольные физические замеры аудио-тракта:
- **Длительность аудио**: Без фазовых искажений (Δ = только реверб-хвост +0.6 с).
- **Сдвиг тона (Pitch shift)**: Синусоида 200 Гц: 200.8 → 183.9 Гц (фактор 0.9157, расчетный 0.9170 ✓).
- **Медианная f0 речи**: 95.6 → 92.8 Гц.
- **Подавление сибилянтов (De-esser)**: Полоса 6–9.5 кГц: снижение **+0.8…+3.1 дБ**.
- **Интегральная громкость**: Стабильно −16.1…−16.8 LUFS (разброс **0.60 дБ**).
- **Частота дискретизации**: 48 000 Гц (studio reference).

---

## 3. Анализ бандла и готовность к слабым ПК (`TZ §11`, `npm run analyze:bundle`)

> **Скрипт замера:** `scripts/analyze-bundle.cjs` (`npm run analyze:bundle` → `dist/bundle-report.json`).  
> После удаления 17 МБ неиспользуемых скриншотов (`public/assets/aistudio/`) итоговый каталог сборки `out/` содержит **53 файла**: **`8 892.31 KB` raw** / **`2 014.81 KB` gzip** / **`1 848.73 KB` brotli**.

| Артефакт / Чанк | Загрузка | Raw (KB) | Gzip (KB) | Brotli (KB) |
|---|---|---:|---:|---:|
| `renderer/assets/index-*.js` | Initial entry (Vue + Three.js Reactor + Core UI) | 3 963.23 | 772.05 | 695.82 |
| `renderer/assets/whisper.worker-*.js` | **Lazy Web Worker** (только при запуске локального Whisper) | 1 401.06 | 253.75 | 230.37 |
| `main/index.js` | Electron Main Process | 1 196.76 | 277.36 | 244.58 |
| `renderer/assets/SettingsPanel-*.js` | **Lazy View** (`defineResilientAsyncView`) | 799.64 | 142.52 | 124.60 |
| `renderer/assets/TasksView-*.js` | **Lazy View** | 287.62 | 48.26 | 43.91 |
| `renderer/assets/index-*.css` | Initial CSS (Tailwind + A.R.C. tokens) | 217.93 | 31.14 | 28.41 |
| `renderer/assets/ChatView-*.js` | **Lazy View** | 205.68 | 38.24 | 35.58 |
| `renderer/assets/ObjectivesView-*.js` | **Lazy View** | 121.94 | 22.58 | 20.92 |
| `renderer/assets/TranscriptionView-*.js` | **Lazy View** | 67.78 | 14.70 | 14.05 |
| `renderer/assets/MemoryView-*.js` | **Lazy View** | 65.01 | 12.33 | 11.90 |
| `renderer/assets/CommandsView-*.js` | **Lazy View** | 57.70 | 10.67 | 10.27 |
| `renderer/assets/ModulesView-*.js` | **Lazy View** | 29.17 | 5.83 | 5.54 |

- **Проверка lazy-loading (`allHeavyViewsLazyLoaded`):** **PASS** (все 9 тяжёлых представлений и `whisper.worker` вынесены в отдельные async-чанки и не блокируют первичный рендер).
- **Контроль мусорных ассетов (`zeroForbiddenDeadAssets`):** **PASS** (`0` файлов `assets/aistudio/` и `vosk_server`).
- **Натурные замеры на слабом Windows-ПК (cold/warm startup, RAM/VRAM/CPU, Eco mode):** **`NOT RUN`** в Linux-контейнере; фиксируются при живом Windows QA по `docs/WINDOWS-RELEASE-QA-PROTOCOL.md` и `scripts/windows-soak-harness.ps1` до назначения целевых RAM-порогов.

