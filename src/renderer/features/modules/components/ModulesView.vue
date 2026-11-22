<template>
  <div class="h-full flex flex-col relative z-10 w-full select-none overflow-hidden bg-[var(--arc-plane)] text-[var(--arc-text-primary)]">
    <!-- Header -->
    <header
      class="flex flex-wrap items-center justify-between px-4 sm:px-8 py-4 border-b border-[var(--arc-hairline)] shrink-0 gap-4 bg-[var(--arc-plane)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-3.5 min-w-[200px]">
        <button
          type="button"
          @click="uiStore.setActiveTab('core')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer text-xs font-mono font-semibold uppercase tracking-wider shrink-0 group"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.55)' }"
          title="Вернуться к 3D-Ядру (Esc)"
          data-testid="modules-exit-to-core"
        >
          <ArrowLeft class="w-3.5 h-3.5 text-[var(--accent)] group-hover:-translate-x-0.5 transition-transform" />
          <span>К Ядру</span>
        </button>
        <div
          class="w-9 h-9 rounded-[12px] flex items-center justify-center p-2 shrink-0 bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--accent)] relative overflow-hidden"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 16px rgba(0, 0, 0, 0.65)' }"
        >
          <Cpu class="w-4 h-4 relative z-10" />
        </div>
        <div class="min-w-0">
          <h1 class="font-sans font-semibold text-[15px] text-[var(--arc-text-primary)] tracking-normal truncate">
            Архитектура модулей
          </h1>
          <p class="font-mono text-xs text-[var(--arc-text-muted)] tracking-normal mt-0.5 truncate tabular-nums">
            Единый реестр подсистем · проверка: {{ formattedSnapshotTime }}
          </p>
        </div>
      </div>

      <!-- Search, Refresh & Segment Filter Tabs -->
      <div class="flex flex-wrap items-center gap-4">
        <div class="relative w-48 sm:w-56">
          <Search class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--arc-text-muted)]" />
          <input
            v-model="searchFilter"
            type="text"
            placeholder="Поиск модуля..."
            data-testid="modules-search-input"
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[10px] pl-9 pr-3 py-1.5 text-xs text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] font-mono outline-none transition-colors"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.70)' }"
          />
        </div>

        <button
          type="button"
          @click="handleRefresh"
          :disabled="systemStore.modulesRefreshing"
          data-testid="modules-refresh-btn"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer text-xs font-mono font-semibold uppercase tracking-wider shrink-0"
          title="Перепроверить состояние подсистем"
        >
          <RefreshCw class="w-3.5 h-3.5 text-[var(--accent)]" :class="{ 'animate-spin': systemStore.modulesRefreshing }" />
          <span>{{ systemStore.modulesRefreshing ? 'Проверка…' : 'Обновить' }}</span>
        </button>

        <!-- Segment Filter Tabs -->
        <div class="flex items-center gap-5 border-b border-transparent shrink-0 px-1">
          <button
            type="button"
            @click="activeFilter = 'all'"
            data-testid="modules-filter-all"
            class="relative pb-1.5 text-xs font-mono font-semibold uppercase tracking-[0.10em] transition-colors cursor-pointer focus:outline-none"
            :class="activeFilter === 'all' ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
          >
            Все
            <span class="text-xs font-mono text-[var(--arc-text-muted)] ml-1 tabular-nums">({{ snapshot.summary.total }})</span>
            <div v-if="activeFilter === 'all'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full"></div>
          </button>

          <button
            type="button"
            @click="activeFilter = 'implemented'"
            data-testid="modules-filter-implemented"
            class="relative pb-1.5 text-xs font-mono font-semibold uppercase tracking-[0.10em] transition-colors cursor-pointer focus:outline-none flex items-center gap-1.5"
            :class="activeFilter === 'implemented' ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
            Реализованные
            <span class="text-xs font-mono text-[var(--arc-text-muted)] ml-1 tabular-nums">({{ snapshot.summary.implemented }})</span>
            <div v-if="activeFilter === 'implemented'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full"></div>
          </button>

          <button
            type="button"
            @click="activeFilter = 'attention'"
            data-testid="modules-filter-attention"
            class="relative pb-1.5 text-xs font-mono font-semibold uppercase tracking-[0.10em] transition-colors cursor-pointer focus:outline-none flex items-center gap-1.5"
            :class="activeFilter === 'attention' ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)]"></span>
            Внимание
            <span class="text-xs font-mono text-[var(--arc-text-muted)] ml-1 tabular-nums">({{ attentionCount }})</span>
            <div v-if="activeFilter === 'attention'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full"></div>
          </button>

          <button
            type="button"
            @click="activeFilter = 'planned'"
            data-testid="modules-filter-planned"
            class="relative pb-1.5 text-xs font-mono font-semibold uppercase tracking-[0.10em] transition-colors cursor-pointer focus:outline-none flex items-center gap-1.5"
            :class="activeFilter === 'planned' ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--arc-text-muted)]"></span>
            Запланировано в v1.1
            <span class="text-xs font-mono text-[var(--arc-text-muted)] ml-1 tabular-nums">({{ snapshot.summary.planned }})</span>
            <div v-if="activeFilter === 'planned'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full"></div>
          </button>
        </div>
      </div>
    </header>

    <!-- Content Area: Modules Grid -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-8 space-y-8">
      <!-- IPC Error Banner (non-blocking, calm hairline) -->
      <div
        v-if="systemStore.modulesError"
        data-testid="modules-ipc-error"
        class="px-4 py-3 rounded-[12px] border border-[var(--status-warn)] bg-[var(--arc-block)] text-xs font-mono text-[var(--status-warn)] flex items-center justify-between gap-3"
      >
        <span>Не удалось обновить статус подсистем: {{ systemStore.modulesError }}</span>
        <button
          type="button"
          @click="handleRefresh"
          class="px-2.5 py-1 rounded-[8px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] cursor-pointer shrink-0"
        >
          Повторить
        </button>
      </div>

      <!-- Section 1: Implemented Modules with Honest Runtime Health -->
      <section v-if="filtered.implemented.length > 0">
        <div class="flex items-center justify-between mb-3.5">
          <div class="flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
            <h2 class="text-xs font-mono uppercase tracking-wider text-[var(--arc-text-primary)] font-semibold tabular-nums">
              Реализованные подсистемы ({{ filtered.implemented.length }})
            </h2>
          </div>
          <span class="text-xs font-mono text-[var(--arc-text-muted)] hidden sm:inline tabular-nums">
            Готовы: {{ snapshot.summary.ready }} · Деградация: {{ snapshot.summary.degraded }} · Недоступны: {{ snapshot.summary.unavailable + snapshot.summary.error }}
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div
            v-for="cap in filtered.implemented"
            :key="cap.id"
            :data-testid="`module-card-${cap.id}`"
            :data-health="cap.health"
            :data-lifecycle="cap.lifecycleState"
            class="flex flex-col justify-between border border-[var(--arc-hairline)] rounded-[16px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] transition-colors p-4 group relative overflow-hidden select-none"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 32px rgba(0, 0, 0, 0.72)' }"
          >
            <div class="flex flex-col gap-2.5 relative z-10">
              <div class="flex items-center justify-between gap-2">
                <div
                  class="w-8 h-8 rounded-[10px] flex items-center justify-center bg-[var(--arc-plane)] border border-[var(--arc-hairline)] shrink-0"
                  :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
                >
                  <component :is="getCapabilityIcon(cap.id)" class="w-4 h-4" :class="badgeFor(cap).iconClass" />
                </div>
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="badgeFor(cap).dotClass"></span>
                  <span class="text-xs font-mono uppercase tracking-wider truncate" :class="badgeFor(cap).textClass">
                    {{ badgeFor(cap).label }}
                  </span>
                </div>
              </div>

              <div>
                <h3 class="text-sm font-sans font-medium text-[var(--arc-text-primary)] truncate">
                  {{ cap.name }}
                </h3>
                <p class="text-xs font-sans text-[var(--arc-text-hint)] mt-1 leading-relaxed line-clamp-2">
                  {{ cap.description }}
                </p>
                <p
                  v-if="cap.reason"
                  class="text-xs font-mono text-[var(--arc-text-muted)] mt-2 line-clamp-2"
                  :data-testid="`module-reason-${cap.id}`"
                >
                  {{ cap.reason }}
                </p>
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-[var(--arc-hairline)] flex items-center justify-between gap-2 relative z-10">
              <div class="min-w-0">
                <span class="text-xs font-mono text-[var(--arc-text-muted)] truncate block">
                  {{ cap.subsystem }}
                </span>
                <span class="text-xs font-mono text-[var(--arc-text-muted)] truncate block tabular-nums">
                  {{ cap.dependencies.join(' · ') }} · {{ formatCheckedAt(cap.lastCheckedAt) }}
                </span>
              </div>
              <button
                v-if="cap.entrypoint"
                type="button"
                @click="openModuleEntrypoint(cap.entrypoint.tab)"
                class="flex items-center gap-1.5 text-xs font-sans font-medium text-[var(--arc-text-primary)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] px-3 py-1 rounded-[8px] transition cursor-pointer shrink-0"
                :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
              >
                <span>{{ cap.entrypoint.label || 'Открыть модуль' }}</span>
                <ArrowRight class="w-3 h-3 text-[var(--accent)]" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Planned v1.1 Modules (Strictly Non-Active Roadmap Items) -->
      <section v-if="filtered.planned.length > 0">
        <div class="flex items-center justify-between mb-3.5">
          <div class="flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)]"></span>
            <h2 class="text-xs font-mono uppercase tracking-wider text-[var(--status-warn)] font-semibold tabular-nums">
              Запланировано в v1.1 ({{ filtered.planned.length }})
            </h2>
          </div>
          <span class="text-xs font-mono text-[var(--arc-text-muted)] hidden sm:inline">
            Пользовательская реализация отсутствует в v1.0
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div
            v-for="cap in filtered.planned"
            :key="cap.id"
            :data-testid="`module-card-${cap.id}`"
            :data-health="cap.health"
            :data-lifecycle="cap.lifecycleState"
            class="flex flex-col justify-between border border-[var(--arc-hairline)] rounded-[16px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] transition-colors p-4 group relative overflow-hidden select-none"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 12px 32px rgba(0, 0, 0, 0.72)' }"
          >
            <div class="flex flex-col gap-2.5 relative z-10">
              <div class="flex items-center justify-between gap-2">
                <div
                  class="w-8 h-8 rounded-[10px] flex items-center justify-center bg-[var(--arc-plane)] border border-[var(--arc-hairline)] shrink-0"
                  :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
                >
                  <component :is="getCapabilityIcon(cap.id)" class="w-4 h-4 text-[var(--arc-text-muted)]" />
                </div>
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)] shrink-0"></span>
                  <span class="text-xs font-mono uppercase text-[var(--status-warn)] tracking-wider truncate">
                    {{ badgeFor(cap).label }}
                  </span>
                </div>
              </div>

              <div>
                <h3 class="text-sm font-sans font-medium text-[var(--arc-text-primary)] truncate">
                  {{ cap.name }}
                </h3>
                <p class="text-xs font-sans text-[var(--arc-text-hint)] mt-1 leading-relaxed line-clamp-2">
                  {{ cap.description }}
                </p>
                <p
                  v-if="cap.reason"
                  class="text-xs font-mono text-[var(--arc-text-muted)] mt-2 line-clamp-2"
                  :data-testid="`module-reason-${cap.id}`"
                >
                  {{ cap.reason }}
                </p>
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-[var(--arc-hairline)] flex items-center justify-between gap-2 relative z-10">
              <span class="text-xs font-mono text-[var(--arc-text-muted)] truncate max-w-[160px]">
                {{ cap.subsystem }}
              </span>
              <span
                class="flex items-center gap-1.5 text-xs font-mono text-[var(--arc-text-muted)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] px-3 py-1 rounded-[8px] cursor-not-allowed select-none shrink-0"
                aria-disabled="true"
              >
                Запланировано в v1.1
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Empty state if search or filter returns nothing -->
      <div v-if="filtered.implemented.length === 0 && filtered.planned.length === 0" class="py-16 text-center">
        <Cpu class="w-10 h-10 text-[var(--arc-text-muted)] mx-auto mb-3 opacity-40" />
        <p class="text-xs font-mono text-[var(--arc-text-muted)]">
          {{ searchFilter.trim() ? `Модули по запросу "${searchFilter}" не найдены` : 'Нет модулей в выбранной категории' }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Cpu, ArrowRight, ArrowLeft, Search, RefreshCw } from 'lucide-vue-next';
