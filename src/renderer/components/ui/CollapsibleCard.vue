<template>
  <div 
    :id="id"
    class="border border-[var(--arc-hairline)] rounded-[16px] bg-[var(--arc-block)] transition duration-300 overflow-hidden"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: isCollapsed 
        ? 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' 
        : 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 14px 36px rgba(0, 0, 0, 0.78)'
    }"
  >
    <!-- Card Header -->
    <div 
      @click="toggleCollapse"
      class="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none hover:bg-[var(--arc-hover)] transition-colors"
      :class="!isCollapsed ? 'border-b border-[var(--arc-hairline)]' : ''"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-3">
        <span 
          class="w-[2px] h-3.5 rounded-full shrink-0"
          :style="{ backgroundColor: 'var(--accent)', boxShadow: '0 0 8px rgba(var(--accent-rgb, 239, 68, 68), 0.45)' }"
        ></span>
        <!-- Icon slot -->
        <div v-if="$slots.icon" class="text-[var(--arc-text-muted)]">
          <slot name="icon" />
        </div>
        
        <!-- Title and description -->
        <div>
          <h3 class="text-xs font-mono tracking-[0.14em] uppercase font-semibold text-[var(--arc-text-primary)]">
            {{ title }}
          </h3>
          <p v-if="description" class="text-xs font-mono text-[var(--arc-text-muted)] mt-0.5">
            {{ description }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3" @click.stop>
        <!-- Header Actions/Badges Slot -->
        <slot name="header-actions" />

        <!-- Collapse Toggle Button -->
        <button 
          @click="toggleCollapse"
          type="button"
          class="w-7 h-7 rounded-lg border border-[var(--arc-hairline)] bg-[var(--arc-plane)] flex items-center justify-center hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition duration-200 cursor-pointer"
        >
          <ChevronDown 
            class="w-4 h-4 transition-transform duration-300" 
            :class="{ 'rotate-180 text-[var(--accent)]': !isCollapsed }"
          />
        </button>
      </div>
    </div>

    <!-- Collapsible Body -->
    <transition
      name="collapse"
      @enter="startTransition"
      @after-enter="endTransition"
      @leave="startTransition"
      @after-leave="endTransition"
    >
      <div v-show="!isCollapsed" class="overflow-hidden transition duration-300">
        <div class="p-5">
          <slot />
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

const props = defineProps<{
  id?: string;
  title: string;
  description?: string;
  defaultCollapsed?: boolean;
}>();

const isCollapsed = ref(props.defaultCollapsed ?? false);

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

const startTransition = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.height = htmlEl.scrollHeight + 'px';
};

const endTransition = (el: Element) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.height = '';
};
</script>

<style scoped>
.collapse-enter-active,
.collapse-leave-active {
  transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
}

.collapse-enter-from,
.collapse-leave-to {
  height: 0 !important;
  opacity: 0;
}
</style>
