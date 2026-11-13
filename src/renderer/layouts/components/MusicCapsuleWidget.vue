<template>
  <transition name="fade-slide">
    <div 
      v-if="showMusicWidget && (!autoHideMusicWidget || uiStore.musicState === 'playing')"
      ref="widgetRef"
      class="music-capsule-widget z-20 pointer-events-auto select-none font-sans group outline-none rounded-none"
      :style="positionStyle()"
      id="arc-media-capsule"
      tabindex="0"
    >
      <!-- Next Track Hover Preview (A.R.C. HUD Tooltip) -->
      <transition name="fade">
        <div 
          v-if="uiStore.musicNextTrack"
          class="absolute -bottom-14 right-0 bg-[#0A0A0A] border border-[var(--glass-border)] rounded-xl px-3 py-2.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition duration-300 pointer-events-none shadow-[0_12px_24px_rgba(0,0,0,0.8)] whitespace-nowrap translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0 z-40"
        >
          <div class="text-[8px] font-mono font-bold text-white/40 uppercase tracking-[0.2em] mb-1 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-white/60 shadow-[0_0_6px_rgba(255,255,255,0.3)]"></span>
            NEXT IN QUEUE
          </div>
          <div class="text-[11px] text-white/90 font-semibold truncate max-w-[260px] tracking-normal">{{ uiStore.musicNextTrack }}</div>
        </div>
      </transition>

      <!-- Main Shell Panel -->
      <HudWidgetShell
        title="01. МЕДИАХАБ"
        tag="AUDIO"
        category="workspace"
        :icon="Music"
        :show-close="false"
        :force-visible="isDragging"
        :size="settingsStore.widgetSizes['music']"
        :mode="settingsStore.getWidgetMode('music')"
        @update:mode="(m) => settingsStore.setWidgetMode('music', m)"
        @drag-start="onDragStart"
      >
        <!-- Ambient Mode: Single-Row 32px Capsule Strip -->
        <template #ambient>
          <div class="flex items-center gap-1.5 font-mono text-[9px] truncate">
            <span 
              class="w-1.5 h-1.5 rounded-full shrink-0" 
              :class="uiStore.musicState === 'playing' ? 'bg-[var(--accent)] shadow-[0_0_6px_var(--accent)] animate-pulse' : 'bg-white/20'"
            ></span>
            <span class="text-white font-medium truncate max-w-[110px]">
              {{ uiStore.musicTitle || 'A.R.C. Media' }}
            </span>
            <span class="text-white/40">·</span>
            <span class="text-white/70">
              {{ uiStore.musicState === 'playing' ? 'ИГРАЕТ' : 'ОЖИДАНИЕ' }}
            </span>
          </div>
        </template>

        <!-- Compact Mode: Minimal Monolith Media Hub -->
        <template #compact>
          <div class="row-data" @click.stop="$emit('toggleMusic')" title="Нажмите для воспроизведения / паузы">
            <span class="txt-val-main truncate max-w-[200px]" :title="uiStore.musicTitle || 'Quantum Soundscape'">
              {{ uiStore.musicTitle || 'Quantum Soundscape' }}
            </span>
            <span 
              class="txt-val-num cursor-pointer hover:text-[var(--accent)] transition-colors flex items-center gap-1.5" 
              :class="uiStore.musicState === 'playing' ? 'text-[var(--accent)] font-bold' : 'text-white/40'"
            >
              <span v-if="uiStore.musicState === 'playing'" class="mini-eq flex items-end gap-[2px] h-[9px] pb-[1px]" aria-hidden="true">
                <span class="w-[1.5px] bg-[var(--accent)]/90 rounded-[0.5px] animate-[eq-bar_0.8s_ease-in-out_infinite]"></span>
                <span class="w-[1.5px] bg-[var(--accent)]/90 rounded-[0.5px] animate-[eq-bar_1.2s_ease-in-out_infinite_0.2s]"></span>
                <span class="w-[1.5px] bg-[var(--accent)]/90 rounded-[0.5px] animate-[eq-bar_0.6s_ease-in-out_infinite_0.4s]"></span>
              </span>
              <span>{{ uiStore.musicState === 'playing' ? 'PLAYING' : 'OFFLINE' }}</span>
            </span>
          </div>
        </template>

        <!-- Full Content -->
        <div class="relative flex flex-col w-full gap-2 font-mono">
          <!-- Main Player Row -->
          <div class="flex items-center justify-between w-full relative z-10 gap-2.5">
            <!-- Album Art -->
            <div class="relative w-10 h-10 shrink-0 overflow-hidden rounded-none border border-white/10 bg-black/60 flex items-center justify-center group/art transition duration-200 hover:border-white/20">
              <img 
                v-if="uiStore.musicCover" 
                :src="uiStore.musicCover" 
                referrerpolicy="no-referrer"
                class="absolute inset-0 w-full h-full object-cover transition duration-300"
                :class="uiStore.musicState === 'playing' ? 'scale-100' : 'brightness-60 scale-95'"
              />
              <div 
                v-else 
                class="w-full h-full bg-white/[0.02] flex items-center justify-center"
              >
                <Music class="w-4 h-4 text-white/30" />
              </div>

              <!-- Animated Equalizer Overlay -->
              <div 
                class="absolute inset-0 flex items-end justify-center gap-[2px] pb-1 select-none transition-opacity duration-200 bg-black/60"
                :class="uiStore.musicState === 'playing' ? 'opacity-100' : 'opacity-0'"
              >
                <span 
                  v-for="i in 4" 
                  :key="i"
                  class="w-0.5 bg-[var(--accent)] rounded-none animate-[equalizer_0.8s_infinite]"
                  :style="{ animationDelay: `${i * 0.12}s`, height: '4px' }"
                ></span>
              </div>
            </div>

            <!-- Track Info -->
            <div class="flex flex-col flex-1 min-w-0 justify-center">
              <div class="overflow-hidden w-full relative h-[16px]">
                <h3 
                  class="text-[11px] font-sans font-medium text-white/90 truncate absolute whitespace-nowrap transition duration-300"
                  :class="shouldScrollTitle ? 'marquee-scroll' : ''"
                >
                  {{ uiStore.musicTitle || localizations.bgStream || 'A.R.C. MEDIA CORE' }}
                </h3>
              </div>
              <div class="flex items-center gap-1.5 text-[8.5px] text-white/40 tracking-wider">
                <span class="text-[var(--accent)]/80">SYS_MEDIA</span>
                <span>•</span>
                <span>{{ uiStore.musicState === 'playing' ? 'PLAYING' : 'STANDBY' }}</span>
              </div>
            </div>

            <!-- Main Controls (Play, Prev, Next) -->
            <div class="flex items-center gap-1.5 shrink-0">
              <button 
                @click="handlePrevTrack" 
                :disabled="uiStore.vkConnectedClientsCount === 0"
                class="w-6.5 h-6.5 rounded-none bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition active:scale-95 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                title="Предыдущий трек"
              >
                <SkipBack class="w-3 h-3" />
              </button>
              <button 
                @click="$emit('toggleMusic')"
                class="w-7 h-7 rounded-none bg-[rgba(var(--accent-rgb),0.15)] text-[var(--accent)] hover:bg-[rgba(var(--accent-rgb),0.25)] border border-[rgba(var(--accent-rgb),0.40)] hover:border-[rgba(var(--accent-rgb),0.70)] flex items-center justify-center transition active:scale-95 cursor-pointer"
                title="Воспроизведение / Пауза"
              >
                <Pause v-if="uiStore.musicState === 'playing'" class="w-3.5 h-3.5 fill-current text-[var(--accent)]" />
                <Play v-else class="w-3.5 h-3.5 fill-current text-[var(--accent)] ml-0.5" />
              </button>
              <button 
                @click="handleNextTrack" 
                :disabled="uiStore.vkConnectedClientsCount === 0"
                class="w-6.5 h-6.5 rounded-none bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition active:scale-95 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                title="Следующий трек"
              >
                <SkipForward class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Progress Bar -->
          <div 
            class="flex flex-col gap-1 w-full relative z-10 group/progress select-none"
            role="slider"
            :aria-valuenow="Math.round(currentProgressPercent)"
            aria-valuemin="0"
            aria-valuemax="100"
            tabindex="0"
            @keydown.left.prevent="stepProgress(-5)"
            @keydown.right.prevent="stepProgress(5)"
          >
            <div 
              class="h-2 w-full flex items-center cursor-pointer relative"
              ref="progressBarRef"
              @mousedown="startSeekDrag"
              @mousemove="updateHover"
              @mouseleave="isHovering = false"
            >
              <!-- Base Track Background -->
              <div class="h-[2px] w-full bg-white/10 rounded-none overflow-hidden relative">
                <div 
                  class="absolute inset-y-0 left-0 bg-[rgba(var(--accent-rgb),0.30)] rounded-none transition-opacity duration-150"
                  :class="{ 'opacity-100': isHovering, 'opacity-0': !isHovering }"
                  :style="{ width: `${hoverPercentage}%` }"
                ></div>
                <div 
                  class="absolute inset-y-0 left-0 bg-[var(--accent)] rounded-none transition duration-75" 
                  :style="{ width: `${currentProgressPercent}%` }"
                ></div>
              </div>

              <!-- Thumb -->
              <div 
                class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-3 rounded-none bg-[var(--accent)] transition-transform duration-100 pointer-events-none z-20"
                :class="isScrubbing || isHovering ? 'scale-110 opacity-100' : 'opacity-70 group-hover/progress:opacity-100'"
                :style="{ left: `${currentProgressPercent}%` }"
              ></div>
            </div>

            <!-- Timestamps -->
            <div class="flex items-center justify-between text-[8px] text-white/40 px-0.5">
              <span>{{ formatTime(displayCurrentTime) }}</span>
              <span>{{ uiStore.musicDuration > 0 ? formatTime(uiStore.musicDuration) : '0:00' }}</span>
            </div>
          </div>

          <!-- Mini Auxiliary Controls Row (Volume, Shuffle, Repeat, Like) -->
          <div v-if="uiStore.vkActive || uiStore.musicState === 'playing' || uiStore.musicState === 'paused'" class="flex items-center justify-between border-t border-white/[0.08] pt-2 relative z-10 text-[9px]">
            <!-- Left: Volume Control -->
            <div class="flex items-center gap-1.5 group/vol">
              <button @click="$emit('toggleMute')" class="text-white/40 hover:text-white transition-colors flex items-center justify-center w-4 h-4 cursor-pointer">
                <VolumeX v-if="uiStore.musicVolume === 0" class="w-3 h-3 text-[var(--accent)]" />
                <Volume1 v-else-if="uiStore.musicVolume < 0.5" class="w-3 h-3 text-white/50" />
                <Volume2 v-else class="w-3 h-3 text-white/50" />
              </button>
              
              <div class="relative flex items-center">
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.02" 
                  :value="uiStore.musicVolume" 
                  @input="$emit('handleVolumeInput', $event)" 
                  class="cyber-volume-slider w-12 group-hover/vol:w-16 h-1 bg-white/10 accent-[var(--accent)] rounded-none appearance-none cursor-pointer focus:outline-none transition-all duration-300"
                  :title="localizations.volume || 'Volume'"
                />
              </div>
              
              <span class="text-[8px] font-mono text-white/40 w-5 text-right">
                {{ Math.round(uiStore.musicVolume * 100) }}%
              </span>
            </div>

            <!-- Right: Shuffle, Repeat, Like states -->
            <div class="flex items-center gap-1">
              <!-- Shuffle -->
              <button 
                @click="$emit('toggleShuffle')" 
                :disabled="uiStore.vkConnectedClientsCount === 0"
                class="w-5.5 h-5.5 rounded-none border transition flex items-center justify-center text-[9px] cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed" 
                :class="uiStore.musicShuffled ? 'text-[var(--accent)] font-bold bg-[rgba(var(--accent-rgb),0.10)] border-[rgba(var(--accent-rgb),0.30)]' : 'text-white/40 border-white/[0.08] bg-white/[0.015] hover:text-white hover:border-white/20'" 
                title="Перемешать"
              >
                <Shuffle class="w-3 h-3" />
              </button>
              <!-- Repeat -->
              <button 
                @click="$emit('toggleRepeat')" 
                :disabled="uiStore.vkConnectedClientsCount === 0"
                class="w-5.5 h-5.5 rounded-none border transition flex items-center justify-center text-[9px] cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed" 
                :class="uiStore.musicRepeated !== 'off' && uiStore.musicRepeated !== false ? 'text-[var(--accent)] font-bold bg-[rgba(var(--accent-rgb),0.10)] border-[rgba(var(--accent-rgb),0.30)]' : 'text-white/40 border-white/[0.08] bg-white/[0.015] hover:text-white hover:border-white/20'" 
                title="Повтор"
              >
                <Repeat class="w-3 h-3" />
              </button>
              <!-- Like -->
              <button 
                @click="$emit('toggleLike')" 
                :disabled="uiStore.vkConnectedClientsCount === 0"
                class="w-5.5 h-5.5 rounded-none border transition flex items-center justify-center text-[9px] cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed" 
                :class="uiStore.musicLiked ? 'text-[var(--accent)] font-bold bg-[rgba(var(--accent-rgb),0.10)] border-[rgba(var(--accent-rgb),0.30)]' : 'text-white/40 border-white/[0.08] bg-white/[0.015] hover:text-white hover:border-white/20'" 
                title="Избранное"
              >
                <Heart class="w-3 h-3" :class="{ 'fill-[var(--accent)] text-[var(--accent)]': uiStore.musicLiked }" />
              </button>
            </div>
          </div>
      </div>
    </HudWidgetShell>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { 
  Music, Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Heart, Volume1, Volume2, VolumeX 
} from 'lucide-vue-next';
import { useDraggableWidget } from '../../composables/useDraggableWidget';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { useEcoStore } from '../../stores/eco.store';
import HudWidgetShell from '../../components/ui/HudWidgetShell.vue';

