import { registerDialogIPC } from './dialog.ipc';
import { registerFilesIpc } from './files.ipc';
import { registerVoiceIpc } from './voice.ipc';
import { registerSystemIpc } from './system.ipc';
import { registerAppIpc } from './app.ipc';
import { registerAiIpc } from './ai.ipc';
import { registerMemoryHandlers } from './memory.ipc';
import { registerToolsIpc } from './tools.ipc';
import { registerSkillsIpc } from './skills.ipc';
import { registerLauncherIpc } from './launcher.ipc';
import { registerMacrosIpc } from './macros.ipc';
import { registerObjectiveIpc } from './objective.ipc';
import { registerTranscriptionIpc } from './transcription.ipc';
import { registerTasksIpc } from './tasks.ipc';
import { registerSettingsIpc } from './settings.ipc';
import { registerApprovalIpc } from './approval.ipc';

export function registerIpcHandlers() {
    registerFilesIpc();
    registerVoiceIpc();
    registerSystemIpc();
    registerAppIpc();
    registerAiIpc();
    registerMemoryHandlers();
    registerToolsIpc();
    registerSkillsIpc();
    registerLauncherIpc();
    registerMacrosIpc();
    registerObjectiveIpc();
    registerTranscriptionIpc();
    registerDialogIPC();
    registerTasksIpc();
    registerSettingsIpc();
    registerApprovalIpc();
    console.log("Domain-specific IPC Handlers registered");
}
