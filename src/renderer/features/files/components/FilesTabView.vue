<template>
  <div class="w-full h-full flex flex-col font-sans select-none min-h-0 overflow-hidden bg-[var(--arc-plane)] text-[var(--arc-text-primary)] p-4 md:p-6 gap-4">
    <!-- Standardized Workspace Header -->
    <header 
      class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--arc-hairline)] shrink-0"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-3.5 min-w-[200px]">
        <button
          @click="uiStore.setActiveTab('core')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer text-xs font-mono font-semibold uppercase tracking-wider shrink-0 group"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.55)' }"
          title="Вернуться к 3D-Ядру (Esc)"
          data-testid="files-exit-to-core"
        >
          <ArrowLeft class="w-3.5 h-3.5 text-[var(--accent)] group-hover:-translate-x-0.5 transition-transform" />
          <span>К Ядру</span>
        </button>
        <div 
          class="w-9 h-9 rounded-[12px] flex items-center justify-center p-2 shrink-0 bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--accent)]"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 16px rgba(0, 0, 0, 0.65)' }"
        >
          <Folder class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <h1 class="font-sans font-semibold text-[15px] text-[var(--arc-text-primary)] tracking-normal truncate">
            Файловая система
          </h1>
          <p class="font-mono text-xs text-[var(--arc-text-muted)] tracking-normal mt-0.5 truncate">
            Локальный проводник и предпросмотр ресурсов рабочей директории
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-1 max-w-xl justify-end">
        <button 
          @click="navigateUp" 
          :disabled="loading || currentPath === '/'"
          class="p-2 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
          title="Вверх"
        >
          <ArrowLeft class="w-4 h-4" />
        </button>

        <div 
          class="flex-1 bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3.5 py-2 font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap text-[var(--arc-text-primary)]"
          :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.70)' }"
        >
          {{ currentPath }}
        </div>

        <button 
          @click="loadDirectory(currentPath)" 
          :disabled="loading"
          class="p-2 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer disabled:opacity-30 shrink-0"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
          title="Обновить"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
        </button>
      </div>
    </header>

    <!-- Main Content Area: File List + Optional Preview Panel -->
    <div class="flex-1 flex min-h-0 overflow-hidden gap-4">
      <!-- File List Container: Tactile Obsidian Instrument Block -->
      <div 
        class="flex-1 overflow-y-auto custom-scrollbar border border-[var(--arc-hairline)] rounded-[16px] bg-[var(--arc-block)]"
        :style="{
          background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 16px 40px rgba(0, 0, 0, 0.78)'
        }"
      >
        <div v-if="loading && files.length === 0" class="flex flex-col items-center justify-center h-full p-8 text-[var(--arc-text-muted)]">
          <Loader2 class="w-6 h-6 animate-spin mb-3 text-[var(--arc-text-muted)]" />
          <p class="text-xs font-mono">Загрузка директории...</p>
        </div>
        
        <div v-else-if="error" class="flex flex-col items-center justify-center h-full p-8 text-center">
          <AlertCircle class="w-6 h-6 mb-3 text-[var(--status-err)]" />
          <p class="text-xs font-sans text-[var(--status-err)] max-w-md">{{ error }}</p>
          <ArcButton variant="secondary" size="sm" class="mt-4" @click="loadDirectory('.')">
            Вернуться в корень
          </ArcButton>
        </div>

        <div v-else-if="files.length === 0" class="flex flex-col items-center justify-center h-full p-8 text-[var(--arc-text-muted)]">
          <Folder class="w-8 h-8 mb-3 opacity-40 text-[var(--arc-text-hint)]" />
          <p class="text-xs font-mono uppercase tracking-wider">Папка пуста</p>
        </div>

        <div v-else class="divide-y divide-[var(--arc-hairline)]">
          <div 
            v-for="file in files" 
            :key="file.path"
            @click="handleFileClick(file)"
            class="flex items-center justify-between p-3.5 hover:bg-[var(--arc-hover)] border-l-2 border-transparent hover:border-[var(--accent)] cursor-pointer transition-colors"
            :class="{ 'bg-[var(--arc-hover)] border-l-[var(--accent)]': selectedFile?.path === file.path }"
          >
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <Folder v-if="file.isDirectory" class="w-4 h-4 text-[var(--accent)] shrink-0" />
              <FileIcon v-else class="w-4 h-4 text-[var(--arc-text-hint)] shrink-0" />
              <span class="text-sm font-sans font-medium text-[var(--arc-text-primary)] truncate" :title="file.name">
                {{ file.name }}
              </span>
            </div>
            <span class="text-xs font-mono text-[var(--arc-text-muted)] shrink-0 ml-3">
              {{ file.isDirectory ? 'Папка' : 'Файл' }}
            </span>
          </div>
        </div>
      </div>

      <!-- File Preview Panel: var(--arc-code) -->
      <div v-if="selectedFile && !selectedFile.isDirectory" class="w-96 border border-[var(--arc-hairline)] rounded-[var(--arc-radius-block,14px)] bg-[var(--arc-code)] flex flex-col shrink-0 overflow-hidden">
        <div class="flex items-center justify-between p-3.5 border-b border-[var(--arc-hairline)] bg-transparent">
          <h3 class="font-sans font-medium text-sm truncate pr-3 text-[var(--arc-text-primary)]" :title="selectedFile.name">
            {{ selectedFile.name }}
          </h3>
          <button 
            @click="closePreview" 
            class="p-1 text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer"
            title="Закрыть"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        
        <div class="flex-1 overflow-hidden relative">
          <div v-if="previewLoading" class="absolute inset-0 flex items-center justify-center bg-[var(--arc-plane)]/80">
            <Loader2 class="w-6 h-6 animate-spin text-[var(--arc-text-muted)]" />
          </div>
          <div v-else-if="previewError" class="p-4 text-xs font-sans text-[var(--status-err)] text-center mt-10">
            <AlertCircle class="w-5 h-5 mx-auto mb-2 text-[var(--status-err)]" />
            {{ previewError }}
          </div>
          <textarea 
            v-else
            readonly
            class="w-full h-full p-4 bg-transparent border-none text-xs font-mono text-[var(--arc-text-secondary)] resize-none focus:outline-none custom-scrollbar"
            :value="fileContent"
          ></textarea>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ArrowLeft, RefreshCw, Folder, File as FileIcon, X, Loader2, AlertCircle } from 'lucide-vue-next';
