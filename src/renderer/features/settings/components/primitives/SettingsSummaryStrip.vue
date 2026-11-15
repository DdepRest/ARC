<template>
  <div
    class="grid gap-0 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] overflow-hidden"
    :class="items.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'"
    :style="{ boxShadow: 'var(--arc-well-shadow)' }"
  >
    <div
      v-for="(item, idx) in items"
      :key="idx"
      class="flex flex-col gap-1 px-3 py-2.5 sm:px-4 sm:py-3 min-w-0 border-[var(--arc-divider)]"
      :class="
        items.length === 3
          ? (idx > 0 ? 'border-t sm:border-t-0 sm:border-l' : '')
          : [
              idx % 2 === 1 ? 'border-l' : '',
              idx >= 2 ? 'border-t lg:border-t-0' : '',
              idx === 2 ? 'lg:border-l' : ''
            ]
      "
    >
      <span class="text-xs font-mono text-[var(--arc-text-machine)] tracking-wider uppercase truncate">
        {{ item.label }}
      </span>
      <div class="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <span
          v-if="item.tone && item.tone !== 'default'"
          class="w-2 h-2 rounded-full shrink-0"
          :class="dotClass(item.tone)"
        ></span>
        <span
          class="text-[13px] sm:text-[14px] font-mono font-semibold tabular-nums truncate"
          :class="valueClass(item.tone)"
          :title="item.value"
        >
          {{ item.value }}
        </span>
      </div>
      <span
        v-if="item.detail"
        class="text-xs text-[var(--arc-text-hint)] leading-snug line-clamp-2 sm:truncate"
        :title="item.detail"
      >
        {{ item.detail }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface SummaryStripItem {
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'ok' | 'warn' | 'err' | 'accent' | 'off';
}

export type SummaryItem = SummaryStripItem;

defineProps<{
  items: SummaryStripItem[];
}>();

function dotClass(tone?: SummaryStripItem['tone']): string {
  switch (tone) {
    case 'ok':
      return 'bg-[var(--status-ok)]';
    case 'warn':
      return 'bg-[var(--status-warn)]';
    case 'err':
      return 'bg-[var(--status-err)]';
    case 'accent':
      return 'bg-[var(--accent)]';
    default:
      return 'bg-[var(--arc-text-muted)]';
  }
}

function valueClass(tone?: SummaryStripItem['tone']): string {
  switch (tone) {
    case 'ok':
      return 'text-[var(--status-ok)]';
    case 'warn':
      return 'text-[var(--status-warn)]';
    case 'err':
      return 'text-[var(--status-err)]';
    case 'accent':
      return 'text-[var(--accent)]';
    case 'off':
      return 'text-[var(--arc-text-muted)]';
    default:
      return 'text-[var(--arc-text-primary)]';
  }
}
</script>
