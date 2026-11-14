<template>
  <section 
    id="section-models" 
    class="scroll-mt-14 flex flex-col gap-10 text-[var(--arc-text-primary)] font-sans"
  >
    <!-- Уровень 1: Workspace Header + Аппаратный профиль памяти -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Интеллект · Подсистема 04"
      title="Модели и загрузки"
      description="Централизованный каталог языковых (GGUF) и речевых (STT/TTS) моделей, оценка аппаратной совместимости по памяти и управление локальными весами."
      :statusLabel="modelsHeaderStatus.label"
      :statusTone="modelsHeaderStatus.tone"
      :blockCountText="compatibleCount !== null ? `${compatibleCount} из ${totalModelsCount} совместимо` : `— из ${totalModelsCount} · память не определена`"
      :icon="HardDrive"
    >
      <template #summary>
        <div
          id="models.hub"
          data-setting-id="models.hub"
          data-search="model hub модели загрузки веса vram озу квантование"
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] font-mono text-xs tabular-nums"
          :style="{
            boxShadow: 'var(--arc-well-shadow)'
          }"
        >
          <!-- Колонка 1: ОЗУ системы -->
          <div class="flex flex-col gap-1 px-2.5">
            <span class="text-[var(--arc-text-hint)]">Оперативная память (ОЗУ)</span>
            <span v-if="systemRamGb !== null" class="text-sm font-semibold text-[var(--status-ok)]">
              {{ systemRamGb }} ГБ <span class="text-xs font-normal text-[var(--arc-text-hint)]">Установлено ОЗУ</span>
            </span>
            <span v-else class="text-sm font-semibold text-[var(--arc-text-muted)]">
              — <span class="text-xs font-normal text-[var(--arc-text-hint)]">Установлено ОЗУ</span>
            </span>
          </div>

          <!-- Колонка 2: Видеопамять (VRAM) -->
          <div class="flex flex-col gap-1 px-2.5 sm:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-hint)]">Видеопамять (VRAM)</span>
            <span class="text-sm font-semibold" :class="systemVramGb && systemVramGb > 0 ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)]'">
              {{ systemVramGb && systemVramGb > 0 ? `${systemVramGb} ГБ GPU` : (systemRamGb !== null ? 'Общий пул ОЗУ' : 'Не определено') }}
            </span>
          </div>

          <!-- Колонка 3: Установленные веса -->
          <div class="flex flex-col gap-1 px-2.5 lg:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-hint)]">Установлено на диске</span>
            <span class="text-sm font-semibold" :class="diskCheckStatus === 'ERROR' ? 'text-[var(--status-err)]' : diskCheckStatus === 'UNAVAILABLE' ? 'text-[var(--status-warn)]' : 'text-[var(--arc-text-primary)]'">
              <template v-if="diskCheckStatus === 'UNAVAILABLE'">IPC недоступен</template>
              <template v-else-if="diskCheckStatus === 'ERROR'">Ошибка чтения</template>
              <template v-else-if="diskCheckStatus === 'CHECKING'">Проверка...</template>
              <template v-else>{{ installedQuantsCount }} <span class="text-xs font-normal text-[var(--arc-text-hint)]">проверено на диске</span></template>
            </span>
          </div>

          <!-- Колонка 4: Профиль расчёта совместимости -->
          <div class="flex flex-col gap-1 px-2.5 sm:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-hint)]">Целевой контур расчёта</span>
            <div v-if="systemVramGb && systemVramGb > 0" class="flex items-center gap-1.5">
              <button
                type="button"
                @click="useGpuCalc = true"
                :class="useGpuCalc ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)]' : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
                class="px-2 py-0.5 rounded-[6px] text-xs font-mono font-semibold border transition-colors cursor-pointer"
              >
                ГП ({{ systemVramGb }} ГБ)
              </button>
              <button
                type="button"
                @click="useGpuCalc = false"
                :class="!useGpuCalc ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)]' : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
                class="px-2 py-0.5 rounded-[6px] text-xs font-mono font-semibold border transition-colors cursor-pointer"
              >
                ЦП ({{ systemRamGb !== null ? `${systemRamGb} ГБ` : '—' }})
              </button>
            </div>
            <span v-else-if="targetMemoryGb !== null" class="text-sm font-semibold text-[var(--arc-text-secondary)]">
              ЦП / ОЗУ ({{ targetMemoryGb }} ГБ)
            </span>
            <span v-else class="text-sm font-semibold text-[var(--arc-text-muted)]">
              Профиль не определён
            </span>
          </div>
        </div>
      </template>
    </SettingsSectionHeader>

    <!-- Уровень 2: Функциональная группа 1 — Активные загрузки и состояние хранилища -->
    <SettingsGroup
      indexLabel="01"
      title="Очередь загрузок и состояние весов"
      description="Контроль текущих потоков скачивания моделей и проверка установленных архивов на диске."
    >
      <!-- Активная панель скачивания (LLM или STT) -->
      <div
        v-if="hasAnyActiveDownload"
        class="p-4 rounded-[16px] bg-[var(--arc-block)] border flex flex-col gap-2.5"
        :class="downloadStore.isPausedForVoice ? 'border-[var(--status-warn)]/40' : 'border-[var(--status-ok)]/35'"
        :style="{
          background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)'
        }"
      >
        <div class="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
          <span :class="downloadStore.isPausedForVoice ? 'text-[var(--status-warn)]' : 'text-[var(--status-ok)]'" class="flex items-center gap-2 min-w-0">
            <Loader2 class="w-4 h-4 shrink-0" :class="downloadStore.isPausedForVoice ? 'text-[var(--status-warn)]' : 'animate-spin'" />
            <span v-if="downloadStore.isPausedForVoice" class="font-bold text-[var(--status-warn)] truncate">Загрузка приостановлена: активен голосовой ввод</span>
            <span v-else class="font-semibold text-[var(--arc-text-primary)] truncate">Загрузка файла: {{ activeDownloadLabel }}</span>
          </span>
          <div class="flex items-center gap-2.5 shrink-0">
            <span class="text-[var(--arc-text-primary)] font-bold">{{ activeDownloadPercent }}%</span>
            <button
              type="button"
              @click="cancelActiveDownload"
              class="px-2.5 py-0.5 rounded-[7px] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--status-err)] text-xs font-mono uppercase transition cursor-pointer"
            >
              Отменить
            </button>
          </div>
        </div>

        <div class="w-full h-2 bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-full overflow-hidden">
          <div
            class="h-full transition duration-300 rounded-full"
            :class="downloadStore.isPausedForVoice ? 'bg-[var(--status-warn)]' : 'bg-[var(--status-ok)]'"
            :style="{ width: activeDownloadPercent + '%' }"
          ></div>
        </div>

        <div class="flex justify-between items-center text-xs font-mono text-[var(--arc-text-muted)] tabular-nums">
          <span>Скорость: {{ downloadStore.isPausedForVoice ? '0 КБ/с (Пауза)' : downloadStore.downloadSpeedFormatted }}</span>
          <span>{{ downloadStore.isPausedForVoice ? 'Приоритет канала: Голос' : `Осталось: ${downloadStore.estimatedTimeFormatted}` }}</span>
        </div>
      </div>

      <!-- Панель статуса хранилища весов (когда нет активных загрузок) -->
      <div
        v-else
        class="p-4 rounded-[16px] bg-[var(--arc-block)] border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        :class="diskCheckStatus === 'ERROR' ? 'border-[var(--status-err)]/40' : diskCheckStatus === 'UNAVAILABLE' ? 'border-[var(--status-warn)]/35' : 'border-[var(--arc-hairline)]'"
        :style="{
          background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)'
        }"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div class="p-2 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] shrink-0" :class="diskBannerStyle.iconCls">
            <AlertTriangle v-if="diskCheckStatus === 'ERROR' || diskCheckStatus === 'UNAVAILABLE'" class="w-4 h-4" />
            <RefreshCw v-else-if="diskCheckStatus === 'CHECKING'" class="w-4 h-4 animate-spin" />
            <Cpu v-else class="w-4 h-4" />
          </div>
          <div class="flex flex-col gap-0.5 min-w-0">
            <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] uppercase">
              {{ diskBannerStyle.title }}
            </span>
            <span class="text-xs text-[var(--arc-text-hint)]">
              {{ diskBannerStyle.subtitle }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2.5 shrink-0 self-start sm:self-center flex-wrap">
          <button
            type="button"
            @click="checkAllStatuses"
            :disabled="diskCheckStatus === 'CHECKING'"
            class="px-3 py-1.5 rounded-[10px] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': diskCheckStatus === 'CHECKING' }" />
            <span>{{ diskCheckStatus === 'CHECKING' ? 'ПРОВЕРКА...' : 'ПРОВЕРИТЬ ДИСК' }}</span>
          </button>
          <button
            v-if="canOpenDataFolder"
            type="button"
            @click="openDataFolder"
            class="px-3 py-1.5 rounded-[10px] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] flex items-center gap-1.5 transition cursor-pointer"
            title="Открыть каталог данных приложения"
          >
            <FolderOpen class="w-3.5 h-3.5" />
            <span>ПАПКА ДАННЫХ</span>
          </button>
          <CrossLink
            label="Рантаймы (Локальный ИИ)"
            tab="intelligence"
            sectionId="section-local"
          />
        </div>
      </div>

      <!-- Сообщение об ошибке загрузки, если возникло -->
      <div
        v-if="downloadActionError"
        class="px-3.5 py-2.5 rounded-[12px] bg-[var(--arc-block)] border border-[var(--status-err)]/35 text-xs font-mono text-[var(--status-err)] flex items-center gap-2"
      >
        <AlertTriangle class="w-4 h-4 shrink-0" />
        <span>{{ downloadActionError }}</span>
      </div>
    </SettingsGroup>

    <!-- Уровень 2: Функциональная группа 2 — Каталог моделей и фильтрация -->
    <SettingsGroup
      indexLabel="02"
      title="Каталог моделей и совместимость"
      description="Выберите категорию модели, отфильтруйте по объёму памяти и скачайте подходящую квантизацию."
      :badgeText="`Показано: ${filteredModels.length} из ${totalModelsCount}`"
    >
      <!-- Панель фильтрации и поиска -->
      <div
        class="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between p-3.5 rounded-[16px] bg-[var(--arc-block)] border border-[var(--arc-hairline)]"
        :style="{
          background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
        }"
      >
        <!-- Табы типов моделей + Поиск -->
        <div class="flex flex-wrap items-center gap-2.5">
          <div class="flex gap-1 bg-[var(--arc-plane)] p-1 rounded-[10px] border border-[var(--arc-hairline)] overflow-x-auto max-w-full">
            <button
              v-for="f in filters"
              :key="f.id"
              type="button"
              @click="activeFilter = f.id"
              class="px-3 py-1 rounded-[7px] text-xs font-mono font-bold tracking-wide uppercase transition shrink-0 cursor-pointer"
              :class="activeFilter === f.id
                ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border border-[var(--accent)]/40'
                : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] border border-transparent'"
            >
              {{ f.name }}
            </button>
          </div>

          <input
            v-model="searchQuery"
            type="text"
            placeholder="Поиск модели или вендора..."
            class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 text-xs text-[var(--arc-text-primary)] font-mono focus:outline-none focus:border-[var(--accent)] w-full sm:w-64"
          />
        </div>

        <!-- Сортировка, фильтр размера и чекбокс совместимости -->
        <div class="flex flex-wrap items-center gap-2.5">
          <div class="w-48 shrink-0">
            <ArcSelect
              size="sm"
              :model-value="sortBy"
              :options="[
                { label: 'Сортировка: По качеству', value: 'quality' },
                { label: 'Сортировка: По скорости', value: 'speed' },
                { label: 'Сортировка: По размеру', value: 'size' }
              ]"
              @update:model-value="setSortBy"
            />
          </div>

          <div class="w-36 shrink-0">
            <ArcSelect
              size="sm"
              :model-value="sizeFilter"
              :options="[
                { label: 'Любой размер', value: 'all' },
                { label: 'До 1 ГБ', value: '<1' },
                { label: '1–4 ГБ', value: '1-4' },
                { label: '4–8 ГБ', value: '4-8' },
                { label: '8+ ГБ', value: '>8' }
              ]"
              @update:model-value="setSizeFilter"
            />
          </div>

          <label
            class="flex items-center gap-2 bg-[var(--arc-input)] px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] transition select-none"
            :class="targetMemoryGb === null ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-[var(--arc-border-focus,var(--arc-hairline))]'"
            :title="targetMemoryGb === null ? 'Недостаточно данных о памяти устройства для фильтрации' : 'Показать только совместимые по памяти модели'"
          >
            <input type="checkbox" v-model="onlyCompatible" :disabled="targetMemoryGb === null" class="hidden" />
            <div
              class="w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition"
              :class="onlyCompatible && targetMemoryGb !== null ? 'bg-[var(--arc-selected)] border-[var(--status-ok)] text-[var(--status-ok)]' : 'border-[var(--arc-hairline)] text-transparent'"
            >
              <CheckCircle class="w-2.5 h-2.5" />
            </div>
            <span class="text-xs font-mono text-[var(--arc-text-secondary)] uppercase tabular-nums">
              {{ compatibleCount !== null ? `Совместимые (${compatibleCount}/${totalModelsCount})` : `Совместимые (—/${totalModelsCount})` }}
            </span>
          </label>
        </div>
      </div>

      <!-- Пустое состояние фильтрации -->
      <div
        v-if="filteredModels.length === 0"
        class="py-9 px-4 rounded-[16px] border border-dashed border-[var(--arc-hairline)] bg-[var(--arc-plane)] text-center flex flex-col items-center gap-2.5"
      >
        <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] uppercase">
          Модели по заданным фильтрам не найдены
        </span>
        <span class="text-xs text-[var(--arc-text-hint)]">
          Попробуйте изменить поисковый запрос, категорию или отключить фильтр строгой совместимости по памяти.
        </span>
        <button
          type="button"
          @click="resetFilters"
          class="mt-1 px-3 py-1.5 rounded-[10px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-primary)] uppercase cursor-pointer transition"
        >
          Сбросить фильтры
        </button>
      </div>

      <!-- Сетка карточек моделей -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ModelCard
          v-for="model in filteredModels"
          :key="model.id"
          :model="model"
          :target-memory-gb="targetMemoryGb"
          :tts-verification-status="ttsVerificationStatus"
          :download-state="downloadState"
          :confirm-low-ram="confirmLowRam"
          :is-quant-downloading="isQuantDownloading"
          :get-quant-progress="getQuantProgress"
          :download-quant="downloadQuant"
        />
      </div>
    </SettingsGroup>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { MODEL_REGISTRY, type ModelType } from './model-hub.registry';
