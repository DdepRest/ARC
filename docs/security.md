# A.R.C. — Политика безопасности, директивы CSP и модель угроз (`docs/security.md`)

## 1. Граница доверия Electron (`BrowserWindow` и Origin Boundary)

Активная фабрика главного окна расположена в `src/main/index.ts` и использует единый модуль политики `src/main/services/security/electron-security.util.ts` совместно с `src/shared/config/csp.config.ts`:

- **Изоляция `BrowserWindow`:** явно заданы `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, `webviewTag: false`. Preload-скрипты (`src/main/preload.ts`, `preload-tts.ts`, `preload-dialog.ts`) используют исключительно `contextBridge` и `ipcRenderer` без Node-модулей.
- **Канонический `file://` origin (`isTrustedFileUrl` / `isTrustedOrigin`):** в production `file://` принимается только при строгом вхождении декодированного пути внутрь канонического каталога рендерера (`resolveTrustedRendererRoot(__dirname)` → `out/renderer`), с запретом UNC-хостов (`file://host/share`), `..`, percent-encoded traversal (`%2e`, `%2f`, `%5c`, `%00`), sibling-prefix обходов и fail-closed отказом при отсутствии `trustedFileRoot`.
- **Разрешения сессии (`media`):** `setPermissionRequestHandler` и `setPermissionCheckHandler` разрешают только `media` и только для доверенного origin главного окна.
- **Контроль навигации и всплывающих окон:**
  - `will-navigate` блокирует переходы на любые URL вне доверенного origin;
  - `will-attach-webview` безусловно отклоняется;
  - `setWindowOpenHandler` всегда возвращает `{ action: 'deny' }`, передавая в `shell.openExternal()` только URL, прошедшие `isSafeExternalHttpUrl()` (`new URL`, протокол строго `http:` или `https:`, без встроенных учётных данных и управляющих символов).
- **Доступ к DevTools в production (`isDevToolsAllowed`):** в packaged/production сборке DevTools (включая `F12` и `Ctrl+Shift+I`) отключены (`webPreferences.devTools = false` и блокировка `before-input-event`). Включение допускается только в dev-режиме или явным флагом `--debug` / переменной окружения `ARC_ALLOW_DEVTOOLS=1`.
- **Approval IPC (`ApprovalService`):** проверка `event.sender`, `mainFrame` и origin привязана к тому же каноническому `trustedFileRoot` главного окна.

## 2. Content Security Policy (`PROD_CSP` и `getHttpCspPolicy`)

Конфигурация CSP определяется централизованно в `src/shared/config/csp.config.ts` и применяется как в `<meta http-equiv="Content-Security-Policy">` (`electron.vite.config.ts`), так и в HTTP-заголовках (`onHeadersReceived` с добавлением `frame-ancestors 'none';`):

| Директива | Политика в `PROD_CSP` | Обоснование / модель угроз |
|---|---|---|
| `default-src` | `'self' blob: data:` | Запрет загрузки произвольных удалённых ресурсов по умолчанию |
| `script-src` | `'self' 'unsafe-eval' blob: 'wasm-unsafe-eval'` | `'unsafe-inline'` удалён. `'wasm-unsafe-eval'` нужен для ONNX/WASM STT (`whisper.worker.ts`). `'unsafe-eval'` временно сохранён **только** из-за `litegraph.js` и `onnxruntime-web` (см. долг ниже) |
| `worker-src` | `'self' blob:` | Web Workers и AudioWorklet бандлятся локально |
| `style-src` | `'self' 'unsafe-inline'` | Динамические `:style` привязки Vue и стили канвы `litegraph.js` (`fonts.googleapis.com` удалён, все шрифты локальные) |
| `img-src` | `'self' data: blob: https://*.userapi.com https://*.vkuserphoto.net https://*.vk-cdn.net https://*.vk.com https://*.vk.ru https://*.mycdn.me` | Широкий `https:` убран; разрешены локальные ресурсы, вложения чата (`data:`/`blob:`) и CDN обложек VK Музыки |
| `connect-src` | `'self' data: blob: http://127.0.0.1:* http://localhost:* https://huggingface.co https://*.huggingface.co https://hf.co https://*.hf.co https://hf-mirror.com https://*.hf-mirror.com` | Широкие `https:`, `ws:`, `wss:` и внешние LLM API убраны (облачные провайдеры вызываются из Main IPC). Оставлены локальные порты (Ollama/локальные health-пробы) и HuggingFace/mirror для браузерного fallback `whisper.worker.ts` |
| `media-src` | `'self' blob: data: http://127.0.0.1:* http://localhost:* https://*.freecodecamp.org` | Широкий `https:` убран; разрешены локальный TTS-аудиопоток и ретрансляторы CodeRadio |
| `font-src` | `'self' data:` | Все шрифты (`Inter`, `JetBrains Mono`, `Onest`, `Tektur`) упакованы локально в `src/renderer/assets/fonts/` |
| `object-src`, `base-uri`, `form-action`, `frame-ancestors` | `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, HTTP `frame-ancestors 'none'` | Блокировка плагинов, подмены `<base>`, отправки форм наружу и встраивания во фреймы |

## 3. Узкое CORS-исключение HuggingFace (`shouldRewriteHuggingFaceCors`)

Защищённый голосовой контур (`useVoice.ts`) запускает браузерный Web Worker `src/renderer/workers/whisper.worker.ts` (`@xenova/transformers`). Чтобы не ломать этот fallback и при этом убрать широкий wildcard-перехват по подстроке:

- В Main-процессе (`electron-security.util.ts`) `Access-Control-Allow-Origin: *` выставляется **только** при одновременном выполнении условий:
  1. Протокол целевого URL строго `https:` без встроенных учётных данных.
  2. Hostname строго входит в allowlist (`huggingface.co`, `*.huggingface.co`, `hf.co`, `*.hf.co`, `hf-mirror.com`, `*.hf-mirror.com`).
  3. Если доступны `details.webContents` или `details.initiator` (кроме opaque `'null'` / `'file://'`), они обязаны проходить проверку `isTrustedOrigin`.
- Все автозагрузки STT/TTS моделей (Sherpa, GigaAM, Silero) выполняются в Main-процессе через `network-security.util.ts` с pin-манифестом SHA-256 и защитой от SSRF/DNS rebinding (`S2-04`).

## 4. Зафиксированный технический долг и ограничения (`P2` / Windows QA)

- **`'unsafe-eval'` в `script-src` (`PROD_CSP`)**: временно сохранён до полной изоляции вычислений `litegraph.js` и `onnxruntime-web` либо переноса оставшегося браузерного Whisper fallback полностью в Main (`S3-03` намеренно не затрагивает защищённые `useVoice.ts` и `useMacroEditor.ts`).
- **Удаление CORS-перехвата HuggingFace**: станет возможным после отдельной задачи по переводу fallback-загрузки `@xenova/transformers` из `whisper.worker.ts` / `useVoice.ts` в Main IPC.
- **Живая проверка на Windows**: совместимость `sandbox: true`, WebGL/Three.js Reactor, AudioWorklet, `whisper.worker.ts` и обложек VK Музыки под ужесточённым `PROD_CSP` требует натурной проверки в packaged Windows-сборке (`NOT RUN` в Linux-контейнере).
