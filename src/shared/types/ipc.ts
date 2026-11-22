export interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SystemInfo {
  os: string;
  arch: string;
  cores: number;
  memory: number;
}

export type {
  CapabilityLifecycleState,
  CapabilityAvailability,
  CapabilityHealth,
  CapabilityCategory,
  CapabilityEntrypoint,
  ModuleCapability,
  ModulesCapabilitySummary,
  LegacyModulesStatusMap,
  ModulesCapabilitySnapshot,
  ModulesStatusRequestOptions
} from '../config/modules-capability.registry';

export type {
  TaskDecompositionSource,
  TaskDecompositionFallbackReason,
  TaskDecompositionResult,
  TasksAiDecomposeResponse
} from './models/task';

export type ModuleStatus = 'Active' | 'Degraded' | 'Idle' | 'Unavailable' | 'Error';

export interface VkConnectionStatusPayload {
  connectedClientsCount: number;
  serverPort: number | null;
  serverError: string | null;
  serverRunning: boolean;
}

export interface VkSendResult {
  success: boolean;
  reason?: 'no_clients' | 'no_open_socket' | 'invalid_command' | 'unsupported_action' | string;
  clientCount: number;
}

export interface VkStatusPayload {
  title: string;
  playing: boolean;
  closed: boolean;
  currentTime?: number;
  duration?: number;
  cover?: string;
  nextTrack?: string;
  lyrics?: string;
  shuffled?: boolean;
  repeated?: boolean | string;
  liked?: boolean;
  volume?: number;
  track?: string;
  artist?: string;
}

export const SUPPORTED_VK_COMMANDS = [
  'play',
  'pause',
  'next',
  'prev',
  'shuffle',
  'repeat',
  'save',
  'remove',
  'volume',
  'rewind_fwd',
  'rewind_back',
  'seek',
  'sync'
] as const;

export type VkCommandAction = typeof SUPPORTED_VK_COMMANDS[number];

export type VkControlPayloadMap = {
  play: void;
  pause: void;
  next: void;
  prev: void;
  shuffle: void;
  repeat: { mode: 'off' | 'track' | 'playlist' };
  save: void;
  remove: void;
  volume: { value: number };
  rewind_fwd: void;
  rewind_back: void;
  seek: { percentage: number };
  sync: void;
};

export type VkControlPayload<T extends VkCommandAction = VkCommandAction> = T extends keyof VkControlPayloadMap ? VkControlPayloadMap[T] : never;

export function isSupportedVkCommand(action: string): action is VkCommandAction {
  return SUPPORTED_VK_COMMANDS.includes(action as VkCommandAction);
}

