<script setup lang="ts">
import { ref, computed } from 'vue';
import { Sparkles, Activity, Search, Plus, Globe } from 'lucide-vue-next';
import { PRESETS, ProviderPreset } from './presetsData';
import ArcModal from '../../../../../components/ui/ArcModal.vue';

const emit = defineEmits<{
  (e: 'select-preset', preset: ProviderPreset): void;
}>();

const showAddMenu = ref(false);
const presetSearchQuery = ref('');
const selectedCategory = ref<'all' | 'free' | 'local' | 'cloud'>('all');
const presetHealthStatus = ref<Record<string, 'checking' | 'online' | 'offline'>>({});

const filteredPresets = computed(() => {
  let list = PRESETS;
  
  if (selectedCategory.value === 'free') {
    list = list.filter(p => p.freeTier === 'free' || p.freeTier === 'freemium');
  } else if (selectedCategory.value === 'local') {
    list = list.filter(p => p.type === 'local');
  } else if (selectedCategory.value === 'cloud') {
    list = list.filter(p => p.type === 'cloud');
  }

  const query = presetSearchQuery.value.toLowerCase().trim();
  if (!query) return list;

  return list.filter(p => 
    p.name.toLowerCase().includes(query) || 
    p.endpoint.toLowerCase().includes(query) ||
    p.model.toLowerCase().includes(query) ||
    (p.freeTierInfo && p.freeTierInfo.toLowerCase().includes(query))
  );
});

const checkPresetHealth = async (preset: ProviderPreset) => {
  if (!preset.endpoint) return;
  presetHealthStatus.value[preset.name] = 'checking';
  try {
    if (preset.type === 'local') {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const url = new URL(preset.endpoint);
      const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
      const probeUrl = `${url.protocol}//${host}:${url.port || (url.protocol === 'https:' ? 443 : 80)}/`;
      await fetch(probeUrl, { method: 'GET', mode: 'no-cors', signal: controller.signal });
      clearTimeout(timeoutId);
      presetHealthStatus.value[preset.name] = 'online';
    } else {
      presetHealthStatus.value[preset.name] = 'online';
    }
  } catch (e) {
    presetHealthStatus.value[preset.name] = 'offline';
  }
};

const checkAllPresetsHealth = () => {
  PRESETS.forEach(p => {
    if (p.type === 'local') {
      checkPresetHealth(p);
    }
  });
};

const toggleAddMenu = () => {
  showAddMenu.value = !showAddMenu.value;
};

const handleSelectPreset = (preset: ProviderPreset) => {
  emit('select-preset', preset);
  showAddMenu.value = false;
};
</script>

