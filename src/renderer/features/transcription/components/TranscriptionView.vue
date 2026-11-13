<template>
  <div class="flex flex-col h-full w-full gap-3.5 font-sans select-text min-h-0 overflow-hidden bg-[var(--arc-plane)] p-4" id="transcription-container">
    <!-- Standardized Workspace Header -->
    <header 
      class="flex flex-wrap items-center justify-between gap-4 pb-3.5 border-b border-[var(--arc-hairline)] shrink-0"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-3.5 min-w-[200px]">
        <button
          @click="uiStore.setActiveTab('core')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer text-xs font-mono font-semibold uppercase tracking-wider shrink-0 group"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.55)' }"
          title="Вернуться к 3D-Ядру (Esc)"
          data-testid="transcription-exit-to-core"
        >
          <ArrowLeft class="w-3.5 h-3.5 text-[var(--accent)] group-hover:-translate-x-0.5 transition-transform" />
          <span>К Ядру</span>
        </button>
        <div 
          class="w-9 h-9 rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--accent)] flex items-center justify-center shrink-0"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 16px rgba(0, 0, 0, 0.65)' }"
        >
          <FileAudio class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <h1 class="font-sans font-semibold text-[15px] text-[var(--arc-text-primary)] tracking-normal truncate">
            Транскрибация аудио
          </h1>
          <p class="font-mono text-xs text-[var(--arc-text-muted)] tracking-normal mt-0.5 truncate">
            Преобразование аудиодорожек любого формата в текст с точной временной шкалой
          </p>
        </div>
      </div>

      <span 
        class="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--status-ok)] border border-[var(--arc-hairline)] bg-[var(--arc-block)] px-3 py-1 rounded-[10px]"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
        ГОТОВ
      </span>
    </header>

    <!-- Grid: left controls, right timeline result -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3.5 flex-1 min-h-0 overflow-hidden">
      
      <!-- Left Configuration Panel (5 cols) -->
      <div class="lg:col-span-5 flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1">
        
        <!-- File Uploader -->
        <div 
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="handleDrop"
          :class="[
            'border border-dashed rounded-xl p-4 shrink-0 min-h-[120px] flex flex-col items-center justify-center gap-2.5 transition text-center relative overflow-hidden group cursor-pointer',
            dragOver ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.08)]' : selectedFile ? 'border-[var(--arc-hairline)] bg-[var(--arc-block)]' : 'border-[var(--arc-hairline)] hover:border-[var(--arc-hover)] bg-[var(--arc-plane)]'
          ]"
        >
          <input 
            ref="fileInput"
            type="file" 
            accept="audio/*,video/*"
            class="absolute inset-0 opacity-0 cursor-pointer z-10"
            @change="handleFileSelected"
          />
          
          <template v-if="!selectedFile">
            <div class="w-10 h-10 rounded-lg bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex items-center justify-center text-[var(--arc-text-hint)] group-hover:text-[var(--arc-text-primary)] transition-colors shrink-0">
              <Upload class="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div class="flex flex-col gap-0.5 items-center justify-center">
              <span class="text-xs font-semibold text-[var(--arc-text-primary)] tracking-wide uppercase leading-tight">Перетащите аудио файл</span>
              <span class="text-xs font-mono text-[var(--arc-text-hint)] uppercase leading-snug">Или нажмите для выбора (MP3, WAV, M4A, OGG, FLAC)</span>
            </div>
          </template>

          <template v-else>
            <div class="w-10 h-10 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] flex items-center justify-center text-[var(--status-ok)]">
              <Check class="w-5 h-5" />
            </div>
            <div class="flex flex-col gap-0.5 items-center">
              <span class="text-xs font-medium text-[var(--arc-text-primary)] truncate max-w-[280px]" :title="selectedFile.name">
                {{ selectedFile.name }}
              </span>
              <div class="flex items-center justify-center gap-2 text-xs font-mono text-[var(--arc-text-hint)]">
                <span>{{ formatBytes(selectedFile.size) }}</span>
                <span>•</span>
                <span>{{ audioDurationFormatted }}</span>
              </div>
            </div>
            <button 
              @click.stop="clearFile"
              class="text-xs border border-[var(--arc-hairline)] px-2.5 py-1 rounded bg-[var(--arc-plane)] hover:border-[var(--status-err)] text-[var(--status-err)] transition relative z-20 cursor-pointer mt-1 font-mono uppercase"
            >
              Сбросить файл
            </button>
          </template>
        </div>

        <!-- Audio Player Preview -->
        <div v-if="audioUrl" class="border border-[var(--arc-hairline)] bg-[var(--arc-block)] rounded-xl p-3 flex flex-col gap-2 shrink-0">
          <div class="flex justify-between items-center text-xs font-mono text-[var(--arc-text-hint)] select-none uppercase">
            <span>Источник // AUDIO_PREVIEW</span>
            <span class="text-[var(--accent)] font-medium">{{ formatTime(playerCurrentTime) }} / {{ formatTime(playerDuration) }}</span>
          </div>
          <audio 
            ref="audioElement"
            :src="audioUrl"
            @timeupdate="onPlayerTimeUpdate"
            @loadedmetadata="onPlayerLoadedMetadata"
            controls
            class="w-full h-8 focus:outline-none filter invert brightness-90 shrink-0 opacity-80"
          ></audio>
        </div>

        <!-- Model Selection -->
        <div class="border border-[var(--arc-hairline)] bg-[var(--arc-plane)] rounded-xl p-3.5 flex flex-col gap-2.5 shrink-0">
          <span class="text-xs font-mono font-semibold tracking-wider text-[var(--arc-text-hint)] uppercase">Выбор модели</span>
          <div role="radiogroup" class="flex flex-col gap-2">
            <div 
              v-for="model in models" 
              :key="model.id"
              role="radio"
              :aria-checked="selectedModelId === model.id"
              tabindex="0"
              @click="selectModel(model)"
              @keydown.enter="selectModel(model)"
              @keydown.space.prevent="selectModel(model)"
              :class="[
                'border rounded-lg p-3 flex flex-col gap-1 cursor-pointer transition focus-visible:outline-none',
                selectedModelId === model.id 
                  ? 'bg-[var(--arc-selected)] border-[var(--accent)] shadow-sm' 
                  : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)]'
              ]"
            >
              <div class="flex justify-between items-start gap-2">
                <div class="flex flex-col gap-1">
                  <span class="text-xs font-medium text-[var(--arc-text-primary)]">{{ model.name }}</span>
                  <span :class="['text-xs px-2 py-0.5 rounded font-mono uppercase tracking-wider w-fit', model.badgeClass]">
                    {{ model.badge }}
                  </span>
                </div>
                <div class="text-xs font-mono">
                  <span v-if="model.isCloud" class="text-[var(--status-ok)] flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
                    ОБЛАКО
                  </span>
                  <span v-else-if="modelDownloadedMap[model.id]" class="text-[var(--accent)] flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
                    КЭШ
                  </span>
                  <button 
                    v-else
                    @click.stop="downloadLocalModel(model.id)"
                    class="px-2 py-1 rounded bg-[var(--arc-block)] border border-[var(--arc-hairline)] hover:border-[var(--accent)] text-xs font-mono text-[var(--arc-text-primary)] flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Download class="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Скачать ({{ model.size }})</span>
                  </button>
                </div>
              </div>
              <p class="text-xs text-[var(--arc-text-hint)] leading-relaxed mt-0.5">{{ model.description }}</p>
            </div>
          </div>
        </div>

        <!-- GPU Selection & Diagnostics -->
        <div v-if="!isCloudSelected" class="border border-[var(--arc-hairline)] bg-[var(--arc-plane)] rounded-xl p-3.5 flex flex-col gap-2.5 shrink-0">
          <div class="flex justify-between items-center">
            <span class="text-xs font-mono font-semibold tracking-wider text-[var(--arc-text-hint)] uppercase">Аппаратное ускорение</span>
            <span class="text-xs font-mono text-[var(--accent)] border border-[var(--arc-hairline)] px-2 py-0.5 rounded">GPU BOOST</span>
          </div>
          
          <div class="grid grid-cols-3 gap-2">
            <button 
              type="button" 
              @click="setDevice('cpu')"
              :class="[
                'border rounded-lg p-2.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition text-center relative overflow-hidden',
                selectedDevice === 'cpu' 
                  ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)]' 
                  : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-hint)] hover:bg-[var(--arc-hover)] hover:text-[var(--arc-text-primary)]'
              ]"
            >
              <Cpu class="w-4 h-4" />
              <span class="text-xs font-mono uppercase">ЦП (WASM)</span>
            </button>

            <button 
              type="button" 
              @click="setDevice('cuda')"
              :class="[
                'border rounded-lg p-2.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition text-center relative overflow-hidden',
                selectedDevice === 'cuda' 
                  ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)]' 
                  : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-hint)] hover:bg-[var(--arc-hover)] hover:text-[var(--arc-text-primary)]'
              ]"
            >
              <Zap class="w-4 h-4 text-[var(--status-ok)]" />
              <span class="text-xs font-mono uppercase">NVIDIA CUDA</span>
            </button>

            <button 
              type="button" 
              @click="setDevice('dml')"
              :class="[
                'border rounded-lg p-2.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition text-center relative overflow-hidden',
                selectedDevice === 'dml' 
                  ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)]' 
                  : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-hint)] hover:bg-[var(--arc-hover)] hover:text-[var(--arc-text-primary)]'
              ]"
            >
              <Sparkles class="w-4 h-4 text-[var(--accent)]" />
              <span class="text-xs font-mono uppercase">DIRECTML</span>
            </button>
          </div>

          <!-- Dynamic Hardware Accelerator Info Panel -->
          <div class="border border-[var(--arc-hairline)] p-3 rounded-lg bg-[var(--arc-block)] flex flex-col gap-2 text-xs">
            <div class="flex items-center justify-between gap-2 border-b border-[var(--arc-divider)] pb-2">
              <div class="flex items-center gap-2">
                <span class="font-mono font-medium text-[var(--arc-text-primary)]">{{ deviceInfo.title }}</span>
              </div>
              <span :class="['text-xs px-2 py-0.5 rounded font-mono uppercase tracking-wider', deviceInfo.badgeClass]">
                {{ deviceInfo.badgeText }}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2 text-xs font-mono">
              <div class="flex flex-col bg-[var(--arc-plane)] p-2 rounded border border-[var(--arc-hairline)]">
                <span class="text-[var(--arc-text-hint)]">УСТРОЙСТВО</span>
                <span class="text-[var(--arc-text-primary)] font-medium truncate mt-0.5">{{ deviceInfo.activeDeviceName }}</span>
              </div>
              <div class="flex flex-col bg-[var(--arc-plane)] p-2 rounded border border-[var(--arc-hairline)]">
                <span class="text-[var(--arc-text-hint)]">СКОРОСТЬ</span>
                <span class="font-medium truncate mt-0.5" :class="deviceInfo.iconColor">{{ deviceInfo.speedMultiplier }}</span>
              </div>
            </div>

            <p class="text-xs text-[var(--arc-text-hint)] leading-normal pt-0.5">
              {{ deviceInfo.description }}
            </p>
          </div>

          <div v-if="gpuWarningActive" class="border border-[var(--status-warn)]/30 bg-[var(--arc-block)] p-3 rounded-lg flex items-start gap-2.5 text-xs text-[var(--status-warn)]">
            <TriangleAlert class="w-4 h-4 shrink-0 mt-0.5" />
            <div class="flex flex-col gap-0.5">
              <span class="font-mono font-semibold uppercase">Откат на ЦП // CPU_FALLBACK</span>
              <span class="text-[var(--arc-text-hint)]">Аппаратный запуск на GPU не удался. Инференс переключен на ЦП.</span>
            </div>
          </div>
        </div>

        <!-- Download Progress Bar -->
        <div v-if="isDownloading && activeDownloadModelId === selectedModelId" class="border border-[var(--arc-hairline)] bg-[var(--arc-block)] rounded-xl p-3.5 flex flex-col gap-2">
          <div class="flex justify-between items-center text-xs font-mono text-[var(--arc-text-primary)] select-none">
            <span class="truncate max-w-[250px]">Загрузка модели ({{ activeDownloadFile }})</span>
            <span class="text-[var(--accent)] font-medium">{{ downloadPercentage }}%</span>
          </div>
          <div class="h-1.5 w-full bg-[var(--arc-plane)] rounded-full overflow-hidden">
            <div 
              class="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
              :style="{ width: `${downloadPercentage}%` }"
            ></div>
          </div>
        </div>

        <!-- Start/Action Panel -->
        <div v-if="selectedFile" class="flex flex-col gap-2 mt-auto pt-1">
          <div class="flex justify-between items-center text-xs font-mono text-[var(--arc-text-hint)] select-none px-1 uppercase">
            <span>Оценка времени:</span>
            <span class="text-[var(--accent)] font-medium">{{ timeEstimate }}</span>
          </div>
          <button 
            @click="startTranscription"
            :disabled="isProcessing"
            class="h-11 rounded-lg bg-[var(--accent)] text-white hover:brightness-110 font-medium text-xs tracking-wider transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed uppercase"
          >
            <Activity class="w-4 h-4" />
            <span>Запустить расшифровку</span>
          </button>
        </div>

        <!-- Debug Toggle & Console Logs -->
        <div class="mt-1">
          <button 
            @click="showDebug = !showDebug"
            class="w-full text-center text-xs font-mono text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] uppercase transition-colors py-1 cursor-pointer"
          >
            [{{ showDebug ? 'Скрыть системные логи' : 'Показать системные логи' }}]
          </button>
          
          <div 
            v-if="showDebug" 
            class="mt-2 border border-[var(--arc-hairline)] bg-[var(--arc-block)] p-3 rounded-lg max-h-[140px] overflow-y-auto custom-scrollbar text-xs text-[var(--arc-text-hint)] font-mono leading-relaxed"
          >
            <div v-for="(log, i2) in debugLogs" :key="i2" class="border-b border-[var(--arc-divider)] pb-1 mb-1 last:border-0 last:mb-0 last:pb-0">
              {{ log }}
            </div>
            <div v-if="debugLogs.length === 0" class="text-center py-2 text-[var(--arc-text-hint)]">Нет активных логов</div>
          </div>
        </div>

      </div>

      <!-- Right Timeline & Segment list Panel (7 cols) -->
      <div class="lg:col-span-7 flex flex-col gap-3 min-h-0 h-full overflow-hidden">
        <div class="border border-[var(--arc-hairline)] bg-[var(--arc-plane)] rounded-xl p-3.5 flex flex-col gap-3 h-full min-h-0 relative overflow-hidden">
          
          <!-- Timeline Header -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[var(--arc-divider)] shrink-0">
            <div class="flex flex-col">
              <span class="text-xs font-mono text-[var(--arc-text-hint)]">Консоль вывода // OUTPUT_CONSOLE</span>
              <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] uppercase">Результат транскрибирования</span>
            </div>
            
            <div v-if="transcriptText" class="flex items-center gap-2">
              <input 
                v-model="transcriptSearch"
                type="text"
                placeholder="ПОИСК В ТЕКСТЕ..."
                class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-lg px-2.5 py-1 text-xs text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-hint)] uppercase w-40 transition outline-none font-mono"
              />
              <button 
                @click="downloadAsTxt"
                class="flex items-center gap-1.5 border border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:border-[var(--status-ok)] text-[var(--status-ok)] px-2.5 py-1 rounded-lg text-xs font-mono tracking-wider transition cursor-pointer uppercase"
                title="Сохранить полную расшифровку в .txt файл"
              >
                <Save class="w-3.5 h-3.5" />
                <span>Сохранить TXT</span>
              </button>
            </div>
          </div>

          <!-- Content Body (Scrollable Container) -->
          <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2.5">
            
            <!-- Case 1: Empty State -->
            <div 
              v-if="!selectedFile && !transcriptText" 
              class="flex-1 flex flex-col items-center justify-center gap-3.5 border border-dashed border-[var(--arc-hairline)] rounded-xl p-8 text-center min-h-[220px]"
            >
              <div class="w-12 h-12 rounded-xl bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex items-center justify-center text-[var(--arc-text-hint)]">
                <Mic class="w-6 h-6 text-[var(--accent)]" />
              </div>
              <div class="flex flex-col gap-1 select-none">
                <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] uppercase">Ожидание источника аудио</span>
                <span class="text-xs text-[var(--arc-text-hint)]">Загрузите аудиофайл в левую панель для начала работы</span>
              </div>
            </div>

            <!-- Case 2: Neural Processing Loader -->
            <div 
              v-else-if="isProcessing && transcriptSegments.length === 0" 
              class="flex-1 flex flex-col items-center justify-center gap-5 border border-[var(--arc-hairline)] bg-[var(--arc-block)] rounded-xl p-6 min-h-[220px] text-center"
            >
              <div class="w-12 h-12 relative flex items-center justify-center">
                <div class="absolute inset-0 rounded-full border border-dashed border-[var(--accent)] animate-spin opacity-40"></div>
                <Activity class="w-6 h-6 text-[var(--accent)] animate-pulse" />
              </div>
              
              <div class="flex flex-col gap-1.5 select-none max-w-[400px]">
                <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] uppercase">Нейронный анализ аудио</span>
                <span class="text-xs font-mono text-[var(--accent)] uppercase">Этап: {{ processStepText }}</span>
                <span class="text-xs font-mono text-[var(--arc-text-hint)] uppercase">
                  Прошло: {{ elapsedTimerFormatted }} // Осталось: ~{{ remainingTimerFormatted }}
                </span>
              </div>

              <!-- Animated Wave Ticks -->
              <div class="flex items-center gap-1 h-6 justify-center">
                <span 
                  v-for="i in 16" 
                  :key="i"
                  class="w-1 rounded-full bg-[var(--accent)] animate-[pulse_1.5s_infinite]"
                  :style="{ height: `${Math.sin(i / 2) * 10 + 12}px`, animationDelay: `${i * 0.1}s` }"
                ></span>
              </div>
            </div>

            <!-- Case 3: Segments List -->
            <div v-else-if="transcriptSegments.length > 0" class="flex flex-col gap-2">
              <!-- Realtime stream alert/cancellation if still processing -->
              <div v-if="isProcessing" class="border border-[var(--arc-hairline)] bg-[var(--arc-block)] p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs font-mono select-none">
                <div class="flex items-center gap-2">
                  <RefreshCw class="w-3.5 h-3.5 text-[var(--accent)] animate-spin" />
                  <span class="text-[var(--arc-text-primary)]">Идет расшифровка в реальном времени...</span>
                </div>
                <div class="flex items-center gap-2.5">
                  <span class="text-[var(--arc-text-hint)]">Прошло: {{ elapsedTimerFormatted }}</span>
                  <button 
                    type="button"
                    @click="cancelActiveTranscription"
                    class="px-2 py-0.5 bg-transparent hover:bg-[var(--arc-hover)] border border-[var(--status-err)] text-[var(--status-err)] rounded font-mono text-xs transition cursor-pointer uppercase shrink-0"
                  >
                    Отменить
                  </button>
                </div>
              </div>

              <!-- Segment rows -->
              <div 
                v-for="(seg, idx) in filteredSegments" 
                :key="idx"
                @click="seekPlayerTo(seg.startSec)"
                :class="[
                  'border border-[var(--arc-hairline)] p-3 rounded-lg hover:bg-[var(--arc-hover)] cursor-pointer transition flex flex-col md:flex-row gap-3 items-start md:items-center relative bg-[var(--arc-plane)]',
                  isPlayingSegment(seg) 
                    ? 'bg-[var(--arc-selected)] border-[var(--accent)]' 
                    : ''
                ]"
              >
                <!-- Active playback indicator bar -->
                <div v-if="isPlayingSegment(seg)" class="absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent)] rounded-l-lg"></div>
                
                <div class="flex items-center gap-1.5 text-xs font-mono text-[var(--arc-text-machine)] shrink-0 select-none">
                  <Clock class="w-3.5 h-3.5 text-[var(--arc-text-hint)]" />
                  <span>{{ formatTime(seg.startSec) }} - {{ formatTime(seg.endSec) }}</span>
                </div>
                
                <p class="text-xs sm:text-sm text-[var(--arc-text-primary)] leading-relaxed font-sans font-normal">
                  {{ seg.text }}
                </p>
              </div>

              <div v-if="filteredSegments.length === 0" class="border border-dashed border-[var(--arc-hairline)] p-6 text-center text-xs font-mono text-[var(--arc-text-hint)] uppercase rounded-lg">
                Нет совпадений для заданного запроса
              </div>
            </div>

            <!-- Case 4: Process Failure -->
            <div v-else-if="errorMessage" class="border border-[var(--status-err)]/30 bg-[var(--arc-block)] p-3.5 rounded-lg flex items-start gap-2.5 text-xs">
              <CircleAlert class="w-4 h-4 text-[var(--status-err)] shrink-0 mt-0.5" />
              <div class="flex flex-col gap-0.5 text-left">
                <span class="font-mono font-semibold text-[var(--status-err)] uppercase">Ошибка обработки аудиосигнала</span>
                <p class="text-xs text-[var(--arc-text-secondary)] leading-relaxed font-mono select-text">{{ errorMessage }}</p>
              </div>
            </div>

          </div>

          <!-- Statistics Footer -->
          <div v-if="transcriptSegments.length > 0" class="border border-[var(--arc-hairline)] bg-[var(--arc-block)] rounded-lg p-2.5 flex flex-col gap-1 shrink-0 select-none">
            <span class="text-xs font-mono text-[var(--arc-text-hint)]">Статистика // TRANSCRIPTION_TELEMETRY</span>
            <div class="flex items-center justify-between text-xs font-mono text-[var(--arc-text-primary)] uppercase gap-4">
              <span>Фраз: <span class="text-[var(--accent)]">{{ transcriptSegments.length }}</span></span>
              <span>Слов: <span class="text-[var(--accent)]">{{ wordCount }}</span></span>
              <span>Длительность: <span class="text-[var(--accent)]">{{ audioDurationFormatted }}</span></span>
            </div>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { 
  FileAudio, 
  Upload, 
  Check, 
  Sparkles, 
  Download, 
  RefreshCw, 
  Save, 
  Clock, 
  Cpu,
  Mic,
  Activity,
  TriangleAlert,
  CircleAlert,
  Zap,
  ArrowLeft
} from 'lucide-vue-next';
import { useTranscription } from '../composables/useTranscription';
import { useUIStore } from '../../../stores/ui.store';

