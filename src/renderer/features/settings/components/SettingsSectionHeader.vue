<template>
  <header
    class="flex flex-col gap-4 select-none"
    :class="variant === 'workspace' ? 'pb-5 mb-2 border-b border-[var(--arc-divider)]' : 'mb-4 px-1'"
    :style="{ fontFamily: 'var(--font-ui)' }"
  >
    <!-- Category Context Breadcrumb (Level 1 Workspace Header) -->
    <div
      v-if="eyebrow || categoryLabel"
      class="flex items-center justify-between gap-2 text-xs font-mono text-[var(--arc-text-machine)] tracking-wider uppercase"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0"></span>
        <span class="truncate">{{ categoryLabel || eyebrow }}</span>
      </div>
      <span v-if="blockCountText && variant === 'workspace'" class="text-[var(--arc-text-muted)] tabular-nums shrink-0">
        {{ blockCountText }}
      </span>
    </div>

    <!-- Main Header Row -->
    <div
      class="flex flex-col sm:flex-row sm:items-start justify-between gap-3.5"
      :class="collapsible ? 'cursor-pointer group' : ''"
      @click="collapsible && $emit('toggle')"
    >
      <div class="flex items-start gap-4 min-w-0">
        <div
          v-if="icon"
          class="w-11 h-11 rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-edge-strong)] text-[var(--accent)] shrink-0 flex items-center justify-center relative overflow-hidden mt-0.5"
          :style="{
            background: 'var(--arc-block-gradient)',
            boxShadow: 'var(--arc-block-elevation)'
          }"
        >
          <div
            class="pointer-events-none absolute inset-0"
            :style="{ background: 'radial-gradient(circle at 50% 0%, rgba(var(--accent-rgb, 239, 68, 68), 0.18), transparent 72%)' }"
          ></div>
          <component :is="icon" class="w-4 h-4 shrink-0 relative z-10" :class="iconColor ? iconColor : ''" />
        </div>

        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-3 flex-wrap">
            <h2
              :class="[
                variant === 'workspace' ? 'text-[21px] sm:text-[23px]' : 'text-[16px] sm:text-[17px]',
                collapsible ? 'group-hover:text-white transition-colors' : ''
              ]"
              class="font-semibold text-[var(--arc-text-primary)] tracking-tight leading-[1.22]"
            >
              {{ title }}
            </h2>

            <!-- Honest Subsystem Status Pill -->
            <span
              v-if="statusLabel"
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[7px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] text-xs font-mono font-semibold tracking-wider tabular-nums max-w-full"
              :class="statusTextClasses"
              :style="{ boxShadow: 'var(--arc-well-shadow)' }"
            >
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="statusDotClasses"></span>
              <span class="truncate">{{ statusLabel }}</span>
            </span>

            <!-- Standard Section Meta Text (unboxed) -->
            <span
              v-if="blockCountText && variant !== 'workspace'"
              class="text-xs font-mono text-[var(--arc-text-muted)] tabular-nums"
            >
              · {{ blockCountText }}
            </span>
          </div>

          <p v-if="description" class="text-[13px] text-[var(--arc-text-hint)] leading-[1.55] max-w-[70ch] mt-1.5">
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

    <!-- Optional Workspace Summary Strip Slot (HUD Readout Strip) -->
    <div v-if="$slots.summary" class="pt-1.5">
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
  statusTone?: 'ok' | 'warn' | 'err' | 'off' | 'accent' | 'default';
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
  (e: 'toggle'): void;
}>();

const statusTextClasses = computed(() => {
  switch (props.statusTone) {
    case 'ok':
      return 'text-[var(--status-ok)]';
    case 'warn':
      return 'text-[var(--status-warn)]';
    case 'err':
      return 'text-[var(--status-err)]';
    case 'accent':
      return 'text-[var(--accent)]';
    case 'default':
      return 'text-[var(--arc-text-secondary)]';
    default:
      return 'text-[var(--arc-text-muted)]';
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
    case 'accent':
      return 'bg-[var(--accent)]';
    case 'default':
      return 'bg-[var(--arc-text-secondary)]';
    default:
      return 'bg-[var(--arc-text-muted)]';
  }
});
</script>
