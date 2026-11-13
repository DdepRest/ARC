<template>
  <ArcHudWidget :status="hudStatus" :status-title="hudStatusTitle">
    <div class="flex flex-col gap-3.5">
      <!-- Top Row: Cover Art, Track Info, Actions -->
      <div class="flex items-center gap-3.5">
        <!-- Album Art Thumbnail with Red Ambient Illumination -->
        <div class="w-14 h-14 rounded-2xl overflow-hidden bg-[var(--arc-plane)] border border-white/10 shrink-0 relative flex items-center justify-center shadow-md group/art">
          <!-- Ambient Crimson Glow in Art -->
          <div 
            class="absolute inset-0 opacity-50 group-hover/art:opacity-80 transition-opacity"
            :style="{ background: 'radial-gradient(circle at 75% 25%, rgba(var(--accent-rgb), 0.75) 0%, transparent 70%)' }"
          ></div>
          <!-- Cover Image or Fallback Disc Icon -->
          <img
            v-if="coverUrl && !coverLoadError"
            :src="coverUrl"
            alt=""
            @error="coverLoadError = true"
            class="w-full h-full object-cover relative z-10"
          />
          <Disc3
            v-else
            class="w-7 h-7 text-white/80 relative z-10 transition-transform duration-700"
            :class="{ 'animate-spin': isPlaying }"
          />
        </div>

        <!-- Track Info -->
        <div class="flex flex-col min-w-0 flex-1">
          <span class="text-[12px] font-medium text-white/80 truncate" :title="currentArtist">
            {{ currentArtist }}
          </span>
          <span class="text-[16px] font-semibold text-white tracking-tight truncate leading-tight mt-0.5" :title="currentTrackTitle">
            {{ currentTrackTitle }}
          </span>
          <span class="text-[10px] font-mono tracking-[0.22em] uppercase mt-0.5 font-semibold" :class="isPlaying ? 'text-[var(--accent)]' : 'text-[var(--arc-text-muted)]'">
            {{ sourceLabel }}
          </span>
        </div>

        <!-- Quick Actions: Like (Add/Remove Track) & Open VK Player -->
        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            @click="onLike"
            :aria-disabled="!uiStore.vkActive"
            aria-label="Нравится"
            class="min-w-[28px] min-h-[28px] w-7 h-7 rounded-lg flex items-center justify-center transition outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            :class="!uiStore.vkActive ? 'opacity-40 cursor-not-allowed text-[var(--arc-text-muted)]' : ((uiStore.musicLikedOverride ?? uiStore.musicLiked) ? 'text-[var(--accent)] bg-[rgba(var(--accent-rgb),0.14)] cursor-pointer active:scale-90' : 'text-[var(--arc-text-muted)] hover:text-white cursor-pointer active:scale-90')"
            :title="!uiStore.vkActive ? 'Откройте вкладку VK Музыка в браузере' : ((uiStore.musicLikedOverride ?? uiStore.musicLiked) ? 'Удалить трек из Моей музыки VK' : 'Добавить трек в Мою музыку VK')"
          >
            <Heart class="w-3.5 h-3.5" :class="{ 'fill-current': (uiStore.musicLikedOverride ?? uiStore.musicLiked) }" />
          </button>
          <button 
            type="button"
            @click="onOpenVk"
            aria-label="Открыть VK Музыку"
            class="min-w-[28px] min-h-[28px] w-7 h-7 rounded-lg flex items-center justify-center text-[var(--arc-text-muted)] hover:text-white transition cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-90"
            title="Открыть VK Музыку"
          >
            <ExternalLink class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Scrubber Progress Bar (Interactive Seek) -->
      <div class="flex flex-col gap-1.5">
        <div 
          @click="onSeek"
          class="w-full py-1.5 -my-1.5 relative flex items-center group/seek select-none"
          :class="uiStore.vkActive && uiStore.musicDuration > 0 ? 'cursor-pointer' : (!uiStore.vkActive ? 'opacity-40 cursor-not-allowed' : 'cursor-default')"
          :title="!uiStore.vkActive ? 'Откройте вкладку VK Музыка в браузере' : 'Перемотать трек'"
        >
          <div class="w-full h-1.5 bg-[rgba(255,255,255,0.08)] group-hover/seek:bg-[rgba(255,255,255,0.14)] rounded-full overflow-hidden relative transition-colors">
            <div 
              class="h-full rounded-full transition-[width] duration-200 pointer-events-none"
              :style="{ 
                width: `${progressPercent}%`, 
                backgroundColor: 'var(--accent)',
                boxShadow: '0 0 10px rgba(var(--accent-rgb), 0.7)'
              }"
            ></div>
          </div>
          <!-- Scrubber Thumb -->
          <div
            v-if="uiStore.musicDuration > 0"
            class="w-2.5 h-2.5 rounded-full absolute -translate-x-1/2 opacity-0 group-hover/seek:opacity-100 transition-opacity pointer-events-none"
            :style="{
              left: `${progressPercent}%`,
              backgroundColor: 'var(--accent)',
              boxShadow: '0 0 8px rgba(var(--accent-rgb), 0.9)'
            }"
          ></div>
        </div>
        <div class="flex items-center justify-between text-[10px] font-mono text-white/45 select-none tabular-nums">
          <span>{{ currentTimeFormatted }}</span>
          <span>{{ durationFormatted }}</span>
        </div>
      </div>

      <!-- Playback Controls Row -->
      <div class="flex items-center justify-center gap-4 pt-0.5">
        <!-- Shuffle Button -->
        <button 
          type="button"
          @click="onShuffle" 
          aria-label="Перемешать треки"
          class="min-w-[28px] min-h-[28px] w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-90"
          :class="uiStore.musicShuffled ? 'text-[var(--accent)] bg-[rgba(var(--accent-rgb),0.14)]' : 'text-[var(--arc-text-muted)] hover:text-white/80'"
          :title="uiStore.musicShuffled ? 'Перемешивание включено' : 'Перемешать'"
        >
          <Shuffle class="w-3.5 h-3.5" />
        </button>

        <!-- Prev Button -->
        <button 
          type="button"
          @click="onPrev"
          :aria-disabled="!uiStore.vkActive"
          aria-label="Предыдущий трек"
          class="min-w-[32px] min-h-[32px] w-8 h-8 rounded-lg flex items-center justify-center transition-all outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          :class="!uiStore.vkActive ? 'opacity-40 cursor-not-allowed text-[var(--arc-text-muted)]' : 'text-white/60 hover:text-white active:scale-90 cursor-pointer'"
          :title="!uiStore.vkActive ? 'Откройте вкладку VK Музыка в браузере' : 'Предыдущий трек'"
        >
          <SkipBack class="w-4 h-4" />
        </button>

        <!-- Circular Accent Play / Pause Button -->
        <button 
          type="button"
          @click="onToggle" 
          :aria-label="isPlaying ? 'Пауза' : 'Воспроизведение'"
          class="w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all duration-200 active:scale-95 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white"
          :style="{
            borderColor: 'var(--accent)',
            backgroundColor: isPlaying ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.12)',
            boxShadow: isPlaying ? '0 0 18px rgba(var(--accent-rgb), 0.55)' : 'none'
          }"
          :title="!uiStore.vkActive ? 'Откройте VK Музыку в браузере для воспроизведения' : (isPlaying ? 'Пауза (остановить воспроизведение)' : 'Воспроизвести')"
        >
          <Pause v-if="isPlaying" class="w-4 h-4 fill-current text-[var(--arc-frame)]" />
          <Play v-else class="w-4 h-4 ml-0.5 fill-current" :style="{ color: 'var(--accent)' }" />
        </button>

        <!-- Next Button -->
        <button 
          type="button"
          @click="onNext"
          :aria-disabled="!uiStore.vkActive"
          aria-label="Следующий трек"
          class="min-w-[32px] min-h-[32px] w-8 h-8 rounded-lg flex items-center justify-center transition-all outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          :class="!uiStore.vkActive ? 'opacity-40 cursor-not-allowed text-[var(--arc-text-muted)]' : 'text-white/60 hover:text-white active:scale-90 cursor-pointer'"
          :title="!uiStore.vkActive ? 'Откройте вкладку VK Музыка в браузере' : 'Следующий трек'"
        >
          <SkipForward class="w-4 h-4" />
        </button>

        <!-- Repeat Button (Playlist vs Single Track) -->
        <button 
          type="button"
          @click="onRepeat" 
          aria-label="Режим повтора треков"
          class="min-w-[28px] min-h-[28px] w-7 h-7 rounded-lg relative flex items-center justify-center transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-90"
          :class="isRepeatActive ? 'text-[var(--accent)] bg-[rgba(var(--accent-rgb),0.14)]' : 'text-[var(--arc-text-muted)] hover:text-white/80'"
          :title="repeatTooltip"
        >
          <Repeat1 v-if="isRepeatSingleTrack" class="w-4 h-4" />
          <Repeat v-else class="w-3.5 h-3.5" />
          <span
            v-if="isRepeatSingleTrack"
            class="absolute -top-1 -right-1 px-1 rounded text-[10px] font-mono font-bold leading-tight select-none"
            :style="{ backgroundColor: 'var(--accent)', color: 'var(--arc-frame)' }"
          >
            1
          </span>
        </button>
      </div>

      <!-- Volume Control Row -->
      <div class="flex items-center gap-2.5 pt-1 border-t border-white/[0.06]">
        <button
          type="button"
          @click="onMute"
          class="w-6 h-6 rounded-md flex items-center justify-center transition cursor-pointer outline-none focus:outline-none active:scale-90 shrink-0"
          :class="volumePercent === 0 ? 'text-[var(--accent)]' : 'text-white/50 hover:text-white'"
          :title="volumePercent === 0 ? 'Включить звук' : 'Выключить звук'"
        >
          <VolumeX v-if="volumePercent === 0" class="w-3.5 h-3.5" />
          <Volume1 v-else-if="volumePercent < 50" class="w-3.5 h-3.5" />
          <Volume2 v-else class="w-3.5 h-3.5" />
        </button>

        <div class="relative flex-1 flex items-center h-4 group/vol select-none">
          <div class="w-full h-1 bg-[rgba(255,255,255,0.08)] group-hover/vol:bg-[rgba(255,255,255,0.14)] rounded-full overflow-hidden relative transition-colors pointer-events-none">
            <div
              class="h-full rounded-full transition-[width] duration-75"
              :style="{
                width: `${volumePercent}%`,
                backgroundColor: 'var(--accent)'
              }"
            ></div>
          </div>
          <div
            class="w-2.5 h-2.5 rounded-full absolute -translate-x-1/2 opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none"
            :style="{
              left: `${volumePercent}%`,
              backgroundColor: 'var(--accent)',
              boxShadow: '0 0 6px rgba(var(--accent-rgb), 0.85)'
            }"
          ></div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="uiStore.musicVolume"
            @input="onVolumeInput"
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0"
            title="Громкость музыки"
          />
        </div>

        <span class="text-xs font-mono text-white/50 tabular-nums w-9 text-right select-none shrink-0">
          {{ volumePercent }}%
        </span>
      </div>
    </div>
  </ArcHudWidget>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import ArcHudWidget from './ArcHudWidget.vue';
