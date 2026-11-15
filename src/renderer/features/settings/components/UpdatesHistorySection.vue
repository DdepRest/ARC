<template>
  <div
    class="settings-scroll-container flex-1 min-h-0 h-full overflow-y-auto arc-scroll bg-transparent text-[var(--arc-text-primary)] px-3 sm:px-6 md:pl-10 md:pr-8 lg:pl-12 lg:pr-10 pt-5 sm:pt-7 pb-24 select-none"
    @scroll="(e) => handleViewScroll('updates', e)"
  >
    <div class="max-w-[1120px] w-full mx-auto flex flex-col gap-7 pb-12">
      <SettingsSectionHeader
        variant="workspace"
        :categoryLabel="isEn ? 'Updates · Subsystem 01' : 'Обновления · Подсистема 01'"
        :title="isEn ? 'A.R.C. Updates & Release History' : 'История обновлений A.R.C.'"
        :description="isEn
          ? 'Complete architectural log of platform releases, voice pipeline upgrades, and core stability fixes.'
          : 'Полный журнал релизов платформы, улучшений голосового тракта Silero/GigaAM и исправлений стабильности ядра.'"
        :statusLabel="headerStatus.label"
        :statusTone="headerStatus.tone"
        :blockCountText="isEn ? '2 functional groups' : '2 функциональные группы'"
        :icon="Sparkles"
      >
        <template #actions>
          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href="/arc-system-tests.html"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[var(--arc-rail)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer no-underline"
              :title="isEn ? 'Open QA system test suite' : 'Открыть чеклист физ-тестирования'"
            >
              <ClipboardList class="w-3.5 h-3.5 text-[var(--status-ok)]" />
              <span>{{ isEn ? 'QA Tests' : 'Физ-тесты' }}</span>
            </a>

            <button
              type="button"
              @click="checkForUpdates"
              :disabled="isChecking"
              class="flex items-center gap-2 px-3.5 py-1.5 rounded-[10px] bg-[var(--arc-rail)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-primary)] transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw class="w-3.5 h-3.5 text-[var(--accent)]" :class="isChecking ? 'animate-spin' : ''" />
              <span>{{ isChecking ? (isEn ? 'Checking...' : 'Проверка...') : (isEn ? 'Check Updates' : 'Проверить обновления') }}</span>
            </button>

            <button
              type="button"
              @click="copyLatestReleaseNotes"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[var(--arc-rail)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition cursor-pointer"
              :title="isEn ? 'Copy release notes' : 'Скопировать описание релиза'"
            >
              <Check v-if="copied" class="w-3.5 h-3.5 text-[var(--status-ok)]" />
              <Copy v-else class="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{{ copied ? (isEn ? 'Copied' : 'Скопировано') : (isEn ? 'Copy Log' : 'Копировать') }}</span>
            </button>
          </div>
        </template>
        <template #summary>
          <SettingsSummaryStrip :items="summaryItems" />
        </template>
      </SettingsSectionHeader>

      <!-- Group 01: Current Build Status -->
      <section id="section-updates-latest" class="scroll-mt-14">
        <SettingsGroup
          indexLabel="01"
          :title="isEn ? 'Active Core Build Telemetry' : 'Паспорт активной сборки ядра'"
          :description="isEn ? 'Installed version verification and voice pipeline baseline' : 'Верификация установленного билда и эталонных моделей речевого контура'"
          :badgeText="`v${CURRENT_ARC_VERSION}`"
        >
          <div class="rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] p-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[var(--arc-text-muted)]">
            <div class="flex flex-wrap items-center gap-2">
              <span class="w-2 h-2 rounded-full shrink-0" :class="presentation.dotClass"></span>
              <span :class="presentation.textClass">{{ presentation.statusText }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ isEn ? 'Releases logged:' : 'Версий в журнале:' }} {{ ARC_RELEASES.length }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ isEn ? 'Total changes:' : 'Всего изменений:' }} {{ totalChangesCount }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span>STT: GigaAM CTC 220M</span>
              <span aria-hidden="true">·</span>
              <span>TTS: Silero v5.6</span>
            </div>
          </div>
        </SettingsGroup>
      </section>

      <!-- Group 02: Filter & Timeline -->
      <section id="section-updates-timeline" class="scroll-mt-14">
        <SettingsGroup
          indexLabel="02"
          :title="isEn ? 'Release Architecture Log' : 'Хронология релизов и изменений'"
          :description="isEn ? 'Filterable changelog across core, voice, and UI subsystems' : 'Фильтруемый реестр модификаций по подсистемам ядра, голоса и интерфейса'"
          :badgeText="`${filteredReleases.length} / ${ARC_RELEASES.length}`"
        >
          <div class="flex flex-col gap-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[12px] p-3">
              <div class="flex flex-wrap items-center gap-1 bg-[var(--arc-rail)] p-1 rounded-[10px] border border-[var(--arc-hairline)]">
                <button
                  v-for="tab in UPDATE_FILTER_OPTIONS"
                  :key="tab.id"
                  type="button"
                  @click="activeFilter = tab.id"
                  class="px-3 py-1.5 rounded-[8px] text-xs font-mono transition cursor-pointer"
                  :class="activeFilter === tab.id
                    ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] font-semibold border border-[var(--arc-hairline)]'
                    : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
                >
                  {{ isEn ? tab.labelEn : tab.labelRu }}
                </button>
              </div>

              <div class="relative w-full sm:w-64">
                <input
                  v-model="filterQuery"
                  type="text"
                  :placeholder="isEn ? 'Filter by version or module...' : 'Поиск по версии или узлу...'"
                  class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[10px] pl-8 pr-7 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] outline-none transition"
                />
                <Search class="w-3.5 h-3.5 text-[var(--arc-text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <button
                  v-if="filterQuery"
                  type="button"
                  @click="filterQuery = ''"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] cursor-pointer"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div
              v-if="filteredReleases.length === 0"
              class="rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] p-8 text-center flex flex-col items-center gap-2"
            >
              <span class="text-sm font-sans text-[var(--arc-text-primary)]">
                {{ isEn ? 'No matching release entries found' : 'Записи в журнале обновлений не найдены' }}
              </span>
              <span class="text-xs font-mono text-[var(--arc-text-muted)]">
                {{ isEn ? 'Try clearing the search filter or selecting All categories.' : 'Попробуйте сбросить поисковый запрос или выбрать категорию «Все».' }}
              </span>
            </div>

            <div
              v-for="rel in filteredReleases"
              :key="rel.version"
              class="rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] overflow-hidden transition"
            >
              <div
                @click="toggleExpand(rel.version)"
                class="p-5 flex items-start justify-between gap-4 cursor-pointer hover:bg-[var(--arc-hover)] transition border-b border-[var(--arc-divider)]"
              >
                <div class="flex flex-col gap-1.5 min-w-0">
                  <div class="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--arc-text-muted)]">
                    <span class="text-[var(--accent)] font-semibold">v{{ rel.version }}</span>
                    <span aria-hidden="true">·</span>
                    <span>{{ isEn ? rel.dateEn : rel.dateRu }}</span>
                    <span aria-hidden="true">·</span>
                    <span>build {{ rel.buildHash }}</span>
                    <template v-if="rel.version === CURRENT_ARC_VERSION">
                      <span aria-hidden="true">·</span>
                      <span class="text-[var(--status-ok)]">{{ isEn ? 'INSTALLED' : 'УСТАНОВЛЕНО' }}</span>
                    </template>
                  </div>

                  <h3 class="text-base font-sans font-semibold text-[var(--arc-text-primary)]">
                    {{ isEn ? rel.titleEn : rel.titleRu }}
                  </h3>

                  <p class="text-xs font-sans text-[var(--arc-text-secondary)] leading-relaxed">
                    {{ isEn ? rel.summaryEn : rel.summaryRu }}
                  </p>
                </div>

                <button
                  type="button"
                  class="p-1.5 rounded-[8px] bg-[var(--arc-rail)] border border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] shrink-0 mt-1 cursor-pointer"
                  :aria-label="expandedVersions[rel.version] ? 'Collapse' : 'Expand'"
                >
                  <ChevronDown
                    class="w-4 h-4 transition-transform duration-200"
                    :class="expandedVersions[rel.version] ? 'rotate-180 text-[var(--accent)]' : ''"
                  />
                </button>
              </div>

              <div v-if="expandedVersions[rel.version]" class="p-5 flex flex-col gap-4 bg-[var(--arc-plane)]">
                <div class="rounded-[12px] bg-[var(--arc-rail)] border border-[var(--arc-hairline)] p-4 flex flex-col gap-2">
                  <div class="text-xs font-mono text-[var(--arc-text-muted)]">
                    {{ isEn ? 'Key Highlights' : 'Ключевые изменения релиза' }}
                  </div>
                  <ul class="flex flex-col gap-1.5">
                    <li
                      v-for="(hl, idx) in (isEn ? rel.highlightsEn : rel.highlightsRu)"
                      :key="idx"
                      class="flex items-start gap-2.5 text-xs font-sans text-[var(--arc-text-primary)]"
                    >
                      <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-1.5 shrink-0"></span>
                      <span>{{ hl }}</span>
                    </li>
                  </ul>
                </div>

                <div class="flex flex-col divide-y divide-[var(--arc-divider)] border border-[var(--arc-hairline)] rounded-[12px] bg-[var(--arc-block)]">
                  <div
                    v-for="item in rel.filteredChanges"
                    :key="item.id"
                    class="p-3.5 flex flex-col gap-1"
                  >
                    <div class="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="CHANGE_TYPE_META[item.type].dotClass"></span>
                      <span :class="CHANGE_TYPE_META[item.type].textClass">{{ isEn ? CHANGE_TYPE_META[item.type].labelEn : CHANGE_TYPE_META[item.type].labelRu }}</span>
                      <span class="text-[var(--arc-text-muted)]" aria-hidden="true">·</span>
                      <span class="text-[var(--arc-text-muted)]">{{ item.subsystem }}</span>
                    </div>
                    <div class="text-xs font-sans font-semibold text-[var(--arc-text-primary)]">
                      {{ isEn ? item.titleEn : item.titleRu }}
                    </div>
                    <div class="text-xs font-sans text-[var(--arc-text-secondary)] leading-relaxed">
                      {{ isEn ? item.detailsEn : item.detailsRu }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SettingsGroup>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettingsStore } from '../stores/settings.store';
