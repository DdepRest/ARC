<template>
  <button
    type="button"
    @click="$emit('click', $event)"
    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-mono font-medium transition duration-200 select-none border cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
    :class="[
      active
        ? 'bg-[var(--arc-block)] text-[var(--arc-text-primary)] border-[var(--accent)]'
        : 'bg-[var(--arc-input)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] hover:text-[var(--arc-text-primary)]',
      disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
    ]"
    :style="active
      ? { boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 14px rgba(var(--accent-rgb, 239, 68, 68), 0.22)' }
      : { boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.65)' }"
  >
    <span 
      v-if="active && !icon" 
      class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0"
    ></span>
    <component :is="icon" v-if="icon" class="w-3.5 h-3.5 shrink-0" :class="active ? 'text-[var(--accent)]' : ''" />
    <span>{{ label }}</span>
    <span
      v-if="removable"
      @click.stop="$emit('remove', $event)"
      class="ml-1 p-0.5 rounded-full hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors"
    >
      <X class="w-3 h-3" />
    </span>
  </button>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';
import type { Component } from 'vue';

withDefaults(defineProps<{
  label: string;
  active?: boolean;
  removable?: boolean;
  disabled?: boolean;
  icon?: Component;
}>(), {
  active: false,
  removable: false,
  disabled: false
});

defineEmits<{
  (e: 'click', event: MouseEvent): void;
  (e: 'remove', event: MouseEvent): void;
}>();
</script>
