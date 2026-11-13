# Инвентаризация пространства: TRANSCRIPTION (АУДИО) (09-transcription.md)

> **Пространство:** `transcription`  
> **Лейбл:** `АУДИО`  
> **Файл реализации:** `src/renderer/features/transcription/components/TranscriptionView.vue`

---

## 1. Секция: Загрузчик и прослушивание аудиофайла

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.upload.dropzone` | Transcription → Upload → Dropzone | ПЕРЕТАЩИТЕ АУДИО ФАЙЛ | input (file drag-drop) | Выбор аудио/видео файла для транскрибации (MP3, WAV, M4A, OGG, FLAC) | `TranscriptionView.vue:38` | - | daily |
| `transcription.upload.clear_file` | Transcription → Upload → Reset File | Сбросить файл | button | Очистка выбранного аудиофайла и результатов | `TranscriptionView.vue:71` | - | daily |
| `transcription.preview.player` | Transcription → Preview → Audio Player | Плеер источника | custom (audio player) | Предварительное прослушивание загруженного аудиофайла | `TranscriptionView.vue:85` | - | daily |

---

## 2. Секция: Выбор интеллектуальной модели STT

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.model.select` | Transcription → Model → Select Model | [Карточка модели STT] | select / radio | Выбор модели распознавания (Whisper Small, Whisper Large-v3, Gemini 3.5 Flash) | `TranscriptionView.vue:105` | `settings.voice.stt` | daily |
| `transcription.model.download` | Transcription → Model → Download | Скачать ([размер]) | button | Фоновое скачивание локальной модели Whisper с HuggingFace | `TranscriptionView.vue:127` | `settings.voice.stt.download` | setup-once |

---

## 3. Секция: Аппаратное ускорение (GPU Boost / Acceleration)

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.gpu.device_cpu` | Transcription → GPU → Device CPU | ЦП (WASM) | button (radio) | Инференс на процессоре без использования дискретной видеокарты | `TranscriptionView.vue:150` | `settings.models.device` | weekly |
| `transcription.gpu.device_cuda` | Transcription → GPU → Device CUDA | NVIDIA CUDA | button (radio) | Аппаратное ускорение на видеокартах NVIDIA GeForce | `TranscriptionView.vue:167` | `settings.models.device` | weekly |
| `transcription.gpu.device_dml` | Transcription → GPU → Device DirectML | DIRECTML (GPU) | button (radio) | Универсальное ускорение DirectML для AMD / Intel / Apple | `TranscriptionView.vue:185` | `settings.models.device` | weekly |

---

## 4. Секция: Запуск, логи и экспорт результатов

| id | path | label | type | description | file:line | duplicates | frequency |
|---|---|---|---|---|---|---|---|
| `transcription.actions.start` | Transcription → Actions → Start Button | Запустить расшифровку | button | Запуск полного процесса декодирования аудиодорожки в текст | `TranscriptionView.vue:279` | - | daily |
| `transcription.actions.toggle_logs`| Transcription → Actions → Toggle Debug | [Показать / скрыть логи системы] | button | Отображение консоли логов пайплайна транскрипции | `TranscriptionView.vue:291` | - | debug-only |
| `transcription.actions.search` | Transcription → Actions → Search Text | ПОИСК В ТЕКСТЕ... | input | Быстрая фильтрация по таймлайну и сегментам расшифровки | `TranscriptionView.vue:324` | - | daily |
| `transcription.actions.save_txt` | Transcription → Actions → Save TXT | СОХРАНИТЬ TXT | button | Экспорт распознанного текста с таймкодами в текстовый файл | `TranscriptionView.vue:330` | - | daily |