import { useSettingsNav } from '../composables/useSettingsNav';
import SettingsSectionHeader from './SettingsSectionHeader.vue';
import SettingsGroup from './primitives/SettingsGroup.vue';
import SettingsSummaryStrip from './primitives/SettingsSummaryStrip.vue';
import { ARC_RELEASES, CURRENT_ARC_VERSION, CURRENT_ARC_BUILD } from '../config/releases.registry';
import {
  UPDATE_FILTER_OPTIONS,
  CHANGE_TYPE_META,
  getUpdatesPresentation,
  filterReleaseEntries,
  type UpdatesFilterId,
  type UpdateCheckState
} from '../logic/updates-status';
import { RefreshCw, Copy, Check, Search, X, ChevronDown, ClipboardList, Sparkles } from 'lucide-vue-next';

const store = useSettingsStore();
const { handleViewScroll } = useSettingsNav();
const isEn = computed(() => store.language === 'EN');

const activeFilter = ref<UpdatesFilterId>('all');
const filterQuery = ref('');
const isChecking = ref(false);
const copied = ref(false);
const lastCheckedTime = ref('');
const checkState = ref<UpdateCheckState>('idle');
const latestVersion = ref('');
const updateError = ref('');
const expandedVersions = ref<Record<string, boolean>>({ [CURRENT_ARC_VERSION]: true, '1.0.11': true });

