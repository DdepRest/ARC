<template>
  <span class="w-[26px] h-[26px] rounded-full bg-[var(--arc-plane)] flex items-center justify-center shrink-0 border border-[var(--arc-hairline)]">
    <svg v-if="provider === 'kimi'" width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4.2 3.2V12.8M4.2 8.2L10.4 3.2M6.8 6.2L11.2 12.8" stroke="var(--arc-text-primary)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="12.2" cy="4.2" r="1.15" fill="var(--arc-text-primary)" />
    </svg>
    <svg v-else-if="provider === 'openai'" width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M21.2 10.1c.2-1.5-.2-3.1-1.2-4.3-1.3-1.6-3.4-2.3-5.4-1.8-.9-1.1-2.3-1.8-3.8-1.8-2.1 0-3.9 1.3-4.6 3.2-1.5.3-2.8 1.2-3.6 2.5-1 1.8-.9 4 .2 5.7-.2 1.5.2 3.1 1.2 4.3 1.3 1.6 3.4 2.3 5.4 1.8.9 1.1 2.3 1.8 3.8 1.8 2.1 0 3.9-1.3 4.6-3.2 1.5-.3 2.8-1.2 3.6-2.5 1.1-1.8 1-4-.2-5.7z" stroke="var(--arc-text-primary)" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="12" cy="12" r="2.7" stroke="var(--arc-text-primary)" stroke-width="1.5" />
    </svg>
    <svg v-else-if="provider === 'local' || provider === 'ollama'" width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="3" width="10" height="10" rx="2.5" stroke="var(--accent)" stroke-width="1.5" />
      <circle cx="8" cy="8" r="1.8" fill="var(--arc-text-primary)" />
    </svg>
    <svg v-else width="15" height="15" viewBox="0 0 18 18" fill="none">
      <g stroke="var(--accent)" stroke-width="1.35" stroke-linecap="round">
        <line x1="9" y1="2.2" x2="9" y2="15.8" />
        <line x1="2.2" y1="9" x2="15.8" y2="9" />
        <line x1="4.1" y1="4.1" x2="13.9" y2="13.9" />
        <line x1="13.9" y1="4.1" x2="4.1" y2="13.9" />
        <line x1="6.4" y1="2.7" x2="11.6" y2="15.3" />
        <line x1="2.7" y1="6.4" x2="15.3" y2="11.6" />
      </g>
      <circle cx="9" cy="9" r="1.4" fill="var(--arc-plane)" />
    </svg>
  </span>
</template>

<script setup lang="ts">
import type { ProviderBadgeType } from '../composables/useComposerModels';

defineProps<{
  provider: ProviderBadgeType;
}>();
</script>
