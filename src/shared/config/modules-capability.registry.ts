import type { TabName } from '../types/ui';

export type CapabilityLifecycleState = 'implemented' | 'planned' | 'disabled';
export type CapabilityAvailability = 'available' | 'degraded' | 'unavailable';
export type CapabilityHealth = 'checking' | 'ready' | 'degraded' | 'unavailable' | 'error' | 'unknown';
export type CapabilityCategory = 'cognitive' | 'voice' | 'workflow' | 'telemetry' | 'roadmap';

export interface CapabilityEntrypoint {
  tab: TabName;
  section?: string;
  label?: string;
}

export interface ModuleCapabilityDefinition {
  id: string;
  name: string;
  description: string;
  subsystem: string;
  category: CapabilityCategory;
  lifecycleState: CapabilityLifecycleState;
  entrypoint: CapabilityEntrypoint | null;
  dependencies: readonly string[];
  plannedReason?: string;
}

export interface ModuleCapability {
  id: string;
  name: string;
  description: string;
  subsystem: string;
  category: CapabilityCategory;
  lifecycleState: CapabilityLifecycleState;
  availability: CapabilityAvailability;
  health: CapabilityHealth;
  entrypoint: CapabilityEntrypoint | null;
  dependencies: string[];
  lastCheckedAt: string | null;
  reason: string | null;
}

export interface ModulesCapabilitySummary {
  total: number;
  implemented: number;
  planned: number;
  disabled: number;
  ready: number;
  degraded: number;
  unavailable: number;
  error: number;
  checking: number;
  unknown: number;
}

export type LegacyModuleTelemetryState = 'Active' | 'Degraded' | 'Idle' | 'Unavailable' | 'Error';

export interface LegacyModulesStatusMap {
  Assistant: LegacyModuleTelemetryState;
  Voice: LegacyModuleTelemetryState;
  Memory: LegacyModuleTelemetryState;
  Tasks: LegacyModuleTelemetryState;
  [key: string]: LegacyModuleTelemetryState;
}

export interface ModulesCapabilitySnapshot {
  schemaVersion: 1;
  checkedAt: string | null;
  capabilities: ModuleCapability[];
  summary: ModulesCapabilitySummary;
  legacyStatusMap: LegacyModulesStatusMap;
}

export interface ModulesStatusRequestOptions {
  refresh?: boolean;
}

export const PLANNED_DEFAULT_REASON = 'Запланировано в v1.1 — пользовательская реализация отсутствует';

