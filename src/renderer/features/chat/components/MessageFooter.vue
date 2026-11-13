<template>
  <div 
    v-if="hasContent" 
    class="mt-2.5 flex items-center flex-wrap gap-2 text-xs font-mono select-none relative z-10"
  >
    <!-- Tool Source Chips -->
    <template v-if="toolSource">
      <span 
        v-if="toolSource.tool === 'wikipedia'" 
        class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs text-[var(--arc-text-secondary)] font-mono"
        title="Источник информации: Wikipedia"
      >
        <BookOpen class="w-3 h-3 text-[var(--arc-text-machine)]" />
        <span>Wikipedia</span>
        <span v-if="toolSource.count !== undefined" class="text-[var(--arc-text-machine)] text-[10px] font-mono">
          ({{ toolSource.count }} {{ formatArticleCount(toolSource.count) }})
        </span>
      </span>

      <span 
        v-else-if="toolSource.tool === 'web_search'" 
        class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs text-[var(--arc-text-secondary)] font-mono"
        title="Источник информации: Поиск в сети"
      >
        <Globe class="w-3 h-3 text-[var(--arc-text-machine)]" />
        <span>Поиск</span>
        <span v-if="toolSource.count !== undefined" class="text-[var(--arc-text-machine)] text-[10px] font-mono">
          ({{ toolSource.count }} {{ formatResultCount(toolSource.count) }})
        </span>
      </span>

      <span 
        v-else-if="toolSource.tool?.includes('memory')" 
        class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs text-[var(--arc-text-secondary)] font-mono"
        title="Источник информации: Долгосрочная память"
      >
        <Sparkles class="w-3 h-3 text-[var(--arc-text-machine)]" />
        <span>Память</span>
        <span v-if="toolSource.count !== undefined" class="text-[var(--arc-text-machine)] text-[10px] font-mono">
          ({{ toolSource.count }} {{ formatRecordCount(toolSource.count) }})
        </span>
      </span>
    </template>

    <!-- Unified Meta & TTS Pill (local / cache / live LLM · TTS engine) -->
    <div 
      v-if="metaInfo"
      class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono transition-colors"
      :class="metaInfo.classes"
      :title="metaInfo.tooltip"
    >
      <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="metaInfo.dotClass"></span>
      <span>{{ metaInfo.text }}</span>
      <template v-if="ttsBadgeInfo">
        <span class="text-[var(--arc-text-muted)] select-none">·</span>
        <span class="text-[var(--arc-text-secondary)] font-mono">{{ ttsBadgeInfo.label }}</span>
        <HardDrive
          v-if="ttsBadgeInfo.isCached"
          class="w-3 h-3 shrink-0 text-[var(--arc-text-muted)]"
          title="Озвучено из кэша TTS"
        />
      </template>
    </div>

    <!-- Standalone TTS Pill if metaInfo is absent -->
    <div
      v-else-if="ttsBadgeInfo"
      class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-secondary)] transition-colors"
      :title="ttsBadgeInfo.tooltip"
    >
      <span>{{ ttsBadgeInfo.label }}</span>
      <HardDrive
        v-if="ttsBadgeInfo.isCached"
        class="w-3 h-3 shrink-0 text-[var(--arc-text-muted)]"
        title="Озвучено из кэша TTS"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToolSourceInfo } from '../../../../shared/types/models/chat';
import { BookOpen, Globe, Sparkles, HardDrive } from 'lucide-vue-next';

interface MessageMeta {
  provider?: string;
  model?: string;
  latency?: number;
  isCache?: boolean;
  source?: 'live' | 'cache' | 'local' | 'system';
  ttsEngine?: 'silero' | 'edge' | 'sapi';
  ttsCached?: boolean;
}

const props = defineProps<{
  meta?: MessageMeta;
  toolSource?: ToolSourceInfo;
}>();

const formatArticleCount = (c: number) => (c === 1 ? 'статья' : (c >= 2 && c <= 4 ? 'статьи' : 'статей'));
const formatResultCount = (c: number) => (c === 1 ? 'результат' : (c >= 2 && c <= 4 ? 'результата' : 'результатов'));
const formatRecordCount = (c: number) => (c === 1 ? 'запись' : (c >= 2 && c <= 4 ? 'записи' : 'записей'));

const formatProviderName = (name?: string) => {
  if (!name) return 'AI';
  const clean = name.trim();
  const base = clean.split(/[\/:]/)[0].toLowerCase();
  const map: Record<string, string> = {
    openrouter: 'OpenRouter', ollama: 'Ollama', groq: 'Groq', gigachat: 'GigaChat', freellmapi: 'FreeLLM', 
    openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', mistral: 'Mistral'
  };
  return map[base] || (base.charAt(0).toUpperCase() + base.slice(1));
};

const metaInfo = computed(() => {
  if (!props.meta) return null;
  const m = props.meta;

  if (m.source === 'system' || m.source === 'local' || !m.provider) {
    return {
      dotClass: 'bg-[var(--status-off)]',
      classes: 'text-[var(--arc-text-hint)]',
      text: 'системный ответ',
      tooltip: 'Локальная или системная обработка без ответа внешней LLM'
    };
  }

  if (m.source === 'cache' || m.isCache) {
    const lat = m.latency !== undefined ? `${m.latency} ms` : '12 ms';
    return {
      dotClass: 'bg-[var(--status-warn)]',
      classes: 'text-[var(--status-warn)]',
      text: `${lat} · кэш`,
      tooltip: `Семантический кэш · Задержка: ${lat}`
    };
  }

  const prov = formatProviderName(m.provider);
  const latencyStr = m.latency !== undefined ? `${(m.latency / 1000).toFixed(1)} s` : '';
  const providerModel = m.model ? `${prov} • ${m.model}` : prov;
  const text = latencyStr ? `${latencyStr} · ${providerModel}` : providerModel;

  return {
    dotClass: 'bg-[var(--status-ok)]',
    classes: 'text-[var(--arc-text-secondary)]',
    text,
    tooltip: `Провайдер: ${prov}${m.model ? ' · Модель: ' + m.model : ''} · Задержка: ${m.latency !== undefined ? m.latency + ' ms' : 'не указана'}`
  };
});

const ttsBadgeInfo = computed(() => {
  const engine = props.meta?.ttsEngine;
  if (!engine) return null;
  const isCached = Boolean(props.meta?.ttsCached);
  const labelMap: Record<'silero' | 'edge' | 'sapi', string> = {
    silero: 'Silero',
    edge: 'Edge',
    sapi: 'SAPI'
  };
  const label = labelMap[engine] || 'TTS';
  const classes = 'text-[var(--arc-text-secondary)]';
  const tooltip = `Синтез речи: ${label}${isCached ? ' (из кэша на диске)' : ''}`;
  return { label, isCached, classes, tooltip };
});

const hasContent = computed(() => !!props.toolSource || !!metaInfo.value || !!ttsBadgeInfo.value);
</script>