const uiStore = useUIStore();

const {
  selectedFile,
  fileInput,
  dragOver,
  audioUrl,
  audioDuration,
  selectedModelId,
  errorMessage,
  selectedDevice,
  setDevice,
  deviceInfo,
  gpuName,
  gpuWarningActive,
  gpuWarningMessage,
  isProcessing,
  processStep,
  elapsedTimer,
  remainingTimer,
  showDebug,
  debugLogs,
  modelDownloadedMap,
  isDownloading,
  activeDownloadModelId,
  activeDownloadFile,
  downloadPercentage,
  audioElement,
  playerCurrentTime,
  playerDuration,
  transcriptText,
  transcriptSegments,
  transcriptSearch,
  models,
  isCloudSelected,
  timeEstimate,
  audioDurationFormatted,
  wordCount,
  processStepText,
  filteredSegments,
  elapsedTimerFormatted,
  remainingTimerFormatted,
  handleDrop,
  handleFileSelected,
  clearFile,
  selectModel,
  downloadLocalModel,
  startTranscription,
  cancelActiveTranscription,
  downloadAsTxt,
  isPlayingSegment,
  seekPlayerTo,
  onPlayerTimeUpdate,
  onPlayerLoadedMetadata,
  formatBytes,
  formatTime
} = useTranscription();
</script>