import { useUIStore } from '../../stores/ui.store';
import { Play, Pause, SkipBack, SkipForward, Disc3, ExternalLink, Heart, Shuffle, Repeat, Repeat1, Volume2, Volume1, VolumeX } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  isPlaying?: boolean; trackTitle?: string; artist?: string; currentTime?: string; duration?: string; coverUrl?: string;
}>(), { isPlaying: undefined });

const emit = defineEmits<{
  (e: 'toggle'): void; (e: 'prev'): void; (e: 'next'): void; (e: 'open-vk'): void;
  (e: 'seek', percentage: number): void; (e: 'shuffle'): void; (e: 'repeat'): void;
  (e: 'like'): void; (e: 'mute'): void; (e: 'volume', event: Event): void;
}>();

const uiStore = useUIStore();
const coverLoadError = ref(false);

const isPlaying = computed(() => uiStore.vkActive && (props.isPlaying !== undefined ? props.isPlaying : (uiStore.musicState === 'playing')));

let playbackTimer: ReturnType<typeof setInterval> | null = null;
watch(isPlaying, (playing) => {
  if (playbackTimer) { clearInterval(playbackTimer); playbackTimer = null; }
  if (playing) {
    playbackTimer = setInterval(() => { uiStore.tickMusicTime(); }, 1000);
  }
}, { immediate: true });

