<template>
  <div class="w-full h-full min-h-0 flex flex-col gap-4 p-4 animate-pulse select-none">
    <div class="flex items-center justify-between border-b border-[var(--arc-divider)] pb-3">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-[10px] bg-[var(--arc-block)]"></div>
        <div class="flex flex-col gap-1.5">
          <div class="w-32 h-3.5 bg-[var(--arc-hover)] rounded"></div>
          <div class="w-20 h-2 bg-[var(--arc-block)] rounded"></div>
        </div>
      </div>
      <div class="w-24 h-7 bg-[var(--arc-block)] rounded-[10px]"></div>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="h-28 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[16px]"></div>
      <div class="h-28 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[16px]"></div>
      <div class="h-28 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[16px]"></div>
    </div>

    <div class="flex-1 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[16px] p-4 flex flex-col gap-3 min-h-[220px]">
      <div class="w-48 h-3 bg-[var(--arc-hover)] rounded"></div>
      <div class="w-full h-12 bg-[var(--arc-block)] rounded-[10px]"></div>
      <div class="w-full h-12 bg-[var(--arc-block)] rounded-[10px]"></div>
      <div class="w-full h-12 bg-[var(--arc-block)] rounded-[10px]"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Light skeleton placeholder for async tab loading
</script>