export interface MusicLocalizations {
  shuffle: string;
  repeatTrack: string;
  repeatPlaylist: string;
  repeatOff: string;
  likeRemove: string;
  likeAdd: string;
  volume: string;
  bgStream: string;
}

const widgetRef = ref<HTMLElement | null>(null);
const { onDragStart, positionStyle, isDragging } = useDraggableWidget('music_capsule', { x: 24, y: 100, isBottom: true, isRight: true }, widgetRef);

const props = defineProps<{
  showMusicWidget: boolean;
  autoHideMusicWidget: boolean;
  localizations: MusicLocalizations;
  formatTime: (sec: number) => string;
}>();

const uiStore = useUIStore();
const settingsStore = useSettingsStore();
const ecoStore = useEcoStore();

const emit = defineEmits<{
  (e: 'toggleMusic'): void;
  (e: 'prevTrack'): void;
  (e: 'nextTrack'): void;
  (e: 'seekTrack', percentage: number): void;
  (e: 'toggleShuffle'): void;
  (e: 'toggleRepeat'): void;
  (e: 'toggleLike'): void;
  (e: 'toggleMute'): void;
  (e: 'handleVolumeInput', event: Event): void;
}>();

const progressBarRef = ref<HTMLElement | null>(null);
const hoverPercentage = ref(0);
const isHovering = ref(false);
const isScrubbing = ref(false);
const scrubPercentage = ref(0);

