<template>
  <!-- 1. AMBIENT MODE (~32px): Sleek Flat Minimal Monolith Strip -->
  <div 
    v-if="currentMode === 'ambient'"
    class="hud-widget-shell hud-ambient relative flex items-center justify-between select-none pointer-events-auto cursor-pointer transition-all duration-150 group/shell"
    :class="[extraClass, ambientSizeClass]"
    :style="computedStyle"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @pointerdown="handleShellPointerDown"
    @click="setMode('compact')"
  >
    <!-- Left: Dot Indicator & Title -->
    <div class="flex items-center gap-2 shrink-0 min-w-0 mr-2">
      <GripVertical class="w-2.5 h-2.5 text-white/30 group-hover/shell:text-white/70 transition-colors shrink-0 cursor-grab" />
      <span class="dot" :class="statusDotClass"></span>
      <span class="text-[11px] font-semibold text-[#ededed] truncate">
        {{ title }}
      </span>
      <span v-if="displayTag" class="txt-tag">
        {{ displayTag }}
      </span>
    </div>

    <!-- Center/Right: Ambient Slot -->
    <div class="flex-1 min-w-0 flex items-center justify-end px-1 overflow-hidden">
      <slot name="ambient">
        <slot name="compact" />
      </slot>
    </div>

    <!-- Right Controls: Expand / Close -->
    <div class="flex items-center gap-1 shrink-0 no-drag ml-1 pl-1" @pointerdown.stop>
      <slot name="header-actions" />
      <button 
        @click.stop="setMode('compact')"
        class="w-4 h-4 flex items-center justify-center text-white/40 hover:text-white transition cursor-pointer"
        title="Развернуть виджет"
      >
        <ChevronUp class="w-3 h-3 stroke-[2]" />
      </button>
      <button 
        v-if="showClose"
        @click.stop="$emit('close')"
        class="w-4 h-4 flex items-center justify-center text-white/40 hover:text-red-400 transition cursor-pointer"
        title="Скрыть виджет"
      >
        <X class="w-3 h-3 stroke-[2]" />
      </button>
    </div>
  </div>

  <!-- 2. COMPACT MODE: Minimal Monolith Swiss Typography -->
  <div 
    v-else-if="currentMode === 'compact'"
    class="hud-widget-shell hud-compact w select-none pointer-events-auto transition-all duration-150 group/shell cursor-pointer"
    :class="[extraClass, compactSizeClass]"
    :style="computedStyle"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @pointerdown="handleShellPointerDown"
  >
    <!-- Minimal Monolith Header: [Title] [TAG] -->
    <header class="row-meta">
      <div class="txt-label">
        <span v-if="hasDot" class="dot" :class="statusDotClass"></span>
        <template v-if="parsedTitle.prefix">
          <span class="txt-idx">{{ parsedTitle.prefix }}</span>
          <span class="truncate">{{ parsedTitle.label }}</span>
        </template>
        <span v-else class="truncate">{{ title }}</span>
      </div>

      <div class="flex items-center gap-1.5 ml-auto no-drag" @pointerdown.stop>
        <span v-if="displayTag" class="txt-tag">
          {{ displayTag }}
        </span>
        <button 
          v-if="showClose"
          @click.stop="$emit('close')"
          class="w-3.5 h-3.5 flex items-center justify-center text-white/30 hover:text-red-400 transition cursor-pointer opacity-0 group-hover/shell:opacity-100"
          title="Скрыть модуль"
        >
          <X class="w-2.5 h-2.5 stroke-[2]" />
        </button>
      </div>
    </header>

    <!-- Glanceable Body -->
    <div class="flex-1 min-h-0 flex flex-col justify-center">
      <slot name="compact">
        <slot />
      </slot>
    </div>
  </div>

  <!-- 3. EXPANDED MODE: Minimal Monolith Diagnostic Panel -->
  <div 
    v-else
    class="hud-widget-shell hud-expanded w select-none pointer-events-auto transition-all duration-150 group/shell"
    :class="[extraClass, expandedSizeClass]"
    :style="computedStyle"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @pointerdown="handleShellPointerDown"
  >
    <!-- Header Zone: [Title] [TAG] -->
    <header 
      class="row-meta cursor-pointer pb-1.5 border-b border-white/[0.08]"
      @click="setMode('compact')"
    >
      <div class="txt-label">
        <span v-if="hasDot" class="dot" :class="statusDotClass"></span>
        <span class="truncate">{{ title }}</span>
      </div>

      <div class="flex items-center gap-1.5 ml-auto shrink-0 no-drag" @pointerdown.stop>
        <span v-if="displayTag" class="txt-tag">
          {{ displayTag }}
        </span>
        <slot name="header-actions" />
        <button 
          v-if="showCollapse"
          @click.stop="setMode('compact')"
          class="w-3.5 h-3.5 flex items-center justify-center text-white/40 hover:text-white transition cursor-pointer"
          title="Свернуть в компактный вид"
        >
          <ChevronUp class="w-3 h-3 stroke-[2]" />
        </button>
        <button 
          v-if="showClose"
          @click.stop="$emit('close')"
          class="w-3.5 h-3.5 flex items-center justify-center text-white/40 hover:text-red-400 transition cursor-pointer"
          title="Скрыть виджет"
        >
          <X class="w-2.5 h-2.5 stroke-[2]" />
        </button>
      </div>
    </header>
    
    <!-- Expanded Body Content -->
    <div class="pt-2 flex flex-col gap-2 transition-all duration-200">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Component } from 'vue';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { GripVertical, Minimize2, X, ChevronUp, ChevronDown } from 'lucide-vue-next';

