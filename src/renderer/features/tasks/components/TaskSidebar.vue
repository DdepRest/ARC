<template>
  <div class="flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar pr-2">
    <!-- Smart Lists -->
    <div class="flex flex-col gap-1">
      <span class="text-[9px] font-mono text-white/30 uppercase tracking-widest px-2 mb-2">Навигация</span>
      
      <button
        v-for="list in smartLists"
        :key="list.id"
        @click="$emit('update:activeFilter', list.id)"
        class="flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer group"
        :class="activeFilter === list.id ? 'bg-[var(--accent-bg-alpha)] text-[var(--accent-text)] font-medium' : 'text-white/60 hover:text-white hover:bg-white/5'"
      >
        <div class="flex items-center gap-3">
          <component :is="list.icon" class="w-4 h-4" :class="activeFilter === list.id ? 'text-[var(--accent-text)]' : list.iconClass" />
          <span class="text-sm">{{ list.label }}</span>
        </div>
        <span class="text-xs" :class="activeFilter === list.id ? 'text-[var(--accent-text)]' : 'text-white/40'">
          {{ typeof filterCount === 'function' ? filterCount(list.id) : 0 }}
        </span>
      </button>
    </div>

    <!-- User Categories -->
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between px-2 mb-2">
        <span class="text-[9px] font-mono text-white/30 uppercase tracking-widest">Категории</span>
        <button 
          @click="$emit('openCategoryModal')" 
          class="text-white/30 hover:text-white transition-colors p-1"
          title="Управление категориями"
        >
          <Settings class="w-3 h-3" />
        </button>
      </div>

      <button
        @click="$emit('update:activeFilter', 'all')"
        class="flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer"
        :class="activeFilter === 'all' ? 'bg-[var(--accent-bg-alpha)] text-[var(--accent-text)] font-medium' : 'text-white/60 hover:text-white hover:bg-white/5'"
      >
        <div class="flex items-center gap-3">
          <div class="w-2.5 h-2.5 rounded-full border-2 border-white/40"></div>
          <span class="text-sm">Все задачи</span>
        </div>
      </button>

      <button
        v-for="cat in categories"
        :key="cat.id"
        @click="$emit('update:activeFilter', 'cat_' + cat.id)"
        class="flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer group"
        :class="activeFilter === 'cat_' + cat.id ? 'bg-[var(--accent-bg-alpha)] text-[var(--accent-text)] font-medium' : 'text-white/60 hover:text-white hover:bg-white/5'"
      >
        <div class="flex items-center gap-3">
          <div class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: cat.color || '#ef4444' }"></div>
          <span class="text-sm truncate">{{ cat.name }}</span>
        </div>
        <span class="text-xs" :class="activeFilter === 'cat_' + cat.id ? 'text-[var(--accent-text)]' : 'text-white/40'">
          {{ typeof filterCount === 'function' ? filterCount('cat_' + cat.id) : 0 }}
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Inbox, Sun, Star, Calendar, CheckCircle2, Settings } from 'lucide-vue-next';

defineProps<{
  activeFilter: string;
  categories: any[];
  filterCount: (f: string) => number;
}>();

defineEmits<{
  (e: 'update:activeFilter', val: string): void;
  (e: 'openCategoryModal'): void;
}>();

const smartLists = [
  { id: 'inbox', label: 'Входящие', icon: Inbox, iconClass: 'text-zinc-400' },
  { id: 'my_day', label: 'Мой день', icon: Sun, iconClass: 'text-amber-400' },
  { id: 'important', label: 'Важные', icon: Star, iconClass: 'text-amber-300' },
  { id: 'scheduled', label: 'Запланировано', icon: Calendar, iconClass: 'text-teal-400' },
  { id: 'completed', label: 'Завершенные', icon: CheckCircle2, iconClass: 'text-emerald-400' }
];
</script>
