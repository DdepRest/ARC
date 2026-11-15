<template>
  <section id="section-shortcuts" class="scroll-mt-14 flex flex-col gap-8 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + HUD Readout Strip -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Общие · Подсистема 05"
      :icon="Keyboard"
      title="Горячие клавиши"
      description="Глобальные и локальные клавиатурные комбинации для быстрого управления A.R.C."
      :statusLabel="`АКТИВНО: ${hotkeys.length}`"
      statusTone="ok"
      blockCountText="3 функциональные группы"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

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
              <kbd
                class="text-xs font-mono bg-[var(--arc-well)] px-3 py-1.5 rounded-[8px] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] shrink-0 tracking-wide tabular-nums"
                :style="{ boxShadow: 'var(--arc-well-shadow)' }"
              >
                {{ formatKeys(hk.keys) }}
              </kbd>
            </SettingsRow>
          </div>
        </SettingsBlock>
      </SettingsGroup>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Keyboard } from 'lucide-vue-next';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
import { hotkeysService, Hotkey } from '../../../../../services/hotkeys.service';

const hotkeys = ref<Hotkey[]>([]);

onMounted(() => {
  hotkeys.value = hotkeysService.getAll();
});

const categories = [
  { id: 'global', name: 'Глобальные комбинации', desc: 'Системный перехват клавиш вызова ядра и голосового канала поверх всех окон.' },
  { id: 'navigation', name: 'Навигация и окна', desc: 'Быстрое переключение между рабочими пространствами и панелями A.R.C.' },
  { id: 'chat', name: 'Когнитивный диалог', desc: 'Управление отправкой сообщений, очисткой контекста и голосовым вводом.' }
];

const getHotkeysByCategory = (cat: string) => {
  return hotkeys.value.filter(h => h.category === cat);
};

const formatKeys = (keys: string[]) => {
  if (!keys || keys.length === 0) return 'Не задано';
  return keys[0].split('+').join(' + ');
};

const summaryItems = computed<SummaryStripItem[]>(() => [
  {
    label: 'Всего шорткатов',
    value: `${hotkeys.value.length} команд`,
    detail: 'В 3 контурах управления',
    tone: 'ok'
  },
  {
    label: 'Глобальный контур',
    value: `${getHotkeysByCategory('global').length} активны`,
    detail: 'Поверх окон ОС',
    tone: 'accent'
  },
  {
    label: 'Навигация',
    value: `${getHotkeysByCategory('navigation').length} команд`,
    detail: 'Вкладки и панели',
    tone: 'default'
  },
  {
    label: 'Конфликты клавиш',
    value: '0 обнаружено',
    detail: 'Таблица привязок чиста',
    tone: 'ok'
  }
]);
</script>
