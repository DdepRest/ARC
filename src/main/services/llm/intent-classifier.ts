import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import axios from 'axios';
import { AiProvider } from './providers/provider.interface';
import { resolveChatEndpoint } from './endpoint-normalizer';
import { secretVault } from '../security/secret-vault.service';

let intentMacrosCache: { expiresAt: number; intents: { macro: any; intent: string }[] } | null = null;

export function getAiIntentMacros() {
    const now = Date.now();
    if (intentMacrosCache && now < intentMacrosCache.expiresAt) {
      return intentMacrosCache.intents;
    }
    const intents: { macro: any, intent: string }[] = [];
    try {
      const macrosDir = path.join(app.getPath('userData'), 'macros');
      if (fs.existsSync(macrosDir)) {
        const files = fs.readdirSync(macrosDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const content = fs.readFileSync(path.join(macrosDir, file), 'utf-8');
            const data = JSON.parse(content);
            if (data.enabled !== false && data.nodes) {
              // Map all node IDs that are sources/origins of connection links in the graph
              const rawLinks = data.links || [];
              const nodesWithOutgoingLinks = new Set<number>();
              for (const linkArr of rawLinks) {
                if (Array.isArray(linkArr) && linkArr.length >= 2) {
                  nodesWithOutgoingLinks.add(linkArr[1]); // linkArr[1] is the origin_id (source node)
                }
              }

              for (const node of data.nodes) {
                if (node.type === 'triggers/ai_intent' && node.properties?.intent) {
                  // Enforce active link requirement: must have outgoing link or non-empty outputs link list
                  const isConnected = nodesWithOutgoingLinks.has(node.id) || 
                    (node.outputs && node.outputs.some((o: any) => o.links && o.links.length > 0));

                  if (isConnected) {
                    intents.push({
                      macro: data,
                      intent: node.properties.intent.trim()
                    });
                  } else {
                    console.log(`[AI-Service] Skipping disconnected/dangling AI Intent node in macro "${data.name || 'Untitled'}" (ID: ${node.id})`);
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to get AI intents', e);
    }
    intentMacrosCache = { expiresAt: now + 5000, intents };
    return intents;
  }


export async function classifyIntentWithProvider(
    provider: AiProvider, 
    text: string, 
    intents: { macro: any, intent: string }[], 
    abortController: AbortController, timeoutMs: number = 8000
  ): Promise<{ index: number, mode: 'DIRECT' | 'SUGGEST' } | null> {
    const isOllama = provider.type === 'local' && 
      (provider.endpoint.includes('11434') || provider.name.toLowerCase().includes('ollama') || provider.id.includes('ollama'));

    const systemPrompt = `You are a high-speed routing assistant for an AI system.
Analyze the user's query and select the exact index number of the intent that BEST matches the user's query semantically.

CRITICAL INSTRUCTIONS FOR HIGH ACCURACY & SAFETY:
1. Be extremely conservative. If the user's query is just a random conversational phrase, ambient word, general discussion, or does not clearly and strongly convey an explicit intention/desire to perform the action represented by the intent, you MUST respond with "NONE".
2. Only select an intent if the query is a clear semantic fit. If there is any doubt or it is loose, respond with "NONE".
3. Evaluate the query's tone and determine the trigger mode:
   - "DIRECT": Select if the user explicitly and imperatively commands A.R.C. to perform this action right now (e.g., "открой ютуб", "запусти утренний ритуал", "включи музыку", "run the script").
   - "SUGGEST": Select if the user is expressing a feeling, state of mind, mood, or an indirect wish where offering to run the macro would be highly helpful but should not be done automatically (e.g., "что-то скучно", "хочу расслабиться", "а не послушать ли нам музыку", "я устал").

Format your response EXACTLY as "INDEX;MODE" (e.g. "0;DIRECT" or "1;SUGGEST"). If no intent matches, respond ONLY with "NONE". Do not include any other words or punctuation. Your response must be extremely concise.`;

    const instructions = `
Query: "${text}"

Predefined Intents:
${intents.map((item, idx) => `${idx}: ${item.intent}`).join('\n')}

Response (index;mode or "NONE"):`;

    try {
      if (isOllama) {
        let endpointUrl = provider.endpoint;
        if (endpointUrl.includes('localhost:11434')) {
          endpointUrl = endpointUrl.replace('localhost:11434', '127.0.0.1:11434');
        }
        const response = await axios.post(endpointUrl, {
          model: provider.model,
          prompt: systemPrompt + '\n\n' + instructions,
          stream: false,
          options: {
            num_predict: 8,
            temperature: 0.0
          }
        }, {
          signal: abortController.signal,
          timeout: timeoutMs
        });
        const resText = (response.data?.response || '').trim();
        if (resText.toUpperCase() === 'NONE' || !resText) {
          return null;
        }
        const parts = resText.split(';');
        const index = parseInt(parts[0]);
        if (isNaN(index)) return null;
        const mode = parts[1]?.trim().toUpperCase() === 'SUGGEST' ? 'SUGGEST' : 'DIRECT';
        return { index, mode };
      } else {
        const resolvedKey = secretVault.resolveProviderApiKey(provider.id, provider.apiKey);
        if (resolvedKey.value === null && provider.type === 'cloud' && !provider.noAuthHeader) {
          return null;
        }
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (!provider.noAuthHeader && resolvedKey.value) {
          headers['Authorization'] = `Bearer ${resolvedKey.value}`;
        }
        // OpenAI compatible model (like OpenRouter, DeepSeek, Google Gemini)
        const response = await axios.post(resolveChatEndpoint(provider.endpoint), {
          model: provider.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: instructions }
          ],
          stream: false,
          max_tokens: 8,
          temperature: 0.0
        }, {
          headers,
          signal: abortController.signal,
          timeout: timeoutMs
        });
        const resText = (response.data?.choices?.[0]?.message?.content || '').trim();
        if (resText.toUpperCase() === 'NONE' || !resText) {
          return null;
        }
        const parts = resText.split(';');
        const index = parseInt(parts[0]);
        if (isNaN(index)) return null;
        const mode = parts[1]?.trim().toUpperCase() === 'SUGGEST' ? 'SUGGEST' : 'DIRECT';
        return { index, mode };
      }
    } catch (e) {
      console.error('Error during intent classification:', e);
      return null;
    }
  }

export function isSimpleQuery(text: string): boolean {
    const clean = text.toLowerCase().trim();
    const complexKeywords = [
      'код', 'code', 'функци', 'вычисли', 'sandbox', 'песочниц', 'database', 'баз', 'sqlite', 'sql',
      'rollback', 'откат', 'route', 'маршрут', 'flow', 'сценари', 'macro', 'макрос', 'analysis', 'анализ',
      'создай', 'create', 'write', 'запиши', 'file', 'файл', 'структур', 'разработ', 'build', 'компил'
    ];
    if (complexKeywords.some(keyword => clean.includes(keyword))) {
      return false;
    }
    if (clean.length < 80) {
      return true;
    }
    return false;
  }

export function isConversationalQuery(text: string): boolean {
    const clean = text.toLowerCase().trim().replace(/[?,.!\-]/g, '').trim();
    if (!clean) return true;
    
    const patterns = [
      /^(привет|здравствуй|здравствуйте|хай|ку|салют|добрый день|добрый вечер|доброе утро|доброй ночи)( арк| arc)?$/i,
      /^(как дела|как поживаешь|как жизнь|как оно|что нового|как успехи|как сам)( у тебя)?$/i,
      /^(кто ты|что ты|как тебя зовут|какое твое имя|что ты умеешь|для чего ты|твоя функция)$/i,
      /^(спасибо|благодарю|отлично|супер|классно|круто|понятно|ясно|ок|хорошо|ладно)$/i,
      /^(расскажи анекдот|расскажи шутку|пошути|рассмеши меня)$/i
    ];
    
    return patterns.some(pattern => pattern.test(clean));
  }