export const MODULES_CAPABILITY_DEFINITIONS: readonly ModuleCapabilityDefinition[] = [
  {
    id: 'ai-chat',
    name: 'Когнитивный диалог',
    description: 'Основной канал взаимодействия с ИИ-ядром, стриминг ответов, переключение моделей.',
    subsystem: 'Cognitive Engine',
    category: 'cognitive',
    lifecycleState: 'implemented',
    entrypoint: { tab: 'chat', label: 'Открыть чат' },
    dependencies: ['ai-providers', 'dialog-storage']
  },
  {
    id: 'memory-engine',
    name: 'Когнитивная память',
    description: 'Векторная и реляционная база фактов, предпочтений пользователя и истории сессий.',
    subsystem: 'Memory Subsystem',
    category: 'cognitive',
    lifecycleState: 'implemented',
    entrypoint: { tab: 'memory', label: 'Открыть память' },
    dependencies: ['sqlite-db']
  },
  {
    id: 'tasks-engine',
    name: 'Операционные задачи',
    description: 'Управление активными задачами, спринтами, таймерами отдыха и расписанием.',
    subsystem: 'Execution Scheduler',
    category: 'workflow',
    lifecycleState: 'implemented',
    entrypoint: { tab: 'tasks', label: 'Открыть задачи' },
    dependencies: ['sqlite-db']
  },
  {
    id: 'strategic-objectives',
    name: 'Стратегические цели',
    description: 'Долгосрочное целеполагание, декомпозиция глобальных задач системы и трекинг OKR.',
    subsystem: 'Planning Unit',
    category: 'cognitive',
    lifecycleState: 'implemented',
    entrypoint: { tab: 'objectives', label: 'Открыть цели' },
    dependencies: ['sqlite-db']
  },
  {
    id: 'speech-stt',
    name: 'Речевой контур (STT & TTS)',
    description: 'Silero v5.6 и Sherpa ONNX для синтеза и распознавания речи с шумоподавлением.',
    subsystem: 'Voice DSP Core',
    category: 'voice',
    lifecycleState: 'implemented',
    entrypoint: { tab: 'transcription', label: 'Открыть аудио' },
    dependencies: ['stt-engine', 'tts-engine']
  },
  {
    id: 'skills',
    name: 'Процедурные навыки',
    description: 'Реестр навыков A.R.C. с обучением новым триггерам, фразам и процедурным алгоритмам.',
    subsystem: 'Skills Registry',
    category: 'workflow',
    lifecycleState: 'implemented',
    entrypoint: { tab: 'commands', label: 'Открыть команды' },
    dependencies: ['skills-registry']
  },
  {
    id: 'scenarios',
    name: 'Сценарии и макросы',
    description: 'Графический редактор логики на графах и библиотека системных сценариев автоматизации.',
    subsystem: 'Graph Workflow',
    category: 'workflow',
    lifecycleState: 'implemented',
    entrypoint: { tab: 'commands', label: 'Открыть сценарии' },
    dependencies: ['macro-scheduler', 'macros-storage']
  },
  {
    id: 'observability',
    name: 'Наблюдаемость и телеметрия',
    description: 'Комплексный мониторинг системной нагрузки, памяти VRAM/RAM и логов безопасности.',
    subsystem: 'Telemetry Core',
    category: 'telemetry',
    lifecycleState: 'implemented',
    entrypoint: { tab: 'vision', label: 'Открыть обзор' },
    dependencies: ['os-metrics']
  },
  {
    id: 'perf-isolation',
    name: 'Изоляция производительности',
    description: 'Управление политикой визуальной нагрузки (Active, Background, Eco Mode) без задержек.',
    subsystem: 'Performance Core',
    category: 'telemetry',
    lifecycleState: 'implemented',
    entrypoint: { tab: 'settings', section: 'performance', label: 'Открыть настройки' },
    dependencies: ['eco-service']
  },
  {
    id: 'orchestrator',
    name: 'Оркестратор процессов',
    description: 'Маршрутизация вызовов между пулами локальных (Ollama / GGUF) и облачных нейросетей.',
    subsystem: 'Orchestration Unit',
    category: 'cognitive',
    lifecycleState: 'implemented',
    entrypoint: { tab: 'settings', section: 'intelligence', label: 'Маршрутизация в Settings' },
    dependencies: ['ai-providers', 'provider-health']
  },
  {
    id: 'agents',
    name: 'Автономные агенты',
    description: 'Пул субагентов (Planner, Writer, Critic, Auditor) для параллельных процессов.',
    subsystem: 'Agent Swarm',
    category: 'roadmap',
    lifecycleState: 'planned',
    entrypoint: null,
    dependencies: ['agent-swarm-runtime'],
    plannedReason: PLANNED_DEFAULT_REASON
  },
  {
    id: 'tools-mcp',
    name: 'MCP & системные утилиты',
    description: 'Протокол интеграции внешних инструментов Model Context Protocol для работы с ОС.',
    subsystem: 'Tool Bridge',
    category: 'roadmap',
    lifecycleState: 'planned',
    entrypoint: null,
    dependencies: ['mcp-host-bridge'],
    plannedReason: PLANNED_DEFAULT_REASON
  },
  {
    id: 'architecture',
    name: 'Архитектурный дизайн',
    description: 'Интерактивная визуализация связей компонентов ядра и мониторинг шины событий.',
    subsystem: 'Core Topology',
    category: 'roadmap',
    lifecycleState: 'planned',
    entrypoint: null,
    dependencies: ['topology-inspector'],
    plannedReason: PLANNED_DEFAULT_REASON
  },
  {
    id: 'sandbox',
    name: 'Песочница экспериментов',
    description: 'Изолированное окружение для безопасного запуска скриптов и отладки промптов.',
    subsystem: 'Sandbox Engine',
    category: 'roadmap',
    lifecycleState: 'planned',
    entrypoint: null,
    dependencies: ['isolated-runner'],
    plannedReason: PLANNED_DEFAULT_REASON
  }
];

export function computeCapabilitySummary(capabilities: readonly ModuleCapability[]): ModulesCapabilitySummary {
  const summary: ModulesCapabilitySummary = {
    total: capabilities.length,
    implemented: 0,
    planned: 0,
    disabled: 0,
    ready: 0,
    degraded: 0,
    unavailable: 0,
    error: 0,
    checking: 0,
    unknown: 0
  };

  for (const cap of capabilities) {
    if (cap.lifecycleState === 'implemented') summary.implemented++;
    else if (cap.lifecycleState === 'planned') summary.planned++;
    else summary.disabled++;

    if (cap.health === 'ready') summary.ready++;
    else if (cap.health === 'degraded') summary.degraded++;
    else if (cap.health === 'unavailable') summary.unavailable++;
    else if (cap.health === 'error') summary.error++;
    else if (cap.health === 'checking') summary.checking++;
    else summary.unknown++;
  }

  return summary;
}

function mapHealthToLegacyState(cap: ModuleCapability | undefined): LegacyModuleTelemetryState {
  if (!cap || cap.lifecycleState !== 'implemented') return 'Unavailable';
  switch (cap.health) {
    case 'ready':
      return 'Active';
    case 'degraded':
      return 'Degraded';
    case 'error':
      return 'Error';
    case 'unavailable':
      return 'Unavailable';
    case 'checking':
    case 'unknown':
    default:
      return 'Idle';
  }
}

