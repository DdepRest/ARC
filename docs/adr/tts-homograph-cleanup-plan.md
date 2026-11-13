# План v7: Окончательная чистка TTS-омографов и ручных ударений A.R.C.

## Контекст и цель
На основе результатов аудиотестов и спектрального DTW-LSD анализа (ADR `docs/adr/tts-homographs-classification.md`) установлено, что из 13 проверенных правил ручного управления ударениями в Silero TTS v5.5 только 1 правило (`\bв\s+замок\b` → `в зам+ок`) является обоснованным. Остальные 12 правил признаны избыточными или вредными и подлежат чистке.

План v7 является окончательной технической спецификацией чистки, полностью интегрирующей требования C1–C4.

---

## ШАГ 0. Документирование ADR и уточнение открытых вопросов (до бэкапов кода)

1. **Редактирование ADR (`docs/adr/tts-homographs-classification.md`)**:
   - Переписать ячейку «Финальный вердикт» для правила 12 (`+система`) **дословно**:
     > `УДАЛИТЬ (сломанный +\1-маркер подтверждённо вреден: спектр 5.80 dB от дефолта; корректный маркер для норматива сИстема — с+истема, НЕ тестировался; дефолтное ударение «система» не верифицировано ухом — открытый вопрос)`
   - Историческую строку реестра с «систЕма» и подраздел «Примечание по нормативу» оставить без изменений.
   - Добавить подраздел:
     > ### Открытый вопрос (post-Stage-1 micro-test, не блокирует чистку)
     > Четыре слова: `система`, `ошибка`, `внимание`, `успешно`.  
     > Нормативы: `сИстема`, `ошИбка`, `внимАние`, `успЕшно`.  
     > Корректные маркеры при необходимости: `с+истема`, `ош+ибка`, `вним+ание`, `усп+ешно`.  
     > Статус: дефолты модели не прослушаны ухом; старый префикс `+\1` для всех четырёх синтаксически несовместим с нормативом (размещение `+` перед согласной). Снятие `mark_keywords` полностью обосновано без ушей. Возврат возможен только корректно размещённым маркером после контрольного прослушивания.

---

## ШАГ 1. Discovery (read-only) и формирование бэкап-манифеста с протоколом отката

1. **Read-only Discovery (перед манифестом)**:
   Выполнить поиск по всему репозиторию (исключая `node_modules`, `tts_test`, `*.bak`, `*.pt`):
   `grep -rn -E "здор\+ово|свя\+зи|\+система|\+ошибка|\+внимание|\+успешно|сист\+ема|mark_keywords|дверной.*зам\+ок|открыть.*зам\+ок|сломать.*зам\+ок|закрыт.*зам\+ок|средневековый.*з\+амок|старый.*з\+амок|красивый.*з\+амок|построить.*з\+амок" . --exclude-dir={node_modules,tts_test,.git} --exclude="*.bak" --exclude="*.pt"`
   Результат: точный discovery-список файлов, подлежащих бэкапу и обновлению.

2. **Создание манифеста `manifest_pre.sha256`**:
   До совершения каких-либо изменений исходного кода (включая Шаг 0) создать файл `tts_test/backup_cleanup/manifest_pre.sha256` со списком sha256-хэшей ВСЕХ файлов из discovery-списка, в обязательный состав которого входят:
   - `docs/adr/tts-homographs-classification.md`
   - `Voice/dicts/tts_dict_homographs.json`
   - `silero_text_prep.py`
   - `src/main/services/tts-text.util.ts`
   - `test_tts_normalization.py`
   - `src/main/services/tts-text.util.test.ts`
   - и любые другие файлы-носители маркеров из discovery-списка.

3. **Протокол отката (Rollback Protocol)**:
   При провале **ЛЮБОГО** гейта проверки (JSON parse, grep-гейты, `npm test`, `python3 test_tts_normalization.py`, `npm run lint`, `npm run check-sizes`, `npm run build`, `npm run check-visual-constitution`):
   - Прогон незамедлительно останавливается.
   - Все затронутые файлы восстанавливаются строго из состояния `manifest_pre.sha256`.
   - Выполняется сверка контрольных сумм `sha256sum -c tts_test/backup_cleanup/manifest_pre.sha256`.
   - Выводится отчёт о провале верификации и полном откате.
   - **Доработка «на лету» после провала категорически запрещена.**

---

## ШАГ 2. Очистка словарей и процедурная арифметика JSON