onMounted(() => {
  if (window.api?.getVkConnectionStatus) {
    window.api.getVkConnectionStatus().then((status) => {
      if (status) uiStore.setVkConnectionStatus(status);
    }).catch(() => {});
  }
});

onUnmounted(() => {
  if (playbackTimer) {
    clearInterval(playbackTimer);
    playbackTimer = null;
  }
});

const hudStatus = computed<'ok' | 'warn' | 'off'>(() => {
  if (isPlaying.value) return 'ok';
  if (uiStore.vkActive) return 'warn';
  return 'off';
});

const hudStatusTitle = computed(() => {
  if (isPlaying.value) return 'Воспроизведение активно';
  if (uiStore.vkActive) return 'VK Музыка подключена (пауза)';
  return 'Ожидание медиа-потока';
});

const parsedTrack = computed(() => {
  const raw = (uiStore.musicTitle || '').trim();
  if (!raw) {
    return {
      artist: uiStore.vkActive ? 'VK Музыка подключена' : 'Медиаканал A.R.C.',
      title: 'Нет активного трека'
    };
  }
  const emDashIdx = raw.indexOf(' — ');
  if (emDashIdx !== -1) {
    return {
      artist: raw.slice(0, emDashIdx).trim() || 'VK Музыка',
      title: raw.slice(emDashIdx + 3).trim() || raw
    };
  }
  const hyphenIdx = raw.indexOf(' - ');
  if (hyphenIdx !== -1) {
    return {
      artist: raw.slice(0, hyphenIdx).trim() || 'VK Музыка',
      title: raw.slice(hyphenIdx + 3).trim() || raw
    };
  }
  return {
    artist: uiStore.vkActive ? 'VK Музыка' : 'Аудиопоток A.R.C.',
    title: raw
  };
});

