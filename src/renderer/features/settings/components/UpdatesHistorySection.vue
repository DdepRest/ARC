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
        :statusLabel="`v${CURRENT_ARC_VERSION} · BUILD ${CURRENT_ARC_BUILD}`"
        statusTone="ok"
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
              <span class="w-2 h-2 rounded-full bg-[var(--status-ok)] shrink-0"></span>
              <span class="text-[var(--status-ok)]">{{ checkStatusText }}</span>
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
                  v-for="tab in filterOptions"
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
                  :aria-label="isExpanded(rel.version) ? 'Collapse' : 'Expand'"
                >
                  <ChevronDown
                    class="w-4 h-4 transition-transform duration-200"
                    :class="isExpanded(rel.version) ? 'rotate-180 text-[var(--accent)]' : ''"
                  />
                </button>
              </div>

              <div v-if="isExpanded(rel.version)" class="p-5 flex flex-col gap-4 bg-[var(--arc-plane)]">
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
                      <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="typeDotClass(item.type)"></span>
                      <span :class="typeTextClass(item.type)">{{ typeLabel(item.type) }}</span>
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
import SettingsSummaryStrip, { type SummaryItem } from './primitives/SettingsSummaryStrip.vue';
import {
  ARC_RELEASES,
  CURRENT_ARC_VERSION,
  CURRENT_ARC_BUILD,
  type ChangeType
} from '../config/releases.registry';
import { RefreshCw, Copy, Check, Search, X, ChevronDown, ClipboardList, Sparkles } from 'lucide-vue-next';

const store = useSettingsStore();
const { handleViewScroll } = useSettingsNav();
const isEn = computed(() => store.language === 'EN');

type FilterId = 'all' | ChangeType;
const activeFilter = ref<FilterId>('all');
const filterQuery = ref('');
const isChecking = ref(false);
const copied = ref(false);
const lastCheckedTime = ref<string>('');
const expandedVersions = ref<Record<string, boolean>>({
  [CURRENT_ARC_VERSION]: true,
  '1.0.11': true
});

const filterOptions: { id: FilterId; labelRu: string; labelEn: string }[] = [
  { id: 'all', labelRu: 'Все', labelEn: 'All' },
  { id: 'feature', labelRu: 'Новое', labelEn: 'New' },
  { id: 'improvement', labelRu: 'Улучшения', labelEn: 'Improvements' },
  { id: 'fix', labelRu: 'Исправления', labelEn: 'Fixes' }
];

const totalChangesCount = computed(() =>
  ARC_RELEASES.reduce((acc, r) => acc + r.changes.length, 0)
);

const checkStatusText = computed(() => {
  if (lastCheckedTime.value) {
    return isEn.value
      ? `Up to date (checked at ${lastCheckedTime.value})`
      : `Установлена актуальная версия (проверено в ${lastCheckedTime.value})`;
  }
  return isEn.value ? 'Up to date · Local Core Ready' : 'Установлена актуальная версия';
});

const summaryItems = computed<SummaryItem[]>(() => [
  { label: isEn.value ? 'Active Version' : 'Активная сборка', value: `v${CURRENT_ARC_VERSION}`, tone: 'ok', sublabel: `Build ${CURRENT_ARC_BUILD}` },
  { label: isEn.value ? 'Update Channel' : 'Канал обновлений', value: 'Stable', tone: 'ok', sublabel: checkStatusText.value },
  { label: isEn.value ? 'Releases Logged' : 'Версий в журнале', value: String(ARC_RELEASES.length), sublabel: `${totalChangesCount.value} изменений` },
  { label: isEn.value ? 'Voice Engine' : 'Речевой тракт', value: 'Silero v5.6', sublabel: 'GigaAM CTC 220M' },
]);

const filteredReleases = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  return ARC_RELEASES.map((rel) => {
    const matchingChanges = rel.changes.filter((ch) => {
      const matchesType = activeFilter.value === 'all' || ch.type === activeFilter.value;
      if (!matchesType) return false;
      if (!q) return true;
      return (
        rel.version.toLowerCase().includes(q) ||
        rel.buildHash.toLowerCase().includes(q) ||
        ch.subsystem.toLowerCase().includes(q) ||
        ch.titleRu.toLowerCase().includes(q) ||
        ch.titleEn.toLowerCase().includes(q) ||
        ch.detailsRu.toLowerCase().includes(q) ||
        ch.detailsEn.toLowerCase().includes(q)
      );
    });
    return {
      ...rel,
      filteredChanges: matchingChanges
    };
  }).filter((rel) => rel.filteredChanges.length > 0);
});

function isExpanded(version: string): boolean {
  return Boolean(expandedVersions.value[version]);
}

function toggleExpand(version: string) {
  expandedVersions.value[version] = !expandedVersions.value[version];
}

function typeLabel(type: ChangeType): string {
  if (isEn.value) {
    return type === 'feature' ? 'NEW' : type === 'improvement' ? 'IMPROVED' : 'FIXED';
  }
  return type === 'feature' ? 'НОВОЕ' : type === 'improvement' ? 'УЛУЧШЕНИЕ' : 'ИСПРАВЛЕНИЕ';
}

function typeDotClass(type: ChangeType): string {
  if (type === 'feature') return 'bg-[var(--accent)]';
  if (type === 'improvement') return 'bg-[var(--status-ok)]';
  return 'bg-[var(--status-warn)]';
}

function typeTextClass(type: ChangeType): string {
  if (type === 'feature') return 'text-[var(--accent)]';
  if (type === 'improvement') return 'text-[var(--status-ok)]';
  return 'text-[var(--status-warn)]';
}

function checkForUpdates() {
  if (isChecking.value) return;
  isChecking.value = true;
  setTimeout(() => {
    isChecking.value = false;
    lastCheckedTime.value = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }, 450);
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
