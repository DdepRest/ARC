<template>
  <section id="section-graphics" class="scroll-mt-14 flex flex-col gap-6 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Система · Подсистема 01"
      title="Графика и 3D-Ядро"
      description="Единый кинематографичный движок 3D-реактора WebGL2: профили Eco / Balanced / Cinematic, временный режим Showcase и тонкая настройка PBR-конвейера."
      :statusLabel="headerStatusLabel"
      statusTone="accent"
      blockCountText="Профили · Showcase · Расширенные"
      :icon="Layers"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <div class="flex flex-col gap-6">
      <SettingsGroup
        indexLabel="01"
        title="Профили качества и Showcase"
        description="Выберите постоянный профиль работы или запустите временную демонстрацию максимального качества"
        :badgeText="presetBadgeText"
      >
        <GraphicsPresetBanner />
      </SettingsGroup>

      <!-- Collapsed-by-default Advanced Settings Accordion -->
      <div class="rounded-[16px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] overflow-hidden">
        <button
          type="button"
          @click="advancedOpen = !advancedOpen"
          :aria-expanded="advancedOpen"
          class="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--arc-hover)] transition cursor-pointer"
        >
          <div class="flex flex-col gap-0.5 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono text-[var(--arc-text-muted)]">02</span>
              <span class="text-sm font-semibold text-[var(--arc-text-primary)]">Расширенные параметры рендеринга</span>
              <span v-if="store.isGraphicsModified" class="px-2 py-0.5 rounded-[5px] text-xs font-mono bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)]">Изменён</span>
            </div>
            <span class="text-xs text-[var(--arc-text-muted)]">
              Ручное управление MSAA/FXAA, разрешением PBR-текстур, PMREM, GTAO, тенями, Bloom, шейдерами и адаптивным качеством
            </span>
          </div>
          <span class="shrink-0 inline-flex items-center gap-1.5 text-xs font-mono text-[var(--arc-text-secondary)]">
            <span>{{ advancedOpen ? 'Свернуть' : 'Раскрыть' }}</span>
            <ChevronDown class="w-4 h-4 transition-transform duration-200" :class="advancedOpen ? 'rotate-180' : ''" />
          </span>
        </button>

        <div v-show="advancedOpen" class="border-t border-[var(--arc-hairline)] p-4 sm:p-5 flex flex-col gap-6">
          <SettingsBlock title="Сглаживание, разрешение и адаптивность" subtitle="MSAA, FXAA, DPR, масштаб буфера и защита 60 FPS">
            <SettingsRow id="system.gfx.adaptive" label="Адаптивное управление производительностью" description="Автоматическое ступенчатое снижение нагрузки при просадках FPS ниже 55 с возвратом при стабильных 60 FPS." data-search="адаптивное качество авто fps adaptive performance фиксированное">
              <ArcToggle v-model="store.autoAdjustGraphics" />
            </SettingsRow>
            <SettingsRow id="system.gfx.msaa" label="Аппаратное сглаживание (WebGL2 MSAA)" description="Мультисэмплинг геометрии во фреймбуфере EffectComposer (до 4x, ограничивается возможностями GPU)." data-search="msaa сглаживание антиалиасинг мультисэмплинг 2x 4x">
              <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button v-for="opt in msaaOptions" :key="opt.value" type="button" @click="store.updateGraphicsParam('msaaSamples', opt.value)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer" :class="btnClass(cfg.msaaSamples === opt.value)">{{ opt.label }}</button>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.fxaa" label="Экранное пост-сглаживание (FXAA)" description="Проход сглаживания высококонтрастных кромок после OutputPass в пространстве sRGB." data-search="fxaa пост сглаживание шейдер блики контуры">
              <ArcToggle :modelValue="cfg.fxaaEnabled" @update:modelValue="(val: boolean) => store.updateGraphicsParam('fxaaEnabled', val)" />
            </SettingsRow>
            <SettingsRow id="system.gfx.dpr" label="Плотность пикселей (Target DPR)" description="Базовая плотность пикселей WebGL-буфера для чёткости тонких колец и логотипа." data-search="dpr плотность пикселей четкость разрешение">
              <div class="inline-flex flex-wrap gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button v-for="opt in dprOptions" :key="String(opt.value)" type="button" @click="store.updateGraphicsParam('targetDpr', opt.value)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer" :class="btnClass(cfg.targetDpr === opt.value)">{{ opt.label }}</button>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.render_scale" label="Масштаб внутреннего рендера (Render Scale)" description="Множитель разрешения буфера рендера (75% — экономия fillrate, 125% — суперсэмплинг)." data-search="render scale масштаб рендера разрешение 75 85 95 100 115 125">
              <div class="inline-flex flex-wrap gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button v-for="scale in renderScaleOptions" :key="scale" type="button" @click="store.updateGraphicsParam('renderScale', scale)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer" :class="btnClass(cfg.renderScale === scale)">{{ Math.round(scale * 100) }}%</button>
              </div>
            </SettingsRow>
          </SettingsBlock>

          <SettingsBlock title="PBR-материалы, текстуры и студийный PMREM" subtitle="Разрешение процедурных карт, фильтрация и студийная карта отражений">
            <SettingsRow id="system.gfx.tex_res" label="Разрешение PBR-карт материалов" description="Тир генерации карт Albedo / Normal / Roughness / AO для титана, карбона и керамики." data-search="текстуры pbr разрешение 256 512 1024 2048 normal roughness">
              <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button v-for="res in texResOptions" :key="res" type="button" @click="store.updateGraphicsParam('textureResolution', res)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer" :class="btnClass(cfg.textureResolution === res)">{{ res }}</button>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.anisotropy" label="Анизотропная фильтрация (Anisotropic)" description="Чёткость логотипа A.R.C. и металлических фасок под острыми углами." data-search="анизотропная фильтрация текстур декали логотип 1x 4x 8x 16x">
              <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button v-for="aniso in ([1, 2, 4, 8, 16] as const)" :key="aniso" type="button" @click="store.updateGraphicsParam('anisotropy', aniso)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer" :class="btnClass(cfg.anisotropy === aniso)">{{ aniso }}x</button>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.trilinear" label="Трилинейная фильтрация мипмапов" description="Плавная фильтрация без муара при вращении деталей." data-search="трилинейная фильтрация мипмапы trilinear mipmaps">
              <ArcToggle :modelValue="cfg.trilinearFiltering" @update:modelValue="(val: boolean) => store.updateGraphicsParam('trilinearFiltering', val)" />
            </SettingsRow>
            <SettingsRow id="system.gfx.pmrem" label="Качество студийного PMREM-окружения" description="Уровень детализации и мягких софтбокс-отражений на титане и оптическом стекле." data-search="pmrem отражения софтбокс окружение environment">
              <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button v-for="opt in pmremOptions" :key="opt.value" type="button" @click="store.updateGraphicsParam('pmremQuality', opt.value)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer" :class="btnClass(cfg.pmremQuality === opt.value)">{{ opt.label }}</button>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.env_intensity" label="Интенсивность металлических отражений" description="Яркость студийных бликов на титановом шасси и кромках." data-search="интенсивность отражений envmap блеск металл">
              <div class="w-52 shrink-0">
                <ArcSlider :model-value="cfg.envMapIntensity" :min="50" :max="150" :step="5" unit="%" :show-value="true" @update:model-value="(val: number) => store.updateGraphicsParam('envMapIntensity', val)" />
              </div>
            </SettingsRow>
          </SettingsBlock>

          <SettingsBlock title="Освещение, тени, GTAO и пост-обработка" subtitle="Ambient Occlusion, мягкие тени, калиброванный Bloom и цветокоррекция">
            <SettingsRow id="system.gfx.ao" label="Контактное затенение (Ambient Occlusion / GTAO)" description="Затенение механических стыков и углублений корпуса на половинном разрешении." data-search="ao gtao ssao затенение стыки глубина">
              <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button v-for="opt in aoOptions" :key="opt.value" type="button" @click="store.updateGraphicsParam('aoMode', opt.value)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer" :class="btnClass(cfg.aoMode === opt.value)">{{ opt.label }}</button>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.shadows" label="Тени студийного Key-света (Shadow Map)" description="Контролируемые мягкие PCF-тени только от главного источника для читаемого рельефа." data-search="тени shadows pcf shadow map key light">
              <div class="inline-flex flex-wrap gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button v-for="opt in shadowOptions" :key="opt.value" type="button" @click="store.updateGraphicsParam('shadowQuality', opt.value)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer" :class="btnClass(cfg.shadowQuality === opt.value)">{{ opt.label }}</button>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.bloom" label="Оптическое свечение (Unreal Bloom Pass)" description="Калиброванный ореол вокруг плазменных трубок без засветки корпуса и логотипа." data-search="unreal bloom свечение неон ореол пост обработка">
              <ArcToggle :modelValue="cfg.bloomEnabled" @update:modelValue="(val: boolean) => store.updateGraphicsParam('bloomEnabled', val)" />
            </SettingsRow>
            <SettingsRow id="system.gfx.bloom_strength" label="Сила и радиус свечения (Bloom Strength / Radius)" description="Интенсивность и ширина оптического ореола." data-search="сила радиус свечения bloom strength radius">
              <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <div class="w-44"><ArcSlider :model-value="cfg.bloomStrength" :min="50" :max="150" :step="5" unit="%" :disabled="!cfg.bloomEnabled" :show-value="true" @update:model-value="(val: number) => store.updateGraphicsParam('bloomStrength', val)" /></div>
                <div class="w-44"><ArcSlider :model-value="cfg.bloomRadius" :min="0.2" :max="0.8" :step="0.05" :disabled="!cfg.bloomEnabled" :show-value="true" :format-value="(val: number) => val.toFixed(2)" @update:model-value="(val: number) => store.updateGraphicsParam('bloomRadius', val)" /></div>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.bloom_threshold" label="Порог отсечения свечения (Bloom Threshold)" description="Более высокий порог оставляет корпус чистым, подсвечивая только эмиссионное ядро." data-search="порог bloom threshold засветка">
              <div class="w-52 shrink-0">
                <ArcSlider :model-value="cfg.bloomThreshold" :min="0.35" :max="0.85" :step="0.02" :disabled="!cfg.bloomEnabled" :show-value="true" :format-value="(val: number) => val.toFixed(2)" @update:model-value="(val: number) => store.updateGraphicsParam('bloomThreshold', val)" />
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.volumetric" label="Объёмные лучи и кинематографичная цветокоррекция" description="Тонкие лучи за корпусом реактора, мягкий контраст и виньетирование." data-search="лучи volumetric цветокоррекция color grading виньетка">
              <div class="flex items-center gap-4">
                <label class="inline-flex items-center gap-2 text-xs text-[var(--arc-text-secondary)]">
                  <span>Лучи</span>
                  <ArcToggle :modelValue="cfg.volumetricRays" @update:modelValue="(val: boolean) => store.updateGraphicsParam('volumetricRays', val)" />
                </label>
                <label class="inline-flex items-center gap-2 text-xs text-[var(--arc-text-secondary)]">
                  <span>Грейдинг</span>
                  <ArcToggle :modelValue="cfg.colorGrading" @update:modelValue="(val: boolean) => store.updateGraphicsParam('colorGrading', val)" />
                </label>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.color_buffer" label="Точность цветового буфера (HDR Framebuffer)" description="16-bit HalfFloat устраняет banding в тёмных градиентах (с авто-фолбэком при отсутствии поддержки GPU)." data-search="halffloat hdr глубина цвета 16 bit 8 bit буфер">
              <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button v-for="opt in bufferOptions" :key="opt.value" type="button" @click="store.updateGraphicsParam('colorBufferPrecision', opt.value)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer" :class="btnClass(cfg.colorBufferPrecision === opt.value)">{{ opt.label }}</button>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.point_lights" label="Контур динамического освещения" description="Количество активных динамических источников света ядра и периметра." data-search="точечный свет point lights освещение контур">
              <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button v-for="opt in lightOptions" :key="opt.value" type="button" @click="store.updateGraphicsParam('dynamicPointLights', opt.value)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer" :class="btnClass(cfg.dynamicPointLights === opt.value)">{{ opt.label }}</button>
              </div>
            </SettingsRow>
          </SettingsBlock>

          <SettingsBlock title="Шейдеры, физика и частицы" subtitle="GLSL-плазма, гармоники, пружинная инерция и энергетическое поле">
            <SettingsRow id="system.gfx.glsl_plasma" label="GLSL-шейдер плазмы и сферические гармоники" description="Детализированный шейдер вихря и микро-колебания кристаллической решётки." data-search="glsl шейдер плазма френель гармоники">
              <div class="flex items-center gap-4">
                <label class="inline-flex items-center gap-2 text-xs text-[var(--arc-text-secondary)]">
                  <span>Плазма</span>
                  <ArcToggle :modelValue="cfg.glslPlasmaShader" @update:modelValue="(val: boolean) => store.updateGraphicsParam('glslPlasmaShader', val)" />
                </label>
                <label class="inline-flex items-center gap-2 text-xs text-[var(--arc-text-secondary)]">
                  <span>Гармоники</span>
                  <ArcToggle :modelValue="cfg.sphericalHarmonics" @update:modelValue="(val: boolean) => store.updateGraphicsParam('sphericalHarmonics', val)" />
                </label>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.spring_physics" label="Инерция колец, импульсы и 3-полосный аудио-спектр" description="Пружинно-демпферная динамика диафрагмы, ударные волны и аудио-реакция 3 сторон." data-search="пружинная физика ударные волны shockwaves аудио спектр">
              <div class="flex flex-wrap items-center gap-4">
                <label class="inline-flex items-center gap-2 text-xs text-[var(--arc-text-secondary)]">
                  <span>Инерция</span>
                  <ArcToggle :modelValue="cfg.springPhysics" @update:modelValue="(val: boolean) => store.updateGraphicsParam('springPhysics', val)" />
                </label>
                <label class="inline-flex items-center gap-2 text-xs text-[var(--arc-text-secondary)]">
                  <span>Импульсы</span>
                  <ArcToggle :modelValue="cfg.shockwavesEnabled" @update:modelValue="(val: boolean) => store.updateGraphicsParam('shockwavesEnabled', val)" />
                </label>
                <label class="inline-flex items-center gap-2 text-xs text-[var(--arc-text-secondary)]">
                  <span>Аудио 3-band</span>
                  <ArcToggle :modelValue="cfg.spatialAudioBands" @update:modelValue="(val: boolean) => store.updateGraphicsParam('spatialAudioBands', val)" />
                </label>
              </div>
            </SettingsRow>
            <SettingsRow id="system.gfx.particles" label="Плотность частиц, искр и квантовой пыли" description="Доля активных частиц вокруг реактора (0% — отключено, 100% — полный объём)." data-search="плотность частиц искры пыль particles">
              <div class="inline-flex flex-wrap gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button v-for="opt in particleOptions" :key="opt.value" type="button" @click="store.updateGraphicsParam('particleDensity', opt.value)" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer" :class="btnClass(cfg.particleDensity === opt.value)">{{ opt.label }}</button>
              </div>
            </SettingsRow>
          </SettingsBlock>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { GRAPHICS_PRESET_META } from '../../../logic/graphics-presets';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import ArcSlider from '../../../../../components/ui/ArcSlider.vue';
