# ADR: Division of Responsibilities in TTS Text Normalization (TypeScript vs Python)

## Status
Proposed / Approved

## Context
В текущей архитектуре A.R.C. присутствуют два независимых этапа нормализации текста:
1. `src/main/services/tts-text.util.ts:246` (`formatTextForSpeech`) — Node.js Main Process.
2. `silero_text_prep.py:168` (`normalize_text`) — Python Silero Server.

Анализ выявил дублирование логики обработки чисел, дат, валют, процентов, физических величин, брендов и очистки Markdown/HTML на обоих уровнях.

## Analysis of Duplication
| Класс данных | Обработка в TS (`tts-text.util.ts`) | Обработка в Python (`silero_text_prep.py`) |
| :--- | :--- | :--- |
| **Очистка Markdown/HTML** | Регулярные выражения строк 380–391 (разметка, блоки кода, URLs) | Регулярные выражения строк 173–180 (URLs, пути, блоки кода) |
| **Имя ассистента / Бренды** | `A.R.C.` -> `АРК`, `gemini` -> `джемини` (строка 252) | `Voice/dicts/tts_dict_abbreviations.json` & `tts_dict_it.json` |
| **Числа и Числительные** | `numberToRussianWords` (строка 36), `formatDecimalFraction` | `silero_number_converter.py` (`int_to_words`, `decimal_to_words`) |
| **Даты и Года** | `DAYS_ORDINAL`, `MONTHS_GENITIVE`, `convertYearToGenitive` | `silero_number_converter.py` (`convert_dates`, `get_ordinal_year`) |
| **Единицы и Метео** | Градусы, м/с, км/ч, мм рт. ст., % (строки 307–347) | `normalize_units` (строки 125–166) |
| **Ударения / Омографы** | `свя+зи` (строка 376) | `Voice/dicts/tts_dict_homographs.json` (`resolve_homographs`) |

## Boundary Decision
Фиксируется чёткая архитектурная граница ответственности между слоями:

### 1. TypeScript Layer (Node.js Main Process — `tts-text.util.ts`)
* **Зона ответственности**: Быстрая поверхностная предочистка и системный брендинг.
* **Задачи**:
  - Удаление HTML-тегов, системных блоков кода ```` ```...``` ````, маркерных списков и сырых URL-ссылок до передачи по IPC/HTTP.
  - Единая канонизация названия бренда системы (`A.R.C.` / `ARC` -> `АРК`).
  - Очистка управляющих символов и валидация строки на пустоту.
* **Пример**: `A.R.C. нашел https://example.com/file` -> `АРК нашел `

### 2. Python Layer (Silero Server — `silero_text_prep.py` & `silero_number_converter.py`)
* **Зона ответственности**: Глубокая лингвистическая нормализация (ITN), морфология и фонетизация.
* **Задачи**:
  - Полная числительная нормализация: целые числа, дроби, диапазоны (`10-20` -> `от десяти до двадцати`), телефоны.
  - Согласование дат, месяцев и годов по падежам (`14 февраля 2005 года` -> `четырнадцатого февраля две тысячи пятого года`).
  - Раскрытие единиц измерения и валют с правильным склонением сущностей (`+10°C`, `5 м/с`, `500 тыс.руб.`).
  - Транслитерация англоязычных/IT терминов через `tts_dict_it.json` и SQLite CMU базу (~125k слов).
  - Контекстная расстановка ударений и подстановка знака `+` для омографов из `tts_dict_homographs.json`.
* **Пример**: `2,5 млрд рублей` -> `два с половиной миллиарда рублей`

## Benefits
- Исключение двойной мутации строки и конфликтов падежных окончаний.
- Чёткое разделение быстрой валидации (TS) и ресурсоёмкой лингвистики (Python).
- Повышение производительности и предсказуемости синтеза.
