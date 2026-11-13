<template>
  <div class="space-y-6 max-w-2xl">
    <div class="bg-black/40 border border-white/10 rounded-xl p-4 sm:p-6">
      <h2 class="text-sm font-sans tracking-widest text-white/90 uppercase mb-6 truncate">Параметры безопасности & обратной связи</h2>
      
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="font-sans text-xs text-white/80 truncate">Озвучивать выполнение команд</div>
            <div class="font-mono text-xs text-white/40 mt-1 truncate">Использовать TTS для подтверждения действий</div>
          </div>
          <button @click="settingsStore.voiceFeedback = !settingsStore.voiceFeedback" class="shrink-0 transition-colors" :class="settingsStore.voiceFeedback ? settingsStore.themeColors.text : 'text-white/30 hover:text-white/50'">
            <ToggleRight v-if="settingsStore.voiceFeedback" class="w-6 h-6" />
            <ToggleLeft v-else class="w-6 h-6" />
          </button>
        </div>

        <div class="flex flex-wrap items-center justify-between border-t border-white/5 pt-4 gap-4">
          <div class="min-w-0 flex-1">
            <div class="font-sans text-xs text-white/80 truncate">Требовать подтверждение</div>
            <div class="font-mono text-xs text-white/40 mt-1 truncate">Запрашивать ответ перед удалением файлов или завершением процессов</div>
          </div>
          <button @click="settingsStore.requireConfirm = !settingsStore.requireConfirm" class="shrink-0 transition-colors" :class="settingsStore.requireConfirm ? settingsStore.themeColors.text : 'text-white/30 hover:text-white/50'">
            <ToggleRight v-if="settingsStore.requireConfirm" class="w-6 h-6" />
            <ToggleLeft v-else class="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ToggleRight, ToggleLeft } from 'lucide-vue-next';

defineProps<{
  settingsStore: any;
}>();
</script>
