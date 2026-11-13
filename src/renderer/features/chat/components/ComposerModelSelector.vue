<template>
  <div ref="rootRef" class="relative inline-flex items-center min-w-0">
    <!-- Model Trigger Button (when Auto is OFF) -->
    <button
      v-if="!autoMode"
      type="button"
      @click.stop="handleOpenModelMenu"
      :class="['aic-model-trigger-btn min-w-0', modelMenuOpen ? 'menu-open' : '']"
      :title="`${activeModel.name} · Мышление: ${activeModel.effort} (${activeModel.sourceLabel})`"
      aria-haspopup="true"
      :aria-expanded="modelMenuOpen"
    >
      <ComposerProviderIcon :provider="activeModel.provider" />
      <span class="flex items-baseline gap-1.5 min-w-0">
        <span class="font-medium text-[var(--arc-text-primary)] truncate max-w-[160px] sm:max-w-[200px]">{{ activeModel.name }}</span>
        <span class="font-normal text-[var(--arc-text-secondary)] shrink-0">{{ activeModel.effort }}</span>
      </span>
      <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: getPingDotColor(activeModel.pingStatus) }" :title="activeModel.sourceLabel" />
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" :class="['mt-0.5 shrink-0 text-[var(--arc-text-secondary)] transition-transform duration-200', modelMenuOpen ? 'rotate-180' : '']">
        <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <!-- Auto Trigger Pill (when Auto is ON) -->
    <div
      v-else
      role="button"
      tabindex="0"
      @click.stop="handleOpenModelMenu"
      @keydown.enter.prevent="handleOpenModelMenu"
      class="aic-auto-trigger-btn"
      aria-label="Автоматическая маршрутизация моделей"
    >
      <span class="font-medium select-none text-[var(--arc-text-primary)]">Auto</span>
      <span class="aic-auto-chevron mt-0.5 text-[var(--arc-text-secondary)]">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <span class="aic-auto-inline-switch">
        <button type="button" @click.stop="$emit('update:autoMode', false)" class="aic-ios-switch on" title="Отключить Auto-маршрутизацию моделей">
          <span class="aic-ios-switch-thumb" />
        </button>
      </span>
    </div>

    <!-- Model Selector Popover Menu -->
    <div
      @click.stop
      :class="['aic-glass-popover absolute left-0 bottom-[calc(100%+8px)] w-[288px] rounded-[20px] p-2 z-50', modelMenuOpen ? 'aic-popover-visible' : 'aic-popover-hidden']"
    >
      <!-- Collapsible Search Models Input + Live Ping Action at Top -->
      <div @mouseenter="clearHoveredModel" :class="['aic-search-row-wrap', searchRevealed || searchQuery.length > 0 ? 'revealed' : '']">
        <div class="flex items-center gap-1.5">
          <div class="flex items-center gap-2 px-2.5 h-8 rounded-lg bg-[var(--arc-input)] border border-[var(--arc-hairline)] flex-1 min-w-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="shrink-0 text-[var(--arc-text-secondary)]">
              <circle cx="7.2" cy="7.2" r="4.8" stroke="currentColor" stroke-width="1.5" />
              <path d="M10.8 10.8L13.8 13.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Поиск подключенных..."
              autocomplete="off"
              class="w-full bg-transparent border-none outline-none text-xs font-sans text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-hint)]"
            />
          </div>
          <button
            type="button"
            @click.stop="$emit('refresh-models')"
            :disabled="isPinging"
            class="h-8 px-2.5 rounded-lg bg-[var(--arc-input)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
            title="Проверить и пропинговать реально подключенные модели A.R.C."
          >
            <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: isPinging ? 'var(--status-warn)' : 'var(--status-ok)' }" />
            <span>{{ isPinging ? 'Пинг…' : 'Пинг' }}</span>
          </button>
        </div>
      </div>

      <!-- Auto Toggle Row -->
      <div @mouseenter="clearHoveredModel" class="flex items-center justify-between px-2.5 h-9">
        <span class="text-sm font-medium text-[var(--arc-text-primary)] leading-tight">Auto (Роутер ИИ)</span>
        <button type="button" role="switch" :aria-checked="autoMode" @click.stop="handleToggleAutoInMenu" :class="['aic-ios-switch', autoMode ? 'on' : '']">
          <span class="aic-ios-switch-thumb" />
        </button>
      </div>

      <!-- Cohesive fav / online Segmented Filter Bar Below Auto -->
      <div role="tablist" aria-label="Фильтр подключенных моделей" @mouseenter="clearHoveredModel" class="aic-model-filter-bar">
        <button
          type="button"
          role="tab"
          :aria-selected="modelFilterTab === 'fav'"
          @click.stop="modelFilterTab = 'fav'; hoveredModelId = null"
          :class="['aic-model-filter-pill', modelFilterTab === 'fav' ? 'active' : '']"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            :fill="modelFilterTab === 'fav' ? 'var(--accent)' : 'none'"
            :stroke="modelFilterTab === 'fav' ? 'var(--accent)' : 'currentColor'"
            stroke-width="1.4"
            stroke-linejoin="round"
            class="shrink-0"
          >
            <path d="M8 1.6L9.95 5.55L14.3 6.18L11.15 9.25L11.89 13.58L8 11.53L4.11 13.58L4.85 9.25L1.7 6.18L6.05 5.55L8 1.6Z" />
          </svg>
          <span>fav</span>
          <span v-if="favCount > 0" class="text-xs font-mono tabular-nums text-[var(--arc-text-secondary)] opacity-80">{{ favCount }}</span>
        </button>

        <button
          type="button"
          role="tab"
          :aria-selected="modelFilterTab === 'all'"
          @click.stop="modelFilterTab = 'all'; hoveredModelId = null"
          :class="['aic-model-filter-pill', modelFilterTab === 'all' ? 'active' : '']"
        >
          <span>{{ modelsOnlineLabel }}</span>
        </button>
      </div>

      <!-- Models List -->
      <div class="flex flex-col gap-0.5 max-h-[250px] overflow-y-auto custom-model-scrollbar">
        <div v-if="visibleModels.length === 0" class="px-3 py-3 text-center text-xs text-[var(--arc-text-secondary)]">
          <template v-if="modelFilterTab === 'fav' && models.length > 0">
            Нет избранных среди подключенных. Переключитесь на
            <button type="button" @click.stop="modelFilterTab = 'all'" class="underline font-medium text-[var(--arc-text-primary)] cursor-pointer">все модели</button>
            и нажмите ★.
          </template>
          <template v-else>
            Нет активных проверенных моделей по запросу. Нажмите «Пинг» или проверьте шлюзы в Настройках ИИ.
          </template>
        </div>

        <div
          v-for="m in visibleModels"
          :key="m.id"
          role="menuitem"
          tabindex="0"
          @click.stop="handleSelectModel(m.id)"
          @keydown.enter.prevent="handleSelectModel(m.id)"
          @mouseenter="onRowMouseEnter(m.id)"
          @mouseleave="onRowMouseLeave"
          :title="`${m.sourceLabel} · ${m.capabilityLabel}`"
          :class="[
            'aic-model-row',
            m.id === hoveredModelId && searchQuery.trim().length === 0 ? 'active-hover' : '',
            !autoMode && m.id === activeModel.id ? 'selected-row' : ''
          ]"
        >
          <div class="flex items-center gap-2 min-w-0 pr-1 flex-1">
            <ComposerProviderIcon :provider="m.provider" />
            <span class="text-sm truncate flex items-baseline gap-1 min-w-0">
              <span class="font-medium text-[var(--arc-text-primary)] truncate">{{ m.name }}</span>
              <span class="font-normal text-xs text-[var(--arc-text-secondary)] shrink-0">{{ m.effort }}</span>
            </span>
            <button
              type="button"
              @click.stop="$emit('toggle-fav', m.id)"
              :class="['aic-fav-star-btn', m.isFav ? 'starred' : '']"
              :title="m.isFav ? 'Убрать из избранного' : 'В избранное'"
            >
              <svg
                width="13.5"
                height="13.5"
                viewBox="0 0 16 16"
                :fill="m.isFav ? 'var(--accent)' : 'none'"
                :stroke="m.isFav ? 'var(--accent)' : 'currentColor'"
                stroke-width="1.3"
                stroke-linejoin="round"
              >
                <path d="M8 1.6L9.95 5.55L14.3 6.18L11.15 9.25L11.89 13.58L8 11.53L4.11 13.58L4.85 9.25L1.7 6.18L6.05 5.55L8 1.6Z" />
              </svg>
            </button>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <span v-if="m.latencyMs" class="text-xs font-mono tabular-nums text-[var(--arc-text-machine)]">{{ m.latencyMs }}ms</span>
            <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: getPingDotColor(m.pingStatus) }" />
            <svg v-if="!autoMode && m.id === activeModel.id" width="15" height="15" viewBox="0 0 16 16" fill="none" class="shrink-0 text-[var(--accent)]">
              <path d="M3.2 8.5L6.5 11.8L13 4.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" class="text-[var(--arc-text-hint)] opacity-70">
              <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Effort (Thinking) Submenu -->
    <div
      @click.stop
      @mouseenter="onEffortMenuEnter"
      @mouseleave="onEffortMenuLeave"
      :style="{ bottom: `${effortBottomOffsetPx + 44}px` }"
      :class="['aic-glass-popover aic-effort-submenu-bridge absolute left-[296px] w-[184px] rounded-[18px] p-2 z-50', isEffortMenuVisible ? 'aic-popover-visible' : 'aic-popover-hidden']"
    >
      <div class="px-2.5 pt-1 pb-0.5 text-xs font-mono uppercase tracking-wider text-[var(--arc-text-secondary)]">Мышление</div>
      <div class="px-2.5 pb-1.5 text-xs text-[var(--arc-text-hint)] border-b border-[var(--arc-divider)] mb-1">
        {{ hoveredModel?.capabilityLabel || 'Авто-контур A.R.C.' }}
      </div>
      <div class="flex flex-col gap-0.5">
        <button
          v-for="level in hoveredModel?.efforts || ['Auto']"
          :key="level"
          type="button"
          @click.stop="handleSelectEffort(level)"
          class="aic-mode-menu-item w-full h-[34px] px-2.5 text-sm"
        >
          <div class="flex items-baseline gap-1.5 min-w-0">
            <span class="font-medium text-[var(--arc-text-primary)]">{{ level }}</span>
            <span v-if="level === 'Auto'" class="text-xs text-[var(--arc-text-secondary)] truncate">Сам решает</span>
          </div>
          <svg v-if="hoveredModel?.effort === level" width="15" height="15" viewBox="0 0 16 16" fill="none" class="shrink-0 text-[var(--accent)]">
            <path d="M3.2 8.5L6.5 11.8L13 4.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      <div v-if="hoveredModel && !hoveredModel.isThinkingCapKnown" class="px-2.5 pt-1.5 mt-1 border-t border-[var(--arc-divider)] text-xs text-[var(--arc-text-hint)] leading-snug">
        Потолок модели неизвестен — A.R.C. сам управляет глубиной размышления.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ComposerProviderIcon from './ComposerProviderIcon.vue';
