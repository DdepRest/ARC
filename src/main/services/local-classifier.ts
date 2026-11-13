import { CoreClassifier } from './classifiers/core-classifier';
import { ProductivityClassifier } from './classifiers/productivity-classifier';
import { SystemClassifier } from './classifiers/system-classifier';
import { MediaClassifier } from './classifiers/media-classifier';
import { vkWebSocketServer } from './media/vk-websocket-server';
import { VkSendResult, isSupportedVkCommand } from '../../shared/types/ipc';

export class LocalClassifier {
  private static lastSuccessfulCommand: string | null = null;
  private static lastSettings: any = null;
  static async classify(text: string, settings?: any): Promise<string | null> {
    if (!text || typeof text !== 'string') {
      return null;
    }

    const lower = text.toLowerCase().trim();
    
    // Check for repeat commands
    const repeatPhrases = ['ещё', 'еще', 'повтори', 'ещё раз', 'еще раз', 'снова', 'сделай еще раз', 'repeat', 'again'];
    if (repeatPhrases.includes(lower)) {
        if (this.lastSuccessfulCommand) {
            console.log(`[LocalClassifier] Repeating last command: ${this.lastSuccessfulCommand}`);
            return this.classify(this.lastSuccessfulCommand, this.lastSettings || settings);
        } else {
            return "Нет предыдущей команды для повторения.";
        }
    }
    const isSearchQuery = /^(поиск|найди|гугл|яндекс|загугли|поищи|поискать)\b/i.test(lower);

    let result: string | null = null;

    // Priority: 1. Core & User Macros -> 2. Media & VK -> 3. Productivity & Tasks -> 4. System
    const coreResult = await CoreClassifier.classify(text, lower, isSearchQuery);
    if (coreResult !== null) {
      result = coreResult;
    } else {
      const mediaResult = MediaClassifier.classify(lower, settings);
      if (mediaResult !== null) {
        result = mediaResult;
      } else {
        const productivityResult = await ProductivityClassifier.classify(lower);
        if (productivityResult !== null) {
          result = productivityResult;
        } else {
          const systemResult = await SystemClassifier.classify(lower, isSearchQuery);
          if (systemResult !== null) {
            result = systemResult;
          }
        }
      }
    }

    if (result !== null) {
      this.lastSuccessfulCommand = text;
      this.lastSettings = settings;
      return result;
    }

    return null;
  }

  static async controlVk(action: string, data?: any): Promise<VkSendResult> {
    if (!isSupportedVkCommand(action)) {
      return {
        success: false,
        reason: 'unsupported_action',
        clientCount: vkWebSocketServer.getClientCount()
      };
    }

    return vkWebSocketServer.sendCommand(action as any, data);
  }
}
