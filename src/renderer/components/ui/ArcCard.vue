<template>
  <div 
    class="rounded-[16px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] p-5 transition duration-300 relative overflow-hidden"
    :class="[
      interactive ? 'hover:bg-[var(--arc-hover)] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]' : '',
      glow ? 'border-[var(--accent)]' : ''
    ]"
    :style="glow 
      ? { background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 16px 36px rgba(0, 0, 0, 0.78), 0 0 24px rgba(var(--accent-rgb, 239, 68, 68), 0.20)' }
      : { background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 14px 36px rgba(0, 0, 0, 0.76)' }"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive ? 0 : undefined"
    @click="interactive && $emit('click', $event)"
    @keydown.enter="interactive && $emit('click', $event)"
  >
    <div v-if="title || $slots.header" class="flex items-center justify-between mb-4 pb-3 border-b border-[var(--arc-hairline)]">
      <div>
        <h4 v-if="title" class="text-sm font-semibold text-[var(--arc-text-primary)] flex items-center gap-2">
          <span class="w-[2px] h-3.5 rounded-full bg-[var(--accent)] shrink-0"></span>
          <slot name="title-prefix" />
          {{ title }}
        </h4>
        <p v-if="subtitle" class="text-xs text-[var(--arc-text-muted)] font-mono mt-1 tracking-wider">{{ subtitle }}</p>
      </div>
      <slot name="header-action" />
    </div>

    <div class="flex flex-col">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string;
  subtitle?: string;
  interactive?: boolean;
  glow?: boolean;
}>(), {
  interactive: false,
  glow: false
});

defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();
</script>