// High-precision smooth local time interpolation
const localCurrentTime = ref(uiStore.musicCurrentTime || 0);

// Synchronize with store updates when not scrubbing
watch(() => uiStore.musicCurrentTime, (newTime) => {
  if (!isScrubbing.value) {
    localCurrentTime.value = newTime;
  }
});

watch(() => uiStore.musicTitle, () => {
  localCurrentTime.value = uiStore.musicCurrentTime || 0;
});

const handlePrevTrack = () => {
  if (localCurrentTime.value > 2) {
    localCurrentTime.value = 0;
  }
  emit('prevTrack');
};

const handleNextTrack = () => {
  localCurrentTime.value = 0;
  emit('nextTrack');
};

let tickerFrameId: number | null = null;
let lastTickerTime = 0;
const isVisibleInViewport = ref(true);
let observer: IntersectionObserver | null = null;

const checkTickShouldRun = () => {
  const isPlaying = uiStore.musicState === 'playing';
  const active = isPlaying || isScrubbing.value;
  return active && 
         document.visibilityState === 'visible' && 
         ecoStore.isWindowFocused && 
         isVisibleInViewport.value;
};

const updateTickState = () => {
  if (checkTickShouldRun()) {
    if (tickerFrameId === null) {
      lastTickerTime = performance.now();
      tickerFrameId = requestAnimationFrame(tick);
    }
  } else {
    if (tickerFrameId !== null) {
      cancelAnimationFrame(tickerFrameId);
      tickerFrameId = null;
    }
  }
};

