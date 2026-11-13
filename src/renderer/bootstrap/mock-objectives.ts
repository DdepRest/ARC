export function getMockObjectiveHandlers() {
  return {
    objectiveGetAll: async () => {
      try {
        const stored = localStorage.getItem('arc_mock_objectives');
        if (stored) return JSON.parse(stored);
      } catch {}

      const defaultObjectives = [
        {
          id: 'obj-core-01',
          title: 'Автономная стабилизация ядра A.R.C.',
          description: 'Калибровка фоновых циклов когерентности, оптимизация энергопотребления Three.js сцены и адаптивная регуляция системной энтропии.',
          owner: 'CHAIRMAN',
          priority: 950,
          status: 'ACTIVE',
          confidence: 0.92,
          created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          outcomes: [
            { id: 'out-1', objective_id: 'obj-core-01', title: 'Время кадра рендера Reactor', metric_name: 'Render Latency (ms)', baseline_value: 32, current_value: 16.4, target_value: 16.0, progress: 0.95, status: 'PROGRESSING' },
            { id: 'out-2', objective_id: 'obj-core-01', title: 'Системная когерентность решений', metric_name: 'Coherence Score (%)', baseline_value: 50, current_value: 88, target_value: 90, progress: 0.95, status: 'PROGRESSING' }
          ],
          risks: [
            { id: 'risk-1', objective_id: 'obj-core-01', description: 'Превышение лимита памяти GPU при длительном аптайме', likelihood: 0.25, impact: 0.40, is_active: true },
            { id: 'risk-2', objective_id: 'obj-core-01', description: 'Рассинхронизация WebSocket канала локального LLM', likelihood: 0.15, impact: 0.70, is_active: false }
          ]
        },
        {
          id: 'obj-core-02',
          title: 'Атомарный отказоустойчивый контур (Rollback Engine)',
          description: 'Обеспечение целостности файловых транзакций и возможности отката любых деструктивных изменений кодовой базы.',
          owner: 'CHAIRMAN',
          priority: 820,
          status: 'DRAFT',
          confidence: 0.75,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          outcomes: [
            { id: 'out-3', objective_id: 'obj-core-02', title: 'Успешность тестовых отказов транзакций', metric_name: 'Rollback Success Rate', baseline_value: 0, current_value: 100, target_value: 100, progress: 1.0, status: 'ACHIEVED' }
          ],
          risks: [
            { id: 'risk-3', objective_id: 'obj-core-02', description: 'Коллизия внешних неконтролируемых файлов Git', likelihood: 0.20, impact: 0.50, is_active: true }
          ]
        },
        {
          id: 'obj-core-03',
          title: 'Формирование единого семантического контекста памяти',
          description: 'Связывание кратковременной памяти диалогов с долговременным векторным графом знаний оператора.',
          owner: 'COO_AGENT',
          priority: 700,
          status: 'COMPLETED',
          confidence: 0.98,
          created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
          outcomes: [
            { id: 'out-4', objective_id: 'obj-core-03', title: 'Индекс точности извлечения фактов', metric_name: 'Recall Precision', baseline_value: 60, current_value: 94, target_value: 95, progress: 0.98, status: 'ACHIEVED' }
          ],
          risks: []
        }
      ];
      localStorage.setItem('arc_mock_objectives', JSON.stringify(defaultObjectives));
      return defaultObjectives;
    },

    objectiveCreate: async (data: any) => {
      try {
        const stored = localStorage.getItem('arc_mock_objectives');
        const list = stored ? JSON.parse(stored) : [];
        const newObj = {
          id: `obj-${Date.now().toString(36)}`,
          title: data.title || 'Новая стратегическая цель',
          description: data.description || '',
          owner: data.owner || 'CHAIRMAN',
          priority: data.priority || 100,
          status: 'DRAFT',
          confidence: 0.80,
          created_at: new Date().toISOString(),
          deadline: data.deadline || null,
          outcomes: [],
          risks: []
        };
        list.unshift(newObj);
        localStorage.setItem('arc_mock_objectives', JSON.stringify(list));
        return newObj;
      } catch {
        return null;
      }
    },

    objectiveDecompose: async ({ objectiveId, taskDescriptionText }: any) => {
      try {
        const stored = localStorage.getItem('arc_mock_objectives');
        const list = stored ? JSON.parse(stored) : [];
        const target = list.find((o: any) => o.id === objectiveId);
        if (target) {
          target.outcomes = target.outcomes || [];
          if (target.outcomes.length === 0) {
            target.outcomes.push({
              id: `out-${Date.now().toString(36)}`,
              objective_id: objectiveId,
              title: `Верификация декомпозиции: ${taskDescriptionText?.slice(0, 35) || 'Базовый этап'}`,
              metric_name: 'Completion Rate (%)',
              baseline_value: 0,
              current_value: 15,
              target_value: 100,
              progress: 0.15,
              status: 'PROGRESSING'
            });
          }
          localStorage.setItem('arc_mock_objectives', JSON.stringify(list));
        }
        return target;
      } catch {
        return null;
      }
    },

    objectiveGetGraph: async () => {
      try {
        const stored = localStorage.getItem('arc_mock_objectives');
        const list = stored ? JSON.parse(stored) : [];
        const nodes = list.map((o: any) => ({
          id: o.id,
          title: o.title,
          status: o.status,
          priority: o.priority
        }));
        const links: any[] = [];
        if (nodes.length > 1) {
          links.push({ source: nodes[0].id, target: nodes[1].id });
        }
        if (nodes.length > 2) {
          links.push({ source: nodes[1].id, target: nodes[2].id });
        }
        return { nodes, links };
      } catch {
        return { nodes: [], links: [] };
      }
    },

    objectiveGenerateRouteMap: async (_objectiveId: string) => {
      return {
        nodes: [
          { id: 'node-start', type: 'OUTCOME', title: 'Инициализация контекста', x: 15, y: 50 },
          { id: 'node-dec-1', type: 'DECISION', title: 'Выбор алгоритма синхронизации', requiresApproval: true, execution_weight: 0.85, x: 50, y: 30 },
          { id: 'node-action-1', type: 'ACTION', title: 'Применение структуры схемы', x: 50, y: 70 },
          { id: 'node-finish', type: 'OUTCOME', title: 'Стабилизация состояния', x: 85, y: 50 }
        ],
        edges: [
          { source: 'node-start', target: 'node-dec-1', label: 'Branch' },
          { source: 'node-start', target: 'node-action-1', label: 'Direct' },
          { source: 'node-dec-1', target: 'node-finish', label: 'Next Milestone' },
          { source: 'node-action-1', target: 'node-finish', label: 'Next Milestone' }
        ]
      };
    },

    objectiveApproveRoute: async ({ objectiveId }: any) => {
      try {
        const stored = localStorage.getItem('arc_mock_objectives');
        const list = stored ? JSON.parse(stored) : [];
        const target = list.find((o: any) => o.id === objectiveId);
        if (target) {
          target.status = 'ACTIVE';
          localStorage.setItem('arc_mock_objectives', JSON.stringify(list));
        }
        return { success: true };
      } catch {
        return { success: false };
      }
    },

    objectiveModifyRoute: async () => ({ success: true }),
    objectiveDeclineRoute: async ({ objectiveId }: any) => {
      try {
        const stored = localStorage.getItem('arc_mock_objectives');
        const list = stored ? JSON.parse(stored) : [];
        const target = list.find((o: any) => o.id === objectiveId);
        if (target) {
          target.status = 'BLOCKED';
          localStorage.setItem('arc_mock_objectives', JSON.stringify(list));
        }
        return { success: true };
      } catch {
        return { success: false };
      }
    },

    objectiveRollback: async ({ objectiveId }: any) => {
      try {
        const stored = localStorage.getItem('arc_mock_objectives');
        const list = stored ? JSON.parse(stored) : [];
        const target = list.find((o: any) => o.id === objectiveId);
        if (target) {
          target.status = 'ROLLED_BACK';
          localStorage.setItem('arc_mock_objectives', JSON.stringify(list));
        }
        return {
          success: true,
          rolledBackActions: 4,
          skippedActions: 0,
          errors: []
        };
      } catch (err: any) {
        return { success: false, rolledBackActions: 0, skippedActions: 0, errors: [err.message] };
      }
    },

    objectiveUpdateOutcomeValue: async ({ outcomeId, currentValue }: any) => {
      try {
        const stored = localStorage.getItem('arc_mock_objectives');
        const list = stored ? JSON.parse(stored) : [];
        for (const obj of list) {
          const out = obj.outcomes?.find((o: any) => o.id === outcomeId);
          if (out) {
            out.current_value = currentValue;
            const range = Math.abs(out.target_value - out.baseline_value) || 1;
            const progress = Math.min(1.0, Math.max(0, Math.abs(currentValue - out.baseline_value) / range));
            out.progress = progress;
            if (progress >= 1.0) out.status = 'ACHIEVED';
            break;
          }
        }
        localStorage.setItem('arc_mock_objectives', JSON.stringify(list));
        return true;
      } catch {
        return false;
      }
    },

    objectiveGetEntropyState: async () => ({
      entropy: 0.14,
      state: 'QUIESCENT',
      autoApprove: true,
      systemMode: 'EVOLUTIONARY_EXECUTION',
      rateThrottleFactor: 1.0,
      coherenceIndex: 0.88,
      coherenceData: {
        coherenceIndex: 0.88,
        epCount: 12,
        xpCount: 38,
        spCount: 3,
        stabilityDrift: 0.04,
        explorationFreedom: false,
        suppressionSensitivity: 'NORMAL'
      }
    }),

    objectiveSetAutoApprove: async () => true,

    decisionGetAll: async () => {
      return [
        { id: 'dec-01', objective_id: 'obj-core-01', title: 'Оптимизация цикла вызова WebGL контекста', status: 'APPROVED', rationale: 'Снижение накладных расходов Three.js на 35% при отсутствии анимаций.', created_at: Date.now() - 3600000 * 4, decision_type: 'EXECUTIVE', execution_weight: 0.9 },
        { id: 'dec-02', objective_id: 'obj-core-01', title: 'Включение адаптивного троттлинга частоты кадров', status: 'DONE', rationale: 'Ограничение FPS в свернутом окне сохраняет ресурс CPU.', created_at: Date.now() - 3600000 * 2, decision_type: 'EXECUTIVE', execution_weight: 0.8 },
        { id: 'dec-03', objective_id: 'obj-core-02', title: 'Выбор механизма резервного копирования перед патчем', status: 'PENDING', rationale: 'Создание теневых копий файлов через временный снапшот.', created_at: Date.now() - 1800000, decision_type: 'EXPLORATORY', execution_weight: 0.7 }
      ];
    },

    decisionGetPredictionNodes: async () => [
      { id: 'pred-1', node_type: 'REALITY_EXECUTED', title: 'Финальная калибровка параметров рендеринга', execution_weight: 0.88, entropy_at_prediction: 0.12, created_at: Date.now() - 50000 },
      { id: 'pred-2', node_type: 'SIMULATED_ONLY', title: 'Альтернативная декомпозиция графа задач', execution_weight: 0.42, entropy_at_prediction: 0.28, created_at: Date.now() - 25000 }
    ],

    decisionGetCoherenceHistory: async () => [
      { id: 'coh-1', coherence_index: 0.82, created_at: Date.now() - 60000 * 4 },
      { id: 'coh-2', coherence_index: 0.85, created_at: Date.now() - 60000 * 3 },
      { id: 'coh-3', coherence_index: 0.84, created_at: Date.now() - 60000 * 2 },
      { id: 'coh-4', coherence_index: 0.88, created_at: Date.now() - 60000 * 1 }
    ]
  };
}
