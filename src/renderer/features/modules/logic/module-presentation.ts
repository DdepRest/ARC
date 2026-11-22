import {
  Cpu,
  Box,
  Wrench,
  GraduationCap,
  Layout,
  Workflow,
  Activity,
  Terminal,
  Database,
  MessageSquare,
  ListTodo,
  Layers,
  Radio,
  type LucideIcon
} from 'lucide-vue-next';
import type {
  CapabilityHealth,
  CapabilityLifecycleState,
  ModuleCapability,
  ModulesCapabilitySnapshot
} from '../../../../shared/config/modules-capability.registry';

export interface CapabilityBadgeStyle {
  label: string;
  dotClass: string;
  textClass: string;
  iconClass: string;
}

const MODULE_ICONS: Record<string, LucideIcon> = {
  'ai-chat': MessageSquare,
  'memory-engine': Database,
  'tasks-engine': ListTodo,
  'strategic-objectives': Layers,
  'speech-stt': Radio,
  'skills': GraduationCap,
  'scenarios': Workflow,
  'observability': Activity,
  'perf-isolation': Activity,
  'orchestrator': Cpu,
  'agents': Box,
  'tools-mcp': Wrench,
  'architecture': Layout,
  'sandbox': Terminal
};

export function getCapabilityIcon(id: string): LucideIcon {
  return MODULE_ICONS[id] || Cpu;
}

export function getCapabilityBadge(
  lifecycleState: CapabilityLifecycleState,
  health: CapabilityHealth
): CapabilityBadgeStyle {
  if (lifecycleState === 'planned') {
    return {
      label: 'Запланировано в v1.1',
      dotClass: 'bg-[var(--status-warn)]',
      textClass: 'text-[var(--status-warn)]',
      iconClass: 'text-[var(--arc-text-muted)]'
    };
  }
  if (lifecycleState === 'disabled') {
    return {
      label: 'ОТКЛЮЧЁН',
      dotClass: 'bg-[var(--arc-text-muted)]',
      textClass: 'text-[var(--arc-text-muted)]',
      iconClass: 'text-[var(--arc-text-muted)]'
    };
  }

  switch (health) {
    case 'ready':
      return {
        label: 'ГОТОВ',
        dotClass: 'bg-[var(--status-ok)]',
        textClass: 'text-[var(--status-ok)]',
        iconClass: 'text-[var(--accent)]'
      };
    case 'degraded':
      return {
        label: 'ДЕГРАДАЦИЯ',
        dotClass: 'bg-[var(--status-warn)]',
        textClass: 'text-[var(--status-warn)]',
        iconClass: 'text-[var(--status-warn)]'
      };
    case 'error':
      return {
        label: 'ОШИБКА',
        dotClass: 'bg-[var(--status-err)]',
        textClass: 'text-[var(--status-err)]',
        iconClass: 'text-[var(--status-err)]'
      };
    case 'unavailable':
      return {
        label: 'НЕДОСТУПЕН',
        dotClass: 'bg-[var(--status-warn)]',
        textClass: 'text-[var(--status-warn)]',
        iconClass: 'text-[var(--arc-text-muted)]'
      };
    case 'checking':
      return {
        label: 'ПРОВЕРКА…',
        dotClass: 'bg-[var(--arc-text-muted)]',
        textClass: 'text-[var(--arc-text-muted)]',
        iconClass: 'text-[var(--arc-text-muted)]'
      };
    case 'unknown':
    default:
      return {
        label: 'НЕИЗВЕСТНО',
        dotClass: 'bg-[var(--arc-text-muted)]',
        textClass: 'text-[var(--arc-text-muted)]',
        iconClass: 'text-[var(--arc-text-muted)]'
      };
  }
}

export function isAttentionRequired(cap: ModuleCapability): boolean {
  return (
    cap.lifecycleState === 'implemented' &&
    (cap.health === 'degraded' || cap.health === 'unavailable' || cap.health === 'error' || cap.health === 'unknown')
  );
}

export function formatCheckedAt(iso: string | null): string {
  if (!iso) return 'не проверено';
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return 'не проверено';
    return dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return 'не проверено';
  }
}

export type ModulesViewFilter = 'all' | 'implemented' | 'attention' | 'planned';

export function filterCapabilities(
  snapshot: ModulesCapabilitySnapshot,
  filter: ModulesViewFilter,
  query: string
): { implemented: ModuleCapability[]; planned: ModuleCapability[] } {
  const q = query.trim().toLowerCase();
  const matchesQuery = (cap: ModuleCapability) =>
    !q ||
    cap.name.toLowerCase().includes(q) ||
    cap.description.toLowerCase().includes(q) ||
    cap.subsystem.toLowerCase().includes(q) ||
    cap.id.toLowerCase().includes(q) ||
    (cap.reason ? cap.reason.toLowerCase().includes(q) : false);

  const implementedAll = snapshot.capabilities.filter((c) => c.lifecycleState !== 'planned');
  const plannedAll = snapshot.capabilities.filter((c) => c.lifecycleState === 'planned');

  const implemented =
    filter === 'planned'
      ? []
      : implementedAll.filter((c) => (filter === 'attention' ? isAttentionRequired(c) : true)).filter(matchesQuery);

  const planned =
    filter === 'implemented' || filter === 'attention' ? [] : plannedAll.filter(matchesQuery);

  return { implemented, planned };
}
