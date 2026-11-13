# TTS Replacement Specification: F5-TTS to Silero

## Context
F5-TTS was found to be unstable (ffmpeg crashes, generating corrupted wav files). We need a deep, cold, male voice with emotions ("SHODAN-style").

## Decision
- Replaced F5-TTS with **Silero TTS v5.5** (`v5_5_ru.pt`).
- Selected default voice: `eugene` (deep male Russian voice with `put_accent=True, put_yo=True`).
- Alternative approaches (ONNX Runtime in C#, Sherpa-ONNX) were considered but we stuck with a Python Flask server (`silero_server.py`) as the most proven and flexible integration.
- Included SSML prosody support via `ProsodyAnalyzer` and post-effects via `AudioProcessor` in the existing backend.

## Implementation Details
1. Created `silero_server.py` with Flask endpoints: `/tts`, `/normalize`, `/status`, `/presets`.
2. Created `requirements-silero.txt` including `omegaconf>=2.3.post1,<3`.
3. Added `setup_silero.bat` and updated `setup_f5tts.bat` with appropriate Python version checks.
4. Updated `python_server.service.ts` and `tts.service.ts` to point to the new Silero endpoints and handle process spawning more robustly.
5. Updated C# backend (`Program.cs`, `TtsModels.cs`, `TtsService.cs`, `PythonServerService.cs`) to interface with the Silero server instead of F5-TTS.
6. Centralized model download UX with `ModelDownloadOverlay.vue` and `modelDownload.store.ts`, parsing `__PROGRESS__{json}` stdout markers from Python.
