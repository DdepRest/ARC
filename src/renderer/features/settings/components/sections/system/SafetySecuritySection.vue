<template>
  <section id="section-safety" class="scroll-mt-14 flex flex-col gap-4 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      title="Безопасность" 
      description="Правила контроля над операциями ассистента. Защита файлов, системных процессов и сетевых вызовов."
      blockCountText="2 основных блока · строгий контроль"
      :icon="Shield" 
    />

    <div class="flex flex-col gap-4">
      <!-- Confirmation Block -->
      <SettingsBlock title="Подтверждение действий" subtitle="Интерактивный шлюз">
        <SettingsRow 
          id="system.safety.confirm_destructive"
          label="Подтверждение деструктивных действий" 
          description="Всегда запрашивать согласие перед удалением файлов, перезаписью данных или изменением системных настроек."
          data-search="подтверждение деструктивных действий safety confirm destructive удаление файлов"
        >
          <ArcToggle v-model="store.requireConfirm" />
        </SettingsRow>

        <SettingsRow 
          id="system.safety.shell"
          label="Выполнение терминальных (Shell) команд" 
          description="Политика безопасности для запуска CLI-скриптов и системных утилит."
          data-search="выполнение терминальных shell команд cli scripts safety shell терминал"
        >
          <div 
            class="px-3 py-1 rounded-full bg-[var(--arc-plane)] border border-[rgba(var(--status-warn-rgb,234,179,8),0.35)] text-[var(--status-warn)] text-xs font-mono font-medium flex items-center gap-1.5"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)]"></span>
            <span>Ручное подтверждение</span>
          </div>
        </SettingsRow>
        <div class="px-4 py-3 border-t border-[var(--arc-hairline)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-plane)]/40">
          <span class="text-xs text-[var(--arc-text-muted)]">
            Резервное копирование и выгрузка архива:
          </span>
          <CrossLink tab="system" sectionId="section-storage" label="Экспорт архива базы данных и кэшей — в разделе Данные и хранилище" />
        </div>
      </SettingsBlock>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../../stores/settings.store';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import CrossLink from '../../primitives/CrossLink.vue';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import { Shield } from 'lucide-vue-next';

const store = useSettingsStore();
</script>
