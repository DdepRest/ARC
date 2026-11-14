<template>
  <section id="section-graphics" class="scroll-mt-14 flex flex-col gap-4 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader
      title="Графика и 3D-Ядро"
      description="Детальная конфигурация конвейера рендеринга WebGL2, сглаживания (MSAA/FXAA/SSAA), фильтрации текстур, шейдеров и физики реактора."
      blockCountText="5 блоков · 15 параметров рендера"
      :icon="Layers"
    />

    <GraphicsPresetBanner />

    <div class="flex flex-col gap-4">
      <!-- Block 1: Anti-Aliasing & Upscale -->
      <SettingsBlock title="Сглаживание и разрешение" subtitle="MSAA, FXAA, суперсэмплинг SSAA и масштаб рендера">
        <SettingsRow
          id="system.gfx.msaa"
          label="Аппаратное сглаживание (WebGL2 MSAA)"
          description="Мультисэмплинг геометрических граней колец и центрального треугольника во фреймбуфере."
          data-search="msaa сглаживание антиалиасинг мультисэмплинг 2x 4x 8x грани лесенки"
        >
          <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
            <button
              v-for="opt in msaaOptions"
              :key="opt.value"
              type="button"
              @click="store.updateGraphicsParam('msaaSamples', opt.value)"
              class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer"
              :class="btnClass(cfg.msaaSamples === opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </SettingsRow>

        <SettingsRow
          id="system.gfx.fxaa"
          label="Экранное пост-сглаживание (FXAA ShaderPass)"
          description="Дополнительный проход сглаживания высококонтрастных субпиксельных бликов после Bloom."
          data-search="fxaa пост сглаживание шейдер блики контуры"
        >
          <ArcToggle
            :modelValue="cfg.fxaaEnabled"
            @update:modelValue="(val: boolean) => store.updateGraphicsParam('fxaaEnabled', val)"
          />
        </SettingsRow>

        <SettingsRow
          id="system.gfx.dpr"
          label="Плотность пикселей и суперсэмплинг (DPR / SSAA)"
          description="Рендер в повышенном разрешении (2.0x SSAA даёт эталонную чёткость декалей и тонких колец на 1080p)."
          data-search="dpr ssaa суперсэмплинг плотность пикселей четкость мыло разрешение"
        >
          <div class="inline-flex flex-wrap gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
            <button
              v-for="opt in dprOptions"
              :key="String(opt.value)"
              type="button"
              @click="store.updateGraphicsParam('targetDpr', opt.value)"
              class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer"
              :class="btnClass(cfg.targetDpr === opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </SettingsRow>

        <SettingsRow
          id="system.gfx.render_scale"
          label="Масштаб внутреннего рендера (Render Scale)"
          description="Множитель разрешения буфера относительно целевого DPR (50% — буст FPS, 150% — избыточная чёткость)."
          data-search="render scale масштаб рендера разрешение апскейл 50 75 100 125 150"
        >
          <div class="inline-flex flex-wrap gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
            <button
              v-for="scale in ([0.5, 0.75, 1.0, 1.25, 1.5] as const)"
              :key="scale"
              type="button"
              @click="store.updateGraphicsParam('renderScale', scale)"
              class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer"
              :class="btnClass(cfg.renderScale === scale)"
            >
              {{ Math.round(scale * 100) }}%
            </button>
          </div>
        </SettingsRow>
      </SettingsBlock>

      <!-- Block 2: Textures & Reflections -->
      <SettingsBlock title="Текстуры и отражения" subtitle="Анизотропная фильтрация логотипа A.R.C. и металлический PBR-блеск">
        <SettingsRow
          id="system.gfx.anisotropy"
          label="Анизотропная фильтрация декалей (Anisotropic)"
          description="Чёткость центрального штампа A.R.C., шкал и прицельных сеток под острыми углами наклона."
          data-search="анизотропная фильтрация текстур декали логотип четкость 1x 4x 8x 16x"
        >
          <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
            <button
              v-for="aniso in ([1, 2, 4, 8, 16] as const)"
              :key="aniso"
              type="button"
              @click="store.updateGraphicsParam('anisotropy', aniso)"
              class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer"
              :class="btnClass(cfg.anisotropy === aniso)"
            >
              {{ aniso }}x
            </button>
          </div>
        </SettingsRow>

        <SettingsRow
          id="system.gfx.trilinear"
          label="Трилинейная фильтрация мипмапов (Trilinear Mipmaps)"
          description="Плавная интерполяция между уровнями детализации текстур без муара при вращении колец."
          data-search="трилинейная фильтрация мипмапы trilinear mipmaps муар текстуры"
        >
          <ArcToggle
            :modelValue="cfg.trilinearFiltering"
            @update:modelValue="(val: boolean) => store.updateGraphicsParam('trilinearFiltering', val)"
          />
        </SettingsRow>

        <SettingsRow
          id="system.gfx.pmrem"
          label="Карта отражений окружения (PMREM Environment)"
          description="Физически корректные блики на титановом шасси, медных обмотках и тёмном стекле."
          data-search="pmrem отражения окружение блики металл стекло environment"
        >
          <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
            <button
              v-for="opt in pmremOptions"
              :key="opt.value"
              type="button"
              @click="store.updateGraphicsParam('pmremQuality', opt.value)"
              class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer"
              :class="btnClass(cfg.pmremQuality === opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </SettingsRow>

        <SettingsRow
          id="system.gfx.env_intensity"
          label="Интенсивность металлических отражений"
          description="Яркость зеркальных бликов на внешнем кольце и зажимах камеры."
          data-search="интенсивность металлических отражений envmap блеск металл"
        >
          <div class="w-52 shrink-0">
            <ArcSlider
              :model-value="cfg.envMapIntensity"
              :min="50"
              :max="150"
              :step="5"
              unit="%"
              :show-value="true"
              @update:model-value="(val: number) => store.updateGraphicsParam('envMapIntensity', val)"
            />
          </div>
        </SettingsRow>
      </SettingsBlock>

      <!-- Block 3: Post-Processing & Lighting -->
      <SettingsBlock title="Пост-обработка и освещение" subtitle="Unreal Bloom, глубина цвета HDR и точечные источники света">
        <SettingsRow
          id="system.gfx.bloom"
          label="Оптическое свечение (Unreal Bloom Pass)"
          description="Мягкий неоновый ореол вокруг плазменных трубок и центрального ядра."
          data-search="unreal bloom свечение неон ореол пост обработка"
        >
          <ArcToggle
            :modelValue="cfg.bloomEnabled"
            @update:modelValue="(val: boolean) => store.updateGraphicsParam('bloomEnabled', val)"
          />
        </SettingsRow>

        <SettingsRow
          id="system.gfx.bloom_strength"
          label="Множитель силы свечения (Bloom Strength)"
          description="Баланс яркости ореола (100% — штатный профиль без засветки треугольника)."
          data-search="сила свечения bloom strength яркость ореола засветка"
        >
          <div class="w-52 shrink-0">
            <ArcSlider
              :model-value="cfg.bloomStrength"
              :min="50"
              :max="150"
              :step="5"
              unit="%"
              :disabled="!cfg.bloomEnabled"
              :show-value="true"
              @update:model-value="(val: number) => store.updateGraphicsParam('bloomStrength', val)"
            />
          </div>
        </SettingsRow>

        <SettingsRow
          id="system.gfx.bloom_radius"
          label="Радиус рассеивания ореола (Bloom Radius)"
          description="Ширина диффузного свечения вокруг эмиссионных контуров (0.20 — узкий, 0.80 — широкий)."
          data-search="радиус свечения bloom radius рассеивание ореол"
        >
          <div class="w-52 shrink-0">
            <ArcSlider
              :model-value="cfg.bloomRadius"
              :min="0.2"
              :max="0.8"
              :step="0.05"
              :disabled="!cfg.bloomEnabled"
              :show-value="true"
              :format-value="(val: number) => val.toFixed(2)"
              @update:model-value="(val: number) => store.updateGraphicsParam('bloomRadius', val)"
            />
          </div>
        </SettingsRow>

        <SettingsRow
          id="system.gfx.color_buffer"
          label="Точность цветового буфера (HDR Framebuffer)"
          description="HalfFloat 16-bit устраняет ступенчатость градиентов (banding) в тёмном стекле."
          data-search="halffloat hdr глубина цвета 16 bit 8 bit буфер градиенты banding"
        >
          <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
            <button
              v-for="opt in bufferOptions"
              :key="opt.value"
              type="button"
              @click="store.updateGraphicsParam('colorBufferPrecision', opt.value)"
              class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer"
              :class="btnClass(cfg.colorBufferPrecision === opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </SettingsRow>

        <SettingsRow
          id="system.gfx.point_lights"
          label="Динамические точечные источники света (Point Lights)"
          description="Освещение вершин треугольника, внешних зажимов и траншейных каналов."
          data-search="точечный свет point lights освещение вершины зажимы"
        >
          <div class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
            <button
              v-for="opt in lightOptions"
              :key="opt.value"
              type="button"
              @click="store.updateGraphicsParam('dynamicPointLights', opt.value)"
              class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer"
              :class="btnClass(cfg.dynamicPointLights === opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </SettingsRow>
      </SettingsBlock>

      <!-- Block 4: Shaders, Physics & Particles -->
      <SettingsBlock title="Шейдеры, физика и частицы" subtitle="Процедурная плазма, гармоники, инерция колец и плотность искр">
        <SettingsRow
          id="system.gfx.glsl_plasma"
          label="Процедурный GLSL-шейдер плазмы Френеля"
          description="Анимированная симплекс-турбулентность и краевое свечение Френеля внутри вихря ядра."
          data-search="glsl шейдер плазма френель fresnel turbulence вихрь"
        >
          <ArcToggle
            :modelValue="cfg.glslPlasmaShader"
            @update:modelValue="(val: boolean) => store.updateGraphicsParam('glslPlasmaShader', val)"
          />
        </SettingsRow>

        <SettingsRow
          id="system.gfx.harmonics"
          label="Сферические гармоники ядра (Spherical Harmonics)"
          description="Микро-деформация внутренней кристаллической решётки в такт басу и частотам голоса."
          data-search="сферические гармоники spherical harmonics деформация кристалл"
        >
          <ArcToggle
            :modelValue="cfg.sphericalHarmonics"
            @update:modelValue="(val: boolean) => store.updateGraphicsParam('sphericalHarmonics', val)"
          />
        </SettingsRow>

        <SettingsRow
          id="system.gfx.spring_physics"
          label="Пружинно-демпферная инерция колец (Spring-Damper)"
          description="Физический отскок и инерционное раскрытие диафрагмы и колец при смене состояний ИИ."
          data-search="пружинная физика инерция spring damper отскок кольца"
        >
          <ArcToggle
            :modelValue="cfg.springPhysics"
            @update:modelValue="(val: boolean) => store.updateGraphicsParam('springPhysics', val)"
          />
        </SettingsRow>

        <SettingsRow
          id="system.gfx.shockwaves"
          label="Импульсные ударные волны (Shockwaves)"
          description="Расходящиеся энергетические волны по внешнему контуру при активации слова-триггера."
          data-search="ударные волны shockwaves импульс отклик"
        >
          <ArcToggle
            :modelValue="cfg.shockwavesEnabled"
            @update:modelValue="(val: boolean) => store.updateGraphicsParam('shockwavesEnabled', val)"
          />
        </SettingsRow>

        <SettingsRow
          id="system.gfx.spatial_audio"
          label="3-полосный пространственный аудио-спектр"
          description="Раздельная реакция 3 сторон треугольника на НЧ (Bass), СЧ (Mid) и ВЧ (Treble)."
          data-search="3 полосный аудио спектр эквалайзер треугольник голос"
        >
          <ArcToggle
            :modelValue="cfg.spatialAudioBands"
            @update:modelValue="(val: boolean) => store.updateGraphicsParam('spatialAudioBands', val)"
          />
        </SettingsRow>

        <SettingsRow
          id="system.gfx.particles"
          label="Плотность частиц, искр и квантовой пыли"
          description="Количество активных частиц в магнитной ловушке и внешнем поле."
          data-search="плотность частиц искры пыль particles sparks"
        >
          <div class="inline-flex flex-wrap gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
            <button
              v-for="opt in particleOptions"
              :key="opt.value"
              type="button"
              @click="store.updateGraphicsParam('particleDensity', opt.value)"
              class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer"
              :class="btnClass(cfg.particleDensity === opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </SettingsRow>
      </SettingsBlock>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import ArcSlider from '../../../../../components/ui/ArcSlider.vue';
