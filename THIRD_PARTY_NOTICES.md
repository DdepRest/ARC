# A.R.C. (Autonomous Reactor Core) — Third-Party Notices & License Attribution

**Date of generation:** 2026-11-02  
**Application version:** 1.0.12  
**Project:** A.R.C. (Autonomous Reactor Core)

This file contains third-party software notices and license information for components, runtime libraries, and machine learning models distributed with or utilized by A.R.C.

---

## 1. Machine Learning Models & Weights

| Model / Asset | Primary Author / Source | License | Distribution / Usage Conditions |
|---|---|---|---|
| **Silero TTS (`v5_6_ru.pt`)** | Silero Team (`https://models.silero.ai/models/tts/ru/v5_6_ru.pt`, `https://github.com/snakers4/silero-models`) | **CC BY-NC-SA 4.0** *(Non-Commercial Use Only)* | Bundled in `extraResources` (`resources/models/silero-v5/v5_6_ru.pt`) exclusively for non-commercial / open-source distributions of A.R.C. Any commercial release must obtain a commercial license from the Silero authors. |
| **Silero VAD (`silero_vad.onnx`)** | Silero Team (`https://github.com/snakers4/silero-vad`) | **MIT License** | Free commercial and non-commercial usage with copyright attribution. |
| **GigaAM Multilingual CTC (v2/v3 ONNX)** | SaluteDevices / SberDevices (`https://github.com/salute-developers/GigaAM`) | **MIT License** | Open speech recognition model weights packaged for Sherpa-ONNX offline inference. |
| **OpenAI Whisper (`whisper-small` int8 ONNX)** | OpenAI (`https://github.com/openai/whisper`), converted by `csukuangfj/sherpa-onnx` | **MIT License** | Robust offline speech recognition fallback floor. |
| **Sherpa Zipformer Transducer** | Next-gen Kaldi / k2-fsa (`https://github.com/k2-fsa/sherpa-onnx`) | **Apache License 2.0** | Streaming speech recognition fallback engine. |
| **Local GGUF Models (Qwen / Llama family)** | Alibaba Cloud (Qwen) / Meta Platforms (Llama), downloaded via HuggingFace Hub | **Model-Specific Licenses** *(Apache-2.0 / Qwen Research License / Llama 3 Community License)* | Downloaded and managed locally by the operator in user storage. Subject to respective upstream terms of use. |

---

## 2. Runtime NPM Dependencies (`dependencies`)

The following 22 packages are bundled or loaded as direct runtime dependencies of A.R.C.:

| Package | Version Spec | License | Source / Repository |
|---|---|---|---|
| `@google/genai` | `^2.11.0` | Apache-2.0 | `https://github.com/googleapis/js-genai` |
| `@xenova/transformers` | `^2.17.2` | Apache-2.0 | `https://github.com/xenova/transformers.js` |
| `axios` | `^1.15.2` | MIT | `https://axios-http.com` |
| `better-sqlite3` | `^12.9.0` | MIT | `https://github.com/WiseLibs/better-sqlite3` |
| `dompurify` | `^3.4.14` | MPL-2.0 OR Apache-2.0 | `https://github.com/cure53/DOMPurify` |
| `form-data` | `^4.0.5` | MIT | `https://github.com/form-data/form-data` |
| `glob` | `^13.0.6` | BlueOak-1.0.0 | `https://github.com/isaacs/node-glob` |
| `jimp` | `^0.22.12` | MIT | `https://github.com/jimp-dev/jimp` |
| `jsep` | `^1.4.0` | MIT | `https://ericsmekens.github.io/jsep/` |
| `litegraph.js` | `^0.7.18` | MIT | `https://github.com/jagenjo/litegraph.js` |
| `lucide-vue-next` | `^0.546.0` | ISC | `https://lucide.dev` |
| `marked` | `^18.0.11` | MIT | `https://marked.js.org` |
| `node-edge-tts` | `^1.2.10` | MIT | `https://github.com/SchneeHertz/node-edge-tts` |
| `node-llama-cpp` | `^3.19.0` | MIT | `https://node-llama-cpp.withcat.ai` |
| `pinia` | `^2.3.1` | MIT | `https://github.com/vuejs/pinia` |
| `sherpa-onnx-node` | `1.13.7` | Apache-2.0 | `https://github.com/csukuangfj/sherpa-onnx` |
| `systeminformation` | `^5.31.5` | MIT | `https://systeminformation.io` |
| `three` | `^0.174.0` | MIT | `https://threejs.org/` |
| `tree-kill` | `^1.2.2` | MIT | `https://github.com/pkrumins/node-tree-kill` |
| `vue` | `^3.5.13` | MIT | `https://vuejs.org/` |
| `ws` | `^8.21.0` | MIT | `https://github.com/websockets/ws` |

---

## 3. Development & Build Toolchain Notice

The development and packaging toolchain utilizes the following core packages:
- `electron` (MIT License)
- `electron-builder` (MIT License)
- `electron-vite` (MIT License)
- `vite` (MIT License)
- `vitest` (MIT License)
- `typescript` (Apache-2.0 License)
- `tailwindcss` (MIT License)

---

## 4. Special Compliance Notice: Silero TTS (`v5_6_ru.pt`)

The Silero Russian Speech Synthesis model weights (`v5_6_ru.pt`) are distributed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)** license.

- **Non-Commercial Restriction:** You may not use the model weights for commercial purposes without obtaining a separate commercial license from the Silero authors.
- **Attribution:** Silero Speech-to-Text and Text-to-Speech models are developed by the Silero Team (`https://github.com/snakers4/silero-models`).
- **Commercial Adaptation:** In the event that A.R.C. is packaged for commercial distribution, the installer must omit the bundled `v5_6_ru.pt` file and rely on client-side on-demand download from the official hub or transition to permissive alternative models (such as Apache-2.0 / MIT speech engines).