export function deriveLegacyModulesStatusMap(capabilities: readonly ModuleCapability[]): LegacyModulesStatusMap {
  const byId = new Map<string, ModuleCapability>();
  for (const cap of capabilities) {
    byId.set(cap.id, cap);
  }

  return {
    Assistant: mapHealthToLegacyState(byId.get('ai-chat')),
    Voice: mapHealthToLegacyState(byId.get('speech-stt')),
    Memory: mapHealthToLegacyState(byId.get('memory-engine')),
    Tasks: mapHealthToLegacyState(byId.get('tasks-engine'))
  };
}

export function enforceCapabilityInvariants(cap: ModuleCapability): ModuleCapability {
  if (cap.lifecycleState === 'planned') {
    return {
      ...cap,
      availability: 'unavailable',
      health: 'unavailable',
      entrypoint: null,
      reason: cap.reason || PLANNED_DEFAULT_REASON
    };
  }
  if (cap.lifecycleState === 'disabled') {
    return {
      ...cap,
      availability: 'unavailable',
      health: cap.health === 'error' ? 'error' : 'unavailable'
    };
  }
  return cap;
}

export function buildModulesCapabilitySnapshot(
  capabilities: readonly ModuleCapability[],
  checkedAt: string | null = new Date().toISOString()
): ModulesCapabilitySnapshot {
  const normalized = capabilities.map(enforceCapabilityInvariants);
  return {
    schemaVersion: 1,
    checkedAt,
    capabilities: normalized,
    summary: computeCapabilitySummary(normalized),
    legacyStatusMap: deriveLegacyModulesStatusMap(normalized)
  };
}

export function createBaselineCapabilities(
  implementedHealth: 'checking' | 'unknown' | 'unavailable',
  reason: string,
  checkedAt: string | null = null
): ModuleCapability[] {
  return MODULES_CAPABILITY_DEFINITIONS.map((def) => {
    if (def.lifecycleState === 'planned') {
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        subsystem: def.subsystem,
        category: def.category,
        lifecycleState: 'planned',
        availability: 'unavailable',
        health: 'unavailable',
        entrypoint: null,
        dependencies: [...def.dependencies],
        lastCheckedAt: checkedAt,
        reason: def.plannedReason || PLANNED_DEFAULT_REASON
      };
    }

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      subsystem: def.subsystem,
      category: def.category,
      lifecycleState: def.lifecycleState,
      availability: implementedHealth === 'unavailable' ? 'unavailable' : 'degraded',
      health: implementedHealth,
      entrypoint: def.entrypoint ? { ...def.entrypoint } : null,
      dependencies: [...def.dependencies],
      lastCheckedAt: checkedAt,
      reason
    };
  });
}

export function createPendingCapabilitySnapshot(
  reason: string = 'Проверка состояния подсистем…',
  implementedHealth: 'checking' | 'unknown' | 'unavailable' = 'checking',
  checkedAt: string | null = null
): ModulesCapabilitySnapshot {
  return buildModulesCapabilitySnapshot(
    createBaselineCapabilities(implementedHealth, reason, checkedAt),
    checkedAt
  );
}

export function normalizeModulesCapabilityResponse(raw: unknown): ModulesCapabilitySnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, any>;
  if (Array.isArray(obj.capabilities)) {
    const normalizedCaps: ModuleCapability[] = obj.capabilities
      .filter((item): item is ModuleCapability => Boolean(item && typeof item === 'object' && typeof item.id === 'string'))
      .map((item) => enforceCapabilityInvariants({
        id: String(item.id),
        name: String(item.name || item.id),
        description: String(item.description || ''),
        subsystem: String(item.subsystem || 'Core'),
        category: item.category || 'cognitive',
        lifecycleState: item.lifecycleState === 'planned' || item.lifecycleState === 'disabled' ? item.lifecycleState : 'implemented',
        availability: item.availability === 'available' || item.availability === 'degraded' || item.availability === 'unavailable' ? item.availability : 'unavailable',
        health: (['checking', 'ready', 'degraded', 'unavailable', 'error', 'unknown'].includes(item.health) ? item.health : 'unknown') as CapabilityHealth,
        entrypoint: item.entrypoint && typeof item.entrypoint === 'object' ? { ...item.entrypoint } : null,
        dependencies: Array.isArray(item.dependencies) ? item.dependencies.map(String) : [],
        lastCheckedAt: typeof item.lastCheckedAt === 'string' ? item.lastCheckedAt : null,
        reason: typeof item.reason === 'string' ? item.reason : null
      }));
    const checkedAt = typeof obj.checkedAt === 'string' ? obj.checkedAt : null;
    return buildModulesCapabilitySnapshot(normalizedCaps, checkedAt);
  }
  return null;
}