import type { ComposerModelOption, EffortLevel, ModelFilterTab, ModelPingStatus } from '../composables/useComposerModels';

const props = defineProps<{
  models: ComposerModelOption[];
  activeModel: ComposerModelOption;
  autoMode: boolean;
  modelMenuOpen: boolean;
  isPinging?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:autoMode', val: boolean): void;
  (e: 'update:modelMenuOpen', val: boolean): void;
  (e: 'select-model', id: string): void;
  (e: 'select-effort', payload: { modelId: string; effort: EffortLevel }): void;
  (e: 'toggle-fav', id: string): void;
  (e: 'open-menu'): void;
  (e: 'refresh-models'): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const searchRevealed = ref(false);
const searchQuery = ref('');
const modelFilterTab = ref<ModelFilterTab>('all');
const hoveredModelId = ref<string | null>(null);
const isHoveringModelRow = ref(false);
const isHoveringEffortMenu = ref(false);
let hideEffortTimer: ReturnType<typeof setTimeout> | null = null;

function getPingDotColor(status?: ModelPingStatus): string {
  if (status === 'online' || status === 'verified') return 'var(--status-ok)';
  if (status === 'checking') return 'var(--status-warn)';
  return 'var(--arc-text-muted)';
}

const favCount = computed(() => props.models.filter((m) => m.isFav).length);

const modelsOnlineLabel = computed(() => {
  const count = props.models.length;
  if (count === 1) return '1 модель';
  if (count >= 2 && count <= 4) return `${count} модели`;
  return `${count} моделей`;
});

const visibleModels = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return props.models.filter((m) => {
    const matchesTab = modelFilterTab.value === 'fav' ? m.isFav : true;
    const matchesSearch = m.name.toLowerCase().includes(q) || m.effort.toLowerCase().includes(q) || m.sourceLabel.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });
});

