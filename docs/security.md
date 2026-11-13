# A.R.C. — Политика безопасности и директивы CSP (`docs/security.md`)

## 1. Content Security Policy (`PROD_CSP`)

Конфигурация CSP определяется централизованно в `src/shared/config/csp.config.ts`:

- В `PROD_CSP` директива `'unsafe-inline'` полностью удалена из `script-src` (после переноса инициализации палитры в `src/renderer/main.ts`).
- Директива `'wasm-unsafe-eval'` сохранена для выполнения WebAssembly-модулей ONNX Runtime / STT.

## 2. Зафиксированный технический долг (P2)

- **`'unsafe-eval'` в `script-src` (`PROD_CSP`)**: временно сохранён в `PROD_CSP` для совместимости с runtime-генерацией графов и шейдеров `onnxruntime-web` и `litegraph.js`.
- **План устранения (`P2`)**: полная изоляция `onnxruntime-web` и вычислительных узлов `litegraph.js` в выделенный Web Worker с последующим удалением `'unsafe-eval'` из `script-src` основного окна рендерера.
