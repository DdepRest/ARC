import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useUIStore } from '../../../stores/ui.store';
import { useSettingsStore } from '../../settings/stores/settings.store';
import { useObjectiveRouteLayout } from './useObjectiveRouteLayout';

export function useObjectives() {
  const uiStore = useUIStore();
  const settingsStore = useSettingsStore();
  const routeLayout = useObjectiveRouteLayout();

  const safeSlice = (val: any, start: number, end?: number): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'string' ? val : String(val);
    return str.slice(start, end);
  };

  const activeSection = ref<'goals' | 'topology' | 'diagnostics'>('goals');
  const objectives = ref<any[]>([]);
  const decisions = ref<any[]>([]);
  const graph = ref<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const predictionNodes = ref<any[]>([]);
  const coherenceHistory = ref<any[]>([]);
  const currentRouteMap = ref<any | null>(null);
  const excludedNodes = ref<string[]>([]);
  const selectedObjId = ref<string | null>(null);
  const isRollingBack = ref(false);

  // Rollback Action Sheet state
  const showRollbackDialog = ref(false);
  const rollbackResult = ref<{ success: boolean; message: string } | null>(null);

  // Decomposition Draft state (Task 3.1)
  const pendingDraftsByObjectiveId = ref<Record<string, any>>({});
  const isDecomposing = ref(false);
  const isApprovingDraft = ref(false);

  const hasDraftObjective = computed(() => {
    return objectives.value.some(o => o.status === 'DRAFT');
  });

  const startDrag = (event: MouseEvent, nodeId: string) => {
    routeLayout.startDrag(event, nodeId);
  };

  const onDragMove = (event: MouseEvent) => {
    routeLayout.onDragMove(event, currentRouteMap.value);
  };

  const stopDrag = () => {
    routeLayout.stopDrag();
  };

  const getNodeCoords = (id: string) => {
    return routeLayout.getNodeCoords(id, currentRouteMap.value);
  };

  const entropyState = ref({
    entropy: 0.12,
    state: 'QUIESCENT',
    autoApprove: true,
    systemMode: 'EVOLUTIONARY_EXECUTION',
    rateThrottleFactor: 1.0,
    coherenceIndex: 0.70,
    coherenceData: {
      coherenceIndex: 0.70,
      epCount: 0,
      xpCount: 0,
      spCount: 0,
      stabilityDrift: 0.05,
      explorationFreedom: false,
      suppressionSensitivity: 'NORMAL'
    }
  });

  const entropyColorClass = computed(() => {
    const ent = entropyState.value.entropy;
    if (ent >= 0.7) return 'text-[var(--status-err)] bg-[var(--status-err)]';
    if (ent >= 0.4) return 'text-[var(--status-warn)] bg-[var(--status-warn)]';
    if (ent < 0.2) return 'text-[var(--status-ok)] bg-[var(--status-ok)]';
    return 'text-[var(--accent)] bg-[var(--accent)]';
  });

  const stabilityBadgeClass = computed(() => {
    const state = entropyState.value.state;
    if (state === 'CRITICAL') return 'border-[var(--status-err)]/30 text-[var(--status-err)] bg-[var(--status-err)]/10 animate-pulse';
    if (state === 'DEGRADED') return 'border-[var(--status-warn)]/30 text-[var(--status-warn)] bg-[var(--status-warn)]/10';
    if (state === 'QUIESCENT') return 'border-[var(--status-ok)]/30 text-[var(--status-ok)] bg-[var(--status-ok)]/10';
    return 'border-[rgba(var(--accent-rgb),0.3)] text-[var(--accent)] bg-[rgba(var(--accent-rgb),0.1)]';
  });

  const toggleAutoApprove = async () => {
    if (window.api) {
      const newVal = !entropyState.value.autoApprove;
      await window.api.objectiveSetAutoApprove({ autoApprove: newVal });
      entropyState.value.autoApprove = newVal;
      await loadData();
    }
  };

  const showCreateForm = ref(false);
  const onObjectiveCreated = () => {
    showCreateForm.value = false;
    loadData();
  };

  const selectedObj = computed(() => {
    if (!selectedObjId.value) return null;
    return objectives.value.find(o => o.id === selectedObjId.value) || null;
  });

  const completedCount = computed(() => {
    return objectives.value.filter(o => o.status === 'COMPLETED').length;
  });

  const avgProgress = computed(() => {
    if (objectives.value.length === 0) return 0;
    let total = 0;
    for (const obj of objectives.value) {
      if (obj.outcomes && obj.outcomes.length > 0) {
        total += obj.outcomes.reduce((acc: number, o: any) => acc + o.progress, 0) / obj.outcomes.length;
      } else {
        total += obj.status === 'COMPLETED' ? 1.0 : 0.0;
      }
    }
    return Math.round((total / objectives.value.length) * 100);
  });

  const systemHealthIndex = computed(() => {
    if (objectives.value.length === 0) return 100;
    const totalConf = objectives.value.reduce((acc, o) => acc + o.confidence, 0);
    return Math.round((totalConf / objectives.value.length) * 100);
  });

  const filterDecisionsForSelected = computed(() => {
    if (!selectedObjId.value) return [];
    return decisions.value.filter(d => d.objective_id === selectedObjId.value);
  });

  const graphNodesScaled = computed(() => {
    if (!graph.value.nodes || graph.value.nodes.length === 0) return [];
    
    const count = graph.value.nodes.length;
    return graph.value.nodes.map((node, index) => {
      const angle = (index * 2 * Math.PI) / count - (Math.PI / 2);
      const radius = count > 1 ? 32 : 0;
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);
      
      return {
        ...node,
        x,
        y
      };
    });
  });

  const graphLinksScaled = computed(() => {
    if (!graph.value.links || graph.value.links.length === 0) return [];
    const nodes = graphNodesScaled.value;
    
    return graph.value.links.map(link => {
      const sourceNode = nodes.find(n => n.id === link.source);
      const targetNode = nodes.find(n => n.id === link.target);
      if (!sourceNode || !targetNode) return null;
      return {
        x1: `${sourceNode.x}%`,
        y1: `${sourceNode.y}%`,
        x2: `${targetNode.x}%`,
        y2: `${targetNode.y}%`
      };
    }).filter(Boolean);
  });

  let unsubRollback: (() => void) | null = null;

  onMounted(() => {
    loadData();
    const interval = setInterval(() => {
      if (uiStore.activeTab === 'objectives') {
        loadData();
      }
    }, 4000);

    if (window.api && (window.api as any).onRollbackProgress) {
      unsubRollback = (window.api as any).onRollbackProgress((data: any) => {
        uiStore.setRollbackProgress({
          current: data.current,
          total: data.total,
          text: data.message
        });
      });
    }

    onUnmounted(() => {
      clearInterval(interval);
      if (unsubRollback) {
        unsubRollback();
      }
      routeLayout.cleanupDrag();
      uiStore.setRollbackProgress(null);
    });
  });

  const loadData = async () => {
    if (window.api) {
      try {
        const list = await window.api.objectiveGetAll();
        objectives.value = list || [];
        
        const decs = await window.api.decisionGetAll();
        decisions.value = decs || [];
        
        const g = await window.api.objectiveGetGraph();
        graph.value = g || { nodes: [], links: [] };

        try {
          if (window.api.decisionGetPredictionNodes) {
            const preds = await window.api.decisionGetPredictionNodes();
            predictionNodes.value = preds || [];
          }
        } catch (err) {
          console.warn("Failed to fetch prediction nodes:", err);
        }

        try {
          if (window.api.decisionGetCoherenceHistory) {
            const hist = await window.api.decisionGetCoherenceHistory(25);
            coherenceHistory.value = hist || [];
          }
        } catch (err) {
          console.warn("Failed to fetch coherence history:", err);
        }

        try {
          const ent: any = await window.api.objectiveGetEntropyState();
          if (ent) {
            entropyState.value = {
              ...entropyState.value,
              ...ent,
              coherenceData: {
                ...((entropyState.value as any).coherenceData || {}),
                ...(ent.coherenceData || {})
              }
            };
          }
        } catch (err) {
          console.warn("Failed to fetch engine loop entropy:", err);
        }

        if (list && list.length > 0 && !selectedObjId.value) {
          selectedObjId.value = list[0].id;
          loadRouteMap(list[0].id);
        } else if (selectedObjId.value) {
          const currentObj = list?.find((o: any) => o.id === selectedObjId.value);
          if (currentObj && currentObj.status === 'DRAFT' && !currentRouteMap.value) {
            loadRouteMap(selectedObjId.value);
          }
        }
      } catch (e) {
        console.error("Failed to load Objective OS data:", e);
      }
    }
  };

  const loadRouteMap = async (id: string) => {
    if (window.api && window.api.objectiveGenerateRouteMap) {
      uiStore.setReactorState('route_generation');
      try {
        const rm = await window.api.objectiveGenerateRouteMap(id);
        if (rm && rm.nodes) {
          routeLayout.applyRouteLayout(rm.nodes, rm.edges);
        }
        currentRouteMap.value = rm;
        excludedNodes.value = [];
      } catch (err) {
        console.error("Failed to generate route map:", err);
        currentRouteMap.value = null;
      } finally {
        uiStore.setReactorState('idle');
      }
    }
  };

  const toggleNodeExclusion = (nodeId: string) => {
    if (excludedNodes.value.includes(nodeId)) {
      excludedNodes.value = excludedNodes.value.filter(nId => nId !== nodeId);
    } else {
      excludedNodes.value.push(nodeId);
    }
  };

  const getOrderChanges = () => {
    if (!currentRouteMap.value) return [];
    return currentRouteMap.value.nodes
      .filter((n: any) => n.type === 'DECISION' && typeof n.execution_weight === 'number')
      .map((n: any) => ({ id: n.id, weight: n.execution_weight }));
  };

  const approveRoute = async () => {
    if (!selectedObjId.value || !window.api) return;
    try {
      await window.api.objectiveApproveRoute({
        objectiveId: selectedObjId.value,
        changes: {
          excludedNodes: excludedNodes.value,
          order: getOrderChanges()
        }
      });
      currentRouteMap.value = null;
      excludedNodes.value = [];
      await loadData();
    } catch (err) {
      console.error("Failed to approve route:", err);
    }
  };

  const modifyRoute = async () => {
    if (!selectedObjId.value || !window.api) return;
    try {
      await window.api.objectiveModifyRoute({
        objectiveId: selectedObjId.value,
        changes: {
          excludedNodes: excludedNodes.value,
          order: getOrderChanges()
        }
      });
      await loadRouteMap(selectedObjId.value);
      await loadData();
    } catch (err) {
      console.error("Failed to modify route:", err);
    }
  };

  const declineRoute = async () => {
    if (!selectedObjId.value || !window.api) return;
    try {
      await window.api.objectiveDeclineRoute({
        objectiveId: selectedObjId.value
      });
      currentRouteMap.value = null;
      excludedNodes.value = [];
      await loadData();
    } catch (err) {
      console.error("Failed to decline route:", err);
    }
  };

  const openRollbackDialog = () => {
    if (!selectedObjId.value || !selectedObj.value) return;
    rollbackResult.value = null;
    showRollbackDialog.value = true;
  };

  const closeRollbackDialog = () => {
    if (!isRollingBack.value) {
      showRollbackDialog.value = false;
      rollbackResult.value = null;
    }
  };

  const confirmRollback = async () => {
    if (!selectedObjId.value || !window.api || isRollingBack.value) return;
    
    isRollingBack.value = true;
    uiStore.setRollbackProgress({ current: 0, total: 100, text: 'Инициализация протокола отката...' });
    try {
      const res = await window.api.objectiveRollback({ objectiveId: selectedObjId.value });
      if (res && res.success) {
        rollbackResult.value = {
          success: true,
          message: `Успешный откат: отменено действий: ${res.rolledBackActions}, пропущено: ${res.skippedActions}.`
        };
      } else {
        rollbackResult.value = {
          success: false,
          message: `Откат завершен с замечаниями: ${res?.errors?.join(', ') || 'неизвестная ошибка'}`
        };
      }
      await loadData();
      if (currentRouteMap.value) {
        await loadRouteMap(selectedObjId.value);
      }
    } catch (err: any) {
      console.error("Failed to rollback objective:", err);
      rollbackResult.value = {
        success: false,
        message: `Критический сбой протокола отката: ${err?.message || String(err)}`
      };
    } finally {
      isRollingBack.value = false;
      uiStore.setRollbackProgress(null);
    }
  };

  const selectObjective = async (id: string) => {
    selectedObjId.value = id;
    loadRouteMap(id);
    if (window.api?.objectiveGetPendingDraft) {
      try {
        const res = await window.api.objectiveGetPendingDraft({ objectiveId: id });
        if (res?.draft) {
          pendingDraftsByObjectiveId.value[id] = res.draft;
        } else {
          delete pendingDraftsByObjectiveId.value[id];
        }
      } catch (err) {
        console.warn('[useObjectives] Failed to query pending draft:', err);
      }
    }
  };

  const decomposeObjective = async () => {
    if (!selectedObjId.value || !selectedObj.value || !window.api?.objectiveDecompose) return;
    const objId = selectedObjId.value;
    const objTitle = selectedObj.value.title;
    isDecomposing.value = true;
    try {
      const res = await window.api.objectiveDecompose({
        objectiveId: objId,
        taskDescriptionText: selectedObj.value.description || objTitle
      });
      if (res?.draft) {
        pendingDraftsByObjectiveId.value[objId] = res.draft;
        settingsStore.triggerSyncToast('Черновик декомпозиции готов. Откройте цель и подтвердите маршрут', () => {});
      } else {
        settingsStore.triggerSyncToast('Декомпозиция не вернула черновик', () => {});
      }
    } catch (err: any) {
      console.error('[useObjectives] Decompose failed:', err);
      settingsStore.triggerSyncToast(`Ошибка декомпозиции: ${err?.message || err}`, () => {});
    } finally {
      isDecomposing.value = false;
    }
  };

  const approveDraft = async (objectiveId?: string) => {
    const targetId = objectiveId || selectedObjId.value;
    if (!targetId || !window.api?.objectiveApproveDraft) return;
    const draft = pendingDraftsByObjectiveId.value[targetId];
    isApprovingDraft.value = true;
    try {
      const res = await window.api.objectiveApproveDraft({ objectiveId: targetId, draft });
      delete pendingDraftsByObjectiveId.value[targetId];
      const committed = res?.committed || {};
      settingsStore.triggerSyncToast(
        `Декомпозиция применена (${committed.outcomes ?? 0} outcomes, ${committed.tasks ?? 0} tasks)`,
        () => {}
      );
      await loadData();
      await loadRouteMap(targetId);
    } catch (err: any) {
      console.error('[useObjectives] Approve draft failed:', err);
      settingsStore.triggerSyncToast(`Ошибка утверждения: ${err?.message || err}`, () => {});
    } finally {
      isApprovingDraft.value = false;
    }
  };

  const updateOutcomeValue = async (outcomeId: string, value: any) => {
    if (!window.api) return;
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    try {
      await window.api.objectiveUpdateOutcomeValue({
        outcomeId,
        currentValue: numValue
      });
      await loadData();
    } catch (e) {
      console.error("Outcome update failed:", e);
    }
  };

  const toggleRiskActive = (risk: any) => {
    risk.is_active = !risk.is_active;
    if (selectedObjId.value && selectedObj.value) {
      const totalCount = selectedObj.value.outcomes?.length || 1;
      const progressTotal = selectedObj.value.outcomes?.reduce((acc: number, o: any) => acc + o.progress, 0) || 0;
      const progressRatio = progressTotal / totalCount;
      
      const activeThreat = selectedObj.value.risks
        ?.filter((r: any) => r.is_active)
        ?.reduce((acc: number, r: any) => acc + (r.likelihood * r.impact), 0) || 0;

      selectedObj.value.confidence = Math.max(0, parseFloat(((1.0 - activeThreat) * progressRatio).toFixed(3)));
    }
  };

  return {
    uiStore,
    settingsStore,
    safeSlice,
    activeSection,
    objectives,
    decisions,
    graph,
    predictionNodes,
    coherenceHistory,
    currentRouteMap,
    excludedNodes,
    selectedObjId,
    isRollingBack,
    showRollbackDialog,
    rollbackResult,
    containerRef: routeLayout.containerRef,
    draggingNodeId: routeLayout.draggingNodeId,
    hasDraftObjective,
    startDrag,
    onDragMove,
    stopDrag,
    getNodeCoords,
    entropyState,
    entropyColorClass,
    stabilityBadgeClass,
    toggleAutoApprove,
    showCreateForm,
    onObjectiveCreated,
    selectedObj,
    completedCount,
    avgProgress,
    systemHealthIndex,
    filterDecisionsForSelected,
    graphNodesScaled,
    graphLinksScaled,
    loadData,
    toggleNodeExclusion,
    approveRoute,
    modifyRoute,
    declineRoute,
    openRollbackDialog,
    closeRollbackDialog,
    confirmRollback,
    selectObjective,
    decomposeObjective,
    approveDraft,
    pendingDraftsByObjectiveId,
    isDecomposing,
    isApprovingDraft,
    updateOutcomeValue,
    toggleRiskActive
  };
}