<template>
  <div class="relative">
    <button 
      @click="toggleAddMenu"
      class="px-3 py-1.5 bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[rgba(var(--accent-rgb),0.4)] rounded-[10px] text-xs font-mono text-[var(--accent)] transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer whitespace-nowrap"
      :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
      title="Добавить провайдера"
    >
      <Plus class="w-3.5 h-3.5" />
      <span>ДОБАВИТЬ ШАБЛОН</span>
    </button>

    <!-- A.R.C. Core Cyber-HUD AI Service Catalog Modal -->
    <ArcModal
      :show="showAddMenu"
      @close="showAddMenu = false"
      title="Каталог сервисов"
      maxWidth="max-w-4xl"
    >
      <template #title-prefix>
        <Sparkles class="w-4 h-4 text-[var(--arc-text-muted)]" />
      </template>

      <div class="flex flex-col gap-5 p-1 sm:p-2">
        <!-- Search and Ping Bar -->
        <div class="flex flex-col sm:flex-row items-center gap-3 w-full">
          <div class="relative flex-1 w-full">
            <Search class="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--arc-text-muted)] pointer-events-none" />
            <input 
              v-model="presetSearchQuery" 
              type="text" 
              placeholder="Поиск сервиса..."
              class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] focus:border-[var(--accent)] rounded-[12px] pl-11 pr-10 py-2.5 text-sm text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none transition"
              :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.03)' }"
            />
            <button 
              v-if="presetSearchQuery" 
              @click="presetSearchQuery = ''" 
              class="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
          
          <button 
            @click="checkAllPresetsHealth" 
            class="shrink-0 text-xs font-mono font-medium text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] px-5 py-2.5 rounded-[12px] border border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] transition flex items-center justify-center gap-2 cursor-pointer outline-none"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
            title="Автопроверка онлайн-статуса эндпоинтов"
          >
            <Activity class="w-4 h-4 opacity-70" />
            Сетевой пинг
          </button>
        </div>

        <!-- Category Filter Tabs -->
        <div class="flex items-center gap-6 border-b border-[var(--arc-hairline)] pb-0 overflow-x-auto custom-scrollbar px-2">
          <button 
            @click="selectedCategory = 'all'"
            class="text-xs font-mono tracking-wider uppercase transition whitespace-nowrap cursor-pointer pb-3 -mb-[1px] outline-none"
            :class="selectedCategory === 'all' ? 'text-[var(--arc-text-primary)] border-b-2 border-[var(--accent)] font-bold' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-secondary)] border-b-2 border-transparent'"
          >
            Все
          </button>
          <button 
            @click="selectedCategory = 'free'"
            class="text-xs font-mono tracking-wider uppercase transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer pb-3 -mb-[1px] outline-none"
            :class="selectedCategory === 'free' ? 'text-[var(--arc-text-primary)] border-b-2 border-[var(--accent)] font-bold' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-secondary)] border-b-2 border-transparent'"
          >
            Бесплатный тариф
          </button>
          <button 
            @click="selectedCategory = 'local'"
            class="text-xs font-mono tracking-wider uppercase transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer pb-3 -mb-[1px] outline-none"
            :class="selectedCategory === 'local' ? 'text-[var(--arc-text-primary)] border-b-2 border-[var(--accent)] font-bold' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-secondary)] border-b-2 border-transparent'"
          >
            Локально
          </button>
        </div>

        <!-- Presets List -->
        <div class="h-[45vh] min-h-[350px] overflow-y-auto custom-scrollbar pr-2">
          <div v-if="filteredPresets.length === 0" class="h-full w-full flex flex-col items-center justify-center gap-4 text-xs text-[var(--arc-text-muted)] font-medium">
            <Search class="w-8 h-8 opacity-20" />
            СЕРВИСЫ НЕ НАЙДЕНЫ
          </div>
          
          <div v-else class="flex flex-col gap-1.5 pb-2">
            <!-- Featured: Manual IP / FreeAPILLM Direct Connect Entry -->
            <button 
              v-if="!presetSearchQuery || 'freeapillm'.includes(presetSearchQuery.toLowerCase()) || presetSearchQuery.includes('3067') || presetSearchQuery.includes('ip')"
              @click="handleSelectPreset({
                name: 'FreeAPILLM',
                type: 'local',
                freeTier: 'free',
                freeTierInfo: 'OpenAI-совместимый Free Router (127.0.0.1:3067)',
                endpoint: 'http://127.0.0.1:3067/v1/chat/completions',
                model: 'auto',
                url: 'http://127.0.0.1:3067/'
              })"
              class="w-full bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.3)] hover:border-[rgba(var(--status-ok-rgb,34,197,94),0.5)] p-3.5 rounded-[16px] text-left transition duration-300 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 group relative cursor-pointer outline-none mb-1.5"
              :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 20px rgba(0, 0, 0, 0.4)' }"
            >
              <div class="p-2 rounded-[10px] bg-[var(--arc-plane)] text-[var(--status-ok)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.3)] shrink-0">
                <Globe class="w-4 h-4" />
              </div>
              <div class="flex flex-col gap-0.5 min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold text-[var(--arc-text-primary)] group-hover:text-[var(--status-ok)] transition-colors">FreeAPILLM (Ручной ввод IP)</span>
                  <span class="text-xs font-mono px-2 py-0.5 rounded-full bg-[var(--arc-plane)] text-[var(--status-ok)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.35)] font-bold uppercase">127.0.0.1:3067</span>
                </div>
                <span class="text-xs text-[var(--arc-text-muted)]">Подключение локального роутера FreeAPILLM или любого кастомного IP адреса</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs font-mono text-[var(--status-ok)] uppercase font-semibold">ПОДКЛЮЧИТЬ</span>
                <Plus class="w-4 h-4 text-[var(--status-ok)]" />
              </div>
            </button>

            <button 
              v-for="preset in filteredPresets" 
              :key="preset.name"
              @click="handleSelectPreset(preset)"
              class="w-full bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] p-3.5 rounded-[14px] text-left transition duration-200 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 group relative cursor-pointer outline-none"
              :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
            >
              <!-- Info -->
              <div class="flex flex-col gap-1 min-w-0 flex-1">
                <div class="flex items-center gap-3 flex-wrap">
                  <span class="text-sm font-medium text-[var(--arc-text-primary)] truncate transition-colors">{{ preset.name }}</span>
                  
                  <!-- Health Indicator -->
                  <span 
                    v-if="presetHealthStatus[preset.name]"
                    class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono uppercase tracking-wider shrink-0"
                    :class="{
                      'text-[var(--arc-text-secondary)]': presetHealthStatus[preset.name] === 'online',
                      'text-[var(--status-err)]': presetHealthStatus[preset.name] === 'offline',
                      'text-[var(--status-warn)] animate-pulse': presetHealthStatus[preset.name] === 'checking'
                    }"
                  >
                    <span class="w-1.5 h-1.5 rounded-full" :class="{
                      'bg-[var(--status-ok)]': presetHealthStatus[preset.name] === 'online',
                      'bg-[var(--status-err)]': presetHealthStatus[preset.name] === 'offline',
                      'bg-[var(--status-warn)]': presetHealthStatus[preset.name] === 'checking'
                    }"></span>
                    {{ presetHealthStatus[preset.name] === 'online' ? 'ОНЛАЙН' : presetHealthStatus[preset.name] === 'offline' ? 'ОШИБКА' : 'ПИНГ' }}
                  </span>
                </div>
                <span class="text-xs text-[var(--arc-text-muted)] tracking-wide truncate w-full transition-colors" :title="preset.freeTierInfo || preset.endpoint">{{ preset.freeTierInfo || preset.endpoint }}</span>
              </div>
              
              <!-- Badges -->
              <div class="flex items-center gap-2 shrink-0">
                <span 
                  v-if="preset.freeTier === 'free'" 
                  class="px-2.5 py-1 rounded-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono uppercase tracking-wider text-[var(--status-ok)]"
                >
                  Бесплатно
                </span>
                <span 
                  v-else-if="preset.freeTier === 'freemium'" 
                  class="px-2.5 py-1 rounded-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono uppercase tracking-wider text-[var(--arc-text-secondary)]"
                >
                  Лимиты
                </span>
                <span 
                  v-else-if="preset.type === 'local'" 
                  class="px-2.5 py-1 rounded-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono uppercase tracking-wider text-[var(--arc-text-secondary)]"
                >
                  Локально
                </span>
                
                <div class="w-8 h-8 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] flex items-center justify-center opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 group-focus-within:opacity-100 group-focus-within:ml-0 transition duration-200">
                  <Plus class="w-4 h-4 text-[var(--arc-text-primary)]" />
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </ArcModal>
  </div>
</template>