import { useModelHubSession, getQuantCompatibility } from '../../composables/useModelHubSession';
import SettingsSectionHeader from '../SettingsSectionHeader.vue';
import SettingsGroup from '../primitives/SettingsGroup.vue';
import CrossLink from '../primitives/CrossLink.vue';
import ArcSelect from '../../../../components/ui/ArcSelect.vue';
import ModelCard from './models/ModelCard.vue';
import { Cpu, CheckCircle, Loader2, HardDrive, RefreshCw, AlertTriangle, FolderOpen } from 'lucide-vue-next';

const {
  downloadStore,
  systemRamGb,
  systemVramGb,
  useGpuCalc,
  targetMemoryGb,
  diskCheckStatus,
  diskCheckError,
  downloadState,
  sttDownloadState,
  ttsVerificationStatus,
  confirmLowRam,
  downloadActionError,
  installedQuantsCount,
  compatibleCount,
  isQuantDownloading,
  getQuantProgress,
  cancelActiveDownload,
  checkAllStatuses,
  downloadQuant,
  initializeSession
} = useModelHubSession();

const activeFilter = ref<ModelType | 'all'>('all');
const searchQuery = ref('');
const sortBy = ref<'quality' | 'speed' | 'size'>('quality');
const sizeFilter = ref<'all' | '<1' | '1-4' | '4-8' | '>8'>('all');
const onlyCompatible = ref(false);

