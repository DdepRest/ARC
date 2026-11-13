<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDown, ArrowUp } from 'lucide-vue-next';
import { useAiConfigStore, AIProvider } from '../../../../../stores/aiConfig';
import { useSettingsStore } from '../../../stores/settings.store';
import ArcSlider from '../../../../../components/ui/ArcSlider.vue';

const aiStore = useAiConfigStore();
const settingsStore = useSettingsStore();

const sortedProviders = computed(() => {
  return [...aiStore.providers]
    .filter(p => p.enabled)
    .sort((a, b) => {
      const aFallback = a.routingStrategy === 'fallback' ? 1 : 0;
      const bFallback = b.routingStrategy === 'fallback' ? 1 : 0;
      if (aFallback !== bFallback) return aFallback - bFallback;
      return (a.priority || 99) - (b.priority || 99);
    });
});

async function makeFallback(provider: AIProvider) {
  provider.routingStrategy = 'fallback';
  provider.priority = Math.max(provider.priority || 1, 2);
  await aiStore.saveProvider(provider);
}

async function makePrimary(provider: AIProvider) {
  provider.routingStrategy = 'smart_route';
  provider.priority = 1;
  aiStore.providers.forEach(p => {
    if (p.id !== provider.id && p.priority <= 1) {
      p.priority = 2;
    }
  });
  await aiStore.saveProvider(provider);
}

async function movePriority(provider: AIProvider, direction: 'up' | 'down') {
  const currentIdx = sortedProviders.value.findIndex(p => p.id === provider.id);
  if (currentIdx === -1) return;
  const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
  if (targetIdx < 0 || targetIdx >= sortedProviders.value.length) return;

  const target = sortedProviders.value[targetIdx];
  const tempPriority = provider.priority || 1;
  provider.priority = target.priority || 2;
  target.priority = tempPriority;

  await Promise.all([
    aiStore.saveProvider(provider),
    aiStore.saveProvider(target)
  ]);
}
</script>

<template>
  <div 
    class="flex flex-col gap-4 p-4 rounded-[16px] bg-[var(--arc-block)] border border-[var(--arc-hairline)]" 
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
    }"
    data-search="запасные провайдеры порядок перехода правила сбой порог сложности"
  >
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="arc-text-group-title text-[var(--arc-text-primary)]">Запасные и правила</span>
        <span class="w-1 h-1 rounded-full bg-[var(--arc-hairline)]"></span>
        <span class="arc-text-hint text-[var(--arc-text-secondary)]">Порядок переключения при сбое и порог сложности</span>
      </div>
    </div>

    <!-- Fallback Chain Sequence -->
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between arc-text-machine text-[var(--arc-text-muted)]">
        <span>Порядок перехода при сбое (фолбек-цепочка)</span>
        <span>{{ sortedProviders.length }} активных</span>
      </div>

      <div v-if="sortedProviders.length === 0" class="p-4 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-center text-xs text-[var(--arc-text-muted)]">
        Нет включенных провайдеров. Включите хотя бы один провайдер в списке выше.
      </div>

      <div v-else class="flex flex-col gap-2">
        <div 
          v-for="(prov, idx) in sortedProviders" 
          :key="prov.id"
          class="flex items-center justify-between gap-3 p-2.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] transition-colors hover:border-[var(--arc-border-focus,var(--arc-hairline))]"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <!-- Step index badge -->
            <span 
              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 border bg-[var(--arc-block)]"
              :class="idx === 0 
                ? 'text-[var(--status-ok)] border-[rgba(var(--status-ok-rgb,34,197,94),0.35)]' 
                : 'text-[var(--status-warn)] border-[rgba(var(--status-warn-rgb,234,179,8),0.3)]'"
            >
              {{ idx + 1 }}
            </span>

            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-bold font-mono text-[var(--arc-text-primary)] truncate">{{ prov.name }}</span>
                <span 
                  class="arc-text-machine px-1.5 py-0.5 rounded-[6px] border bg-[var(--arc-block)]"
                  :class="idx === 0 && prov.routingStrategy !== 'fallback'
                    ? 'text-[var(--status-ok)] border-[rgba(var(--status-ok-rgb,34,197,94),0.35)]' 
                    : 'text-[var(--status-warn)] border-[rgba(var(--status-warn-rgb,234,179,8),0.35)]'"
                >
                  {{ idx === 0 && prov.routingStrategy !== 'fallback' ? 'ОСНОВНОЙ' : 'ЗАПАСНОЙ' }}
                </span>
              </div>
              <span class="arc-text-machine text-[var(--arc-text-muted)] truncate">
                {{ prov.model || 'Модель по умолчанию' }}
              </span>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              v-if="prov.routingStrategy !== 'fallback' && idx === 0"
              @click="makeFallback(prov)"
              class="text-xs font-mono px-2.5 py-1 rounded-[8px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] transition-colors cursor-pointer"
              title="Сделать запасным при сбое"
            >
              Сделать запасным
            </button>
            <button
              v-else
              @click="makePrimary(prov)"
              class="text-xs font-mono px-2.5 py-1 rounded-[8px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--status-ok)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.35)] transition-colors cursor-pointer"
              title="Назначить основным провайдером"
            >
              Сделать основным
            </button>

            <button
              :disabled="idx === 0"
              @click="movePriority(prov, 'up')"
              class="p-1 rounded-[6px] hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Поднять в очереди"
            >
              <ArrowUp class="w-3.5 h-3.5" />
            </button>
            <button
              :disabled="idx === sortedProviders.length - 1"
              @click="movePriority(prov, 'down')"
              class="p-1 rounded-[6px] hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Опустить в очереди"
            >
              <ArrowDown class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Threshold Setting for Cloud Escalation -->
    <div class="pt-3 border-t border-[var(--arc-hairline)] flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-xs font-medium text-[var(--arc-text-primary)]">Порог сложности для облака</span>
          <span class="arc-text-hint text-[var(--arc-text-secondary)]">Команды короче порога обрабатываются локально, длинные — передаются в облако</span>
        </div>
        <span class="arc-text-machine text-[var(--accent)] bg-[var(--arc-selected)] border border-[rgba(var(--accent-rgb),0.35)] px-2.5 py-0.5 rounded-[8px]">
          {{ settingsStore.smartRoutingThreshold }} симв.
        </span>
      </div>

      <ArcSlider 
        v-model="settingsStore.smartRoutingThreshold"
        :min="10" 
        :max="250" 
        :step="5"
        unit=" симв."
        :show-value="false"
      />

      <div class="flex justify-between arc-text-machine text-[var(--arc-text-muted)]">
        <span>10 симв (Больше в облако)</span>
        <span>80 симв (Баланс)</span>
        <span>250 симв (Больше локально)</span>
      </div>
    </div>
  </div>
</template>
