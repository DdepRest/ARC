<template>
  <div class="space-y-6">
    <!-- Header Bar -->
    <div class="flex flex-wrap items-center justify-between mb-4 gap-4">
      <div class="flex items-center gap-4">
        <h2 class="text-sm font-sans font-semibold text-[var(--arc-text-primary)]">Реестр навыков и макросов</h2>
        <div class="w-56">
          <ArcInput 
            :model-value="searchQuery" 
            @update:model-value="$emit('update:searchQuery', $event)"
            placeholder="Поиск по навыкам..." 
            size="sm"
          >
            <template #prefix>
              <Search class="w-3.5 h-3.5 text-[var(--arc-text-muted)]" />
            </template>
          </ArcInput>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <input type="file" ref="importFileInput" accept=".json" class="hidden" @change="$emit('handleImportMacro', $event)" />
        <ArcButton 
          variant="secondary" 
          size="sm" 
          @click="$emit('triggerImport')"
        >
          <template #icon>
            <Download class="w-3.5 h-3.5" />
          </template>
          Импорт
        </ArcButton>

        <ArcButton 
          variant="secondary" 
          size="sm" 
          @click="$emit('exportAllMacros')" 
          title="Экспортировать все макросы в один файл"
        >
          <template #icon>
            <Upload class="w-3.5 h-3.5" />
          </template>
          Экспорт всех
        </ArcButton>

        <ArcButton 
          variant="primary" 
          size="sm" 
          @click="macrosStore.openEditor()"
        >
          <template #icon>
            <Plus class="w-3.5 h-3.5" />
          </template>
          Создать макрос
        </ArcButton>
      </div>
    </div>

    <!-- Section 1: Macros -->
    <div class="space-y-2.5">
      <div class="flex items-center justify-between px-1">
        <span class="text-xs font-mono font-semibold text-[var(--arc-text-muted)] tracking-wider uppercase">
          Макросы NLU ({{ filteredMacros.length }})
        </span>
      </div>

      <!-- Tactile Obsidian Instrument Container -->
      <div 
        class="border border-[var(--arc-hairline)] rounded-[16px] divide-y divide-[var(--arc-divider)] bg-[var(--arc-block)] overflow-hidden"
        :style="{
          background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
        }"
      >
        <div 
          v-if="filteredMacros.length === 0" 
          class="p-6 text-center text-xs font-mono text-[var(--arc-text-muted)]"
        >
          Макросы не найдены
        </div>

        <div 
          v-for="macro in filteredMacros" 
          :key="macro.id" 
          class="p-4 hover:bg-[var(--arc-hover)] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
          :class="{ 'opacity-50': !macro.enabled }"
        >
          <div class="flex items-start gap-3 flex-1 min-w-0">
            <div 
              class="w-9 h-9 rounded-[10px] flex items-center justify-center p-1.5 shrink-0 bg-[var(--arc-plane)] border border-[var(--arc-hairline)]"
              :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
            >
              <Cpu class="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="font-sans font-semibold text-sm text-[var(--arc-text-primary)] truncate">{{ macro.title }}</h3>
                <span 
                  class="text-xs font-mono px-2 py-0.5 rounded-full border bg-[var(--arc-plane)] uppercase tracking-wider shrink-0"
                  :class="macro.enabled ? 'border-[rgba(var(--status-ok-rgb,34,197,94),0.3)] text-[var(--status-ok)]' : 'border-[var(--arc-hairline)] text-[var(--arc-text-muted)]'"
                >
                  {{ macro.enabled ? 'Активен' : 'Отключен' }}
                </span>
              </div>
              <p class="text-xs text-[var(--arc-text-secondary)] mt-0.5 truncate max-w-xl">
                {{ macro.desc || 'Пользовательский макрос сценариев A.R.C.' }}
              </p>
              
              <!-- Voice triggers -->
              <div class="flex flex-wrap items-center gap-1.5 mt-2">
                <span class="text-xs font-mono uppercase text-[var(--arc-text-muted)] mr-1">Триггеры:</span>
                <span 
                  v-for="trig in (macro.triggers || [])" 
                  :key="trig"
                  class="text-xs font-mono px-2.5 py-0.5 rounded-[8px] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] bg-[var(--arc-plane)]"
                >
                  “{{ trig }}”
                </span>
                <span v-if="!macro.triggers || macro.triggers.length === 0" class="text-xs font-mono text-[var(--arc-text-muted)]">
                  —
                </span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 shrink-0 self-end md:self-center">
            <button 
              @click.stop="$emit('exportMacro', macro.id)" 
              class="p-1.5 rounded-[8px] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-plane)] transition-colors cursor-pointer" 
              title="Экспортировать макрос"
            >
              <Upload class="w-3.5 h-3.5" />
            </button>
            <button 
              @click.stop="$emit('cloneMacro', macro.id)" 
              class="p-1.5 rounded-[8px] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-plane)] transition-colors cursor-pointer" 
              title="Клонировать макрос"
            >
              <Copy class="w-3.5 h-3.5" />
            </button>
            <button 
              @click.stop="macrosStore.openEditor(macro.id)" 
              class="p-1.5 rounded-[8px] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-plane)] transition-colors cursor-pointer" 
              title="Редактировать макрос"
            >
              <MoreHorizontal class="w-3.5 h-3.5" />
            </button>

            <button 
              @click.stop="$emit('requestDeleteMacro', macro.id, macro.title)" 
              class="p-1.5 rounded-[8px] text-[var(--status-err)] hover:opacity-80 transition-opacity flex items-center gap-1 cursor-pointer"
              :title="macroPendingDeleteId === macro.id ? 'Нажмите ещё раз для подтверждения' : 'Удалить макрос'"
            >
              <Trash2 class="w-3.5 h-3.5" />
              <span v-if="macroPendingDeleteId === macro.id" class="text-xs font-mono uppercase tracking-wider font-bold">Удалить?</span>
            </button>

            <ArcToggle 
              :model-value="macro.enabled" 
              @update:model-value="macrosStore.toggleMacro(macro.id)" 
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: Standard Skills -->
    <div class="space-y-2.5 pt-2">
      <div class="flex items-center justify-between px-1">
        <span class="text-xs font-mono font-semibold text-[var(--arc-text-muted)] tracking-wider uppercase">
          Встроенные навыки ({{ filteredSkills.length }})
        </span>
      </div>

      <!-- Tactile Obsidian Instrument Container -->
      <div 
        class="border border-[var(--arc-hairline)] rounded-[16px] divide-y divide-[var(--arc-divider)] bg-[var(--arc-block)] overflow-hidden"
        :style="{
          background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
        }"
      >
        <div 
          v-if="filteredSkills.length === 0" 
          class="p-6 text-center text-xs font-mono text-[var(--arc-text-muted)]"
        >
          Навыки не найдены
        </div>

        <div 
          v-for="cmd in filteredSkills" 
          :key="cmd.id" 
          class="p-4 hover:bg-[var(--arc-hover)] transition-colors flex flex-col gap-3"
          :class="{ 'opacity-50': !cmd.enabled }"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 flex-1 min-w-0">
              <div 
                class="w-9 h-9 rounded-[10px] flex items-center justify-center p-1.5 shrink-0 bg-[var(--arc-plane)] border border-[var(--arc-hairline)]"
                :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
              >
                <component :is="getIcon(cmd.icon)" class="w-4 h-4 text-[var(--arc-text-primary)]" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="font-sans font-semibold text-sm text-[var(--arc-text-primary)] truncate">{{ cmd.title }}</h3>
                  <span 
                    class="text-xs font-mono px-2 py-0.5 rounded-full border bg-[var(--arc-plane)] uppercase tracking-wider shrink-0"
                    :class="cmd.enabled ? 'border-[rgba(var(--status-ok-rgb,34,197,94),0.3)] text-[var(--status-ok)]' : 'border-[var(--arc-hairline)] text-[var(--arc-text-muted)]'"
                  >
                    {{ cmd.enabled ? 'Активен' : 'Отключен' }}
                  </span>
                </div>
                <p class="text-xs text-[var(--arc-text-secondary)] mt-0.5 truncate max-w-xl">
                  {{ cmd.desc }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <ArcButton 
                variant="secondary"
                size="sm"
                @click="$emit('update:activeCmdId', activeCmdId === cmd.id ? null : cmd.id)" 
                class="h-7 text-xs"
              >
                {{ activeCmdId === cmd.id ? 'Скрыть фразы' : 'Фразы вызова' }}
              </ArcButton>

              <div class="relative">
                <button 
                  @click.stop="$emit('update:openMenuCmdId', openMenuCmdId === cmd.id ? null : cmd.id)" 
                  class="w-7 h-7 rounded-[8px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] flex items-center justify-center text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
                  title="Опции"
                >
                  <MoreHorizontal class="w-3.5 h-3.5" />
                </button>

                <div 
                  v-if="openMenuCmdId === cmd.id" 
                  class="absolute right-0 top-full mt-1 w-36 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[12px] py-1.5 z-50 text-xs"
                  :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 16px 36px rgba(0, 0, 0, 0.7)' }"
                >
                  <button 
                    @click="skillsStore.cloneSkill(cmd.id); $emit('update:openMenuCmdId', null)" 
                    class="w-full px-3 py-1.5 text-left text-xs font-sans text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer"
                  >
                    Клонировать
                  </button>
                  <div class="h-px bg-[var(--arc-divider)] my-1"></div>
                  <button 
                    @click="skillsStore.resetSkill(cmd.id); $emit('update:openMenuCmdId', null)" 
                    class="w-full px-3 py-1.5 text-left text-xs font-sans text-[var(--status-err)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer"
                  >
                    Сбросить
                  </button>
                </div>
              </div>

              <ArcToggle 
                :model-value="cmd.enabled" 
                @update:model-value="skillsStore.toggleSkill(cmd.id)" 
              />
            </div>
          </div>

          <!-- Triggers Preview (if not expanded) -->
          <div v-if="activeCmdId !== cmd.id" class="flex flex-wrap items-center gap-1.5 pt-1">
            <span 
              v-for="trigger in (cmd.triggers || []).slice(0, 4)" 
              :key="trigger"
              class="text-xs font-mono px-2.5 py-0.5 rounded-[8px] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] bg-[var(--arc-plane)] cursor-pointer"
              @click="$emit('update:activeCmdId', cmd.id)"
            >
              “{{ trigger }}”
            </span>
            <span 
              v-if="(cmd.triggers || []).length > 4" 
              class="text-xs font-mono px-2 py-0.5 rounded-[8px] border border-[var(--arc-hairline)] text-[var(--arc-text-muted)] bg-[var(--arc-plane)] cursor-pointer"
              @click="$emit('update:activeCmdId', cmd.id)"
            >
              +{{ cmd.triggers.length - 4 }}
            </span>
          </div>

          <!-- Expanded Triggers Editor -->
          <div v-if="activeCmdId === cmd.id" class="pt-3 border-t border-[var(--arc-divider)]">
            <p class="text-xs font-mono uppercase tracking-wider text-[var(--arc-text-muted)] mb-2">Настройка фраз-триггеров</p>
            <div class="flex flex-col gap-2">
              <div class="flex flex-wrap gap-1.5">
                <span 
                  v-for="trig in cmd.triggers" 
                  :key="trig" 
                  class="inline-flex items-center gap-1 text-xs font-mono px-2.5 py-0.5 rounded-[8px] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)] bg-[var(--arc-plane)]"
                >
                  <span>{{ trig }}</span>
                  <button 
                    @click="skillsStore.removeTrigger(cmd.id, trig)" 
                    class="text-[var(--status-err)] hover:opacity-80 ml-1 cursor-pointer"
                    title="Удалить фразу"
                  >
                    ×
                  </button>
                </span>
              </div>
              <div class="flex items-center gap-2 mt-1">
                <div class="flex-1 max-w-sm">
                  <ArcInput 
                    :model-value="newTrigger" 
                    @update:model-value="$emit('update:newTrigger', $event)"
                    @enter="$emit('handleAddTrigger', cmd.id)" 
                    placeholder="Новая фраза вызова..." 
                    size="sm"
                  />
                </div>
                <ArcButton 
                  variant="secondary" 
                  size="sm" 
                  @click="$emit('handleAddTrigger', cmd.id)"
                >
                  <template #icon>
                    <Plus class="w-3.5 h-3.5" />
                  </template>
                  Добавить
                </ArcButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Search, Download, Upload, Plus, Cpu, MoreHorizontal, Trash2, Copy, Command, Globe, Folder, Music, Play, Terminal } from 'lucide-vue-next';