import GraphicsPresetBanner from './GraphicsPresetBanner.vue';
import { Layers, ChevronDown } from 'lucide-vue-next';

const store = useSettingsStore();
const cfg = computed(() => store.graphicsConfig);
const advancedOpen = ref(false);

// Auto-expand accordion when deep-linked from settings search
watch(
  () => store.pendingHighlightId,
  (id) => {
    if (id && id.startsWith('system.gfx.') && id !== 'system.gfx.preset') {
      advancedOpen.value = true;
    }
  },
  { immediate: true }
);

const activeMeta = computed(() => GRAPHICS_PRESET_META[store.graphicsPreset] || GRAPHICS_PRESET_META.Balanced);
const presetBadgeText = computed(() => (store.isGraphicsModified ? `${activeMeta.value.code} · Изменён` : activeMeta.value.code));
const headerStatusLabel = computed(() =>
  store.showcaseActive ? 'SHOWCASE АКТИВЕН' : `ПРОФИЛЬ: ${presetBadgeText.value}`
);

const summaryItems = computed<SummaryStripItem[]>(() => [
  { label: 'Профиль рендера', value: activeMeta.value.code, tone: 'accent', detail: `Масштаб ${Math.round(cfg.value.renderScale * 100)}% · Tex ${cfg.value.textureResolution}` },
  { label: 'Сглаживание', value: cfg.value.msaaSamples > 0 ? `MSAA ${cfg.value.msaaSamples}x` : (cfg.value.fxaaEnabled ? 'FXAA' : 'Выкл'), tone: cfg.value.msaaSamples > 0 || cfg.value.fxaaEnabled ? 'accent' : 'off', detail: cfg.value.fxaaEnabled ? 'FXAA после OutputPass' : 'Без FXAA' },
  { label: 'Освещение и AO', value: cfg.value.aoMode === 'gtao' ? 'GTAO' : cfg.value.aoMode === 'light' ? 'Light AO' : 'AO Выкл', tone: cfg.value.aoMode !== 'off' ? 'default' : 'off', detail: `Тени: ${cfg.value.shadowQuality} · ${cfg.value.colorBufferPrecision === 'halfFloat' ? 'HDR' : '8-bit'}` },
  { label: 'Адаптивность', value: store.autoAdjustGraphics ? 'Авто 60 FPS' : 'Фикс.', tone: store.autoAdjustGraphics ? 'ok' : 'default', detail: `Частицы ${cfg.value.particleDensity}%` },
]);

