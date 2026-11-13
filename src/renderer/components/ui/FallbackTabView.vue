<template>
  <div class="w-full h-full flex flex-col justify-center items-center py-12 text-center select-none">
    <EmptyState 
      :title="`Модуль ${activeTab ? activeTab.toUpperCase() : 'СИСТЕМА'}`" 
      description="Модуль в разработке. Доступ будет открыт в следующих обновлениях." 
      icon="cpu" 
    />
  </div>
</template>

<script setup lang="ts">
import EmptyState from './EmptyState.vue';

defineProps<{
  activeTab?: string;
}>();
</script>