1. **Измерение исходного состояния `Voice/dicts/tts_dict_homographs.json`**:
   Выполнить измерение:
   `node -e "const d=require('./Voice/dicts/tts_dict_homographs.json'); console.log('count_before:', Object.keys(d.data).length, 'entries_count:', d.entries_count);"`
   *(Измеряемый факт, а не априорное утверждение)*.

2. **Процедурное удаление**:
   - Из объекта `"data"` удалить все записи, кроме ключа правила 3: `\bв\s+замок\b`.
   - Пересчитать количество остатка: `count_after` = 1.
   - Обновить поле `"entries_count": 1`.
   - Выполнить валидацию структуры через `JSON.parse`.
   - В отчёте привести: `count_before` (измеренное), `count_after` (равное 1) и verbatim единственной оставшейся записи `"\\bв\\s+замок\\b": "в зам+ок"`.

---

## ШАГ 3. Чистка Python препроцессора и TypeScript нормализатора

1. **Модификация `silero_text_prep.py`**:
   - Полностью удалить функцию `def mark_keywords(text)` и **ВСЕ** её вызовы (включая вызов `text = mark_keywords(text)` внутри `normalize_text`).
   - Локальный гейт: `grep -n "mark_keywords" silero_text_prep.py` == 0.

2. **Модификация `src/main/services/tts-text.util.ts`**:
   - Полностью удалить TS-хак (строки 375–376), подставлявший дефектный маркер `свя+зи`:
     `formatted = formatted.replace(/(^|[^\p{L}])([Нн]а|[Вв])\s+связи(?=[^\p{L}]|$)/gu, '$1$2 свя+зи');`

3. **Репо-wide гейт `mark_keywords`**:
   - `grep -rn "mark_keywords" . --exclude-dir={node_modules,tts_test,.git} --exclude="*.bak"` == 0 совпадений по всему репозиторию.

---

## ШАГ 4. Обновление файлов из Discovery-списка

1. Обновить **ВСЕ** файлы из discovery-списка, содержащие маркерные строки или `mark_keywords`:
   - `test_tts_normalization.py`: обновить `test_homograph_zdorovo` на проверку чистого текста `"это здорово!"` без маркера `здор+ово`.
   - `src/main/services/tts-text.util.test.ts`: обновить тест «на связи» на проверку чистого текста `"Я на связи."` без маркера `свя+зи`.
   - Любой иной файл из discovery-списка (например, `scripts/tts_homographs_audio_test.py`, если он затронут): скорректировать под чистый формат без удалённых маркеров.

---

## ШАГ 5. Доказательный анализ БД, Кэши и Runbook

1. **Доказательный анализ пересоздания БД (`Voice/dicts/tts_pronunciation.db`)**:
   Grep -n по `silero_server.py` и `tts_dict_loader.py`:
   - В `tts_dict_loader.py` функция `_init_cmu_db()` содержит проверку:
     `if not os.path.exists(CMU_DB_PATH): return False`
   - Цепочка автоматического пересоздания БД при отсутствии файла не предусмотрена (возвращает `False`).
   - **РЕШЕНИЕ**: Файл `Voice/dicts/tts_pronunciation.db` **НЕ удаляем**. Полагаемся на `reload()`, который загружает `_homographs = _load_json(HOMO_DICT_PATH)` напрямую из JSON. Эффект изменения JSON достигается перезапуском сервиса. Удаление/пересоздание БД отложено до отдельного мини-ТЗ с доказанным recreate.

2. **Verbatim-вырезы построения ключей кэша и подтверждённые пути**:
   - Из `silero_server.py`:
     ```python
     CACHE_DIR = "tts_cache"
     os.makedirs(CACHE_DIR, exist_ok=True)
     ```
   - Из `src/main/services/cache.service.ts`:
     ```typescript
     private cacheDir: string = path.join(app.getPath('userData'), 'audio-cache');
     ```
     ```typescript
     generateKey(voicePresetVersion: number, activeModelId: string, normalizedText: string, speed: number, pitch: number, sampleRate: number = 48000, putAccent: boolean = true, putYo: boolean = true, speaker: string = 'eugene'): string {
       const isSpeedTier = this.isSpeedTier(normalizedText);
       const speedQuantized = Math.round(speed / 0.04) * 0.04;
       const pitchQuantized = Math.round(pitch * 2) / 2;
       
       const rawKey = `${voicePresetVersion}|${activeModelId}|${speaker}|${normalizedText}|${speedQuantized}|${pitchQuantized}|${sampleRate}|${putAccent}|${putYo}`;
       const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
       return hash;
     }
     ```

