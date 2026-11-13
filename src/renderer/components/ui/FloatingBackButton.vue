<template>
  <button 
    class="floating-back-button group" 
    type="button" 
    :aria-label="ariaLabel"
    @click="$emit('click', $event)"
  >
    <div class="floating-back-button__icon-wrapper">
      <slot name="icon">
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" class="floating-back-button__icon" width="20" height="20" viewBox="0 0 1024 1024">
          <path d="M542.421333 161.450667a46.762667 46.762667 0 0 0-62.933333 0.128l-274.432 256.853333a39.893333 39.893333 0 0 0 0 59.008c17.408 16.298667 45.653333 16.298667 63.061333 0l198.314667-185.6v541.098667c0 23.04 19.925333 41.728 44.586667 41.728 24.618667 0 44.586667-18.688 44.586666-41.728V291.328l200.362667 186.24c17.493333 16.213333 45.738667 16.128 63.104-0.213333a39.893333 39.893333 0 0 0-0.256-59.050667l-276.394667-256.853333z" fill="currentColor"></path>
        </svg>
      </slot>
    </div>
    <span class="floating-back-button__text">
      <slot>{{ text }}</slot>
    </span>
    <span class="floating-back-button__highlight" aria-hidden="true"></span>
  </button>
</template>

<script setup lang="ts">
defineProps({
  text: {
    type: String,
    default: 'Назад'
  },
  ariaLabel: {
    type: String,
    default: 'Go back'
  }
});
defineEmits(['click']);
</script>

<style scoped>
.floating-back-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 9999px;
  background: var(--arc-block, #101010);
  border: 1px solid var(--arc-hairline, rgba(255, 255, 255, 0.08));
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  color: var(--arc-text-secondary, rgba(255, 255, 255, 0.7));
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.25, 1, 0.4, 1);
  outline: none;
}

.floating-back-button:hover {
  background: var(--arc-hover, #141414);
  border-color: var(--arc-border-focus, var(--accent));
  color: #ffffff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}

.floating-back-button:active {
  transform: translateY(1px) scale(0.96);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.floating-back-button__icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-90deg);
}

.floating-back-button__icon {
  width: 14px;
  height: 14px;
  transition: transform 0.4s cubic-bezier(0.25, 1, 0.4, 1);
}

.floating-back-button:hover .floating-back-button__icon {
  transform: translateX(-2px);
  color: var(--accent);
}

.floating-back-button__text {
  position: relative;
  z-index: 2;
  margin-top: 1px;
}

.floating-back-button__highlight {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.12),
    transparent
  );
  transform: skewX(-20deg);
  transition: none;
  z-index: 1;
}

.floating-back-button:hover .floating-back-button__highlight {
  animation: floating-back-shimmer 1.5s infinite;
}

@keyframes floating-back-shimmer {
  0% { left: -100%; }
  100% { left: 200%; }
}
</style>