import ArcButton from '../../../components/ui/ArcButton.vue';
import { useUIStore } from '../../../stores/ui.store';

const uiStore = useUIStore();

interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

const loading = ref(false);
const error = ref('');
const currentPath = ref('.');
const files = ref<FileEntry[]>([]);

const selectedFile = ref<FileEntry | null>(null);
const fileContent = ref('');
const previewLoading = ref(false);
const previewError = ref('');

const loadDirectory = async (path: string = '.') => {
  loading.value = true;
  error.value = '';
  selectedFile.value = null;
  
  try {
    const result = await window.api.filesList(path);
    if (result.success && result.files && result.currentPath) {
      files.value = result.files;
      currentPath.value = result.currentPath;
    } else {
      error.value = result.error || 'Не удалось загрузить директорию';
    }
  } catch (err: any) {
    error.value = err.message || 'Внутренняя ошибка';
  } finally {
    loading.value = false;
  }
};

const navigateUp = () => {
  loadDirectory(`${currentPath.value}/..`);
};

const handleFileClick = async (file: FileEntry) => {
  if (file.isDirectory) {
    loadDirectory(file.path);
  } else {
    selectedFile.value = file;
    loadFileContent(file.path);
  }
};

const loadFileContent = async (filePath: string) => {
  previewLoading.value = true;
  previewError.value = '';
  fileContent.value = '';

  try {
    const result = await window.api.filesRead(filePath);
    if (result.success && result.content !== undefined) {
      fileContent.value = result.content;
    } else {
      previewError.value = result.error || 'Не удалось прочитать файл';
    }
  } catch (err: any) {
    previewError.value = err.message || 'Ошибка чтения файла';
  } finally {
    previewLoading.value = false;
  }
};

const closePreview = () => {
  selectedFile.value = null;
  fileContent.value = '';
};

onMounted(() => {
  loadDirectory('.');
});
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
