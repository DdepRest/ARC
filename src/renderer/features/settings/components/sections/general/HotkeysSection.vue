<template>
  <section id="section-shortcuts" class="scroll-mt-14 flex flex-col gap-8 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + HUD Readout Strip -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Общие · Подсистема 05"
      :icon="Keyboard"
      title="Горячие клавиши"
      description="Глобальные и локальные клавиатурные комбинации для быстрого управления A.R.C."
      :statusLabel="headerStatus.label"
      :statusTone="headerStatus.tone"
      blockCountText="3 функциональные группы"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <!-- Конфликты комбинаций (показывается только при реальных пересечениях) -->
    <div
      v-if="conflictReport && conflictReport.conflicts.length > 0"
      class="rounded-[14px] border border-[var(--status-warn)]/40 bg-[var(--arc-well)] p-4 flex flex-col gap-3"
      :style="{ boxShadow: 'var(--arc-well-shadow)' }"
      role="alert"
    >
      <div class="flex items-center gap-2 text-xs font-mono font-semibold text-[var(--status-warn)] uppercase tracking-wider">
        <AlertTriangle class="w-4 h-4 shrink-0" />
        <span>Обнаружены пересечения горячих клавиш ({{ conflictReport.conflicts.length }})</span>
      </div>
      <div class="flex flex-col gap-2">
        <div
          v-for="conflict in conflictReport.conflicts"
          :key="conflict.normalizedCombo"
          class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs"
        >
          <kbd class="font-mono font-semibold text-[var(--status-warn)] bg-[var(--arc-well)] px-2 py-0.5 rounded border border-[var(--status-warn)]/30">
            {{ conflict.displayCombo }}
          </kbd>
          <span class="font-mono text-[var(--arc-text-secondary)]">
            {{ conflict.commands.map(c => `${c.label} (${c.id})`).join('  ↔  ') }}
          </span>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-8">
      <SettingsGroup
        v-for="(category, idx) in categories"
        :key="category.id"
        :indexLabel="`0${idx + 1}`"
        :title="category.name"
        :description="category.desc"
        :badgeText="`${getHotkeysByCategory(category.id).length} комбинаций`"
      >
        <SettingsBlock>
          <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
            <SettingsRow
              v-for="hk in getHotkeysByCategory(category.id)"
              :key="hk.id"
              :id="'shortcuts.' + hk.id"
              :label="hk.label"
              :description="`Команда: ${hk.id}`"
            >
              <template v-if="hasCommandConflict(hk.id)" #badge>
                <span class="px-2 py-0.5 rounded-[6px] bg-[var(--arc-well)] border border-[var(--status-warn)]/40 text-[var(--status-warn)] text-xs font-mono font-semibold">
                  КОНФЛИКТ
                </span>
              </template>
              <div class="flex flex-wrap items-center gap-1.5">
                <template v-if="hk.keys && hk.keys.length > 0">
                  <kbd
                    v-for="combo in hk.keys"
                    :key="combo"
                    class="text-xs font-mono bg-[var(--arc-well)] px-2.5 py-1.5 rounded-[8px] border shrink-0 tracking-wide tabular-nums"
                    :class="isComboConflicting(hk.id, combo)
                      ? 'border-[var(--status-warn)]/60 text-[var(--status-warn)]'
                      : 'border-[var(--arc-hairline)] text-[var(--arc-text-primary)]'"
                    :style="{ boxShadow: 'var(--arc-well-shadow)' }"
                  >
                    {{ formatSingleCombo(combo) }}
                  </kbd>
                </template>
                <kbd
                  v-else
                  class="text-xs font-mono bg-[var(--arc-well)] px-2.5 py-1.5 rounded-[8px] border border-[var(--arc-hairline)] text-[var(--arc-text-muted)] shrink-0"
                >
                  Не задано
                </kbd>
              </div>
            </SettingsRow>
          </div>
        </SettingsBlock>
      </SettingsGroup>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Keyboard, AlertTriangle } from 'lucide-vue-next';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
import {
  hotkeysService,
  detectHotkeyConflicts,
  normalizeHotkeyCombo,
  type Hotkey,
  type HotkeyConflictReport
} from '../../../../../services/hotkeys.service';

const hotkeys = ref<Hotkey[]>([]);
const hasChecked = ref(false);

onMounted(() => {
  hotkeys.value = hotkeysService.getAll();
  hasChecked.value = true;
});

const conflictReport = computed<HotkeyConflictReport | null>(() => {
  if (!hasChecked.value) return null;
  return detectHotkeyConflicts(hotkeys.value);
});

const hasCommandConflict = (id: string) => {
  return Boolean(conflictReport.value?.conflictsByCommandId[id]?.length);
};

const isComboConflicting = (id: string, rawCombo: string) => {
  const conflictsForCmd = conflictReport.value?.conflictsByCommandId[id];
  if (!conflictsForCmd?.length) return false;
  const norm = normalizeHotkeyCombo(rawCombo);
  return norm ? conflictsForCmd.includes(norm) : false;
};

const categories = [
  { id: 'global', name: 'Глобальные комбинации', desc: 'Системный перехват клавиш вызова ядра и голосового канала поверх всех окон.' },
  { id: 'navigation', name: 'Навигация и окна', desc: 'Быстрое переключение между рабочими пространствами и панелями A.R.C.' },
  { id: 'chat', name: 'Когнитивный диалог', desc: 'Управление отправкой сообщений, очисткой контекста и голосовым вводом.' }
];

const getHotkeysByCategory = (cat: string) => {
  return hotkeys.value.filter(h => h.category === cat);
};

const formatSingleCombo = (combo: string) => {
  return combo.split('+').join(' + ');
};

const headerStatus = computed<{ label: string; tone: 'ok' | 'warn' | 'off' }>(() => {
  if (!conflictReport.value || conflictReport.value.checkedCount === 0) {
    return { label: 'НЕ ПРОВЕРЕНО', tone: 'warn' };
  }
  const count = conflictReport.value.conflicts.length;
  if (count > 0) {
    return { label: `НАЙДЕНО ${count} КОНФЛ.`, tone: 'warn' };
  }
  return { label: 'КОНФЛИКТОВ НЕТ', tone: 'ok' };
});

const summaryItems = computed<SummaryStripItem[]>(() => {
  const checked = conflictReport.value && conflictReport.value.checkedCount > 0;
  const conflictCount = conflictReport.value?.conflicts.length ?? 0;

  return [
    {
      label: 'Всего шорткатов',
      value: `${hotkeys.value.length} команд`,
      detail: 'В 3 контурах управления',
      tone: 'accent'
    },
    {
      label: 'Глобальный контур',
      value: `${getHotkeysByCategory('global').length} команд`,
      detail: 'Поверх окон ОС',
      tone: 'default'
    },
    {
      label: 'Навигация',
      value: `${getHotkeysByCategory('navigation').length} команд`,
      detail: 'Вкладки и панели',
      tone: 'default'
    },
    {
      label: 'Конфликты клавиш',
      value: !checked ? 'Не проверено' : `${conflictCount} обнаружено`,
      detail: !checked
        ? 'Ожидание сканирования'
        : conflictCount > 0
        ? 'Есть пересечения комбинаций'
        : 'Таблица привязок чиста',
      tone: !checked || conflictCount > 0 ? 'warn' : 'ok'
    }
  ];
});
</script>
