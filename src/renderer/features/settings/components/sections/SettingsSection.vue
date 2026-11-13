<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

interface Props {
  title: string;
  defaultOpen?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false
});

const isOpen = ref(props.defaultOpen);

const toggle = () => {
  isOpen.value = !isOpen.value;
};
</script>

<template>
  <section class="mb-4">
    <!-- Section Header (Collapsible) -->
    <button 
      @click="toggle"
      class="w-full flex items-center justify-between mb-3 px-1 cursor-pointer select-none group"
    >
      <h3 class="text-xs font-bold text-white/50 group-hover:text-white/80 uppercase tracking-widest transition-colors">{{ title }}</h3>
      <ChevronDown 
        class="w-4 h-4 text-white/30 transition-transform duration-300"
        :class="{ '-rotate-90': !isOpen }"
      />
    </button>

    <!-- Wrapper for content -->
    <div 
      class="collapse-wrapper transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      :class="isOpen ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'"
    >
      <div class="overflow-hidden min-h-0">
        <div class="bg-black/20 border border-white/5 rounded-2xl overflow-hidden divide-y divide-white/5 p-5">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.collapse-wrapper {
  display: grid;
}
.settings-section {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}
</style>