3. **Runbook очистки кэша для пользователя ПК**:
   Для сброса ранее сгенерированного аудио омографов очистить подтверждённые пути:
   - Папку `tts_cache/` в корне проекта Python-сервера.
   - Папку `audio-cache/` в `app.getPath('userData')` приложения Electron.

4. **Эффект чистки**:
   > **Эффект чистки наступает после перезапуска `silero_server.py` / приложения A.R.C.**

---

## ШАГ 6. Двухуровневые Grep-гейты верификации

1. **Набор 1: Код и словари**:
   - `grep -E "здорово|дверной|открыть|на\\s\+замок|сломать|закрыт|средневековый|старый|красивый|построить|связи" Voice/dicts/tts_dict_homographs.json` == 0 совпадений.
   - `grep "свя+зи" src/main/services/tts-text.util.ts` == 0 совпадений.
   - `grep -n "mark_keywords" silero_text_prep.py` == 0 совпадений.
   - `grep -rn "mark_keywords" . --exclude-dir={node_modules,tts_test,.git} --exclude="*.bak"` == 0 совпадений (**Репо-wide гейт**).
   - `grep "в\\s+замок" Voice/dicts/tts_dict_homographs.json` == 1 совпадение И verbatim-вывод `node -e` печатает ровно: `"\\bв\\s+замок\\b": "в зам+ок"`.

2. **Набор 2: Дерево тестов (проверка по маркерным строкам)**:
   - Grep по всему дереву тестов на маркерные строки:
     `здор+ово`, `свя+зи`, `+система`, `+ошибка`, `+внимание`, `+успешно`, `сист+ема`, `mark_keywords`, а также удалённые контексты `зам+ок`/`з+амок` (`дверной`, `открыть`, `на`, `сломать`, `закрыт`, `средневековый`, `старый`, `красивый`, `построить`).
   - **Ожидание**: 0 совпадений (за исключением правила 3 `в зам+ок`).
   - Позитивно: строка `в зам+ок` присутствует в тесте правила 3, если данный кейс покрыт тестом.
   - **Примечание**: Обычные слова в нормальном написании («здорово», «связи») в тестах легитимны.

---

## ШАГ 7. Подтверждённый командный интерфейс

1. **Verbatim-вырез блока `"scripts"` из `package.json`**:
   ```json
   "scripts": {
     "dev": "vite",
     "electron:dev": "electron-vite dev",
     "electron:dev:keep-cache": "electron-vite dev",
     "build": "electron-vite build && npm run check-sizes && npm run check-visual-constitution",
     "check-sizes": "node scripts/check-file-sizes.js",
     "check-visual-constitution": "node scripts/check-visual-constitution.js",
     "exorcise": "node scripts/exorcise.js",
     "preview": "vite preview",
     "start": "vite",
     "lint": "tsc --noEmit",
     "test": "vitest run --config ./electron.vite.config.ts",
     "test:soak": "node scripts/soak-test.js --quick",
     "gate": "npm run lint && npm run check-visual-constitution && npm run test && npm run build && npm run check-sizes",
     "rebuild:electron": "npx --yes @electron/rebuild -f -w better-sqlite3",
     "postinstall": "node scripts/postinstall-check.js",
     "dist:win": "npm run build && npx electron-builder --win --dir",
     "pack:win": "npm run build && npx electron-builder --win"
   }
   ```

2. **Команда полного контрольного прогона**:
   `npm run gate`

3. **Проверка Python-теста**:
   `python3 test_tts_normalization.py`

---

## Зафиксированные инварианты
- Baseline-счётчики 178/126/103/200 не меняются.
- Файлы `silero_server.py`, `src/renderer/**`, `useVoice.ts` и веса моделей не затрагиваются.
- Новые ручные маркеры (например, `с+истема`) не добавляются.
- Правило 3 (`в замок` → `в зам+ок`) сохраняется в неизменном виде.
- Все правки осуществляются по смысловому содержанию блоков, а не по фиксированным номерам строк.
- Провенанс `implementation_plan.md` (Чанк 8c TASKS) полностью сохранён. План чистки TTS v7 расположен в `/docs/adr/tts-homograph-cleanup-plan.md`.
