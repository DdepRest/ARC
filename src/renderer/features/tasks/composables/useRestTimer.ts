import { ref, Ref, onUnmounted } from 'vue';
import { Task } from '../types';
import { useSettingsStore } from '../../settings/stores/settings.store';
import { useUIStore } from '../../../stores/ui.store';

export function useRestTimer(tasks: Ref<Task[]>, saveTasks: () => void) {
  const settingsStore = useSettingsStore();
  const uiStore = useUIStore();
  
  const restTimeRemaining = ref<number>(0);
  const isRestRunning = ref<boolean>(false);
  const activeRestSubtaskName = ref<string>('');
  
  let restInterval: any = null;

  const playCompletionChime = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      osc.connect(gainNode);
      gainNode.connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      // Ignore
    
        console.warn('[A.R.C] Handled silent error:', e);
    }
  };

  const notifyRestCompletion = () => {
    playCompletionChime();
    const name = activeRestSubtaskName.value || 'Отдых';
    const isEn = settingsStore.language === 'EN';
    const msg = isEn
      ? `Rest completed for ${name}, sir! Time for the next set!`
      : `Время вышло! Отдых подзадачи «${name}» завершен. Время возвращаться к работе!`;

    settingsStore.triggerSyncToast(msg, undefined, true);
    uiStore.speak(msg);
  };

  const startRestTimer = (seconds: number, subtaskName?: string) => {
    if (restInterval) clearInterval(restInterval);
    restTimeRemaining.value = seconds;
    isRestRunning.value = true;
    activeRestSubtaskName.value = subtaskName || 'Отдых между подходами';

    restInterval = setInterval(() => {
      if (restTimeRemaining.value > 0) {
        restTimeRemaining.value--;
      } else {
        clearInterval(restInterval);
        isRestRunning.value = false;
        notifyRestCompletion();
      }
    }, 1000);
  };

  const toggleRestTimer = () => {
    if (isRestRunning.value) {
      if (restInterval) clearInterval(restInterval);
      isRestRunning.value = false;
    } else if (restTimeRemaining.value > 0) {
      isRestRunning.value = true;
      restInterval = setInterval(() => {
        if (restTimeRemaining.value > 0) {
          restTimeRemaining.value--;
        } else {
          clearInterval(restInterval);
          isRestRunning.value = false;
          notifyRestCompletion();
        }
      }, 1000);
    }
  };

  const stopRestTimer = () => {
    if (restInterval) clearInterval(restInterval);
    isRestRunning.value = false;
    restTimeRemaining.value = 0;
  };

  const adjustRestTime = (secondsDelta: number) => {
    restTimeRemaining.value = Math.max(0, restTimeRemaining.value + secondsDelta);
  };

  const isWorkoutText = (taskText: string, subText: string) => {
    const combined = (taskText + ' ' + subText).toLowerCase();
    return /(отжим|присед|жим|тяг|подтяг|пресс|гантел|штанг|подход|брус|планк|размин|20х|30х|15х|10х|12х|workout|set)/i.test(combined);
  };

  const setSubtaskRestSeconds = (taskId: string, subId: string, seconds: number) => {
    const task = tasks.value.find(t => t.id === taskId);
    if (task && task.subtasks) {
      const sub = task.subtasks.find(st => st.id === subId);
      if (sub) {
        sub.restSeconds = seconds;
        saveTasks();
      }
    }
  };

  const setAllSubtasksRestSeconds = (taskId: string, seconds: number) => {
    const task = tasks.value.find(t => t.id === taskId);
    if (task && task.subtasks) {
      task.autoRestSeconds = seconds;
      task.subtasks.forEach(st => st.restSeconds = seconds);
      saveTasks();
    }
  };

  onUnmounted(() => {
    if (restInterval) clearInterval(restInterval);
  });

  return {
    restTimeRemaining,
    isRestRunning,
    activeRestSubtaskName,
    startRestTimer,
    toggleRestTimer,
    stopRestTimer,
    adjustRestTime,
    isWorkoutText,
    setSubtaskRestSeconds,
    setAllSubtasksRestSeconds
  };
}
