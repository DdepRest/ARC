import type {
  TaskDecompositionSource,
  TaskDecompositionFallbackReason,
  TasksAiDecomposeResponse
} from '../../../shared/types/models/task';

export type {
  TaskDecompositionSource,
  TaskDecompositionFallbackReason,
  TasksAiDecomposeResponse
};

export interface TaskCategory {
  id: string;
  name: string;
  color?: string;
}

export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
  restSeconds?: number;
  source?: TaskDecompositionSource;
}

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'blocked' | 'deferred' | 'done';
export type EisenhowerQuadrant = 'urgent-important' | 'important' | 'urgent' | 'regular';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type RecurrenceEndType = 'never' | 'after_occurrences' | 'on_date';

export interface RecurrenceRule {
  type: RecurrenceType;
  interval?: number; // e.g., 1, 2, 3...
  daysOfWeek?: number[]; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun
  endType?: RecurrenceEndType; // 'never' (♾️ Бесконечно), 'after_occurrences', 'on_date'
  count?: number; // max occurrences e.g. 10
  endDate?: string; // e.g. '2026-12-31'
  occurrencesCount?: number; // how many times executed
  label?: string; // Human-readable description
}

export interface TaskAttachment {
  id: string;
  type: 'image' | 'link' | 'file';
  url: string;
  title: string;
}

export interface Task {
  id: string;
  text: string;
  description: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  updatedAt?: number;
  updated_at?: number;
  priority: 'low' | 'medium' | 'high';
  category: string;
  dueDate?: string;
  subtasks: SubTask[];
  status?: TaskStatus;
  importance?: EisenhowerQuadrant;
  estimatedMinutes?: number;
  spentMinutes?: number;
  aiDecomposed?: boolean;
  isMyDay?: boolean;
  recurrence?: RecurrenceRule;
  attachments?: TaskAttachment[];
  autoRestSeconds?: number;
  objectiveId?: string;
}

export interface TaskChangedPayload {
  action: 'created' | 'updated' | 'completed' | 'deleted' | 'batch' | 'reload';
  task?: any;
  id?: string;
  tasks?: any[];
  source: 'renderer' | 'ai_tool' | 'system';
}

export interface SelectOption {
  label: string;
  value: string | number | boolean;
}
