import type { SecretReadStatus } from '../../database-recovery.types';

export interface AiProvider {
  id: string;
  name: string;
  type: 'local' | 'cloud';
  endpoint: string;
  apiKey?: string;
  hasApiKey?: boolean;
  apiKeyStatus?: SecretReadStatus;
  model: string;
  selectedModels?: string[];
  routingStrategy?: 'smart_route' | 'fallback' | 'ensemble';
  priority: number;
  maxTokens: number;
  temperature: number;
  enabled: boolean;
  isExclusive?: boolean;
  modelsUpdatedAt?: number;
  modelsFetchError?: string;
  lastModelsFetchAt?: number;
  noAuthHeader?: boolean;
  freeTier?: 'free' | 'paid' | 'freemium';
}