const setSortBy = (val: string) => { sortBy.value = val as 'quality' | 'speed' | 'size'; };
const setSizeFilter = (val: string) => { sizeFilter.value = val as 'all' | '<1' | '1-4' | '4-8' | '>8'; };

const filters = [
  { id: 'all', name: 'Все' },
  { id: 'llm-gguf', name: 'LLM' },
  { id: 'stt-streaming', name: 'STT' },
  { id: 'tts', name: 'TTS' }
] as const;

const resetFilters = () => {
  activeFilter.value = 'all';
  searchQuery.value = '';
  sizeFilter.value = 'all';
  onlyCompatible.value = false;
};

const totalModelsCount = computed(() => MODEL_REGISTRY.length);
const canOpenDataFolder = computed(() => typeof window !== 'undefined' && typeof (window.api as any)?.openDataFolder === 'function');
const openDataFolder = () => {
  if (canOpenDataFolder.value) (window.api as any).openDataFolder().catch(() => {});
};

const activeSttDownload = computed(() => {
  const entries = Object.entries(sttDownloadState.value);
  const found = entries.find(([, v]) => v?.downloading);
  return found ? { id: found[0], ...found[1] } : null;
});

const hasAnyActiveDownload = computed(() => downloadStore.isDownloading || Boolean(activeSttDownload.value));
const activeDownloadLabel = computed(() => activeSttDownload.value?.id || downloadStore.currentFilename || 'модель');
const activeDownloadPercent = computed(() => {
  if (activeSttDownload.value) return String(Math.round(activeSttDownload.value.percent || 0));
  return downloadStore.progressPercent;
});

