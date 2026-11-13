<template>
  <button
    type="button"
    @click="handleClick"
    class="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer group outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded px-1 py-0.5"
  >
    <span><slot>{{ label }}</slot></span>
    <ArrowRight class="w-3 h-3 text-[var(--arc-text-machine)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)] shrink-0" />
  </button>
</template>

<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';
import { useSettingsNav, type SettingsTab } from '../../composables/useSettingsNav';

const props = defineProps<{
  label?: string;
  tab?: SettingsTab;
  sectionId?: string;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
}>();

const { navigateToSection } = useSettingsNav();

function handleClick() {
  emit('click');
  if (props.tab && props.sectionId) {
    navigateToSection(props.tab, props.sectionId);
  }
}
</script>