const tick = (now: number) => {
  if (!checkTickShouldRun()) {
    tickerFrameId = null;
    return;
  }

  if (now - lastTickerTime >= 33) {
    lastTickerTime = now;
    if (uiStore.musicState === 'playing' && !isScrubbing.value && uiStore.musicDuration > 0) {
      localCurrentTime.value = Math.min(uiStore.musicDuration, localCurrentTime.value + 0.033);
    }
  }
  tickerFrameId = requestAnimationFrame(tick);
};

watch(() => [uiStore.musicState, isScrubbing.value, ecoStore.isWindowFocused], () => {
  updateTickState();
});

onMounted(() => {
  if (widgetRef.value) {
    observer = new IntersectionObserver((entries) => {
      isVisibleInViewport.value = entries[0].isIntersecting;
      updateTickState();
    });
    observer.observe(widgetRef.value);
  }
  document.addEventListener('visibilitychange', updateTickState);
  updateTickState();
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  document.removeEventListener('visibilitychange', updateTickState);
  if (tickerFrameId !== null) cancelAnimationFrame(tickerFrameId);
  window.removeEventListener('mousemove', onGlobalMouseMove);
  window.removeEventListener('mouseup', onGlobalMouseUp);
});

const displayCurrentTime = computed(() => {
  if (isScrubbing.value && uiStore.musicDuration > 0) {
    return (scrubPercentage.value / 100) * uiStore.musicDuration;
  }
  return localCurrentTime.value;
});