const totalChangesCount = computed(() => ARC_RELEASES.reduce((acc, r) => acc + r.changes.length, 0));

const presentation = computed(() => getUpdatesPresentation({
  isEn: isEn.value,
  isChecking: isChecking.value,
  checkState: checkState.value,
  latestVersion: latestVersion.value,
  lastCheckedTime: lastCheckedTime.value,
  updateError: updateError.value,
  currentVersion: CURRENT_ARC_VERSION,
  currentBuild: CURRENT_ARC_BUILD,
  releasesCount: ARC_RELEASES.length,
  totalChangesCount: totalChangesCount.value
}));

const headerStatus = computed(() => presentation.value.headerStatus);
const summaryItems = computed(() => presentation.value.summaryItems);
const filteredReleases = computed(() => filterReleaseEntries(ARC_RELEASES, activeFilter.value, filterQuery.value));

function toggleExpand(version: string) {
  expandedVersions.value[version] = !expandedVersions.value[version];
}

async function checkForUpdates() {
  if (isChecking.value) return;
  const api = typeof window !== 'undefined' ? (window as any).api : null;
  if (!api || typeof api.checkForUpdates !== 'function') {
    checkState.value = 'no-ipc';
    return;
  }

  isChecking.value = true;
  updateError.value = '';
  try {
    const res = await api.checkForUpdates();
    lastCheckedTime.value = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (res?.success) {
      if (res.hasUpdate) {
        checkState.value = 'update-available';
        latestVersion.value = res.latestVersion || '';
      } else {
        checkState.value = 'up-to-date';
      }
    } else {
      checkState.value = 'error';
      updateError.value = res?.error || (isEn.value ? 'Update check failed' : 'Не удалось проверить обновления');
    }
  } catch (err: any) {
    checkState.value = 'error';
    updateError.value = err?.message || (isEn.value ? 'Update check failed' : 'Не удалось проверить обновления');
  } finally {
    isChecking.value = false;
  }
}

async function copyLatestReleaseNotes() {
  const latest = ARC_RELEASES[0];
  if (!latest) return;
  const lines = [
    `A.R.C. v${latest.version} (build ${latest.buildHash}) — ${latest.titleRu}`,
    latest.summaryRu,
    ...latest.changes.map((c) => `- [${c.subsystem}] ${c.titleRu}: ${c.detailsRu}`)
  ].join('\n');
  try {
    if ((window as any).api?.writeClipboard) {
      await (window as any).api.writeClipboard(lines);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(lines);
    }
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {}
}
</script>

