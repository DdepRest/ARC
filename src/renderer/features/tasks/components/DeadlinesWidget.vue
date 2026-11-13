<template>
  <div v-if="overdueCount > 0 || dueTodayCount > 0" class="w">
    <header>
      <i class="led"></i>
      <b>КРИТИЧЕСКИЕ ДЕДЛАЙНЫ</b>
      <s>···</s>
    </header>
    <div class="r">
      <div>
        <strong>{{ overdueCount > 0 ? `${overdueCount} просрочено` : 'В графике' }}</strong>
        <small>{{ dueTodayCount > 0 ? `${dueTodayCount} завершаются сегодня` : 'Все задачи распределены' }}</small>
      </div>
      <em v-if="overdueCount > 0" class="text-[var(--status-err)]">
        {{ overdueCount }}
        <small>просроч.</small>
      </em>
    </div>
    <div v-if="overdueCount > 0" class="seg">
      <u :style="{ '--v': Math.min(1, overdueCount / 5) }"></u>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AlertCircle } from 'lucide-vue-next';

defineProps<{
  overdueCount: number;
  dueTodayCount: number;
}>();
</script>
