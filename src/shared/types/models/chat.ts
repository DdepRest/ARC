/**
 * File Attachment Model
 */
export interface FileAttachment {
  id?: string;
  name: string;
  size: number;
  type: string;
  extension?: string;
  previewUrl?: string;
  dataUrl?: string;
  content?: string;
}

export interface ToolSourceInfo {
  tool: 'wikipedia' | 'web_search' | 'memory' | 'memory:search' | string;
  count?: number;
  label?: string;
}

export type ExecutionStepStatus = 'pending' | 'running' | 'success' | 'error';

export interface ExecutionStep {
  id: string;
  executor: 'Planner' | 'Executor' | 'Validator' | 'Wikipedia' | 'Web Search' | 'Долгосрочная память' | 'Инструмент' | string;
  description: string;
  status: ExecutionStepStatus;
  inputData?: any;
  outputData?: any;
  errorDetails?: string;
  isRetried?: boolean;
  durationMs?: number;
}

export interface ValidatorFeedback {
  rejected: boolean;
  reason: string;
  details?: string;
  canRetry?: boolean;
  canRefine?: boolean;
}

export type MessageBlockType = 'user_directive' | 'execution_trace' | 'final_answer' | 'system_status';

export type AgentStateStatus = 'idle' | 'planning' | 'executing' | 'validating' | 'ready' | 'error';

/**
 * Message Model
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  blockType?: MessageBlockType;
  content: string;
  timestamp: number;
  providerName?: string;
  providerTarget?: string;
  latency?: number;
  cause?: string;
  attachments?: FileAttachment[];
  toolSource?: ToolSourceInfo;
  executionSteps?: ExecutionStep[];
  validatorFeedback?: ValidatorFeedback;
  statusType?: 'info' | 'warning' | 'error' | 'success';
  errorDetails?: string;
  isRetried?: boolean;
  meta?: {
    provider?: string;
    model?: string;
    latency?: number;
    isCache?: boolean;
    source?: 'live' | 'cache' | 'local' | 'system';
    reqId?: string;
    ttsEngine?: 'silero' | 'edge' | 'sapi';
    ttsCached?: boolean;
  };
}
