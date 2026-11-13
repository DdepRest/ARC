# GEMINI.md - A.R.C. CORE INSTRUCTIONS

## 1. ROLE & CORE DIRECTIVES
- Senior Engineering AI Agent for A.R.C.
- Always maintain code cleanliness and project integrity.
- MUST strictly adhere to the `AGENTS.md` workflow for every task.
- MUST update `docs/current-state.md` for architectural/functional changes.

## 2. DEVELOPMENT LIFECYCLE
Follow the canonical lightweight cycle:
1. **Understand**: Analyze user intent and problem scope.
2. **Inspect**: Inspect relevant context (only affected files and docs).
3. **Plan**: Formulate a concise plan before editing.
4. **Change / Execute**: Perform precise, surgical changes.
5. **Verify**: Check file sizes (`npm run check-sizes`), types (`npm run lint`), and build.
6. **Report**: Structured summary (Сделано, Проверки, Риски).

## 3. PROJECT-SPECIFIC STANDARDS
- **TTS Engine**: Primary is Silero TTS v5.6 (`silero_server.py`, `v5_6_ru.pt` with `put_accent=True, put_yo=True`), fallback to Edge TTS / SAPI.
- **Python Server**: Silero TTS process is launched and monitored automatically via `PythonServerService` (`src/main/services/python_server.service.ts`).
- **Voice DSP**: Server-side ffmpeg/numpy DSP in `silero_server.py` is the reference audio processing pipeline. WebAudio DSP in `App.vue` (`voiceDspEnabled`) is disabled by default (`false`) to prevent audio distortion.
- **Performance**: 60 FPS target; strictly respect GPU-friendly rendering patterns (no resource-heavy CSS hacks or layout thrashing).
- **Scope Lock**: Chat and Tasks workspaces are locked against unrequested refactoring or redesign.
- **3D Reactor**: The Three.js reactor core is immutable unless explicitly requested. Never replace with 2D/SVG stubs to circumvent sandbox limitations.

## 4. DOCUMENT PRIORITY HIERARCHY
1. `AGENTS.md` — правила поведения агента и рабочий цикл.
2. `GEMINI.md` — проектный контекст, стандарты и правила работы.
3. `docs/AI-STUDIO-CONTEXT.md` — специфика среды Google AI Studio.
4. Актуальная документация `docs/` (`current-state.md`, `architecture.md`, `STATISTICS.md` и др.).
5. Исторические документы в `docs/archive/` (никогда не имеют приоритета над актуальными).

## 5. CONSTRAINTS
- Modify only the files in `src/**` that are directly required to accomplish the user's task.
- Do not touch unrelated files or subsystems.
- Protected Areas are locked by default. A Protected Area may be modified only when the user explicitly requests a change to that specific area.
- Do NOT delete application source files (`src/**`), configs, or databases without explicit confirmation.
- Verified obsolete temporary artifacts and duplicate documentation may be cleaned or archived when explicitly requested by the user task.
- Do NOT add dependencies unless strictly required.
- NO unrequested features or fake telemetry.
- After code changes MUST run: `npm run lint`, `npm run check-sizes`, and the project build/compile validation available in the environment.
