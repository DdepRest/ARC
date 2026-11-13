<template>
  <SettingsBlock title="Кэши" subtitle="Точный кэш ответов LLM и буфер синтезированных аудиофайлов">
    <!-- 1. Smart Cache Master Toggle (moved from RoutingSection) -->
    <SettingsRow
      id="providers.smartCacheEnabled"
      label="Умное кэширование контекста"
      description="Кэшировать повторяющиеся одиночные запросы первого хода в SQLite для мгновенного отклика."
      data-search="умное кэширование контекста ответов llm smart cache prompt prefix sqlite"
    >
      <div class="flex items-center gap-3 shrink-0">
        <span class="text-xs font-mono tracking-wider uppercase text-[var(--arc-text-muted)]">
          {{ aiStore.smartCacheEnabled ? 'ВКЛ' : 'ВЫКЛ' }}
        </span>
        <ArcToggle
          v-model="aiStore.smartCacheEnabled"
          data-setting-id="providers.smartCacheEnabled"
          @update:model-value="(val: boolean) => { settingsStore.smartCacheEnabled = val; }"
        />
      </div>
    </SettingsRow>

    <!-- 2. LLM Response Cache Stats & Clear -->
    <SettingsRow
      id="system.storage.llmCache"
      label="Кэш ответов LLM"
      description="Точный кэш одиночных ответов (TTL 24 ч, до 500 записей / 50 МБ)."
      :tech="llmCacheTechText"
      data-search="кэш ответов llm smart cache sqlite ответы очистить"
    >
      <button
        type="button"
        :disabled="isClearingLlmCache"
        @click="clearLlmCache"
        class="px-4 py-1.5 text-xs font-mono tabular-nums font-medium rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] transition-all duration-200 cursor-pointer disabled:opacity-50"
      >
        {{ isClearingLlmCache ? 'Очистка...' : 'Очистить кэш LLM' }}
      </button>
    </SettingsRow>

    <!-- 3. Synthesized Audio Cache Stats & Clear (replaces stub with real TTS audio cache) -->
    <SettingsRow
      id="system.storage.cache"
      label="Кэш синтезированных аудиофайлов"
      description="Повторные фразы Silero TTS воспроизводятся мгновенно из памяти без повторной генерации."
      :tech="audioCacheTechText"
      data-search="кэш синтезированных аудиофайлов фраз audio cache tts звук голос очистить"
    >
      <button
        type="button"
        :disabled="isClearingAudioCache"
        @click="clearAudioCache"
        class="px-4 py-1.5 text-xs font-mono tabular-nums font-medium rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] transition-all duration-200 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
      >
        <Trash2 class="w-3.5 h-3.5 text-[var(--status-err)]" />
        <span>{{ isClearingAudioCache ? 'Очистка...' : 'Очистить кэш' }}</span>
      </button>
    </SettingsRow>

    <!-- Audio Cache Telemetry Grid -->
    <div class="px-4 sm:px-5 py-3.5 bg-[var(--arc-plane)]/40 flex flex-col gap-3">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
        <div class="p-3 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] flex flex-col gap-1">
          <span class="text-[var(--arc-text-muted)]">В памяти (RAM)</span>
          <span class="font-semibold text-[var(--arc-text-primary)]">{{ audioCacheStats.entries }} / {{ settingsStore.voiceCacheRamLimit }} фраз</span>
        </div>
        <div class="p-3 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] flex flex-col gap-1">
          <span class="text-[var(--arc-text-muted)]">На диске</span>
          <span class="font-semibold text-[var(--arc-text-primary)]">{{ formatAudioSize(audioCacheStats.sizeBytes) }} / {{ settingsStore.voiceCacheDiskLimitMb }} МБ</span>
        </div>
        <div class="p-3 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] flex flex-col gap-1">
          <span class="text-[var(--arc-text-muted)]">Попадания (Hits)</span>
          <span class="font-semibold text-[var(--status-ok)]">{{ audioCacheStats.hits }}</span>
        </div>
        <div class="p-3 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] flex flex-col gap-1">
          <span class="text-[var(--arc-text-muted)]">Новые (Misses)</span>
          <span class="font-semibold text-[var(--status-warn)]">{{ audioCacheStats.misses }}</span>
        </div>
      </div>
    </div>

    <!-- 4. Audio Cache Auto-Clear Toggle (moved from TTSSection) -->
    <SettingsRow
      id="settings.stt.auto_clear_cache"
      label="Автоочистка аудио-кэша (режим тестирования)"
      description="Автоматически сбрасывать кэш синтезированных фраз перед каждой новой репликой."
      data-search="автоочистка аудио-кэша кэш синтезированных фраз очистить кэш auto clear cache автосброс"
    >
      <div class="flex items-center gap-3 shrink-0">
        <span class="text-xs font-mono tracking-wider uppercase" :class="settingsStore.voiceAutoClearCache ? 'text-[var(--status-warn)]' : 'text-[var(--arc-text-muted)]'">
          {{ settingsStore.voiceAutoClearCache ? 'АВТОСБРОС: ВКЛ' : 'ВЫКЛ' }}
        </span>
        <ArcToggle
          v-model="settingsStore.voiceAutoClearCache"
          data-setting-id="settings.stt.auto_clear_cache"
        />
      </div>
    </SettingsRow>

    <div
      v-if="settingsStore.voiceAutoClearCache"
      class="px-4 sm:px-5 py-3 bg-[var(--arc-plane)] text-xs font-mono text-[var(--status-warn)] flex items-center gap-2.5"
    >
      <AlertTriangle class="w-4 h-4 text-[var(--status-warn)] shrink-0" />
      <span>Режим тестирования активен: аудио-кэш автоматически сбрасывается перед каждой фразой.</span>
    </div>

    <!-- CrossLinks Footer -->
    <div class="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-plane)]/40">
      <CrossLink
        label="Маршрутизация и оркестрация ИИ"
        tab="intelligence"
        sectionId="section-router"
      />
      <CrossLink
        label="Синтез речи (Silero TTS)"
        tab="voice"
        sectionId="section-tts"
      />
    </div>
  </SettingsBlock>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { useAiConfigStore } from '../../../../../stores/aiConfig';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import CrossLink from '../../primitives/CrossLink.vue';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import { Trash2, AlertTriangle } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
