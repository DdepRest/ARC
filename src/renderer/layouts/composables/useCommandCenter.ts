import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { useKeyboard } from '../../composables/useKeyboard';
import { useElectron } from '../../composables/useElectron';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export function useCommandCenter() {
  const uiStore = useUIStore();
  const settingsStore = useSettingsStore();
  const { files, fetchFiles } = useElectron();

  const isAwakening = ref(false);
  const toasts = computed(() => uiStore.toasts);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info', duration?: number) => {
    return uiStore.showToast(message, type, duration);
  };

  const localizations = computed(() => {
    const isEn = settingsStore.language === 'EN';
    return {
      workspacePath: isEn ? 'WORKSPACE PATH' : 'ПУТЬ К РАБОЧЕЙ ОБЛАСТИ',
      cognitiveIndex: isEn ? 'COGNITIVE INDEX' : 'КОГНИТИВНЫЙ ИНДЕКС',
      searchFiles: isEn ? 'SEARCH FILES...' : 'ПОИСК ФАЙЛОВ...',
      noFilesFound: isEn ? 'NO MATCHING FILES FOUND' : 'ПОДХОДЯЩИЕ ФАЙЛЫ НЕ НАЙДЕНЫ',
      exportOps: isEn ? 'System Export Operations' : 'Системные операции экспорта',
      scanStructure: isEn ? 'SCAN STRUCTURE' : 'СКАН СТРУКТУРЫ',
      optimizeCache: isEn ? 'OPTIMIZE CACHE' : 'ОПТИМИЗАЦИЯ КЭША',
      satelliteVision: isEn ? 'SATELLITE VISION // INTERACTIVE FEED' : 'СПУТНИК ВЫЗОВА // ВИЗУАЛИЗАЦИЯ',
      enableOptics: isEn ? 'ENABLE OPTICS' : 'ВКЛЮЧИТЬ ОПТИКУ',
      disable: isEn ? 'DISABLE' : 'ВЫКЛЮЧИТЬ',
      cognitiveTelem: isEn ? 'COGNITIVE_TELEM // LIVE' : 'КОГНИТИВНАЯ_ТЕЛЕМЕТРИЯ // ОНЛАЙН',
      aiResponse: isEn ? 'AI RESPONSE' : 'ОТКЛИК ИИ',
      streams: isEn ? 'STREAMS' : 'ПОТОКИ',
      coherence: isEn ? 'COHERENCE' : 'РАВНОВЕСИЕ',
      excellent: isEn ? 'EXCELLENT' : 'ОТЛИЧНО',
      synced: isEn ? 'SYNCED' : 'СИНХРОНИЗИРОВАНО',
      stable: isEn ? 'STABLE' : 'СТАБИЛЬНО',
      activeCoreEnergy: isEn ? 'ACTIVE CORE ENERGY' : 'АКТИВНАЯ ЭНЕРГИЯ ЯДРА',
      activateArc: isEn ? '✦ ACTIVATE A.R.C. SYSTEM ✦' : '────────── АКТИВИРОВАТЬ A.R.C. ──────────',
      orClickCore: isEn ? 'OR CLICK THE CORE TO INITIALIZE' : 'ИЛИ НАЖМИТЕ НА ЯДРО ДЛЯ ИНИЦИАЛИЗАЦИИ',
      wakeUp: isEn ? 'WAKE UP' : 'Пробудить',
      sleep: isEn ? 'SLEEP' : 'Усыпить',
      focusMode: isEn ? 'Focus Mode' : 'Режим Фокуса',
      nextInQueue: isEn ? 'NEXT IN QUEUE' : 'СЛЕДУЮЩИЙ В ОЧЕРЕДИ',
      bgStream: isEn ? 'Background Stream' : 'Фоновый поток',
      shuffle: isEn ? 'Shuffle' : 'Случайный порядок',
      repeatTrack: isEn ? 'Repeat: Single track' : 'Повтор: одного трека',
      repeatPlaylist: isEn ? 'Repeat: Entire playlist' : 'Повтор: всего плейлиста',
      repeatOff: isEn ? 'Repeat: Off' : 'Повтор выключен',
      likeRemove: isEn ? 'Remove from favorites' : 'Удалить из библиотеки',
      likeAdd: isEn ? 'Add to favorites' : 'Добавить в библиотеку',
      volume: isEn ? 'Volume' : 'Громкость',
      projectionActive: isEn ? '✦ PROJECTION // ACTIVE' : '✦ ПРОЕКЦИЯ // АКТИВНА',
      closeTab: isEn ? 'Close tab (Esc)' : 'Закрыть вкладку (Esc)',
      actionCompleted: isEn ? 'System action completed: ' : 'Действие успешно завершено: ',
      cameraErr: isEn ? 'Unable to access camera. Ensure permissions are granted.' : 'Не удалось получить доступ к камере. Убедитесь в наличии прав.',
      scanningDirs: isEn ? 'Scanning directories...' : 'Сканирование директорий...',
      optimizingStorage: isEn ? 'Optimizing local database cache...' : 'Оптимизация локального кэша БД...'
    };
  });

  const isCanvasActive = computed(() => uiStore.activeTab !== 'core');

  const windowWidth = ref(window.innerWidth);
  const windowHeight = ref(window.innerHeight);

  const updateWindowSize = () => {
    windowWidth.value = window.innerWidth;
    windowHeight.value = window.innerHeight;
  };

  // Music Lyrics Sync
  const visibleLyrics = computed(() => {
    if (!uiStore.musicLyrics) return [];
    const lines = uiStore.musicLyrics.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) return [];
    
    const duration = uiStore.musicDuration || 1;
    const current = uiStore.musicCurrentTime || 0;
    
    const progress = Math.max(0, Math.min(1, current / duration));
    let lineIndex = Math.floor(progress * lines.length);
    
    if (lineIndex >= lines.length) lineIndex = lines.length - 1;
    
    const start = Math.max(0, lineIndex - 2);
    const end = Math.min(lines.length, start + 5);
    
    return lines.slice(start, end).map((text, i) => ({
      text,
      isCenter: (start + i) === lineIndex
    }));
  });

  // Compute Core location (Centered with clean clearance under top bar)
  const coreCenter = computed(() => {
    return {
      x: windowWidth.value / 2,
      y: windowHeight.value * 0.47
    };
  });

  const coreScaleProps = computed(() => {
    if (isCanvasActive.value) {
      return 1.15;
    }
    return 1.0;
  });

  const coreStyle = computed(() => {
    const c = coreCenter.value;
    let scale = 1.0;
    let opacity = 1.0;
    let filter = 'none';

    if (isCanvasActive.value) {
      scale = 1.15;
      opacity = 0.95;
    }

    return {
      left: `${c.x}px`,
      top: `${c.y}px`,
      transform: `translate(-50%, -50%) scale(${scale})`,
      width: '240px',
      height: '240px',
      opacity: opacity,
      filter: filter,
      transition: 'all 0.9s cubic-bezier(0.25, 1, 0.4, 1)'
    };
  });

  const projectionTitle = computed(() => {
    const isEn = settingsStore.language === 'EN';
    switch (uiStore.activeTab as string) {
      case 'chat': return isEn ? '✦ Cognitive Bridge' : '✦ Когнитивный диалог';
      case 'commands': return isEn ? '✦ Macro Lab' : '✦ Лаборатория макросов';
      case 'modules': return isEn ? '✦ Access Directory' : '✦ Справочник доступа';
      case 'memory': return isEn ? '✦ Memory Bridge' : '✦ Когнитивный мост';
      case 'settings': return isEn ? '✦ System Configuration' : '✦ Параметры системы';
      case 'files': return isEn ? '✦ Project Workspace' : '✦ Системный архив';
      case 'vision': return isEn ? '✦ Telemetry Vision' : '✦ Оптоволоконный мост';
      case 'tasks': return isEn ? '✦ Operational Tasks' : '✦ Операционные задачи';
      case 'objectives': return isEn ? '✦ Strategic Objectives' : '✦ Стратегические цели';
      case 'transcription': return isEn ? '✦ Audio Transcription' : '✦ Расшифровка аудио';
      case 'orchestrator': return isEn ? '✦ Orchestration Pipeline' : '✦ Оркестратор процессов';
      case 'agents': return isEn ? '✦ Multi-Agent Swarm' : '✦ Агенты и модели';
      case 'tools': return isEn ? '✦ System Tools & MCP' : '✦ Инструменты и MCP';
      case 'skills': return isEn ? '✦ Procedural Skills' : '✦ Навыки и процедуры';
      case 'architecture': return isEn ? '✦ System Architecture' : '✦ Архитектура системы';
      case 'scenarios': return isEn ? '✦ Workflow Scenarios' : '✦ Сценарии и пайплайны';
      case 'observability': return isEn ? '✦ System Observability' : '✦ Мониторинг и метрики';
      case 'sandbox': return isEn ? '✦ Experimental Sandbox' : '✦ Песочница и эксперименты';
      default: return isEn ? `✦ Module ${uiStore.activeTab}` : `✦ Модуль ${uiStore.activeTab}`;
    }
  });

  const handledTabs = ['chat', 'commands', 'modules', 'memory', 'settings', 'tasks', 'objectives', 'files', 'vision', 'transcription', 'observability'];
  const isUnhandledTab = computed(() => {
    return uiStore.activeTab !== 'core' && !handledTabs.includes(uiStore.activeTab);
  });

  const closeProjection = () => {
    uiStore.setActiveTab('core');
  };

  const handleCoreClick = () => {
    if (isCanvasActive.value) {
      closeProjection();
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const isMediaCommandPending = ref(false);
  let volumeTxId = 0;

  const vkControlWithTimeout = async (
    action: import('../../../shared/types/ipc').VkCommandAction, 
    data?: import('../../../shared/types/ipc').VkControlPayload
  ): Promise<import('../../../shared/types/ipc').VkSendResult> => {
    if (!window.api?.vkControl) {
      throw new Error('API not available');
    }
    const timeoutMs = 4000;
    let timerId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error('TIMEOUT'));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        data !== undefined ? window.api.vkControl(action, data) : window.api.vkControl(action),
        timeoutPromise
      ]);
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  };

  const toggleMusic = async () => {
    if (!uiStore.vkActive) {
      uiStore.showToast('Откройте вкладку VK Музыка в браузере', 'info');
      return;
    }
    if (isMediaCommandPending.value) return;
    isMediaCommandPending.value = true;
    uiStore.musicLastLocalCommandAt = Date.now();
    try {
      if (typeof window.api?.vkControl === 'function') {
        const action = uiStore.musicState === 'playing' ? 'pause' : 'play';
        const res = await vkControlWithTimeout(action);
        if (res && res.success) {
          uiStore.setMusicState(uiStore.musicState === 'playing' ? 'paused' : 'playing');
        } else {
          showToast('Не удалось изменить статус воспроизведения VK', 'error');
        }
      }
    } catch (e: unknown) {
      console.error(e);
      const errMessage = e instanceof Error ? e.message : String(e);
      if (errMessage === 'TIMEOUT') {
        showToast('Превышено время ожидания VK. Управление возвращено.', 'error');
      } else {
        showToast('Ошибка отправки команды VK', 'error');
      }
    } finally {
      isMediaCommandPending.value = false;
    }
  };

  const nextTrack = async () => {
    if (isMediaCommandPending.value) return;
    if (!uiStore.vkActive) {
      showToast('Откройте вкладку VK Музыка в браузере', 'info');
      return;
    }
    isMediaCommandPending.value = true;
    try {
      if (typeof window.api?.vkControl === 'function') {
        const res = await vkControlWithTimeout('next');
        if (res && res.success) {
          uiStore.setMusicState('playing');
        } else {
          showToast('Не удалось переключить трек VK', 'error');
        }
      }
    } catch (e: unknown) {
      console.error(e);
      const errMessage = e instanceof Error ? e.message : String(e);
      if (errMessage === 'TIMEOUT') {
        showToast('Превышено время ожидания VK. Управление возвращено.', 'error');
      } else {
        showToast('Ошибка отправки команды VK', 'error');
      }
    } finally {
      isMediaCommandPending.value = false;
    }
  };

  const prevTrack = async () => {
    if (isMediaCommandPending.value) return;
    if (!uiStore.vkActive) {
      showToast('Откройте вкладку VK Музыка в браузере', 'info');
      return;
    }
    isMediaCommandPending.value = true;
    try {
      if (typeof window.api?.vkControl === 'function') {
        const res = await vkControlWithTimeout('prev');
        if (res && res.success) {
          uiStore.setMusicState('playing');
        } else {
          showToast('Не удалось переключить трек VK', 'error');
        }
      }
    } catch (e: unknown) {
      console.error(e);
      const errMessage = e instanceof Error ? e.message : String(e);
      if (errMessage === 'TIMEOUT') {
        showToast('Превышено время ожидания VK. Управление возвращено.', 'error');
      } else {
        showToast('Ошибка отправки команды VK', 'error');
      }
    } finally {
      isMediaCommandPending.value = false;
    }
  };

  const seekTrack = async (percentage: number) => {
    if (isMediaCommandPending.value) return;
    const clampedPct = Math.min(100, Math.max(0, Number(percentage) || 0));
    if (!uiStore.vkActive && uiStore.musicDuration <= 0) {
      showToast('Откройте вкладку VK Музыка в браузере', 'info');
      return;
    }
    isMediaCommandPending.value = true;
    try {
      if (uiStore.vkActive && typeof window.api?.vkControl === 'function') {
        const res = await vkControlWithTimeout('seek', { percentage: clampedPct });
        if (res && res.success) {
          uiStore.musicLastSeekTime = Date.now();
          uiStore.musicCurrentTime = Math.floor((clampedPct / 100) * uiStore.musicDuration);
        } else {
          showToast('Не удалось перемотать трек VK', 'error');
        }
      } else if (uiStore.musicDuration > 0) {
        uiStore.musicLastSeekTime = Date.now();
        uiStore.musicCurrentTime = Math.floor((clampedPct / 100) * uiStore.musicDuration);
      }
    } catch (e: unknown) {
      console.error(e);
      const errMessage = e instanceof Error ? e.message : String(e);
      if (errMessage === 'TIMEOUT') {
        showToast('Превышено время ожидания VK. Управление возвращено.', 'error');
      } else {
        showToast('Ошибка отправки команды VK', 'error');
      }
    } finally {
      isMediaCommandPending.value = false;
    }
  };

  const toggleShuffle = async () => {
    if (isMediaCommandPending.value) return;
    isMediaCommandPending.value = true;
    try {
      if (uiStore.vkActive && typeof window.api?.vkControl === 'function') {
        const nextVal = !uiStore.musicShuffled;
        const res = await vkControlWithTimeout('shuffle');
        if (res && res.success) {
          uiStore.setMusicShuffled(nextVal);
        } else {
          showToast('Не удалось изменить режим перемешивания VK', 'error');
        }
      }
    } catch (e: unknown) {
      console.error(e);
      const errMessage = e instanceof Error ? e.message : String(e);
      if (errMessage === 'TIMEOUT') {
        showToast('Превышено время ожидания VK. Управление возвращено.', 'error');
      } else {
        showToast('Ошибка отправки команды VK', 'error');
      }
    } finally {
      isMediaCommandPending.value = false;
    }
  };

  const toggleRepeat = async () => {
    if (isMediaCommandPending.value) return;
    isMediaCommandPending.value = true;
    try {
      if (uiStore.vkActive && typeof window.api?.vkControl === 'function') {
        let nextMode: 'off' | 'track' | 'playlist' = 'off';
        const current = uiStore.musicRepeated;
        if (current === 'off' || current === false) {
          nextMode = 'playlist';
        } else if (current === 'playlist') {
          nextMode = 'track';
        } else {
          nextMode = 'off';
        }
        const res = await vkControlWithTimeout('repeat');
        if (res && res.success) {
          uiStore.setMusicRepeated(nextMode);
        } else {
          showToast('Не удалось изменить режим повтора VK', 'error');
        }
      }
    } catch (e: unknown) {
      console.error(e);
      const errMessage = e instanceof Error ? e.message : String(e);
      if (errMessage === 'TIMEOUT') {
        showToast('Превышено время ожидания VK. Управление возвращено.', 'error');
      } else {
        showToast('Ошибка отправки команды VK', 'error');
      }
    } finally {
      isMediaCommandPending.value = false;
    }
  };

  const toggleLike = async () => {
    if (isMediaCommandPending.value) return;
    if (!uiStore.vkActive) {
      showToast('Для добавления трека откройте вкладку VK Музыка в браузере', 'info');
      return;
    }
    isMediaCommandPending.value = true;
    try {
      if (typeof window.api?.vkControl === 'function') {
        const nextVal = !uiStore.musicLiked;
        const action = nextVal ? 'save' : 'remove';
        const res = await vkControlWithTimeout(action);
        if (res && res.success) {
          uiStore.setMusicLiked(nextVal);
        } else {
          showToast('Не удалось обновить избранное VK', 'error');
        }
      }
    } catch (e: unknown) {
      console.error(e);
      const errMessage = e instanceof Error ? e.message : String(e);
      if (errMessage === 'TIMEOUT') {
        showToast('Превышено время ожидания VK. Управление возвращено.', 'error');
      } else {
        showToast('Ошибка отправки команды VK', 'error');
      }
    } finally {
      isMediaCommandPending.value = false;
    }
  };

  const prevVolume = ref(0.5);
  const toggleMute = async () => {
    if (isMediaCommandPending.value) return;
    isMediaCommandPending.value = true;
    try {
      if (uiStore.vkActive && typeof window.api?.vkControl === 'function') {
        if (uiStore.musicVolume > 0) {
          const oldVol = uiStore.musicVolume;
          prevVolume.value = oldVol;
          const res = await vkControlWithTimeout('volume', { value: 0 });
          if (res && res.success) {
            uiStore.setMusicVolume(0);
          } else {
            showToast('Не удалось изменить громкость VK', 'error');
          }
        } else {
          const targetVol = prevVolume.value;
          const res = await vkControlWithTimeout('volume', { value: targetVol });
          if (res && res.success) {
            uiStore.setMusicVolume(targetVol);
          } else {
            showToast('Не удалось изменить громкость VK', 'error');
          }
        }
      } else {
        if (uiStore.musicVolume > 0) {
          prevVolume.value = uiStore.musicVolume;
          uiStore.setMusicVolume(0);
        } else {
          uiStore.setMusicVolume(prevVolume.value);
        }
      }
    } catch (e: unknown) {
      console.error(e);
      const errMessage = e instanceof Error ? e.message : String(e);
      if (errMessage === 'TIMEOUT') {
        showToast('Превышено время ожидания VK. Управление возвращено.', 'error');
      } else {
        showToast('Ошибка отправки команды VK', 'error');
      }
    } finally {
      isMediaCommandPending.value = false;
    }
  };

  const handleVolumeInput = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const val = parseFloat(input.value);
    const oldVol = uiStore.musicVolume;
    
    uiStore.setMusicVolume(val);

    if (uiStore.vkActive && window.api?.vkControl) {
      volumeTxId++;
      const currentTxId = volumeTxId;
      try {
        const res = await window.api.vkControl('volume', { value: val });
        if (currentTxId !== volumeTxId) {
          return;
        }
        if (!res || !res.success) {
          uiStore.setMusicVolume(oldVol);
          input.value = String(oldVol);
          showToast('Не удалось изменить громкость VK', 'error');
        }
      } catch (err: unknown) {
        if (currentTxId === volumeTxId) {
          uiStore.setMusicVolume(oldVol);
          input.value = String(oldVol);
          showToast('Ошибка отправки команды VK', 'error');
        }
      }
    }
  };

  // File searching & actions
  const fileSearch = ref('');
  const selectedFile = ref<string | null>(null);

  const filteredFiles = computed(() => {
    if (!files.value) return [];
    const query = fileSearch.value.trim().toLowerCase();
    if (!query) return files.value.slice(0, 15);
    return files.value.filter(f => f.toLowerCase().includes(query)).slice(0, 15);
  });

  const triggerWorkspaceAction = (msg: string) => {
    if (window.api) {
      uiStore.setReactorState('processing');
      setTimeout(() => {
        uiStore.setReactorState('idle');
        showToast(`${localizations.value.actionCompleted}${msg}`, 'success');
      }, 1200);
    }
  };

  // Vision tab Webcam features
  const isCameraActive = ref(false);
  const videoPlayer = ref<HTMLVideoElement | null>(null);
  let mediaStream: MediaStream | null = null;

  const initializeCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      mediaStream = stream;
      isCameraActive.value = true;
      if (videoPlayer.value) {
        videoPlayer.value.srcObject = stream;
      }
    } catch (e) {
      console.warn('Camera access error:', e);
      showToast(localizations.value.cameraErr, 'error');
    }
  };

  const stopCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    isCameraActive.value = false;
  };

  useKeyboard({
    'Escape': () => {
      if (isCanvasActive.value) {
        closeProjection();
      }
    }
  });

  onMounted(() => {
    window.addEventListener('resize', updateWindowSize);
    fetchFiles();
  });

  onUnmounted(() => {
    window.removeEventListener('resize', updateWindowSize);
    stopCamera();
  });

  return {
    uiStore,
    settingsStore,
    isAwakening,
    toasts,
    showToast,
    localizations,
    isCanvasActive,
    visibleLyrics,
    coreCenter,
    coreScaleProps,
    coreStyle,
    projectionTitle,
    isUnhandledTab,
    closeProjection,
    handleCoreClick,
    formatTime,
    toggleMusic,
    nextTrack,
    prevTrack,
    seekTrack,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    toggleMute,
    handleVolumeInput,
    isMediaCommandPending,
    fileSearch,
    selectedFile,
    filteredFiles,
    triggerWorkspaceAction,
    isCameraActive,
    videoPlayer,
    initializeCamera,
    stopCamera
  };
}
