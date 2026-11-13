<template>
  <section id="section-shortcuts" class="scroll-mt-14 flex flex-col gap-4 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      :icon="Keyboard" 
      title="Горячие клавиши" 
      description="Глобальные и локальные клавиатурные комбинации для быстрого управления A.R.C."
      blockCountText="3 категории · шорткаты"
    />

    <div class="flex flex-col gap-4">
      <SettingsBlock 
        v-for="category in categories" 
        :key="category.id" 
        :title="category.name"
        :subtitle="`${getHotkeysByCategory(category.id).length} комбинаций`"
      >
        <SettingsRow
          v-for="hk in getHotkeysByCategory(category.id)"
          :key="hk.id"
          :id="'shortcuts.' + hk.id"
          :label="hk.label"
          :description="`Команда: ${hk.id}`"
        >
          <kbd 
            class="text-xs font-mono bg-[var(--arc-input)] px-3 py-1.5 rounded-[8px] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] shrink-0 tracking-wide"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 2px 6px rgba(0, 0, 0, 0.45)' }"
          >
            {{ formatKeys(hk.keys) }}
          </kbd>
        </SettingsRow>
      </SettingsBlock>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Keyboard } from 'lucide-vue-next';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import { hotkeysService, Hotkey } from '../../../../../services/hotkeys.service';

const hotkeys = ref<Hotkey[]>([]);

onMounted(() => {
  hotkeys.value = hotkeysService.getAll();
});

const categories = [
  { id: 'global', name: 'Глобальные комбинации' },
  { id: 'navigation', name: 'Навигация и окна' },
  { id: 'chat', name: 'Когнитивный диалог' }
];

const getHotkeysByCategory = (cat: string) => {
  return hotkeys.value.filter(h => h.category === cat);
};

const formatKeys = (keys: string[]) => {
  if (!keys || keys.length === 0) return 'Не задано';
  return keys[0].split('+').join(' + ');
};
</script>