import { useUIStore } from '../../../stores/ui.store';
import { useSystemStore } from '../../../stores/system.store';
import type { TabName } from '../../../../shared/types/ui';
import type { ModuleCapability } from '../../../../shared/config/modules-capability.registry';
import {
  getCapabilityIcon,
  getCapabilityBadge,
  isAttentionRequired,
  formatCheckedAt,
  filterCapabilities,
  type ModulesViewFilter
} from '../logic/module-presentation';

const uiStore = useUIStore();
const systemStore = useSystemStore();

const activeFilter = ref<ModulesViewFilter>('all');
const searchFilter = ref('');

const snapshot = computed(() => systemStore.capabilitiesSnapshot);

const attentionCount = computed(() =>
  snapshot.value.capabilities.filter((cap) => isAttentionRequired(cap)).length
);

const filtered = computed(() =>
  filterCapabilities(snapshot.value, activeFilter.value, searchFilter.value)
);

const formattedSnapshotTime = computed(() => formatCheckedAt(snapshot.value.checkedAt));

const badgeFor = (cap: ModuleCapability) => getCapabilityBadge(cap.lifecycleState, cap.health);

const handleRefresh = () => {
  void systemStore.refreshModulesStatus({ refresh: true });
};

const openModuleEntrypoint = (tab: TabName) => {
  uiStore.setActiveTab(tab);
};

onMounted(() => {
  if (!systemStore.capabilitiesSnapshot.checkedAt) {
    void systemStore.refreshModulesStatus();
  }
});
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
