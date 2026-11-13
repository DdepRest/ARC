import { ipcMain } from 'electron';
import { ToolDispatcher } from '../services/tools/tool-dispatcher';

export function setupMemoryIpc() {
  // Existing memory IPCs would be here if I haven't moved them yet.
}

export function registerToolsIpc() {
  const dispatcher = ToolDispatcher.getInstance();

  ipcMain.handle('tools:list', async () => {
    return dispatcher.getToolDefinitions();
  });

  ipcMain.handle('tools:execute', async (_, { name, params }) => {
    return await dispatcher.executeTool(name, params);
  });
}
