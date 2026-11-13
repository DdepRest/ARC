import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { isStopCommand } from '../../../shared/utils/stop-command';
import { memoryManager } from '../memory/memory-manager';
import { macroExecutor } from '../MacroExecutor';

export class CoreClassifier {
  static async classify(text: string, lower: string, isSearchQuery: boolean): Promise<string | null> {
    
    // Hard stop command
    if (isStopCommand(text)) {
      try {
        if (BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
          const wins = BrowserWindow.getAllWindows();
          wins.forEach(win => win.webContents.send('ui:stop-audio'));
        }
      } catch (e) { console.warn('Ignored error in catch', e); }
      if (/спасибо|благодарю|cgfcbf/i.test(lower)) {
        return `Всегда рад помочь.`;
      }
      return `Остановлено.`;
    }

    // Meta Word Repeating / Dictation Direct Match
    const isDictationCandidate = !isSearchQuery && !/расскажи/i.test(lower);
    const dictationMatch = isDictationCandidate ? lower.match(/^(?:напиши|скажи|произнеси)\s+(?:слово|фразу|текст)?\s*["'«»]?([^"'+:]+?)["'«»]?$/i) : null;
    if (dictationMatch) {
      const targetWord = dictationMatch[1].trim();
      if (targetWord && !targetWord.startsWith('задач') && !targetWord.startsWith('цель')) {
        return `${targetWord}.`;
      }
    }

    // Check direct memory answers ONLY for explicit memory queries
    const isExplicitMemoryQuery = /(?:какой|какая|какое|напомни|вспомни)\s+.*(?:мой|моя|моё|любим|предпочит)/i.test(lower) ||
      /(?:что\s+(?:ты\s+)?(?:обо\s+мне\s+)?(?:знаешь|помнишь)|что\s+в\s+памяти|мои\s+данные|моя\s+информация)/i.test(lower);

    if (isExplicitMemoryQuery) {
      const memoryContext = await memoryManager.enrichContext(text);
      for (const pref of memoryContext.userPreferences) {
        const keyParts = pref.key.split(':');
        const keyword = keyParts[keyParts.length - 1];
        if (lower.includes(keyword)) {
          return `Ваш ${keyword} — ${pref.value}`;
        }
      }
      
      if (memoryContext.relevantFacts.length > 0) {
        const bestFact = memoryContext.relevantFacts[0];
        if (bestFact.confidence > 0.7) {
          return `Согласно моим данным: ${bestFact.value}`;
        }
      }
    }

    // Custom Macros Triggers (cached with 5s TTL to avoid blocking Event Loop on every turn)
    try {
      const userDataPath = app && typeof app.getPath === 'function' ? app.getPath('userData') : process.cwd();
      const macrosDir = path.join(userDataPath, 'macros');
      const macrosList = await CoreClassifier.loadMacrosCached(macrosDir);
      if (macrosList.length > 0) {
        const cleanQuery = lower.replace(/[.,!?'"«»]/g, '').replace(/\s+/g, ' ').trim();
        const explicitMacroMatch = cleanQuery.match(/^(?:запусти|запустить|выполни|выполнить|включи|включить|активируй|активировать|стартани)\s+(?:мой\s+)?(?:скрипт|сценарий|макрос|команду)?\s*(.+)$/i);
        const targetMacroQuery = explicitMacroMatch ? explicitMacroMatch[1].trim() : '';

        for (const { file, data } of macrosList) {
          if (data && data.enabled !== false) {
            const rawPhraseSources: string[] = [];

              if (Array.isArray(data.triggers)) {
                for (const t of data.triggers) {
                  if (typeof t === 'string') rawPhraseSources.push(t);
                }
              } else if (typeof data.triggers === 'string') {
                rawPhraseSources.push(data.triggers);
              }

              if (Array.isArray(data.nodes)) {
                for (const node of data.nodes) {
                  if (node?.type === 'triggers/voice' && typeof node.properties?.phrases === 'string') {
                    rawPhraseSources.push(node.properties.phrases);
                  }
                }
              }

              for (const source of rawPhraseSources) {
                const subTrigs = source
                  .split(/[\n,;]+/)
                  .map(s => s.replace(/[.,!?'"«»]/g, '').replace(/\s+/g, ' ').trim().toLowerCase())
                  .filter(s => s.length > 0);

                for (const cleanTrig of subTrigs) {
                  if (cleanQuery.includes(cleanTrig)) {
                    console.log(`Executing macro [${data.name || file}] via voice/text trigger [${cleanTrig}]`);
                    macroExecutor.execute(data).catch(e => console.error('Macro execution error:', e));
                    return `Выполняю команду "${data.name || 'без названия'}".`;
                  }
                }
              }

              // Direct invocation by macro name (e.g. "запусти скрипт утренний ритуал" or exact macro name)
              const cleanMacroName = String(data.name || '').replace(/[.,!?'"«»]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
              if (
                cleanMacroName.length >= 2 &&
                (cleanQuery === cleanMacroName || (targetMacroQuery && targetMacroQuery === cleanMacroName))
              ) {
                console.log(`Executing macro [${data.name || file}] via macro name match [${cleanMacroName}]`);
                macroExecutor.execute(data).catch(e => console.error('Macro execution error:', e));
                return `Выполняю команду "${data.name || 'без названия'}".`;
              }
          }
        }
      }
    } catch (err) {
      console.error('Failed to match macro triggers in CoreClassifier:', err);
    }

    return null;
  }

  private static macrosCache: { dir: string; expiresAt: number; items: { file: string; data: any }[] } | null = null;

  private static async loadMacrosCached(macrosDir: string): Promise<{ file: string; data: any }[]> {
    const now = Date.now();
    if (this.macrosCache && this.macrosCache.dir === macrosDir && now < this.macrosCache.expiresAt) {
      return this.macrosCache.items;
    }
    const items: { file: string; data: any }[] = [];
    try {
      if (!fs.existsSync(macrosDir)) {
        this.macrosCache = { dir: macrosDir, expiresAt: now + 5000, items };
        return items;
      }
      const files = fs.promises?.readdir ? await fs.promises.readdir(macrosDir) : fs.readdirSync(macrosDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const fullPath = path.join(macrosDir, file);
          const content = fs.promises?.readFile ? await fs.promises.readFile(fullPath, 'utf-8') : fs.readFileSync(fullPath, 'utf-8');
          items.push({ file, data: JSON.parse(content) });
        } catch {}
      }
    } catch {}
    this.macrosCache = { dir: macrosDir, expiresAt: now + 5000, items };
    return items;
  }
}
