<template>
  <div 
    ref="rowRef"
    :id="id || computedId"
    class="group/row flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-6 px-5 py-4 min-h-[58px] hover:bg-[var(--arc-hover)] transition-colors duration-200 relative"
    :class="{ 'opacity-50 pointer-events-none': disabled }"
    :style="{ fontFamily: 'var(--font-ui)' }"
    :data-search="computedSearchData"
    :data-setting-id="id || computedId"
    :data-frequency="frequency"
  >
    <!-- Label, hint, help tooltip and crosslink column -->
    <div class="flex-1 min-w-0 max-w-[68ch] pr-2">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-[14px] font-medium text-[var(--arc-text-primary,#E8E8E8)] group-hover/row:text-white leading-[1.40] transition-colors">
          {{ label }}
        </span>

        <!-- Term Help Tooltip -->
        <div v-if="termTip" class="relative group/tip inline-flex">
          <span 
            class="w-4 h-4 rounded-full border border-[var(--arc-hairline)] bg-[var(--arc-well)] text-[var(--arc-text-muted,#8F8F8F)] hover:text-[var(--arc-text-primary,#E8E8E8)] hover:border-[var(--arc-edge-strong)] text-xs font-mono flex items-center justify-center cursor-help transition-colors"
            tabindex="0"
          >
            ?
          </span>
          <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tip:block group-focus-within/tip:block z-50 w-64 p-3 rounded-[14px] bg-[var(--arc-popover,#161616)] border border-[var(--arc-edge-strong)] text-xs text-[var(--arc-text-secondary,#B4B4B4)] shadow-2xl leading-relaxed pointer-events-none text-left">
            <span v-if="termTitle" class="block font-semibold text-[var(--arc-text-primary,#E8E8E8)] mb-1">{{ termTitle }}</span>
            <span>{{ termTip }}</span>
          </div>
        </div>

        <slot name="badge" />
      </div>

      <!-- Hint description (human, concise <= 68 chars per line) -->
      <div v-if="description" class="text-[12.5px] sm:text-[13px] text-[var(--arc-text-hint,#909090)] leading-[1.52] mt-1 max-w-[64ch]">
        {{ description }}
      </div>

      <!-- Cross link slot -->
      <div v-if="$slots.link" class="mt-2">
        <slot name="link" />
      </div>

      <!-- Extra technical caption if provided -->
      <div v-if="tech" class="text-xs font-mono tabular-nums text-[var(--arc-text-machine,#7A7A7A)] mt-1.5">
        {{ tech }}
      </div>
    </div>

    <!-- Control column on the right -->
    <div class="shrink-0 flex items-center gap-3 sm:self-center">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useSettingsStore } from '../../stores/settings.store';

const props = defineProps<{
  id?: string;
  label: string;
  description?: string;
  termTitle?: string;
  termTip?: string;
  tech?: string;
  disabled?: boolean;
  searchKeywords?: string;
  frequency?: 'core' | 'standard' | 'advanced' | 'setup-once' | 'debug-only';
}>();

const rowRef = ref<HTMLElement | null>(null);
const settingsStore = useSettingsStore();

const computedId = computed(() => {
  return props.id || props.label.toLowerCase().replace(/[^a-zа-я0-9]/gi, '-');
});

const computedSearchData = computed(() => {
  return `${props.searchKeywords || ''} ${props.label} ${props.description || ''} ${props.tech || ''} ${props.termTitle || ''} ${props.termTip || ''}`.toLowerCase();
});

function checkAndHighlight() {
  const pendingId = settingsStore.pendingHighlightId;
  const pendingQuery = settingsStore.pendingHighlightQuery;
  if (!pendingId && !pendingQuery) return;

  const currentId = (props.id || computedId.value).toLowerCase();
  const searchStr = computedSearchData.value;

  const idMatch = pendingId && (currentId === pendingId.toLowerCase() || currentId.includes(pendingId.toLowerCase()) || pendingId.toLowerCase().includes(currentId));
  const queryWords = (pendingQuery || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const queryMatch = !pendingId && queryWords.length > 0 && queryWords.every(w => searchStr.includes(w));

  if ((idMatch || queryMatch) && rowRef.value) {
    const el = rowRef.value;
    const container = el.closest('.settings-scroll-container') as HTMLElement | null;

    nextTick(() => {
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.search-highlight').forEach(item => item.classList.remove('search-highlight'));
      }
      if (container) {
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const top = container.scrollTop + (elRect.top - containerRect.top) - Math.max(24, (containerRect.height - elRect.height) / 3);
        container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      let lastScrollTop = container ? container.scrollTop : -1;
      let sameCount = 0;
      let maxFrames = 60;
      let timerId: any = null;

      const finalize = () => {
        el.classList.add('search-highlight');
        settingsStore.setPendingHighlight(null);
        if (timerId) clearTimeout(timerId);
        timerId = setTimeout(() => {
          el.classList.remove('search-highlight');
        }, 2000);
      };

      const checkScroll = () => {
        maxFrames--;
        const currentScrollTop = container ? container.scrollTop : -1;
        if (Math.abs(currentScrollTop - lastScrollTop) < 1) {
          sameCount++;
        } else {
          sameCount = 0;
          lastScrollTop = currentScrollTop;
        }

        if (sameCount >= 3 || maxFrames <= 0) {
          finalize();
        } else {
          requestAnimationFrame(checkScroll);
        }
      };

      setTimeout(() => {
        requestAnimationFrame(checkScroll);
      }, 50);
    });
  }
}

onMounted(() => {
  checkAndHighlight();
});

watch(
  () => settingsStore.pendingHighlightId,
  (newVal) => {
    if (newVal) {
      nextTick(() => checkAndHighlight());
    }
  }
);
</script>
