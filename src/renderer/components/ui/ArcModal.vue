<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div 
        v-if="show" 
        class="fixed inset-0 z-[50000] flex items-center justify-center p-4 md:p-6 arc-glass-veil select-none transition duration-300"
        @click.self="handleBackdropClick"
        @keydown.esc="close"
        tabindex="-1"
      >
        <!-- Modal Box: Tactile Obsidian Instrument Terminal -->
        <div 
          class="modal-box relative w-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[18px] overflow-hidden flex flex-col max-h-[90vh] transition"
          :class="maxWidth"
          :style="{
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 60px rgba(0, 0, 0, 0.75)'
          }"
        >
          <!-- Subtle Top Accent Glow Line -->
          <div class="h-[1.5px] w-full bg-[image:var(--arc-header-line)] shrink-0"></div>

          <!-- Clean Instrument Header -->
          <div 
            class="px-5 py-4 border-b border-[var(--arc-hairline)] flex items-center justify-between shrink-0 relative z-10 bg-[var(--arc-block)]"
            :style="{ backgroundImage: 'var(--arc-sheen)' }"
          >
            <div class="flex items-center gap-2.5">
              <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]"></span>
              <div>
                <h3 class="text-xs md:text-sm font-mono font-semibold text-[var(--arc-text-primary)] tracking-wide flex items-center gap-2">
                  <slot name="title-prefix" />
                  {{ title }}
                </h3>
                <p v-if="subtitle" class="text-xs text-[var(--arc-text-secondary)] font-sans tracking-normal mt-0.5">{{ subtitle }}</p>
              </div>
            </div>
            
            <!-- Clean Close Button -->
            <button 
              type="button" 
              @click="close"
              aria-label="Закрыть окно"
              class="w-7 h-7 rounded-[8px] bg-[var(--arc-input)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] flex items-center justify-center transition-colors duration-150 focus:outline-none cursor-pointer"
              :style="{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- Modal Body -->
          <div class="p-5 md:p-6 overflow-y-auto space-y-4 custom-scrollbar relative z-10 font-sans bg-[var(--arc-plane)]">
            <slot />
          </div>

          <!-- Modal Footer (Optional) -->
          <div 
            v-if="$slots.footer" 
            class="px-5 py-3.5 border-t border-[var(--arc-hairline)] bg-[var(--arc-block)] flex items-center justify-end gap-2.5 shrink-0 relative z-10"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { X } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  show: boolean;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  closeOnBackdrop?: boolean;
}>(), {
  maxWidth: 'max-w-2xl',
  closeOnBackdrop: true
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const close = () => {
  emit('close');
};

const handleBackdropClick = () => {
  if (props.closeOnBackdrop) {
    close();
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.show) {
    close();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-enter-active .modal-box,
.modal-fade-leave-active .modal-box {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .modal-box,
.modal-fade-leave-to .modal-box {
  opacity: 0;
  transform: scale(0.95) translateY(6px);
}
</style>