import ArcInput from '../../../../components/ui/ArcInput.vue';
import ArcButton from '../../../../components/ui/ArcButton.vue';
import ArcToggle from '../../../../components/ui/ArcToggle.vue';

defineProps<{
  settingsStore: any;
  skillsStore: any;
  macrosStore: any;
  searchQuery: string;
  filteredMacros: any[];
  filteredSkills: any[];
  macroPendingDeleteId: string | null;
  activeCmdId: string | null;
  openMenuCmdId: string | null;
  newTrigger: string;
}>();

defineEmits<{
  (e: 'update:searchQuery', val: string): void;
  (e: 'update:activeCmdId', val: string | null): void;
  (e: 'update:openMenuCmdId', val: string | null): void;
  (e: 'update:newTrigger', val: string): void;
  (e: 'triggerImport'): void;
  (e: 'handleImportMacro', event: Event): void;
  (e: 'exportAllMacros'): void;
  (e: 'exportMacro', id: string): void;
  (e: 'cloneMacro', id: string): void;
  (e: 'requestDeleteMacro', id: string, title: string): void;
  (e: 'handleAddTrigger', id: string): void;
}>();

const importFileInput = ref<HTMLInputElement | null>(null);

const getIcon = (name: string) => {
  const map: Record<string, any> = { Globe, Folder, Music, Play, Terminal };
  return map[name] || Command;
};
</script>