const modelsHeaderStatus = computed(() => {
  if (hasAnyActiveDownload.value) {
    return {
      label: downloadStore.isPausedForVoice ? 'ПАУЗА (ГОЛОС)' : `ЗАГРУЗКА ${activeDownloadPercent.value}%`,
      tone: 'warn' as const
    };
  }
  if (diskCheckStatus.value === 'CHECKING') return { label: 'ПРОВЕРКА ДИСКА', tone: 'warn' as const };
  if (diskCheckStatus.value === 'ERROR') return { label: 'ОШИБКА ДИСКА', tone: 'err' as const };
  if (diskCheckStatus.value === 'UNAVAILABLE') return { label: 'IPC НЕДОСТУПЕН', tone: 'warn' as const };
  if (diskCheckStatus.value === 'SYNCED') return { label: `НА ДИСКЕ: ${installedQuantsCount.value}`, tone: 'ok' as const };
  return { label: 'НЕ ПРОВЕРЕНО', tone: 'off' as const };
});

const diskBannerStyle = computed(() => {
  if (diskCheckStatus.value === 'CHECKING') {
    return {
      iconCls: 'text-[var(--status-warn)]',
      title: 'Проверка каталога моделей...',
      subtitle: 'Сканирование установленных GGUF/STT весов и проверка статуса подсистем.'
    };
  }
  if (diskCheckStatus.value === 'ERROR') {
    return {
      iconCls: 'text-[var(--status-err)]',
      title: 'Ошибка проверки локального хранилища',
      subtitle: diskCheckError.value || 'Не удалось прочитать файлы моделей на диске.'
    };
  }
  if (diskCheckStatus.value === 'UNAVAILABLE') {
    return {
      iconCls: 'text-[var(--status-warn)]',
      title: 'Локальная проверка недоступна (режим предпросмотра)',
      subtitle: 'Файловая система Electron IPC недоступна в текущем браузерном окружении.'
    };
  }
  if (diskCheckStatus.value === 'SYNCED') {
    const memLabel = targetMemoryGb.value !== null
      ? `Совместимость под ${targetMemoryGb.value} ГБ (${useGpuCalc.value && systemVramGb.value ? 'VRAM' : 'ОЗУ'}).`
      : 'Профиль памяти не определён (совместимость помечена как неизвестная).';
    return {
      iconCls: 'text-[var(--status-ok)]',
      title: 'Активных загрузок нет · Хранилище синхронизировано',
      subtitle: `Проверено на диске: ${installedQuantsCount.value}. ${memLabel}`
    };
  }
  return {
    iconCls: 'text-[var(--arc-text-muted)]',
    title: 'Состояние хранилища не проверено',
    subtitle: 'Нажмите «Проверить диск» для сканирования установленных моделей.'
  };
});