const btnClass = (active: boolean) =>
  active
    ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)] font-semibold'
    : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent';

const msaaOptions = [{ value: 0 as const, label: 'Выкл' }, { value: 2 as const, label: '2x' }, { value: 4 as const, label: '4x' }];
const dprOptions = [{ value: 1.0 as const, label: '1.0x' }, { value: 1.15 as const, label: '1.15x' }, { value: 1.25 as const, label: '1.25x' }, { value: 'auto' as const, label: 'Авто' }];
const renderScaleOptions = [0.75, 0.85, 0.95, 1.0, 1.15, 1.25] as const;
const texResOptions = [256, 512, 1024, 2048] as const;
const pmremOptions = [{ value: 'eco' as const, label: 'Эко' }, { value: 'standard' as const, label: 'Стандарт' }, { value: 'high' as const, label: 'Высокий' }];
const aoOptions = [{ value: 'off' as const, label: 'Выкл' }, { value: 'light' as const, label: 'Light' }, { value: 'gtao' as const, label: 'GTAO' }];
const shadowOptions = [{ value: 'off' as const, label: 'Выкл' }, { value: 'contact' as const, label: 'Контактные' }, { value: 'soft1024' as const, label: 'Soft 1024' }, { value: 'soft2048' as const, label: 'Soft 2048' }];
const bufferOptions = [{ value: 'halfFloat' as const, label: '16-bit HDR' }, { value: 'unsignedByte' as const, label: '8-bit' }];
const lightOptions = [{ value: 'eco' as const, label: 'Эко' }, { value: 'standard' as const, label: 'Стандарт' }, { value: 'full' as const, label: 'Полный' }];
const particleOptions = [{ value: 0 as const, label: 'Выкл' }, { value: 25 as const, label: '25%' }, { value: 50 as const, label: '50%' }, { value: 60 as const, label: '60%' }, { value: 100 as const, label: '100%' }];
</script>