const currentProgressPercent = computed(() => {
  if (isScrubbing.value) return scrubPercentage.value;
  if (!uiStore.musicDuration || uiStore.musicDuration <= 0) return 0;
  return Math.min(100, Math.max(0, (localCurrentTime.value / uiStore.musicDuration) * 100));
});

const seekHoverTime = computed(() => {
  if (!uiStore.musicDuration || uiStore.musicDuration <= 0) return 0;
  const pct = isScrubbing.value ? scrubPercentage.value : hoverPercentage.value;
  return Math.max(0, Math.min(uiStore.musicDuration, (pct / 100) * uiStore.musicDuration));
});

const calculatePercentFromEvent = (e: MouseEvent): number => {
  if (!progressBarRef.value) return 0;
  const rect = progressBarRef.value.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  const rawPct = ((e.clientX - rect.left) / rect.width) * 100;
  return Math.max(0, Math.min(100, rawPct));
};

const updateHover = (e: MouseEvent) => {
  isHovering.value = true;
  hoverPercentage.value = calculatePercentFromEvent(e);
};

const startSeekDrag = (e: MouseEvent) => {
  if (uiStore.vkConnectedClientsCount === 0 || !uiStore.musicDuration) return;
  isScrubbing.value = true;
  scrubPercentage.value = calculatePercentFromEvent(e);
  window.addEventListener('mousemove', onGlobalMouseMove);
  window.addEventListener('mouseup', onGlobalMouseUp);
};

const onGlobalMouseMove = (e: MouseEvent) => {
  if (!isScrubbing.value) return;
  scrubPercentage.value = calculatePercentFromEvent(e);
};

const onGlobalMouseUp = (e: MouseEvent) => {
  if (!isScrubbing.value) return;
  const finalPct = calculatePercentFromEvent(e);
  isScrubbing.value = false;
  window.removeEventListener('mousemove', onGlobalMouseMove);
  window.removeEventListener('mouseup', onGlobalMouseUp);
  
  if (uiStore.musicDuration > 0) {
    localCurrentTime.value = (finalPct / 100) * uiStore.musicDuration;
    emit('seekTrack', finalPct);
  }
};

const stepProgress = (deltaSeconds: number) => {
  if (uiStore.vkConnectedClientsCount === 0 || !uiStore.musicDuration) return;
  const newTime = Math.max(0, Math.min(uiStore.musicDuration, localCurrentTime.value + deltaSeconds));
  localCurrentTime.value = newTime;
  const targetPct = (newTime / uiStore.musicDuration) * 100;
  emit('seekTrack', targetPct);
};

// Simple scroll detection for long titles
const shouldScrollTitle = computed(() => {
  const title = uiStore.musicTitle || '';
  return title.length > 28;
});
</script>

<style scoped>
.music-capsule-widget {
  contain: layout style paint;
}

@keyframes equalizer {
  0%, 100% { height: 4px; }
  50% { height: 16px; }
}

.fade-slide-enter-active, .fade-slide-leave-active {
  transition: opacity 0.35s, transform 0.35s, border-color 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-slide-enter-from, .fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* Elegant Title Marquee Animation */
@keyframes marquee {
  0% { transform: translateX(0); }
  10% { transform: translateX(0); }
  50% { transform: translateX(-35%); }
  60% { transform: translateX(-35%); }
  100% { transform: translateX(0); }
}

.marquee-scroll {
  animation: marquee 12s linear infinite;
}

/* Custom Sleek Glass-Morphic Volume Slider */
.cyber-volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #ffffff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: transform 0.15s ease;
}

.cyber-volume-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.cyber-volume-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #ffffff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: transform 0.15s ease;
}

.cyber-volume-slider::-moz-range-thumb:hover {
  transform: scale(1.2);
}
</style>
