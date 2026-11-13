<template>
  <AppButton
    :id="id"
    :variant="variant"
    :size="size"
    :type="type"
    :disabled="disabled"
    :loading="loading"
    @click="$emit('click', $event)"
  >
    <template #icon v-if="$slots.icon">
      <slot name="icon" />
    </template>
    <slot />
  </AppButton>
</template>

<script setup lang="ts">
import AppButton from './AppButton.vue';

/**
 * @deprecated Use AppButton.vue directly.
 * ArcButton is a legacy compatibility wrapper for the unified AppButton component.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
type Size = 'sm' | 'md' | 'lg' | 'icon';

withDefaults(defineProps<{
  id?: string;
  variant?: Variant;
  size?: Size;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
}>(), {
  variant: 'secondary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false
});

defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();
</script>
