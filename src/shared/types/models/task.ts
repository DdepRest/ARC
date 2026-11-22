/**
 * Task Model
 */
export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
}

export type TaskDecompositionSource = 'llm' | 'local_template';

export type TaskDecompositionFallbackReason =
  | 'llm_timeout'
  | 'llm_error'
  | 'llm_invalid_response'
  | 'llm_empty_steps'
  | 'empty_task_text'
  | 'ipc_unavailable'
  | 'ipc_error'
  | 'ipc_invalid_response';

export interface TaskDecompositionResult {
  steps: string[];
  source: TaskDecompositionSource;
  fallbackReason?: TaskDecompositionFallbackReason;
}

export interface TasksAiDecomposeResponse {
  success: boolean;
  taskId: string;
  steps: string[];
  source?: TaskDecompositionSource;
  fallbackReason?: TaskDecompositionFallbackReason;
  error?: string;
}

