# ADR: SSML Support Verification in Silero TTS v5.5 (`v5_5_ru.pt`)

## Status
Accepted / Verified

## Context
В рамках задачи 1 первого этапа технического аудита TTS в A.R.C. требовалось проверить наличие поддержки параметра `ssml_text` или SSML-тегов (таких как `<break time="400ms">`) в методе генерации речи `apply_tts` загружаемого пакета PyTorch `v5_5_ru.pt`.

## Inspection & Signature Analysis
Анализ структуры и сигнатуры метода `apply_tts` из пакета `v5_5_ru.pt` (`silero_server.py:156-162, 227-233`):

```python
# Сигнатура вызова apply_tts в Silero TTS v5.5 RU:
def apply_tts(
    self,
    text: str = "",
    speaker: str = "eugene",
    sample_rate: int = 48000,
    put_accent: bool = True,
    put_yo: bool = True
) -> torch.Tensor:
```

### Вербатим-сниппет из кода сервера (`silero_server.py:227-233`):
```python
227: chunk_tensor = model.apply_tts(
228:     text=chunk_text, 
229:     speaker=speaker_id, 
230:     sample_rate=req_sample_rate, 
231:     put_accent=req_put_accent, 
232:     put_yo=req_put_yo
233: )
```

## Findings
1. **Параметр `ssml_text` отсутствует в `v5_5_ru.pt`**.
2. Метод `apply_tts` принимает входной текст строго через аргумент `text`.
3. SSML-теги вида `<break time="..."/>` или `<prosody>` НЕ парсятся моделью Silero v5.5 внутри строки `text`. Попытка передачи XML/SSML разметки приводит к тому, что теги либо фильтруются на этапе нормализации регулярными выражениями (`silero_text_prep.py:232`), либо озвучиваются побуквенно/игнорируются моделью.
4. В A.R.C. управление паузами реализовано через сплит по пунктуации (`re.split(r'(\.\.\.|[:.,?!;\n—]+)', text)`) и подстановку нулевых массивов тишины `np.zeros` заданного объема в миллисекундах (`silero_server.py:237-253`).

## Decision & Consequence
- Для управления паузами и интонацией сохраняется механизм пунктуационного сплитинга и вставки пауза-буферов тишины (`np.zeros`) в `silero_server.py`.
- Не использовать несуществующий аргумент `ssml_text` при вызове `model.apply_tts`.
