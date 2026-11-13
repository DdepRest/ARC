<template>
  <div 
    :id="id"
    class="flex flex-col items-center justify-center text-center p-8 border border-dashed border-[var(--arc-hairline)] rounded-[16px] bg-[var(--arc-plane)]"
  >
    <!-- Icon Container with subtle glow -->
    <div 
      class="w-12 h-12 rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] flex items-center justify-center text-[var(--arc-text-muted)] mb-4"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <component :is="iconComponent || Inbox" class="w-6 h-6 text-[var(--accent)] opacity-75" />
    </div>

    <!-- Content -->
    <h3 class="text-xs font-mono tracking-[0.2em] uppercase font-bold text-[var(--arc-text-primary)] mb-1">
      {{ title }}
    </h3>
    <p class="text-xs font-mono text-[var(--arc-text-muted)] max-w-sm leading-relaxed uppercase tracking-wider">
      {{ description }}
    </p>

    <!-- Extra action slot -->
    <div v-if="$slots.default" class="mt-4">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Inbox, Cpu, FolderOpen, Target, ShieldAlert, Bot } from 'lucide-vue-next';

const props = defineProps<{
  id?: string;
  title: string;
  description: string;
  icon?: 'inbox' | 'cpu' | 'folder' | 'target' | 'alert' | 'bot';
}>();

const iconComponent = computed(() => {
  switch (props.icon) {
    case 'cpu': return Cpu;
    case 'folder': return FolderOpen;
    case 'target': return Target;
    case 'alert': return ShieldAlert;
    case 'bot': return Bot;
    case 'inbox':
    default:
      return Inbox;
  }
});
</script>
