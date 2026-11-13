# История: Аудио и Голос (Audio & Voice)
- Изначально использовался WebAudio API (Pitch, Echo) прямо в браузере.
- Возникли проблемы с хрипом и искажениями звука, WebAudio DSP (`App.vue`) был отключен (`voiceDspEnabled = false`).
- Произведен переезд на серверную цепочку DSP через `ffmpeg` и `numpy` (скрипт `silero_server.py`).
- Настроен Silero TTS v5.5 (с флагами `put_accent=True, put_yo=True`), решены проблемы с ударениями и числительными.
