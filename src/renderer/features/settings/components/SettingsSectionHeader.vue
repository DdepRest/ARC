<template>
  <header 
    class="flex flex-col gap-3 select-none"
    :class="variant === 'workspace' ? 'pb-4 mb-1 border-b border-[var(--arc-hairline)]' : 'mb-4 px-1'"
  >
    <!-- Category Context Breadcrumb (Level 1 Workspace Header) -->
    <div 
      v-if="eyebrow || categoryLabel" 
      class="flex items-center justify-between gap-2 text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-wider"
    >
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0"></span>
        <span class="truncate">{{ categoryLabel || eyebrow }}</span>
      </div>
      <span v-if="blockCountText && variant === 'workspace'" class="text-[var(--arc-text-muted)] tabular-nums shrink-0">
        {{ blockCountText }}
      </span>
    </div>

    <!-- Main Header Row -->
    <div 
      class="flex flex-col sm:flex-row sm:items-start justify-between gap-3"
      :class="collapsible ? 'cursor-pointer group' : ''"
      @click="collapsible && $emit('toggle')"
    >
      <div class="flex items-start gap-3.5 min-w-0">
        <!-- Приборная капсула иконки в каноне HUD -->
        <div 
          v-if="icon" 
          class="w-10 h-10 rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--accent)] shrink-0 flex items-center justify-center relative overflow-hidden mt-0.5"
          :style="{
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 16px rgba(0, 0, 0, 0.65)'
          }"
        >
          <div 
            class="pointer-events-none absolute inset-0"
            :style="{ background: 'radial-gradient(circle at 50% 0%, rgba(var(--accent-rgb, 239, 68, 68), 0.16), transparent 70%)' }"
          ></div>
          <component :is="icon" class="w-4 h-4 shrink-0 relative z-10" :class="iconColor ? iconColor : ''" />
        </div>

        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2.5 flex-wrap">
            <h2 
              :class="[
                variant === 'workspace' ? 'text-[18px] sm:text-[20px]' : 'text-[16px]',
                collapsible ? 'group-hover:text-white transition-colors' : ''
              ]"
              class="font-semibold text-[var(--arc-text-primary)] tracking-tight leading-[1.30]"
            >
              {{ title }}
            </h2>

            <!-- Real Subsystem Status Badge -->
            <span 
              v-if="statusLabel" 
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[8px] bg-[var(--arc-block)] border text-xs font-mono font-semibold uppercase tracking-wider tabular-nums"
              :class="statusBadgeClasses"
            >
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="statusDotClasses"></span>
              <span>{{ statusLabel }}</span>
            </span>

            <!-- Standard Section Meta Badge (when not in workspace header top bar) -->
            <span 
              v-if="blockCountText && variant !== 'workspace'" 
              class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-wider"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
              {{ blockCountText }}
            </span>
          </div>

          <p v-if="description" class="text-xs text-[var(--arc-text-hint)] leading-[1.55] max-w-2xl mt-1">
            {{ description }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
        <slot name="actions" />
        <div v-if="collapsible" class="text-[var(--arc-text-muted)] group-hover:text-[var(--arc-text-primary)] transition-colors">
          <ChevronRight v-if="isCollapsed" class="w-4 h-4" />
          <ChevronDown v-else class="w-4 h-4" />
        </div>
      </div>
    </div>

    <!-- Optional Workspace Summary Strip Slot -->
    <div v-if="$slots.summary" class="pt-1">
      <slot name="summary" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { ChevronDown, ChevronRight } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  title: string;
  icon?: Component;
  eyebrow?: string;
  categoryLabel?: string;
  description?: string;
  blockCountText?: string;
  statusLabel?: string;
  statusTone?: 'ok' | 'warn' | 'err' | 'off';
  variant?: 'section' | 'workspace';
  iconColor?: string;
  isCollapsed?: boolean;
  collapsible?: boolean;
}>(), {
  statusTone: 'off',
  variant: 'section',
  iconColor: '',
  isCollapsed: false,
  collapsible: false
});

defineEmits<{
  (e: 'toggle'): void
}>();

const statusBadgeClasses = computed(() => {
  switch (props.statusTone) {
    case 'ok':
      return 'text-[var(--status-ok)] border-[var(--status-ok)]/30';
    case 'warn':
      return 'text-[var(--status-warn)] border-[var(--status-warn)]/30';
    case 'err':
      return 'text-[var(--status-err)] border-[var(--status-err)]/30';
    default:
      return 'text-[var(--arc-text-muted)] border-[var(--arc-hairline)]';
  }
});

const statusDotClasses = computed(() => {
  switch (props.statusTone) {
    case 'ok':
      return 'bg-[var(--status-ok)]';
    case 'warn':
      return 'bg-[var(--status-warn)]';
    case 'err':
      return 'bg-[var(--status-err)]';
    default:
      return 'bg-[var(--arc-text-muted)]';
  }
});
</script>