const hoveredModel = computed(() => (hoveredModelId.value ? props.models.find((m) => m.id === hoveredModelId.value) || null : null));

const effortBottomOffsetPx = computed(() => {
  if (!hoveredModelId.value) return 0;
  const idx = visibleModels.value.findIndex((m) => m.id === hoveredModelId.value);
  if (idx < 0) return 0;
  const rowsFromBottom = visibleModels.value.length - 1 - idx;
  return rowsFromBottom <= 1 ? 0 : Math.min(96, (rowsFromBottom - 1) * 24);
});

const isEffortMenuVisible = computed(() => props.modelMenuOpen && searchQuery.value.trim().length === 0 && hoveredModel.value !== null);

watch(() => props.modelMenuOpen, (open) => {
  if (!open) {
    hoveredModelId.value = null;
    clearHideEffortTimeout();
  }
});

function clearHideEffortTimeout() {
  if (hideEffortTimer !== null) {
    clearTimeout(hideEffortTimer);
    hideEffortTimer = null;
  }
}

function scheduleHideEffortSubmenu() {
  clearHideEffortTimeout();
  hideEffortTimer = setTimeout(() => {
    if (!isHoveringEffortMenu.value && !isHoveringModelRow.value) hoveredModelId.value = null;
  }, 180);
}