const aiStore = useAiConfigStore();

const isClearingLlmCache = ref(false);
const isClearingAudioCache = ref(false);

const llmCacheStats = ref<{ count: number; sizeBytes: number; oldestCreatedAt: number | null }>({
  count: 0,
  sizeBytes: 0,
  oldestCreatedAt: null
});

const audioCacheStats = ref({
  entries: 0,
  sizeBytes: 0,
  hits: 0,
  misses: 0,
  evictions: 0
});

const llmCacheTechText = computed(() => {
  const { count, sizeBytes, oldestCreatedAt } = llmCacheStats.value;
  if (!count || count <= 0) {
    return '0 зап. · 0.0 МБ';
  }
  const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
  if (oldestCreatedAt === null || oldestCreatedAt === undefined) {
    return `${count} зап. · ${mb} МБ`;
  }
  const hours = Math.max(1, Math.floor((Date.now() - oldestCreatedAt) / 3600000));
  return `${count} зап. · ${mb} МБ · старейшая ${hours} ч назад`;
});

const formatAudioSize = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0.0 МБ';
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
};

const audioCacheTechText = computed(() => {
  const { entries, sizeBytes, hits, misses } = audioCacheStats.value;
  if (!entries || entries <= 0) {
    return `0 фраз · 0.0 МБ · Hits: ${hits} / Misses: ${misses}`;
  }
  return `${entries} фраз · ${formatAudioSize(sizeBytes)} · Hits: ${hits} / Misses: ${misses}`;
});

async function loadLlmCacheStats() {
  try {
    const api = (window as any).api;
    if (api && typeof api.getLlmCacheStats === 'function') {
      const stats = await api.getLlmCacheStats();
      if (stats && typeof stats.count === 'number') {
        llmCacheStats.value = {
          count: stats.count,
          sizeBytes: Number(stats.sizeBytes) || 0,
          oldestCreatedAt: stats.oldestCreatedAt ?? null
        };
      }
    }
  } catch (err) {
    console.warn('[CacheSettingsBlock] Failed to load LLM cache stats:', err);
  }
}

async function loadAudioCacheStats() {
  try {
    const api = (window as any).api;
    if (api && typeof api.getCacheStats === 'function') {
      const stats = await api.getCacheStats();
      if (stats) {
        audioCacheStats.value = {
          entries: Number(stats.entries) || 0,
          sizeBytes: Number(stats.sizeBytes) || 0,
          hits: Number(stats.hits) || 0,
          misses: Number(stats.misses) || 0,
          evictions: Number(stats.evictions) || 0
        };
      }
    }
  } catch (err) {
    console.warn('[CacheSettingsBlock] Failed to load audio cache stats:', err);
  }
}

async function clearLlmCache() {
  if (isClearingLlmCache.value) return;
  isClearingLlmCache.value = true;
  try {
    const api = (window as any).api;
    if (api && typeof api.clearLlmCache === 'function') {
      await api.clearLlmCache();
    }
    await loadLlmCacheStats();
  } catch (err) {
    console.warn('[CacheSettingsBlock] Failed to clear LLM cache:', err);
  } finally {
    isClearingLlmCache.value = false;
  }
}

async function clearAudioCache() {
  if (isClearingAudioCache.value) return;
  isClearingAudioCache.value = true;
  try {
    const api = (window as any).api;
    if (api && typeof api.clearAudioCache === 'function') {
      await api.clearAudioCache();
    } else if (api && typeof api.clearCache === 'function') {
      await api.clearCache();
    }
    await loadAudioCacheStats();
  } catch (err) {
    console.warn('[CacheSettingsBlock] Failed to clear audio cache:', err);
  } finally {
    setTimeout(() => {
      isClearingAudioCache.value = false;
    }, 300);
  }
}

async function clearAllCaches() {
  await Promise.all([clearLlmCache(), clearAudioCache()]);
}

let statsInterval: number | undefined;

onMounted(() => {
  loadLlmCacheStats();
  loadAudioCacheStats();
  if (typeof window !== 'undefined') {
    statsInterval = window.setInterval(() => {
      loadAudioCacheStats();
    }, 5000);
  }
});

onUnmounted(() => {
  if (statsInterval) clearInterval(statsInterval);
});

defineExpose({
  clearLlmCache,
  clearAudioCache,
  clearAllCaches
});
</script>