import GraphicsPresetBanner from './GraphicsPresetBanner.vue';
import { Layers } from 'lucide-vue-next';

const store = useSettingsStore();
const cfg = computed(() => store.graphicsConfig);

const btnClass = (active: boolean) =>
  active
    ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)] font-semibold'
    : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent';

const msaaOptions = [{ value: 0 as const, label: 'Выкл' }, { value: 2 as const, label: '2x' }, { value: 4 as const, label: '4x' }, { value: 8 as const, label: '8x MSAA' }];
const dprOptions = [{ value: 1.0 as const, label: '1.0x' }, { value: 1.25 as const, label: '1.25x' }, { value: 1.5 as const, label: '1.5x' }, { value: 2.0 as const, label: '2.0x SSAA' }, { value: 'auto' as const, label: 'Авто' }];
const pmremOptions = [{ value: 'off' as const, label: 'Выкл' }, { value: 'standard' as const, label: 'Стандарт' }, { value: 'high' as const, label: 'Высокие' }];
const bufferOptions = [{ value: 'halfFloat' as const, label: '16-bit HalfFloat HDR' }, { value: 'unsignedByte' as const, label: '8-bit Стандарт' }];
const lightOptions = [{ value: 'eco' as const, label: 'Эко (3)' }, { value: 'standard' as const, label: 'Стандарт (6)' }, { value: 'full' as const, label: 'Полное (12)' }];
const particleOptions = [{ value: 0 as const, label: 'Выкл' }, { value: 25 as const, label: '25%' }, { value: 60 as const, label: '60%' }, { value: 100 as const, label: '100%' }, { value: 150 as const, label: '150%' }];
</script>
