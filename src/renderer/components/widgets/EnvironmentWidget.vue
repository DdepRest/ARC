<template>
  <ArcHudWidget status="ok" status-title="Метеосводка">
    <div class="flex flex-col gap-3">
      <!-- Top Row: Location & Atmospheric Moon Illustration -->
      <div class="flex items-start justify-between">
        <div class="flex flex-col">
          <div class="flex items-center gap-1.5 text-white/90">
            <span class="text-[14px] font-medium tracking-tight">{{ locationName }}</span>
            <Navigation class="w-3.5 h-3.5 text-[var(--accent)] rotate-45" />
          </div>
          <!-- Big Temperature Metric matching Screenshot -->
          <div class="text-[40px] font-light tracking-tight text-white leading-none my-1.5">
            {{ temperatureValue }}
          </div>
        </div>

        <!-- Atmospheric Moon with Crimson Cloud Backlight matching Screenshot -->
        <div class="w-20 h-16 relative flex items-center justify-end overflow-hidden shrink-0 select-none">
          <!-- Crimson Cloud Ambient Glow from Screenshot -->
          <div 
            class="absolute -right-2 -bottom-2 w-16 h-12 rounded-full blur-[8px] opacity-70 pointer-events-none"
            :style="{ background: 'radial-gradient(circle, rgba(var(--accent-rgb), 0.8) 0%, transparent 75%)' }"
          ></div>

          <!-- Moon SVG with Dark Cloud Silhouette -->
          <svg class="w-14 h-14 relative z-10" viewBox="0 0 48 48" fill="none">
            <!-- Crescent Moon -->
            <path 
              d="M26 6C17.163 6 10 13.163 10 22C10 30.837 17.163 38 26 38C28.847 38 31.523 37.258 33.844 35.961C27.062 34.629 22 28.675 22 21.5C22 14.325 27.062 8.371 33.844 7.039C31.523 5.742 28.847 5 26 5V6Z" 
              fill="#E4E4E7" 
            />
            <!-- Dark Cloud Foreground with Crimson Rim -->
            <path 
              d="M14 36C14 31.582 17.582 28 22 28C22.68 28 23.337 28.085 23.965 28.245C25.541 24.582 29.176 22 33.5 22C39.299 22 44 26.701 44 32.5C44 33.064 43.955 33.617 43.869 34.156C44.57 34.671 45 35.534 45 36.5C45 38.433 43.433 40 41.5 40H18C15.791 40 14 38.209 14 36Z" 
              fill="#0A0A0A" 
              stroke="rgba(var(--accent-rgb), 0.45)"
              stroke-width="1.2"
            />
          </svg>
        </div>
      </div>

      <!-- Bottom Grid: Condition & Environmental Telemetry matching Screenshot -->
      <div class="grid grid-cols-2 gap-2 text-[10px]">
        <!-- Left: Condition & Feels Like -->
        <div class="flex flex-col justify-center">
          <span class="text-white/80 font-medium text-[11px]">{{ conditionText }}</span>
          <span class="text-white/40 font-mono mt-1">Чувствуется +10°</span>
        </div>

        <!-- Right: Wind & Humidity -->
        <div class="flex flex-col justify-center gap-1.5 font-mono text-white/60">
          <div class="flex items-center gap-1.5">
            <Wind class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>Ветер 3 м/с</span>
          </div>
          <div class="flex items-center gap-1.5">
            <Droplets class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>Влажность 68%</span>
          </div>
        </div>
      </div>
    </div>
  </ArcHudWidget>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ArcHudWidget from './ArcHudWidget.vue';
import { Navigation, Wind, Droplets } from 'lucide-vue-next';

const locationName = computed(() => 'Москва');
const temperatureValue = computed(() => '+12°');
const conditionText = computed(() => 'Переменная облачность');
</script>