function clearHoveredModel() {
  isHoveringModelRow.value = false;
  hoveredModelId.value = null;
}

function handleOpenModelMenu() {
  emit('open-menu');
  const nextOpen = !props.modelMenuOpen;
  emit('update:modelMenuOpen', nextOpen);
  if (nextOpen) {
    emit('refresh-models');
    hoveredModelId.value = null;
    searchRevealed.value = false;
    searchQuery.value = '';
    setTimeout(() => { searchRevealed.value = true; }, 100);
  }
}

function handleToggleAutoInMenu() {
  const nextAuto = !props.autoMode;
  emit('update:autoMode', nextAuto);
  if (nextAuto) {
    setTimeout(() => {
      emit('update:modelMenuOpen', false);
      hoveredModelId.value = null;
    }, 150);
  }
}

function handleSelectModel(id: string) {
  emit('select-model', id);
  emit('update:modelMenuOpen', false);
  hoveredModelId.value = null;
}

function handleSelectEffort(effort: EffortLevel) {
  if (!hoveredModelId.value) return;
  emit('select-effort', { modelId: hoveredModelId.value, effort });
  emit('update:modelMenuOpen', false);
  hoveredModelId.value = null;
}

function onRowMouseEnter(id: string) {
  clearHideEffortTimeout();
  isHoveringModelRow.value = true;
  hoveredModelId.value = id;
}

function onRowMouseLeave() {
  isHoveringModelRow.value = false;
  scheduleHideEffortSubmenu();
}

function onEffortMenuEnter() {
  clearHideEffortTimeout();
  isHoveringEffortMenu.value = true;
}

function onEffortMenuLeave() {
  isHoveringEffortMenu.value = false;
  scheduleHideEffortSubmenu();
}

defineExpose({ rootRef });
</script>
