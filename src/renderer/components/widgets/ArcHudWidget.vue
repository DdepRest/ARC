<template>
  <div 
    data-arc-hud-widget="true"
    class="arc-hud-widget group relative flex flex-col w-full shrink-0 rounded-[22px] overflow-hidden select-none pointer-events-auto hover:!opacity-100 transition-all duration-200"
    :style="{
      background: widgetBackground,
      border: '1px solid rgba(255, 255, 255, 0.06)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 20px 48px rgba(0, 0, 0, 0.90)',
      opacity: currentOpacity,
      backdropFilter: widgetBackdropFilter,
      WebkitBackdropFilter: widgetBackdropFilter,
      transition: 'opacity 0.25s ease, transform 0.2s ease, border-color 0.2s ease, background 0.2s ease'
    }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Optional Compact Minimal Header (only if title explicitly given and showHeader is true) -->
    <div 
      v-if="showHeader && formattedTitle"
      class="flex items-center justify-between px-4 pt-3.5 pb-0.5 shrink-0"
    >
      <div class="flex items-center gap-2 min-w-0">
        <!-- 6px status dot -->
        <span 
          class="w-1.5 h-1.5 rounded-full shrink-0 transition-colors"
          :style="{ backgroundColor: statusColor }"
          :title="statusTitle || status"
        ></span>
        <!-- 10px mono caps label -->
        <span class="text-[10px] font-mono font-medium tracking-wider uppercase text-white/50 truncate">
          {{ formattedTitle }}
        </span>
      </div>

      <!-- Action / Menu slot or button on hover/focus-within -->
      <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <slot name="header-action">
          <button 
            v-if="hasMenu"
            @click="$emit('menu')" 
            class="min-w-[28px] min-h-[28px] flex items-center justify-center text-xs text-[var(--arc-text-muted)] hover:text-white transition-colors rounded hover:bg-[var(--arc-hover)] cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            title="Опции прибора"
            aria-label="Опции прибора"
          >
            ···
          </button>
        </slot>
      </div>
    </div>

    <!-- Main Content Area: Generous p-4.5 spacing for rounded squircle tile -->
    <div class="p-4 flex-1 flex flex-col justify-center">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { useEcoStore } from '../../stores/eco.store';

let settingsStore: ReturnType<typeof useSettingsStore> | null = null;
let ecoStore: ReturnType<typeof useEcoStore> | null = null;
try {
  settingsStore = useSettingsStore();
  ecoStore = useEcoStore();
} catch {
  // Pinia not active (isolated unit tests)
}

const isEcoActive = computed(() => Boolean(ecoStore?.isEcoActive));
const widgetBackdropFilter = computed(() => isEcoActive.value ? 'none' : 'blur(10px)');
const widgetBackground = computed(() => isEcoActive.value ? 'var(--arc-block)' : 'rgba(10, 10, 10, 0.76)');

const isHovered = ref(false);

const props = withDefaults(defineProps<{
  title?: string;
  status?: 'ok' | 'warn' | 'err' | 'off';
  statusTitle?: string;
  hasMenu?: boolean;
  showHeader?: boolean;
  dimmed?: boolean;
  dimOpacity?: number;
}>(), {
  title: '',
  status: 'off',
  statusTitle: '',
  hasMenu: false,
  showHeader: false,
  dimmed: true,
  dimOpacity: undefined
});

defineEmits<{
  (e: 'menu'): void;
  (e: 'menu-select', id: string): void;
}>();

// Ensure title is <= 12 characters and uppercase
const formattedTitle = computed(() => {
  if (!props.title) return '';
  const t = props.title.trim().toUpperCase();
  return t.length > 12 ? t.slice(0, 12) : t;
});

const statusColor = computed(() => {
  switch (props.status) {
    case 'ok':
      return 'var(--status-ok)';
    case 'warn':
      return 'var(--status-warn)';
    case 'err':
      return 'var(--status-err)';
    case 'off':
    default:
      return 'var(--status-off)';
  }
});

const currentOpacity = computed(() => {
  if (!settingsStore || !settingsStore.widgetsDim || props.dimmed === false) {
    return 1;
  }
  if (isHovered.value) {
    return 1;
  }
  const target = props.dimOpacity !== undefined 
    ? props.dimOpacity 
    : ((settingsStore.widgetDimOpacity ?? 50) / 100);
  return Math.max(0.1, Math.min(1, target));
});
</script>

<style scoped>
.arc-hud-widget {
  contain: paint;
}
</style>
