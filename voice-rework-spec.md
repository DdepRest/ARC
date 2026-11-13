# voice-rework-spec.md — A.R.C. Voice Pipeline Rework (TTS + STT v2)

> **Status**: Superseded by Silero v5.5 Implementation (`silero_server.py`, `v5_5_ru.pt` with speaker `eugene`) | See `docs/adr/tts-replacement-spec.md` and `GEMINI.md`.
> **Author**: Buffy (Codebuff) / Spawned from user interview (4 rounds, June 2026)
> **Supersedes**: `docs/tts-rework-spec.md` (Phase 1 only — this spec fully replaces it)
> **Last updated**: 2026-06-28

---

## 0. Table of Contents

1. [TL;DR](#1-tldr)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [User Intent (verbatim quotes)](#3-user-intent-verbatim-quotes)
4. [Voice Identity: "Strict, Deep, No-Smile" for A.R.C.](#4-voice-identity-strict-deep-no-smile-for-arc)
5. [Hybrid Source: Dataset Speaker + Personal Calibration](#5-hybrid-source-dataset-speaker--personal-calibration)
6. [Adaptive Engine Cascade (TTS)](#6-adaptive-engine-cascade-tts)
7. [Adaptive Engine Cascade (STT)](#7-adaptive-engine-cascade-stt)
8. [Adaptive Resource Detection Layer](#8-adaptive-resource-detection-layer)
9. [Utterance Cache (Key, Eviction, Streaming Integration)](#9-utterance-cache-key-eviction-streaming-integration)
10. [Streaming Pipeline + Cache Substitution](#10-streaming-pipeline--cache-substitution)
11. [Russian Language Pipeline](#11-russian-language-pipeline)
12. [Voice Calibration Wizard](#12-voice-calibration-wizard)
13. [Code to Delete / Keep / Add](#13-code-to-delete--keep--add)
14. [IPC Channels & Preload](#14-ipc-channels--preload)
15. [Settings Store Migration](#15-settings-store-migration)
16. [UI / Settings Plan](#16-ui--settings-plan)
17. [Verification & Acceptance Tests](#17-verification--acceptance-tests)
18. [Risks & Open Questions](#18-risks--open-questions)
19. [Phased Rollout](#19-phased-rollout)
20. [Docs to Update](#20-docs-to-update)

---

## 1. TL;DR

- **Voice source**: **Hybrid** — RU public-dataset speaker (deep male, "no smile") as primary timbre + 30–60 s user voice session that contributes a speaker-embedding for zero-shot F5-TTS conditioning. Result: A.R.C.'s voice is **unique and personal**, not borrowed.
- **Single voice across all scenarios**: Same timbre guaranteed by anchoring on the dataset ref + personal speaker-embedding. Prosody / pitch / SSML / FX may vary, but the listener always recognizes A.R.C.
- **Adaptive cascade** (TTS): **F5-TTS Base → F5-TTS Small → E2-TTS → System SAPI**. Engine swap on demand; only one model resident in VRAM at a time.
- **Adaptive cascade** (STT): **Whisper tiny → Whisper base → Whisper small**, all running in browser worker. Already local and free; tier choice driven by GPU/idle signals.
- **Adaptive triggers**: GPU/NPU telemetry (NVIDIA via `nvidia-smi`, Windows performance counters), idle input timer, watched-process list (with drag-and-drop + voice-command addition + auto-detect of high-GPU unknown `.exe`), and an always-on manual preset (Turbo / Standard / Eco) overriding the auto-detector.
- **Utterance cache** (key insight from user): Phrase-level cache keyed on **normalized text + active SSML tags + speed + pitch + voice-preset version + active-model version**. **Hybrid eviction: speed-tiers + LRU + LFU, 100 phrases RAM cap, 250 MB disk cap**. Streaming pipeline always runs; cache-hit substitutes the inference path **transparently** (no audible seam).
- **Russian fidelity**: ITN (numbers → words), abbreviation dictionary (А.Р.Ц., ЦП, ОЗУ, etc.), automatic `\`\`\`code\`\`\`` → raw mode (digits spoken as digits), single voice across RU + EN mixed responses (no accent-switching).
- **Fallback behavior** (when all local models unreachable): **Utterance cache survives** the failure. Cache lookups for seed phrases (wake responses, error notifications) play from disk; cache miss → silent + visible toast. **All local**, never cloud.
- **Code edits**: Replace XTTS→F5-TTS server wiring (already exists), delete Edge TTS path entirely, add adaptive detection service, add voice calibration service, add utterance cache service, redesign `TTSSection.vue` + `STTSection.vue`, extend `voice.ipc.ts`, extend `settings.store.ts`.

---

## 2. Goals & Non-Goals

### Goals

1. **Unique A.R.C. voice**: deep, male, авторitative, calm, stately. Recurrent across every scenario (chat, TTS output, wake/notification prompts).
2. **Russian fluency**: intonation, punctuation, emotion — natural delivery. Numbers read as words; code blocks read literally; abbreviations expanded.
3. **All-local & free**: zero cloud dependency, zero license costs. Cache-first for everything cached.
4. **Adaptive resource use**: heavy cascade during idle/chat; light cascade during games/background. Both **automatic** and **manual override**.
5. **Single voice across scenarios**: the timbre and identity are constant even when models swap.
6. **Utterance caching**: repeated phrases ("Доброе утро, А.Р.Ц.", "Сэр, голосовой модуль не доступен") always sound identical, regardless of active model.
7. **Streaming UX**: text → audible < 1.5 s. Cache hits are instantaneous.
8. **Transparent fallback**: no silent substitution with "wrong voice". Visible toast when local cascade fails.

### Non-Goals

- Multiple concurrent voices / per-character voices (single A.R.C. voice only).
- Cloud TTS/STT integration (ElevenLabs, OpenAI Voice) — explicitly ruled out.
- Voice cloning from arbitrary user recordings as a feature exposed in UI (we capture one calibration session only).
- GPU training / fine-tuning of F5-TTS (zero-shot only).
- SSML 1.1 spec compliance (markdown-style `[пауза]`, `[шёпот]`, etc. — no W3C bags).
- Emotional ML classification of text (auto-intonation is purely rule-based from punctuation).
- Cross-platform beyond Windows 10/11 (PowerShell SAPI fallback is Windows-native; macos / linux are explicitly out of scope).

---

## 3. User Intent (verbatim quotes)

From the user message (Russian, translated with the original preserved):

> "Нужно полностью обновить систему TTS и SST [STT] для ввода и вывода голоса."
> *(Completely update the TTS and STT systems for voice input and output.)*

> "Для A.R.C. требуется создать уникальный голос: глубокий, мужской, статный, властный и спокойный."
> *(A.R.C. needs a unique voice: deep, male, stately, authoritative, calm.)*

> "Система должна безупречно понимать русский язык, включая интонации, знаки препинания и эмоции."
> *(The system must flawlessly understand Russian — intonations, punctuation, and emotions.)*

> "Все функции должны работать локально и быть абсолютно бесплатными."
> *(Everything must work locally and be absolutely free.)*

> "Необходима автоматическая адаптация под устройство: система должна самостоятельно определять, когда можно использовать более тяжёлые модели."
> *(The system needs automatic device adaptation — must self-detect when heavier models can be used.)*

> "Например, при обычной беседе можно загружать сложную модель, а при запуске игры — более лёгкую."
> *(E.g. during normal conversation load a complex model, when launching a game — a lighter one.)*

> "Голос должен быть единым во всех сценариях использования, без изменений или вариаций."
> *(The voice must be one across all usage scenarios, without changes or variations.)*

From interview answers (Round 1 fallback answer):

> "Система должна кэшировать голоса. Допустим если я буду говорить каждый день 'Доброе утро, АРК', а он будет отвечать каждый раз чуть по разному, он может это кэшировать. Так же и ошибками."
> *(The system should cache voices. So if I say "Good morning, ARC" every day and it answers a bit differently each time, it can cache that. Same for errors.)*

From interview answers (Round 2 process-list):

> "+ добавление своих .exe, с помощью голоса"
> *(Adding custom .exe via voice.)*

---

## 4. Voice Identity: "Strict, Deep, No-Smile" for A.R.C.

### 4.1 Persona Definition

| Attribute | Target |
|-----------|--------|
| Pitch (F0) target | ~95–120 Hz (low male, no falsetto) |
| Timbre | Resonant, slightly chest-heavy, "no smile" — flat affect by default |
| Speech rate | Calm, measured. A.R.C. never rushes. |
| Pronunciation | Standard Russian (no regional accent), clear consonants. |
| Authoritative register | Pronoun drop ("Готов", not "Я готов"), short imperative forms. |
| ASR mirror | A.R.C.'s voice should be **easier for A.R.C.'s own Whisper** to recognize (at least acoustic-center consistent). |
| Variation latitude | SSML FX allowed; core timbre must remain recognizable. |

### 4.2 Single-Voice Guarantee

**What "single voice" means in practice** (user-confirmed in Round 1):
- **Timbre is constant.** Regardless of which engine (Base/Small/E2-TTS) is active, the speaker has the same voice fingerprint because all engines are conditioned on the same dataset reference + same user speaker embedding.
- **Prosody may vary by content.** Punctuation-driven melody, SSML effects, and emotion hints are free to modulate cadence, but never the underlying voice.
- **No "wrong voice" fallback.** Local-cascade failure → cache → silent + toast. **Never** a different system voice (SAPI is the absolute last tier, used for raw survival, and clearly badged as degraded).

### 4.3 Comparison with Existing Spec

The previous `tts-rework-spec.md` aimed for "deep male, strict, no smile" but did not specify a hybrid dataset+user pipeline. This spec promotes the user voice as the *primary* anchoring signal, with the dataset as a fallback when no calibration has been recorded.

---

## 5. Hybrid Source: Dataset Speaker + Personal Calibration

### 5.1 Source Selection (Round 1 + Round 4)

**Tiered source hierarchy** (highest priority first):

1. **User calibration recording (60 s session)** → produces a personal **speaker-embedding** (128-dim typical of F5-TTS). This is the primary identity.
2. **Dataset reference** (MLS RU or M-AILABS RU, deep-male speaker) → output and ref-text aligned. Provides the "deep male" baseline timbre when the user recording is unavailable or corrupted.
3. **`Voice/Voice.wav`** (legacy) → only if user explicitly enables "personal clone" in advanced settings. Off by default.

### 5.2 Dataset Speaker Shortlist

Recommended candidates (chosen at Phase 1 listen-test):

| Rank | Dataset | Speaker | Notes |
|------|---------|---------|-------|
| 1 | MLS RU 7k | `spk_326` (or any clearly deep-male) | CC-BY, large pool, dry recordings |
| 2 | M-AILABS RU | "Nabokov" narrator | CC-BY-SA, audiobook, very calm |
| 3 | VCTK | `p286` | EN, useful as cross-language fallback if RU candidate fails listen-test |
| 4 | MLS RU | `spk_502` (deeper female alternate) | Backup if no male candidate passes |

**License filter**: CC-BY, CC-BY-SA, Public Domain, Apache-2.0 only. No proprietary speakers.

**Reference audio spec** (stored in `Voice/Presets/<id>/ref.{wav,txt,meta.json}`):
- Mono, 24 kHz PCM16 WAV.
- 8–15 s clean speech, no music, no filled pauses (`эм`, `э-э`).
- Trimmed silence at both ends (-40 dBFS threshold, via `librosa.effects.trim`).
- Peak normalized to -3 dBFS.
- Verbatim `ref.txt` matching the audio word-for-word.

### 5.3 Blending: Zero-Shot Conditioning (Round 4)

F5-TTS supports **multi-reference** zero-shot inference: feed both the dataset ref and the user speaker-embedding as conditioning signals. Implementation:

```
Reference inputs to F5-TTS:
  - ref_audio: Voice/Presets/<dataset>/ref.wav (always present)
  - ref_text:  matching transcription
  - speaker_emb: <from_user_calibration.wav, 128-dim>  (if available)
```

When `speaker_emb` is **absent** (fresh install, no calibration yet):
- F5-TTS conditions purely on the dataset ref.
- The voice is "deep male strict" (dataset identity) — A.R.C.'s voice exists, but not yet "personalized".

When `speaker_emb` is **present** (after wizard completion):
- F5-TTS blends both signals through its cross-attention layers.
- Output timbre shifts toward the user's vocal-tract characteristics (depth, grain, chest resonance).
- The shift is **subtle** — A.R.C.'s A.I. identity is preserved; the user brings the personal "anchor".

### 5.4 Voice Identity Invariant

Across Base/Small/E2-TTS, the conditioning inputs (`ref.wav`, `ref.txt`, `speaker_emb`) are byte-identical. Every engine produces timbre from the same sources → **no engine-specific voice shift**. The "single voice" guarantee is mechanically enforced, not just policy.

---

## 6. Adaptive Engine Cascade (TTS)

### 6.1 Tiers (Round 2)

| Tier | Model | VRAM | Quality | Use case |
|------|-------|------|---------|----------|
| 1. Heavy | **F5-TTS Base** (`SWivid/F5-TTS_Base`) | ~6 GB | Best | Idle, chat, manual-Turbo, no competing GPU work |
| 2. Medium | **F5-TTS Small** (smaller variant or E2-TTS variant) | ~3 GB | Good | Active chat with concurrent GPU load (browser, video) |
| 3. Light | **E2-TTS** (F5-TTS family, simpler arch) | ~2 GB | Acceptable | Detected `.exe` heavy-load OR low VRAM headroom |
| 4. Survival | **System SAPI** (`System.Speech.Synthesis`) | 0 GB | Mechanical | All Local models fail — emits raw RU voice via PowerShell |

### 6.2 Switching Strategy (Round 2)

**Decision: "one model resident, swap on demand"** — only one TTS model in VRAM at a time. On tier request:
- Capture any in-flight chunks for current tier, finish, then unload.
- Free VRAM (`torch.cuda.empty_cache()`).
- Load new tier's weights (`from_pretrained`).
- Warm-cache 3-5 silent inferences to reduce JIT warm-up of first synthetic request.
- Resume chunk queue.

**Cost**: ~10–15 s swap window. Mitigated by:
- **Pre-cook**: when VRAM sensor crosses 70% → trigger preemptive load of next lower tier during the 10–15 s window. The swap is then a near-zero-time "swap roles".
- **Cache**: repeated wake/error phrases remain available even during swap (read from disk cache).

### 6.3 Manual Preflight Override (Always-on)

User can pin the cascade to one tier explicitly via settings → no auto-detection. Options: `Turbo (Base only) | Standard (auto) | Eco (E2-TTS only)`. Default: `Standard`.

### 6.4 Tier Mapping by Signal

| Signal | Manual preset | Effective tier |
|--------|---------------|----------------|
| Idle, low GPU | Standard | Base |
| Active browser tab + chat | Standard | Base |
| Detected heavy `.exe` not yet committed | Standard | Base → preload Small |
| Detected heavy `.exe` (steam.exe etc) | Standard | Small |
| Detected gpu.heavy.x (auto-detect → confirmed) | Standard | E2-TTS |
| VRAM headroom < 1 GB | Standard | E2-TTS |
| Anything | Turbo | Base |
| Anything | Eco | E2-TTS |
| All models fail | Any | SAPI |

---

## 7. Adaptive Engine Cascade (STT)

### 7.1 Tiers (Round 2)

| Tier | Model | Size | Latency | Use case |
|------|-------|------|---------|----------|
| 1. Heavy | Whisper `small` (.en / multilingual q4) | ~460 MB | ~2-3 s/audio-min | Manual dictation, long-form |
| 2. Balanced | Whisper `base` | ~140 MB | ~0.8 s/audio-min | Chat-bound voice input |
| 3. Light | Whisper `tiny` | ~70 MB | ~0.4 s/audio-min | Wake-word reply, fast commands, gaming |

All tiers are **already local and free**, running in `src/renderer/workers/whisper.worker.ts`. The cache lives in the browser's IndexedDB-backed transformers cache.

### 7.2 Switching Strategy

**Browser-side model swap is heavy** (re-downloading weights, re-compiling ONNX): so STT does **NOT** swap on every signal. Instead:

- **Preload all three tiers on first run** (BackgroundTask) → warmed in browser cache.
- **Tier chosen at inference start**, not pre-scheduled. Smaller tier if GPU memory is tight or detected heavy process.
- **No reload cost when tier chosen** (workers share ONNX runtime; only the model identity in the pipeline call changes).

### 7.3 Tier Mapping by Signal

| Signal | STT tier |
|--------|----------|
| Idle, low GPU | small (best accuracy) |
| Active chat | base |
| Detected heavy `.exe` | tiny |
| Manual override: `Accuracy` | small |
| Manual override: `Speed` | tiny |

---

## 8. Adaptive Resource Detection Layer

### 8.1 Signal Sources (Round 2)

| Source | Mechanism | Polling interval |
|--------|-----------|-------------------|
| **GPU/NPU stats** | `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total` (Windows native invocation via `child_process` exec); fallback to Windows Performance Counters via `os` module | 5 s |
| **Idle input timer** | Renderer-side hook: last `keydown` / `mousemove` time. > 30 s of zero input → "deep idle". | 1 s |
| **Process list** | `tasklist /FI "IMAGENAME eq ..."` for known names. Custom list maintained via Settings or voice. | 5 s |
| **Auto-detect unknown heavy `.exe`** | Watch child processes started under user shell; measure GPU utilization delta on appearance; if delta > 30% GPU for sustained 5 s → candidate. User gets a one-time voice prompt: "Обнаружен новый процесс <name>. Добавить в список игр?" | per-process-start event |
| **Manual preset** | User toggle in top bar: Turbo / Standard / Eco | persistent |

### 8.2 Voice-Activated Process Addition (Round 4)

User can speak:
> «А.Р.Ц., добавь Steam в список игр»
> «А.Р.Ц., следи за Discord»

Flow:
1. Wake-word detected.
2. Command parsed via `intent:` pattern (regex + fuzzy) extracted before being sent to LLM.
3. New process name appended to `settings.adaptiveProcessList`.
4. Voice confirmation cached phrase plays: «Готово, сэр. Steam добавлен в список игр.»

This reuses the wake-word + vocabulary alignment already present in `useChat.ts`.

### 8.3 Drag-and-Drop + Auto-Detect UI

- Drop a `.exe` on the Settings → Adaptive → Process List card → name + path stored.
- Auto-detect-enabled toggle: unknown `.exe` with sustained GPU usage > 30% triggers one-shot voice prompt: «Обнаружен <name>. Это игра?» with `да/нет` short-listener response capture.

---

## 9. Utterance Cache (Key, Eviction, Streaming Integration)

### 9.1 Why Cache (user-critical insight)

User requirement (Round 1): repeated utterances ("Доброе утро, А.Р.Ц.", error notifications, wake responses) must always sound **identical**. If a model swap occurred between two identical phrases, naively each would re-synthesize with slightly different NULL-state of the random sampler → audibly different. Cache prevents this.

### 9.2 Cache Key Composition (most universal)

Cache key = `sha256( voicePresetVersion || activeModelId || normalizedText || tagFingerprint || speedQuantized || pitchQuantized || sampleRate || emotionVector )`

- `voicePresetVersion`: monotonic integer bumped on any ref.wav / speaker_emb change.
- `activeModelId`: `"F5TTS_Base" | "F5TTS_Small" | "E2TTS" | "system_sapi"`. Changing model → automatic invalidation.
- `normalizedText`: trimmed, lowercased, whitespace-collapsed, punctuation normalized (NFC). Full-form, not sentence-split.
- `tagFingerprint`: sorted set of SSML tags in use; FX chain fingerprint.
- `speedQuantized`: 8-bit quantizer (rounds speed to nearest 0.04).
- `pitchQuantized`: 8-bit quantizer (rounds pitch to nearest 0.5 semitone).
- `emotionVector`: aggregated auto-intonation signal (8-bit hash of excitement x).

Result: **one cache slot per unique (voice × text × style) tuple**.

### 9.3 Eviction Policy (Round 3 combined)

**Hybrid three-tier eviction** (the user explicitly requested this combination):

- **Tier A — Speed cache** (always-resident, no eviction):
  - Wake responses: "Слушаю, сэр.", "Да, сэр.", "Я здесь, сэр.", "Жду указаний, сэр."
  - Error notifications: "Сэр, голосовой модуль не доступен.", "Сэр, микрофон не обнаружен."
  - Calibration intros, dismissals, status replies.
- **Tier B — LFU + LRU in RAM**:
  - Cap: 100 entries.
  - LFU on overflow: eviction chooses the entry with lowest (frequency / age) ratio.
  - LRU on tie.
  - Hit count tracked per entry.
- **Tier C — Disk LRU**:
  - Cap: 250 MB.
  - Per-entry size measured as `os.stat().st_size` on the WAV file.
  - LRU on overflow.

**Storage**:

```
Voice/Cache/
├── index.json      # { <key>: { path, hitCount, lastAccessMs, sizeBytes } }
├── sha256-<key>.wav  # PCM16 24 kHz mono
└── .gitkeep
```

`index.json` is rewritten atomically (`rename`) on every mutation.

### 9.4 Invalidation Triggers

- Voice calibration re-recorded → bump `voicePresetVersion` → fresh cache.
- Active model change → all entries for old model have new key → fresh cache (lazy, no manual flush).
- Settings reset → `Voice/Cache/` wiped via UI command.

### 9.5 Streaming-Cache Integration: Invisible Substitution (Round 3)

The streaming **pipeline always runs** (sentence splitter → per-sentence f5tts → AudioQueue). Cache integration as an **inline hook**:

```
sentence → normalize(text) → cacheLookup(key) →
  ├── HIT  → play WAV from disk; passes through AudioQueue to ensure gapless timing (no audible seam).
  └── MISS → POST /tts; on response, audio bytes are both played AND written to cache (asynchronously, non-blocking).
```

Why still go through AudioQueue on hit? To **eliminate any audible discontinuity** between a cached prior chunk and an in-flight freshly synthesized chunk. The hit and miss chunks share the same Web Audio scheduler → playback is mathematically gapless.

**Result**: zero audible seams; identical repeated phrases sound identical; cache misses fall through to live inference transparently.

---

## 10. Streaming Pipeline + Cache Substitution

### 10.1 End-to-End Flow

```
AI response text chunks arrive at tts.service (Electron main):
  ↓
  tts.service.sentenceSplitter(textAccumulator)
  ↓
  for each completeSentence:
    parseSSML(text) → strip tags into [tags, text]
    inferEmotion(text) → { excitement, rate, pitch, primaryFx }
    normalizeRuText(text) → ITN, abbreviations, raw detection
    chunkKey = buildCacheKey(...)
    cacheLookup(chunkKey) →
      ├── HIT  → send WAV bytes via voice:play-audio-chunk
      └── MISS → POST /tts → write to cache + send WAV via voice:play-audio-chunk
  ↓
Renderer:
  AudioQueue chunks sequentially, gapless via scheduled start times.
  voice:play-audio-done event triggers React-like state update.
```

### 10.2 Cancellation Handling

- New user query mid-playback → `voice:cancel` IPC → Electron main flushes POST /tts + signal abort → renderer empty AudioQueue.
- Tier change → middleware completes in-flight, then triggers tier swap (no audible interruption of last chunk).

### 10.3 Latency Targets (with cache)

| Stage | Cold (cache miss) | Warm (cache hit) |
|-------|-------------------|------------------|
| Sentence text ready | 0.2 s | 0.2 s |
| Cache lookup | — | < 0.01 s |
| POST /tts round-trip | 0.8-1.2 s | — |
| AudioQueue decode | 0.05 s | < 0.01 s |
| **First audible word** | **~1.0–1.4 s** | **~0.25–0.4 s** |

---

## 11. Russian Language Pipeline

### 11.1 Module: ITN (Inverse Text Normalization)

Apply before TTS synthesis on **non-code** runs.

| Input | Output |
|-------|--------|
| `127` | `сто двадцать семь` |
| `2024` | `две тысячи двадцать четыре` |
| `-5` | `минус пять` |
| `15:30` | `пятнадцать тридцать` |
| `127.0.0.1` | `сто двадцать семь точка ноль точка ноль точка один` |
| `50%` | `пятьдесят процентов` |

Implementation: invoke existing ITN library (e.g. `num2words` for Russian) wrapped in a small module that detects digit patterns and emits the spelled-out form.

### 11.2 Abbreviation Dictionary

Bundled `Voice/dictionaries/ru-abbr.json`:

```json
{
  "А.Р.Ц.": "аэр цэ",
  "А.Р.С.": "аэр сэ",
  "ЦП": "цэ пэ",
  "ОЗУ": "о зу",
  "ПО": "пи о",
  "ИИ": "искусственный интеллект",
  "ТЗ": "техническое задание",
  "API": "эй пи ай",
  "URL": "ю эр эл",
  "TTS": "ти ти эс",
  "STT": "эс ти ти",
  "ML": "эм эль",
  "GPU": "джи пи ю",
  "CPU": "цэ пи ю"
}
```

Users can extend via settings UI. Matching is case-insensitive, longest-match wins.

### 11.3 Code-Block Detection (Marker-Driven Raw Mode)

Patterns that switch to raw mode (digits spoken as digits):
- Markdown code blocks: ```` ``` … ``` ````, ```` `inline` ````.
- Triple backslash, paragraph-start `<code>`.
- File paths containing `.exe`, `.ts`, `.js`, `.json` etc.
- Numbers in IP addresses, version strings (e.g. `v1.2.3`).

Raw mode flag is part of the SSML tag fingerprint → cached separately, no contamination.

### 11.4 RU / EN Mixed Responses (Round 4: "single voice everywhere")

Single voice reads **both** Russian and English fragments. Rationale:
- Two-tier cascade = audible seam; we already cache aggressively → no perf pressure to split.
- A.R.C.'s voice is the persona, regardless of script.
- Subtle EN accent on English fragments is a feature, not a bug (it's "the same person").

Pre-processing:
- Detect runs ≥ 3 consecutive Latin words within an otherwise Cyrillic paragraph.
- Pass-through unchanged: F5-TTS produces natural bilingual delivery.

If F5-TTS RU version poorly models EN phonemes, fallback: substitute the model's English best-effort transliteration **only if** listen-test in Phase 1 demonstrates the issue.

---

## 12. Voice Calibration Wizard

### 12.1 Trigger Points

- First-ever app launch.
- Settings → Voice → "Калибровать голос заново" button.
- Re-record flow triggered by user request ("А.Р.Ц., перекалибруй голос").

### 12.2 Wizard Steps (Round 3: 30–60s free session)

A full-screen modal with large text prompt and a live waveform + RMS indicator.

1. **Intro card**: объясняем, что A.R.C. записывает 30–60 c, чтобы подстроить голос под пользователя.
2. **Countdown**: 3-2-1.
3. **Free-form prompt**: пользователь говорит **что угодно** в течение 30–60 c. The user can read the on-screen paragraph (shown for convenience) or improvise.
4. **Processing** (animated spinner, ~5–10 s locally):
   - Trim silence, normalize, write `Voice/Calibration/user-60s.wav` (24 kHz mono PCM16).
   - Pass through a small Python script (`scripts/extract_speaker_emb.py`) that runs F5-TTS or `pyannote/embedding` to produce `speaker_emb.npy` (128-dim).
   - Move to `Voice/Calibration/` directory.
5. **Confirmation card**: play a sample sentence ("Я — A.R.C. Ваш автономный ассистент.") in the new hybrid voice. User can Accept or Re-record.
6. Done.

### 12.3 Storage

```
Voice/Calibration/
├── user-60s.wav          # 30-60 s calibrated recording
├── speaker_emb.npy       # 128-dim float32 speaker embedding
├── metadata.json         # { recordedAt, sampleRate, durationSec, version }
└── .gitkeep
```

The dataset ref remains unchanged at `Voice/Presets/<dataset>/ref.wav`.

### 12.4 Privacy / Reset

- "Удалить калибровку" button wipes the entire `Voice/Calibration/` directory → degrades to dataset-only voice.
- Settings reset wipes the directory as part of full reset.

---

## 13. Code to Delete / Keep / Add

### 13.1 Files Deleted

| Path | Reason |
|------|--------|
| `xtts_server.py` | Replaced entirely by `f5tts_server.py` (already done) |
| `xtts_server.py.legacy` | Final cleanup |
| `Voice/Misha.wav` (ref) | Replaced by `Voice/Presets/<dataset>/ref.wav` |
| `Source` MS Edge TTS integration | Edge is cloud, violates "all-local" |

### 13.2 Files Heavily Modified

| Path | Changes |
|------|---------|
| `src/main/services/tts.service.ts` | Rewrite: `speakWithEdgeTTS` removed; new `speakWithAdaptiveTTS` that selects tier via adaptive service + cache lookup. |
| `src/main/services/stt.service.ts` | Upgrade from placeholder to real adapter: Vosk optional, Whisper tier control via IPC. |
| `src/main/services/adaptive.service.ts` (NEW) | GPU/idle/process telemetry. |
| `src/main/services/cache.service.ts` (NEW) | LRU+LFU+disk cache with tier enforcement. |
| `src/main/services/calibration.service.ts` (NEW) | Wizard orchestration, embedding extraction IPC. |
| `src/main/ipc/voice.ipc.ts` | Many new IPC handlers (cache query, adaptive signals, calibration start/progress/end). |
| `src/main/index.ts` | Register new services. |
| `src/renderer/composables/useVoice.ts` | Add adaptive signaling, calibration wizard state. |
| `src/renderer/composables/useAdaptiveVoice.ts` (NEW) | Renderer-side bridge to adaptive service (GPU/process events). |
| `src/renderer/features/settings/components/sections/TTSSection.vue` | Full UI rewrite for voice preset + tier selector + calibration entry. |
| `src/renderer/features/settings/components/sections/STTSection.vue` | Tier picker + calibration status. |
| `src/renderer/features/settings/stores/settings.store.ts` | Migration + new refs. |
| `src/shared/constants/channels.ts` | New IPC channel constants. |
| `src/main/preload.ts` | New bridge APIs. |
| `f5tts_server.py` | Adds `/tts-stream`, `/presets`, `/sample/<id>`, `/cache-stats`, tier switch endpoint (`/tier`), DSP FX chain dispatcher for SSML tags. |

### 13.3 Files Added

| Path | Purpose |
|------|---------|
| `docs/voice-rework-spec.md` (this doc) | New spec |
| `Voice/Presets/<dataset>/ref.wav` + `ref.txt` + `meta.json` | Dataset ref assets |
| `Voice/Cache/index.json` + `sha256-*.wav` | Utterance cache files |
| `Voice/dictionaries/ru-abbr.json` | Russian abbreviation dictionary |
| `scripts/extract_speaker_emb.py` | Python script for speaker embedding extraction |
| `scripts/setup-adaptive-monitor.bat` | Windows helper for nvidia-smi / counters bootstrap |

### 13.4 Dependencies

- Add: `num2words` (Python, ITN) — already in many stacks, very lightweight.
- Add: optional `pyannote/embedding` or `resemblyzer` for speaker embedding extraction (configurable; F5-TTS itself has a fallback embedding path).
- No NEW npm packages required.
- Remove: `msedge-tts` from `package.json` (final cleanup).

---

## 14. IPC Channels & Preload

### 14.1 New IPC Channels (added to `src/shared/constants/channels.ts`)

```ts
export const IPC_CHANNELS = {
  // ... existing
  VOICE_CHUNK:           "voice:play-audio-chunk",
  VOICE_FALLBACK:        "voice:fallback-engaged",
  VOICE_CANCEL:          "voice:cancel",
  VOICE_HIT_CACHE:       "voice:cache-hit",        // for stats UI
  ADAPTIVE_GET_STATE:    "adaptive:get-state",
  ADAPTIVE_FORCE_TIER:   "adaptive:force-tier",
  ADAPTIVE_ADD_PROCESS:  "adaptive:add-process",
  ADAPTIVE_LIST_PROCESSES:"adaptive:list-processes",
  ADAPTIVE_REMOVE_PROCESS:"adaptive:remove-process",
  ADAPTIVE_GPU_UPDATE:   "adaptive:gpu-update",     // push from main → renderer
  ADAPTIVE_TIER_CHANGED: "adaptive:tier-changed",  // push
  ADAPTIVE_PROCESS_INCOMING:"adaptive:process-incoming", // auto-detect unknown .exe
  CACHE_GET_STATS:       "voice:get-cache-stats",
  CACHE_CLEAR:           "voice:cache-clear",
  CALIBRATION_START:     "voice:calibration-start",
  CALIBRATION_PROGRESS:  "voice:calibration-progress",
  CALIBRATION_DONE:      "voice:calibration-done",
  CALIBRATION_RESET:     "voice:calibration-reset",
  TTS_GET_PRESETS:       "tts:get-presets",
  TTS_PLAY_SAMPLE:       "tts:play-sample",
  TTS_GET_TIER:          "tts:get-tier",
} as const;
```

### 14.2 Preload Surfacing (`src/main/preload.ts`)

All channels exposed on `window.api`:
- `onPlayAudioChunk(cb)`
- `onFallbackEngaged(cb)`
- `cancelAudio()`
- `getCacheStats()` → returns {entries, sizeBytes, hits, misses, evictions}
- `clearCache(all?)` → true on success
- `getAdaptiveState()` → {currentTier, signals, processList, manualOverride}
- `forceTier(tierName)` → boolean
- `addProcess(name, path?)` via voice command OR drag-and-drop handler
- `removeProcess(name)`
- `listProcesses()` → [{name, path, addedAt, autoDetected:bool}]
- `startCalibration()` → begins wizard flow
- `cancelCalibration()`
- `finishCalibration(audioBuffer)` → returns {ok, embPath?, message}
- `resetCalibration()` → wipes `Voice/Calibration/`
- `getTtsPresets()` → list of presets with sample URLs
- `playTtsSample(presetId)` → streams sample to renderer
- `getTtsTier()` → 'heavy' | 'medium' | 'light' | 'survival'

---

## 15. Settings Store Migration

### 15.1 Removed / Replaced Keys (auto-migrate on app start)

| Old key | New key | Migration |
|---------|---------|-----------|
| `ttsVoice: 'ru-RU-DmitryNeural'` | `voicePresetId: 'strict-deep-male'` | Map Edge-id → default preset. |
| `ttsPitch: -5` (Hz, runs through Edge-only) | `voiceCalibratedPitch: 0` (semitones, applies via F5-TTS pitch-shift) | Reset to 0. |
| `xttsServerUrl: ...` | `f5ttsServerUrl: ...` | Pass-through. |

### 15.2 New Keys (defaults in code)

```ts
// Adaptive
const voiceAdaptiveEnabled = ref(true);             // auto-detect on
const voiceManualTier = ref<'turbo'|'standard'|'eco'|'auto'>('auto');
const voiceCalibratedProcessList = ref<string[]>([]); // user-added .exe names
const voiceAutoDetectExe = ref(true);
const voiceTurboGpuThreshold = ref(50);             // % utilization below which Turbo ok

// Cache
const voiceCacheEnabled = ref(true);
const voiceCacheRamLimit = ref(100);                // phrases
const voiceCacheDiskLimitMb = ref(250);             // MB

// Voice calibration
const voiceCalibrationStatus = ref<'absent'|'in_progress'|'ready'>('absent');
const voiceCalibrationRecording = ref<Float32Array | null>(null);
const voiceCalibrationEmbeddingsLoaded = ref(false);

// Streaming
const voiceStreamingEnabled = ref(true);
const voiceMaxSentenceLen = ref(120);               // chars
const voiceSentenceSplitHonour = ref(true);         // split on punctuation even if user wrote run-on

// RU language
const voiceRuITN = ref(true);                       // numbers → words
const voiceRuAbbreviationsPath = ref('Voice/dictionaries/ru-abbr.json');
const voiceRuRawCodeMode = ref(true);
```

### 15.3 Migration Logic

On first launch with the new spec, `settings.store.ts` runs a migration shim. The old `ttsVoice` Edge value is dropped, `voicePresetId` set to default. The personal calibration directory is checked; if absent, calibration is offered.

---

## 16. UI / Settings Plan

### 16.1 New TTSSection.vue Shape

```
┌─────────────────────────────────────────────────────┐
│ КАНАЛ НЕЙРОСИНТЕЗА РЕЧИ (TTS v2)                   │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ● ГОЛОС                                         │ │
│ │   Пресет: Строгий мужской (MLS RU)              │ │
│ │   Калибровка: ✓ Готово / ○ Не проведена         │ │
│ │   [▶ Sample] [⚙ Перекалибровать]                 │ │
│ │   Статус: ● Tier: Base · VRAM 8.2 GB free       │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ 🎚 ADAPTIVE                                       │ │
│ │   Режим: ( ) Turbo ( ) Стандарт (✓) Авто         │ │
│ │   Текущий Tier: Base / Small / E2-TTS / SAPI      │ │
│ │   [▼ Process List: Steam, Discord, webstorm.exe] │ │
│ │   [+ Add .exe] Auto-detect: [✓]                  │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ 💾 CACHE                                          │ │
│ │   Кэш: 67 / 100 фраз · 124 МБ / 250 МБ          │ │
│ │   Hits: 1,243 · Misses: 88 · Evictions: 14       │ │
│ │   [Очистить кэш]                                 │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ 🌍 RU PIPELINE                                    │ │
│ │   ITN: [✓] · Аббревиатуры: [✓] · Raw-code: [✓]   │ │
│ │   [Открыть словарь]                              │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ 🎚 Advanced  ▾                                    │ │
│ │   Streaming · Sentence split · Speed · Pitch     │ │
│ │   SSML enable · FX mode                          │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 16.2 New Calibration Wizard Component

A new full-screen overlay accessed from Settings or auto-shown on first launch. Steps: intro → countdown → recording 30-60 s with live VAD bar → processing → sample preview → accept/retry.

### 16.3 Adaptive Mode Top-Bar Indicator

A small chip in the top-right of the main app bar showing the current tier + reason:
- `Base · idle` (green text, idle)
- `Base · 47% GPU` (green)
- `Small · Steam active` (yellow)
- `E2-TTS · gpu.heavy.x` (orange)
- `SAPI · degraded` (red)

Click expands to adaptive panel.

### 16.4 Voice Quick Panel

Already exists (`src/renderer/components/voice/VoiceQuickPanel.vue`); extend with the chip from §16.3.

### 16.5 STTSection.vue Additions

Same Calibration card (read-only status from shared settings store). Tier selector (Accuracy / Balanced / Speed). Process-list widget shared with TTSSection.

---

## 17. Verification & Acceptance Tests

### 17.1 Per-Phase Smoke Tests

| Phase | Test | Pass criterion |
|-------|------|----------------|
| 1 | Listen test of dataset ref | 3 raters agree on "deep, strict, no smile" |
| 1 | F5-TTS Base inference on RTX 5070 | Inference for 50-char sentence < 1.5 s |
| 1 | Tier swap Base → Small → E2 → SAPI | All reachable, no more than 15 s total swap time |
| 2 | Calibration wizard end-to-end | Speaker embedding written to disk, settings flag flipped |
| 2 | Hybrid voice listen test | 3 raters agree on "recognizably A.R.C." |
| 3 | Cache cold + warm path | First synthesis 1.4 s, second 0.3 s |
| 3 | Cache eviction 100-entry cap | After 101 distinct phrases, oldest evicted |
| 3 | Cache disk cap 250 MB | After 250 MB exceeded, LRU evicted from disk; tier-B retained |
| 3 | Speed-tier entries survive entirely | After full app restart, wake phrases still cached, instant playback |
| 4 | Adaptive detection: launch Steam | Tier auto-drops to Small within 5 s, audible confirmation |
| 4 | Adaptive detection: launch heavy unknown `.exe` | Voice prompt fires, accept → process added |
| 4 | Voice command: "А.Р.Ц., добавь Dota 2 в список игр" | Process added, voice confirmation cached |
| 4 | Manual override: Eco | Tier pinned to E2-TTS, signals ignored |
| 5 | RU pronunciation of `127.0.0.1` | Spoken "сто двадцать семь точка ноль точка ноль точка один" |
| 5 | RU abbreviation `А.Р.Ц. в порядке` | Spoken "аэр цэ в порядке" |
| 5 | Markdown code block `\`\`\`print()\`\`\`` | Raw mode: "print скобки скобки" |
| 5 | Mixed RU+EN `запусти npm install` | Single voice reads both, no audible accent switch |
| 5 | Cache hit identical to cache miss previously | Bit-identical WAV |

### 17.2 Acceptance Criteria for Voice Quality

| Property | Test method | Pass |
|----------|------------|------|
| Deep male timbre | Spectral centroid analysis: F0 med < 130 Hz | ✅ |
| No smile (flat affect on neutral text) | Listen test, 3 raters, no smile-awarded classification | ✅ |
| Russian fluency | Russian-native listener A/B between A.R.C. and natural RU reader | ≥ 4/5 preference |
| Single voice across tiers | A/B between Base/Small/E2-TTS of same sentence | Cosine similarity > 0.85 on speaker embedding |
| Identical repeated phrases | Cache hit bit-equal to cache miss previously stored | ✅ (deterministic) |
| Adaptive swap transparent | Listen test during active game, swap to Small, no audible seam | ≥ 4/5 raters agree |

### 17.3 Stress Tests

| Test | Expected behavior |
|------|-------------------|
| 200 distinct sentences in 60 s | Cache hits start at phrase 3 onward, latency drops to ~0.3 s |
| VPN disconnect during inference | POST /tts fails 3×, cache fallback for seed phrases only, visible toast |
| Heavy RAM/CPU consumer (Chrome 50 tabs) | GPU signals push to E2-TTS tier, swap completes < 15 s |
| Microphone in use during game | STT tier tiny, transcription still works on cached correction dictionary |
| Microphone denied permission | UI prompts, no tier downgrade, fallback error state with toast |

---

## 18. Risks & Open Questions

### 18.1 Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|-----------|
| 1 | `nvidia-smi` not present on non-NVIDIA machines | Detection layer partially blind | Windows Performance Counters fallback (CPU/RAM/GPU counters); manual preset becomes primary path |
| 2 | E2-TTS timbre may differ subtly from Base | "Single voice" weak point | Cache compensates; speaker embedding is identical; both share same conditioning |
| 3 | User calibration recording has poor SNR | Bad embedding → degraded hybrid voice | Wizard enforces environmental SNR check (RMS floor); re-record offered |
| 4 | Test phrases not covered post-launch | User reports "Доброе утро, А.Р.Ц." sounds different one morning | Cache is the explicit fix; user can also re-cache manually via UI button |
| 5 | Disk 250 MB silently exceeds cap on long-running systems | Cache silently evicts; user not aware | UI cap-meter; warning toast at 80% used |
| 6 | F5-TTS can OOM during tier swap if memory is fragmented | Crash | Unload in two phases (move to RAM-resident state before GPU); try `torch.cuda.empty_cache()` in a finally block |
| 7 | User denies microphone at runtime | STT no listener; calibration cannot record | Graceful degraded state; UI shows reason; offered text input |
| 8 | Auto-detect unknown .exe is noisy (e.g. Brave browser spike) | False-positive tier swap | Tier swap only after 5 s sustained > 30% GPU delta; one-shot confirmation prompt, not blindly added |
| 9 | Speaker embedding extraction uses extra Python dependency | New install step | Optional dependency; fallback path uses F5-TTS internal embedding |
| 10 | Mixed RU/EN prosody on English fragments may sound accented | User finds it distracting | Listen test in Phase 1; if poor, fallback to full EN transliteration |
| 11 | Edge TTS was the natural fallback; now that it's removed, SAPI is the only survival tier | If user dislikes SAPI, no usable fallback | SAPI clearly badged; silence + toast is the honest alternative |

### 18.2 Open Questions

1. **Which dataset speaker wins the listen-test?** Resolved in Phase 1. Likely MLS RU.
2. **Should we ship multiple dataset presets and let the user A/B?** Phase 5 nice-to-have; ship one default for now.
3. **Is the `setTimeout`-based tier swap preemptive enough under heavy GPU load?** May need to switch to predictive preloading ("if VRAM > 70% and Base loaded → eagerly unload to CPU-only and load Small").
4. **What's the right calibration length** — current spec is 30–60 s. Too short → poor embed; too long → user fatigue. Listen-test will tune.
5. **Should GPU AMD/Intel use a separate detection module?** Yes — `nvidia-smi` only covers NVIDIA. Windows Performance Counters covers the others. Spec includes the fallback, but isn't blocking.
6. **Should we offer a "Voice Test" mini-game** for sample + tier comparison? Aesthetic idea; out of scope for v1 spec but possible v2.

### 18.3 GPU Footprint Estimates (RTX 5070 12 GB, batch=1)

| Tier | VRAM load | VRAM inference | Swap time |
|------|-----------|----------------|-----------|
| F5-TTS Base | ~5.5 GB | ~4.5 GB | 10-15 s cold, < 1 s warm |
| F5-TTS Small | ~3.0 GB | ~2.5 GB | 5-8 s cold |
| E2-TTS | ~2.5 GB | ~2.0 GB | 5-7 s cold |
| SAPI | 0 GB | 0 GB | 0 s |

---

## 19. Phased Rollout

| Phase | Scope | Files Changed | Duration (est.) |
|-------|-------|---------------|-----------------|
| **P1** | Listen-test candidates; pick dataset speaker; install F5-TTS Base/Small/E2-TTS; add tier-loaded server with `/tier` endpoint; wire `f5tts_server.py` endpoints | `f5tts_server.py`, `requirements-f5tts.txt`, `Voice/Presets/<dataset>/ref.{wav,txt,meta.json}` | 4–6 h |
| **P2** | Delete `speakWithEdgeTTS`; rewrite `tts.service.ts` with adaptive tier selection; implement `adaptive.service.ts` (GPU/idle/process signals); manual preset dropdown; force-tier IPC | `tts.service.ts`, `voice.ipc.ts`, IPC channels, `settings.store.ts` migration, `useAdaptiveVoice.ts`, `TTSSection.vue`, `STTSection.vue` | 4-6 h |
| **P3** | Implement `cache.service.ts` (LFU+LRU, speed-tiers, RAM+disk caps); integrate with `tts.service.ts`; cancellation handling; cache stats UI | `cache.service.ts`, `tts.service.ts`, `TTSSection.vue` (cache widget), IPC | 3-4 h |
| **P4** | Calibration wizard: `calibration.service.ts`, `extract_speaker_emb.py`, `Voice/Calibration/`, F5-TTS zero-shot speaker-embed conditioning, reset flow, settings entry | `calibration.service.ts`, `useVoice.ts`, settings UI, `Voice/dictionaries/ru-abbr.json` | 4-5 h |
| **P5** | RU language pipeline: ITN, abbreviation dictionary, code-block raw mode, mixed RU/EN routing, verified pronunciation | `tts.service.ts`, dictionary file | 2-3 h |
| **P6** | Verification, docs, cleanup: del xtts_server.py, msedge-tts unlink, update `docs/current-state.md`, `AGENTS.md`, `CHANGELOG.md`, full smoke + acceptance test run | Various | 1-2 h |

**Total estimate**: 18–26 h.

---

## 20. Docs to Update

| Doc | Change |
|-----|--------|
| `docs/tts-rework-spec.md` | Mark deprecated; reference this spec as successor. |
| `docs/voice-rework-spec.md` (this doc) | New canonical spec. |
| `docs/current-state.md` | Update to: "Voice: A.R.C. hybrid (dataset+personal); F5-TTS Base/Small/E2-TTS adaptive cascade; utterance cache with speed-tiers; RU ITN + abbrev pipeline; deterministic repeated phrases." |
| `docs/00-index.md` | Add link to `voice-rework-spec.md`. |
| `docs/voice-architecture.md` | New: deep dive on engine design, voice presets, cache layout, calibration pipeline, adaptive layer. |
| `AGENTS.md` | Add voice rework knowledge summary for future agents. |
| `CHANGELOG.md` | Per-phase entry. |
| `README.md` | Updated features list. |

---

*End of spec. Ready for implementation planning.*
