import { executeCommandRegistry } from '../features/commands/commands.registry';
import { useUIStore } from '../stores/ui.store';
import { useReactor } from './useReactor';
import { useChatStore } from '../features/chat/stores/chat.store';
import { useTasksStore } from '../features/tasks/stores/tasks.store';
import { useSettingsStore } from '../features/settings/stores/settings.store';
import { findTaskOrSubtask } from '../features/commands/commands.utils';

export function useVoiceCommands() {
  const uiStore = useUIStore();
  const settingsStore = useSettingsStore();
  const tasksStore = useTasksStore();
  const chatStore = useChatStore();

  const processVoiceCommand = async (rawText: string): Promise<{ handled: boolean; response?: string }> => {
    return executeCommandRegistry(rawText, { uiStore, settingsStore, tasksStore, chatStore });
  };

  return {
    processVoiceCommand,
    findTaskOrSubtask
  };
}
