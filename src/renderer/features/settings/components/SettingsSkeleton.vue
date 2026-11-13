<template>
  <div class="flex flex-col gap-6 animate-pulse select-none">
    <!-- Header Skeleton -->
    <div class="flex items-center gap-3.5 pb-4 border-b border-[var(--arc-hairline)]">
      <div class="w-9 h-9 rounded-[var(--arc-radius-row,12px)] bg-[var(--arc-hover)] border border-[var(--arc-hairline)]"></div>
      <div class="flex flex-col gap-2">
        <div class="h-2.5 w-24 bg-[var(--arc-hover)] rounded"></div>
        <div class="h-4 w-48 bg-[var(--arc-hover)] rounded"></div>
      </div>
    </div>

    <!-- Section Block Skeleton -->
    <div class="rounded-xl border border-[var(--arc-hairline)] bg-[var(--arc-hover)] p-4 sm:p-5 flex flex-col divide-y divide-[var(--arc-divider)]">
      <div v-for="i in 4" :key="i" class="py-3.5 flex items-center justify-between gap-4">
        <div class="flex flex-col gap-1.5 flex-1">
          <div class="h-3.5 w-1/3 bg-[var(--arc-hover)] rounded"></div>
          <div class="h-2.5 w-2/3 bg-[var(--arc-hover)] rounded"></div>
        </div>
        <div class="h-7 w-20 bg-[var(--arc-hover)] rounded-[var(--arc-radius-btn,8px)] shrink-0"></div>
      </div>
    </div>
  </div>
</template>