const filteredModels = computed(() => {
  let list = MODEL_REGISTRY;
  if (activeFilter.value !== 'all') list = list.filter(m => m.type === activeFilter.value);
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(m => m.name.toLowerCase().includes(q) || m.vendor.toLowerCase().includes(q));
  }
  if (onlyCompatible.value && targetMemoryGb.value !== null) {
    list = list.filter(m => m.quants.some(q => getQuantCompatibility(q.minRamGb, targetMemoryGb.value) === 'COMPATIBLE'));
  }
  if (sizeFilter.value !== 'all') {
    list = list.filter(m => {
      const minSize = Math.min(...m.quants.map(q => q.sizeBytes));
      const gb = minSize / (1024 * 1024 * 1024);
      if (sizeFilter.value === '<1') return gb < 1;
      if (sizeFilter.value === '1-4') return gb >= 1 && gb <= 4;
      if (sizeFilter.value === '4-8') return gb > 4 && gb <= 8;
      if (sizeFilter.value === '>8') return gb > 8;
      return true;
    });
  }
  return [...list].sort((a, b) => {
    if (sortBy.value === 'quality') return b.qualityStars - a.qualityStars;
    if (sortBy.value === 'speed') return b.speedStars - a.speedStars;
    if (sortBy.value === 'size') {
      const minA = Math.min(...a.quants.map(q => q.sizeBytes));
      const minB = Math.min(...b.quants.map(q => q.sizeBytes));
      return minA - minB;
    }
    return 0;
  });
});

onMounted(() => {
  initializeSession();
});
</script>