export type ShellWidgetMode = 'ambient' | 'compact' | 'expanded';

const props = withDefaults(
  defineProps<{
    title: string;
    tag?: string;
    category?: 'workspace' | 'system';
    side?: 'left' | 'right';
    icon?: Component;
    showClose?: boolean;
    showCollapse?: boolean;
    extraClass?: string;
    dimmed?: boolean;
    dimOpacity?: number;
    forceVisible?: boolean;
    size?: 'S' | 'M' | 'L';
    mode?: ShellWidgetMode;
    compact?: boolean;
    status?: 'active' | 'ready' | 'waiting' | 'off';
    hasDot?: boolean;
  }>(),
  {
    tag: undefined,
    showClose: false,
    showCollapse: true,
    extraClass: '',
    dimmed: true,
    forceVisible: false,
    size: 'M',
    mode: undefined,
    compact: true,
    status: 'ready',
    hasDot: false
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'dragStart', event: MouseEvent | PointerEvent): void;
  (e: 'update:mode', value: ShellWidgetMode): void;
  (e: 'update:compact', value: boolean): void;
}>();

const settingsStore = useSettingsStore();
const isHovered = ref(false);

const internalMode = ref<ShellWidgetMode>(
  props.mode || (props.compact === false ? 'expanded' : 'compact')
);

const statusDotClass = computed(() => {
  switch (props.status) {
    case 'active': return 'dot-ok';
    case 'ready': return 'dot-ok';
    case 'waiting': return 'dot-warn';
    case 'off': return 'dot-off';
    default: return 'dot-ok';
  }
});

const displayTag = computed(() => {
  if (props.tag) return props.tag;
  if (props.category === 'workspace') return 'FLOW';
  if (props.category === 'system') return 'SYS';
  return '';
});

const parsedTitle = computed(() => {
  const match = props.title.match(/^(\d{2}\.)\s*(.*)$/);
  if (match) {
    return { prefix: match[1], label: match[2] };
  }
  return { prefix: '', label: props.title };
});

watch(() => props.mode, (newVal) => {
  if (newVal) {
    internalMode.value = newVal;
  }
});

watch(() => props.compact, (newVal) => {
  if (props.mode === undefined && newVal !== undefined) {
    internalMode.value = newVal ? 'compact' : 'expanded';
  }
});

const currentMode = computed<ShellWidgetMode>(() => {
  if (settingsStore.widgetLayoutMode === 'dock') {
    return 'compact';
  }
  return props.mode || internalMode.value;
});

const setMode = (newMode: ShellWidgetMode) => {
  internalMode.value = newMode;
  emit('update:mode', newMode);
  emit('update:compact', newMode !== 'expanded');
};

const handleShellPointerDown = (e: MouseEvent | PointerEvent) => {
  const target = e.target as HTMLElement;
  if (
    target.closest('button') ||
    target.closest('input') ||
    target.closest('select') ||
    target.closest('textarea') ||
    target.closest('a') ||
    target.closest('.no-drag')
  ) {
    return;
  }
  emit('dragStart', e);
};

// Size Classes
const ambientSizeClass = computed(() => {
  if (settingsStore.widgetLayoutMode === 'dock') {
    return 'w-full min-w-0';
  }
  switch (props.size) {
    case 'S': return 'w-[220px]';
    case 'L': return 'w-[280px]';
    case 'M':
    default: return 'w-[250px]';
  }
});

const compactSizeClass = computed(() => {
  if (settingsStore.widgetLayoutMode === 'dock') {
    return 'w-full min-w-0';
  }
  switch (props.size) {
    case 'S': return 'w-[250px]';
    case 'L': return 'w-[320px]';
    case 'M':
    default: return 'w-[290px]';
  }
});

const expandedSizeClass = computed(() => {
  if (settingsStore.widgetLayoutMode === 'dock') {
    return 'w-full min-w-0';
  }
  switch (props.size) {
    case 'S': return 'w-[260px]';
    case 'L': return 'w-[340px]';
    case 'M':
    default: return 'w-[300px]';
  }
});

const computedStyle = computed(() => {
  let opacity = 1;
  if (settingsStore.widgetsDim && props.dimmed) {
    if (isHovered.value || props.forceVisible) {
      opacity = 1;
    } else {
      opacity = props.dimOpacity !== undefined 
        ? props.dimOpacity 
        : (settingsStore.widgetDimOpacity / 100);
    }
  }
  return {
    opacity,
    transition: 'opacity 0.25s ease, transform 0.2s ease, border-color 0.25s ease'
  };
});
</script>
