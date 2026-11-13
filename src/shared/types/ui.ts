// UI State Types
export type TabName = 
  | 'core'
  | 'chat'
  | 'modules'
  | 'objectives'
  | 'tasks'
  | 'files'
  | 'orchestrator'
  | 'agents'
  | 'memory'
  | 'tools'
  | 'skills'
  | 'architecture'
  | 'scenarios'
  | 'commands'
  | 'observability'
  | 'sandbox'
  | 'settings'
  | 'vision'
  | 'transcription'
  | 'updates';

export type ReactorState = 
  | 'idle' 
  | 'listening' 
  | 'processing' 
  | 'speaking' 
  | 'alert' 
  | 'directive'
  | 'loading_whisper'
  | 'loading_llm'
  | 'rollback_in_progress'
  | 'route_generation';

export const TAB_REGISTRY: Record<TabName, string> = {
  core: 'CORE',
  chat: 'CHAT',
  modules: 'MODULES',
  objectives: 'OBJECTIVES',
  tasks: 'TASKS',
  files: 'FILES',
  orchestrator: 'ORCHESTRATOR',
  agents: 'AGENTS',
  memory: 'MEMORY',
  tools: 'TOOLS',
  skills: 'SKILLS',
  architecture: 'ARCHITECTURE',
  scenarios: 'SCENARIOS',
  commands: 'КОМАНДЫ',
  observability: 'OBSERVABILITY',
  sandbox: 'SANDBOX',
  settings: 'SETTINGS',
  vision: 'VISION',
  transcription: 'АУДИО',
  updates: 'ОБНОВЛЕНИЯ'
};
