# Local AI Upgrade: node-llama-cpp (GPU Accelerated)
- The local AI backend was upgraded to `node-llama-cpp`.
- Replaced CPU-only `transformers.js` with hardware-accelerated GGUF execution.
- Added native support for Qwen2.5-3B Instruct (3 Billion parameters) running directly on the GPU (CUDA/Metal/Vulkan).
