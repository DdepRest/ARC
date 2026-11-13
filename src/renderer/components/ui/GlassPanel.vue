<template>
  <div 
    :id="id"
    class="rounded-[16px] transition duration-300 relative overflow-hidden"
    :class="[
      variantClasses[variant],
      hoverable ? 'hover:bg-[var(--arc-hover)]' : ''
    ]"
    :style="variant !== 'subtle' ? {
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
    } : {}"
  >
    <!-- Panel Content -->
    <div :class="padding">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
type Variant = 'default' | 'elevated' | 'subtle';

const props = withDefaults(defineProps<{
  id?: string;
  padding?: string;
  hoverable?: boolean;
  variant?: Variant;
}>(), {
  padding: 'p-5',
  hoverable: false,
  variant: 'default'
});

const variantClasses: Record<Variant, string> = {
  default: 'bg-[var(--arc-block)] border border-[var(--arc-hairline)]',
  elevated: 'bg-[var(--arc-popover)] border border-[var(--arc-hairline)]',
  subtle: 'bg-[var(--arc-plane)] border border-[var(--arc-hairline)]'
};
</script>
