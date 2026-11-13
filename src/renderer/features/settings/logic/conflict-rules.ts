import { computed, type Ref } from 'vue';

export interface ConflictRuleContext {
  forcedOfflineMode: boolean;
  useLocalLLM: boolean;
  exclusiveMode: boolean;
  exclusiveProvider?: {
    id: string;
    name: string;
    apiKey?: string;
    isQuarantined?: boolean;
  } | null;
  microphoneEnabled: boolean;
  wakeWordEnabled: boolean;
}

export interface ActiveConflict {
  id: string;
  ruleNumber: 1 | 2 | 3 | number;
  title: string;
  message: string;
  actionLabel: string;
  resolve: () => void;
}

export function evaluateConflicts(
  ctx: ConflictRuleContext,
  actions: {
    enableLocalAI: () => void;
    openProviderCard?: (providerId?: string) => void;
    enableMicrophone: () => void;
  }
): ActiveConflict[] {
  const conflicts: ActiveConflict[] = [];

  // Rule 1: offlineForce && !useLocalLLM
  if (ctx.forcedOfflineMode && !ctx.useLocalLLM) {
    conflicts.push({
      id: 'conflict-offline-no-local',
      ruleNumber: 1,
      title: 'Противоречие в настройках',
      message: 'Отвечать будет нечем: облачные запросы заблокированы, а локальной модели нет.',
      actionLabel: 'Включить локальный ИИ',
      resolve: actions.enableLocalAI
    });
  }

  // Rule 2: exclusiveMode && (!pinnedProvider?.apiKey || isQuarantined)
  if (ctx.exclusiveMode) {
    const prov = ctx.exclusiveProvider;
    const hasKey = Boolean(prov && prov.apiKey && prov.apiKey.trim().length > 0);
    const isQuarantined = Boolean(prov && prov.isQuarantined);
    if (!prov || !hasKey || isQuarantined) {
      conflicts.push({
        id: 'conflict-exclusive-unavailable',
        ruleNumber: 2,
        title: 'Закреплённый провайдер не ответит',
        message: isQuarantined 
          ? `Провайдер ${prov?.name || ''} на паузе после сбоя. Запасные отключены эксклюзивным режимом.` 
          : `У закреплённого провайдера ${prov?.name || ''} не задан API-ключ. Запасные отключены.`,
        actionLabel: 'Открыть карточку провайдера',
        resolve: () => actions.openProviderCard?.(prov?.id)
      });
    }
  }

  // Rule 3: micOff && wakeWordEnabled
  if (!ctx.microphoneEnabled && ctx.wakeWordEnabled) {
    conflicts.push({
      id: 'conflict-mic-off-wakeword-on',
      ruleNumber: 3,
      title: 'Микрофон отключён',
      message: 'Кодовое слово включено, но микрофон выключен — A.R.C. не услышит.',
      actionLabel: 'Включить микрофон',
      resolve: actions.enableMicrophone
    });
  }

  return conflicts;
}
