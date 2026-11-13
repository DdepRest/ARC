export interface ProviderPreset {
  name: string;
  type: 'cloud' | 'local';
  freeTier: 'free' | 'freemium' | 'paid';
  freeTierInfo: string;
  endpoint: string;
  model: string;
  url: string;
}

export const PRESETS: ProviderPreset[] = [
  // Major Cloud Providers
  { 
    name: 'NVIDIA API Catalog (NIM)', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: '1000 Бесплатных кредитов NIM',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions', 
    model: 'meta/llama-3.3-70b-instruct', 
    url: 'https://build.nvidia.com/' 
  },
  { 
    name: 'Cerebras API', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Ультра-быстрая генерация (Free Tier)',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions', 
    model: 'llama3.1-70b', 
    url: 'https://cloud.cerebras.ai/' 
  },
  { 
    name: 'SambaNova Cloud', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Высокая скорость + Free Tier',
    endpoint: 'https://api.sambanova.ai/v1/chat/completions', 
    model: 'Meta-Llama-3.1-405B-Instruct', 
    url: 'https://cloud.sambanova.ai/' 
  },
  { 
    name: 'DeepInfra API', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Стартовый баланс при регистрации',
    endpoint: 'https://api.deepinfra.com/v1/openai/chat/completions', 
    model: 'meta-llama/Meta-Llama-3.1-70B-Instruct', 
    url: 'https://deepinfra.com/dash/api_keys' 
  },
  { 
    name: 'Google Gemini API', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Бесплатный ключ в AI Studio',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 
    model: 'gemini-2.5-flash', 
    url: 'https://aistudio.google.com/app/apikey' 
  },
  { 
    name: 'Groq API', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Ультра-скорость + Free Tier',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions', 
    model: 'llama-3.3-70b-versatile', 
    url: 'https://console.groq.com/keys' 
  },
  { 
    name: 'OpenRouter', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Бесплатные модели (:free)',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions', 
    model: 'google/gemini-2.5-flash', 
    url: 'https://openrouter.ai/keys' 
  },
  { 
    name: 'FreeAPILLM', 
    type: 'local', 
    freeTier: 'free',
    freeTierInfo: 'OpenAI-совместимый Free Router (127.0.0.1:3067)',
    endpoint: 'http://127.0.0.1:3067/v1/chat/completions', 
    model: 'auto', 
    url: 'http://127.0.0.1:3067/' 
  },
  { 
    name: 'FreeLLMAPI', 
    type: 'local', 
    freeTier: 'free',
    freeTierInfo: 'OpenAI-совместимый Free Router (127.0.0.1:31415)',
    endpoint: 'http://127.0.0.1:31415/v1/chat/completions', 
    model: 'auto', 
    url: 'http://127.0.0.1:31415/' 
  },
  { 
    name: 'HuggingFace', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Бесплатный Inference API',
    endpoint: 'https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct/v1/chat/completions', 
    model: 'meta-llama/Meta-Llama-3-8B-Instruct', 
    url: 'https://huggingface.co/settings/tokens' 
  },
  { 
    name: 'AI Horde', 
    type: 'cloud', 
    freeTier: 'free',
    freeTierInfo: '100% Бесплатная сеть',
    endpoint: 'https://stablehorde.net/api/v2/generate/text', 
    model: 'Alpaca', 
    url: 'https://stablehorde.net/register' 
  },
  { 
    name: 'SiliconFlow', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Бесплатный баланс при старте',
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions', 
    model: 'deepseek-ai/DeepSeek-V2-Chat', 
    url: 'https://cloud.siliconflow.cn/account/ak' 
  },
  { 
    name: 'DeepSeek API', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Низкие цены + Стартовый баланс',
    endpoint: 'https://api.deepseek.com/chat/completions', 
    model: 'deepseek-chat', 
    url: 'https://platform.deepseek.com/api_keys' 
  },
  { 
    name: 'Together AI', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Free Trial ($25 кредитов)',
    endpoint: 'https://api.together.xyz/v1/chat/completions', 
    model: 'meta-llama/Llama-3-70b-chat-hf', 
    url: 'https://api.together.ai/settings/api-keys' 
  },
  { 
    name: 'Fireworks AI', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Free Trial кредиты',
    endpoint: 'https://api.fireworks.ai/inference/v1/chat/completions', 
    model: 'accounts/fireworks/models/llama-v3p1-70b-instruct', 
    url: 'https://fireworks.ai/account/api-keys' 
  },
  { 
    name: 'Novita AI', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Тестовый баланс',
    endpoint: 'https://api.novita.ai/v3/openai/chat/completions', 
    model: 'meta-llama/llama-3.1-70b-instruct', 
    url: 'https://novita.ai/dashboard/key' 
  },
  { 
    name: 'Lepton AI', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Бесплатный лимит',
    endpoint: 'https://api.lepton.ai/v1/chat/completions', 
    model: 'llama3-70b', 
    url: 'https://dashboard.lepton.ai/api-tokens' 
  },

  // Major Paid Cloud Providers
  { 
    name: 'OpenAI API', 
    type: 'cloud', 
    freeTier: 'paid',
    freeTierInfo: 'Платный API (Pay-as-you-go)',
    endpoint: 'https://api.openai.com/v1/chat/completions', 
    model: 'gpt-4o', 
    url: 'https://platform.openai.com/api-keys' 
  },
  { 
    name: 'Anthropic API', 
    type: 'cloud', 
    freeTier: 'paid',
    freeTierInfo: 'Платный API (Pay-as-you-go)',
    endpoint: 'https://api.anthropic.com/v1/messages', 
    model: 'claude-3-5-sonnet-latest', 
    url: 'https://console.anthropic.com/settings/keys' 
  },
  { 
    name: 'Perplexity API', 
    type: 'cloud', 
    freeTier: 'paid',
    freeTierInfo: 'Платный API с веб-поиском',
    endpoint: 'https://api.perplexity.ai/chat/completions', 
    model: 'sonar', 
    url: 'https://www.perplexity.ai/settings/api' 
  },
  { 
    name: 'Mistral API', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Free tier на платформе',
    endpoint: 'https://api.mistral.ai/v1/chat/completions', 
    model: 'mistral-large-latest', 
    url: 'https://console.mistral.ai/api-keys/' 
  },
  { 
    name: 'Cohere API', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Бесплатный Trial Key',
    endpoint: 'https://dashboard.cohere.com/api-keys', 
    model: 'command-r-plus-08-2024', 
    url: 'https://dashboard.cohere.com/api-keys' 
  },
  { 
    name: 'Zhipu AI (GLM)', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Бесплатные токены',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 
    model: 'glm-4-plus', 
    url: 'https://open.bigmodel.cn/usercenter/apikeys' 
  },
  { 
    name: 'Qwen API (DashScope)', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: 'Бесплатный тестовый лимит',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 
    model: 'qwen-max', 
    url: 'https://dashscope.console.aliyun.com/apiKey' 
  },
  { 
    name: 'xAI (Grok)', 
    type: 'cloud', 
    freeTier: 'freemium',
    freeTierInfo: '$25 ежемесячный кредит',
    endpoint: 'https://api.x.ai/v1/chat/completions', 
    model: 'grok-beta', 
    url: 'https://console.x.ai/' 
  },

  // Local / On-Premise
  { 
    name: 'FreeAPILLM (Локально)', 
    type: 'local', 
    freeTier: 'free',
    freeTierInfo: 'Ручной ввод IP роутера (127.0.0.1:3067)',
    endpoint: 'http://127.0.0.1:3067/v1/chat/completions', 
    model: 'auto', 
    url: 'http://127.0.0.1:3067/' 
  },
  { 
    name: 'Ollama (Локально)', 
    type: 'local', 
    freeTier: 'free',
    freeTierInfo: '100% Локально и Безлимитно',
    endpoint: 'http://127.0.0.1:11434/api/chat', 
    model: 'llama3.2', 
    url: 'https://ollama.com/' 
  },
  { 
    name: 'LM Studio (Локально)', 
    type: 'local', 
    freeTier: 'free',
    freeTierInfo: '100% Локально и Безлимитно',
    endpoint: 'http://127.0.0.1:1234/v1/chat/completions', 
    model: 'local-model', 
    url: 'https://lmstudio.ai/' 
  },
  { 
    name: 'Llama.cpp (Локально)', 
    type: 'local', 
    freeTier: 'free',
    freeTierInfo: '100% Локально',
    endpoint: 'http://127.0.0.1:8080/v1/chat/completions', 
    model: 'local-model', 
    url: 'https://github.com/ggerganov/llama.cpp' 
  },
  { 
    name: 'Jan (Локально)', 
    type: 'local', 
    freeTier: 'free',
    freeTierInfo: '100% Локально',
    endpoint: 'http://127.0.0.1:1337/v1/chat/completions', 
    model: 'local-model', 
    url: 'https://jan.ai/' 
  },
  { 
    name: 'GPT4All (Локально)', 
    type: 'local', 
    freeTier: 'free',
    freeTierInfo: '100% Локально',
    endpoint: 'http://127.0.0.1:4891/v1/chat/completions', 
    model: 'local-model', 
    url: 'https://gpt4all.io/' 
  },
  { 
    name: 'LocalAI (Локально)', 
    type: 'local', 
    freeTier: 'free',
    freeTierInfo: '100% Локально',
    endpoint: 'http://127.0.0.1:8080/v1/chat/completions', 
    model: 'local-model', 
    url: 'https://localai.io/' 
  },
  { 
    name: 'vLLM (Локально)', 
    type: 'local', 
    freeTier: 'free',
    freeTierInfo: '100% Локально',
    endpoint: 'http://127.0.0.1:8000/v1/chat/completions', 
    model: 'local-model', 
    url: 'https://github.com/vllm-project/vllm' 
  },

  { 
    name: 'Пользовательский', 
    type: 'cloud', 
    freeTier: 'paid',
    freeTierInfo: 'Пользовательский эндпоинт',
    endpoint: 'https://api.openai.com/v1/chat/completions', 
    model: 'gpt-4o-mini', 
    url: '' 
  },
];