const currentTrackTitle = computed(() => props.trackTitle || parsedTrack.value.title);
const currentArtist = computed(() => props.artist || parsedTrack.value.artist);
const coverUrl = computed(() => props.coverUrl ?? uiStore.musicCover);

watch(coverUrl, () => {
  coverLoadError.value = false;
});

const sourceLabel = computed(() => {
  if (uiStore.vkActive) return isPlaying.value ? 'VK AUDIO · ИГРАЕТ' : 'VK AUDIO · ПАУЗА';
  if (uiStore.musicState !== 'stopped') return isPlaying.value ? 'STREAM · ИГРАЕТ' : 'STREAM · ПАУЗА';
  return 'STANDBY';
});

const formatSeconds = (sec: number): string => {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const currentTimeFormatted = computed(() => props.currentTime || formatSeconds(uiStore.musicCurrentTime));
const durationFormatted = computed(() => props.duration || formatSeconds(uiStore.musicDuration));

const progressPercent = computed(() => {
  if (uiStore.musicDuration <= 0) return 0;
  return Math.min(100, Math.max(0, (uiStore.musicCurrentTime / uiStore.musicDuration) * 100));
});

const volumePercent = computed(() => {
  const v = Number(uiStore.musicVolume);
  if (!Number.isFinite(v)) return 50;
  return Math.round(Math.min(1, Math.max(0, v)) * 100);
});

const isRepeatActive = computed(() => {
  return uiStore.musicRepeated !== 'off' && Boolean(uiStore.musicRepeated);
});

const isRepeatSingleTrack = computed(() => {
  return uiStore.musicRepeated === 'track' || uiStore.musicRepeated === true;
});

const repeatTooltip = computed(() => {
  if (isRepeatSingleTrack.value) return 'Повтор одного трека (1)';
  if (uiStore.musicRepeated === 'playlist') return 'Повтор плейлиста';
  return 'Повтор выключен';
});

const onToggle = () => emit('toggle');
const onPrev = () => emit('prev');
const onNext = () => emit('next');
const onOpenVk = () => emit('open-vk');
const onSeek = (event: MouseEvent) => {
  if (!uiStore.vkActive) {
    emit('seek', 0);
    return;
  }
  if (uiStore.musicDuration <= 0) return;
  const bar = event.currentTarget as HTMLElement | null;
  if (!bar) return;
  const rect = bar.getBoundingClientRect();
  if (rect.width <= 0) return;
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const percentage = Math.round(ratio * 1000) / 10;
  emit('seek', percentage);
};
const onShuffle = () => emit('shuffle');
const onRepeat = () => emit('repeat');
const onLike = () => emit('like');
const onMute = () => emit('mute');
const onVolumeInput = (event: Event) => emit('volume', event);
</script>
