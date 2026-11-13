import { ref, computed, watch, Ref, onUnmounted } from 'vue';
import { Task } from '../types';
import { useSettingsStore } from '../../settings/stores/settings.store';

export function useFocusSprint(
  tasks: Ref<Task[]>, 
  saveTasks: () => void, 
  viewMode: Ref<'list' | 'eisenhower' | 'kanban' | 'sprint' | 'history'>,
  expandedTaskId?: Ref<string | null>
) {
  const settingsStore = useSettingsStore();
  const activeFocusTaskId = ref<string | null>(null);
  const sprintDurationMinutes = ref<number>(25);
  const sprintTimeRemaining = ref<number>(25 * 60);
  const isSprintRunning = ref<boolean>(false);

  let sprintTimer: any = null;
  let sessionSecondsElapsed = 0;

  const activeFocusTask = computed(() => {
    if (!activeFocusTaskId.value) return undefined;
    return (tasks.value || []).find((t) => t.id === activeFocusTaskId.value);
  });

  const syncTaskRemainingDuration = (task: Task | undefined) => {
    if (!task) return;
    const est = task.estimatedMinutes || 25;
    const spent = task.spentMinutes || 0;
    const remaining = spent > 0 && est > spent ? est - spent : est;
    const targetMins = Math.max(5, Math.min(180, remaining));
    sprintDurationMinutes.value = targetMins;
    sprintTimeRemaining.value = targetMins * 60;
  };

  // Auto-select in-progress task when entering 'sprint' viewMode and keep Inspector synchronized
  watch(
    () => [viewMode.value, tasks.value.length] as const,
    ([mode]) => {
      if (mode === 'sprint' && (tasks.value || []).length > 0) {
        const currentFocus = activeFocusTaskId.value
          ? tasks.value.find((t) => t.id === activeFocusTaskId.value && !t.completed)
          : undefined;

        if (!currentFocus) {
          const inProgress = tasks.value.find(
            (t) => !t.completed && (t.status === 'in_progress' || (t.spentMinutes || 0) > 0)
          );
          const fallback = tasks.value.find((t) => !t.completed);
          const target = inProgress || fallback;
          if (target) {
            activeFocusTaskId.value = target.id;
            syncTaskRemainingDuration(target);
          }
        }

        // If Task Inspector is open while entering Focus mode, sync it to the active focus task
        if (expandedTaskId && expandedTaskId.value && activeFocusTaskId.value) {
          expandedTaskId.value = activeFocusTaskId.value;
        }
      }
    },
    { immediate: true }
  );

  // If user selects a different task in the Inspector while in 'sprint' view, keep Focus synced
  if (expandedTaskId) {
    watch(expandedTaskId, (newInspectorId) => {
      if (viewMode.value === 'sprint' && newInspectorId && newInspectorId !== activeFocusTaskId.value) {
        const target = (tasks.value || []).find((t) => t.id === newInspectorId && !t.completed);
        if (target) {
          startFocusSprint(target.id, false);
        }
      }
    });
  }

  const startFocusSprint = (taskId: string, navigateToSprintView = true) => {
    const isSameTask = activeFocusTaskId.value === taskId;
    activeFocusTaskId.value = taskId;

    // Keep Task Inspector synchronized if it is currently open
    if (expandedTaskId && expandedTaskId.value) {
      expandedTaskId.value = taskId;
    }

    if (!isSameTask) {
      if (sprintTimer) {
        clearInterval(sprintTimer);
        sprintTimer = null;
      }
      isSprintRunning.value = false;
      const targetTask = (tasks.value || []).find((t) => t.id === taskId);
      syncTaskRemainingDuration(targetTask);
      sessionSecondsElapsed = 0;
    }

    if (navigateToSprintView) {
      viewMode.value = 'sprint';
    }
  };

  const toggleSprintTimer = () => {
    if (isSprintRunning.value) {
      clearInterval(sprintTimer);
      sprintTimer = null;
      isSprintRunning.value = false;
      if (sessionSecondsElapsed >= 30 && activeFocusTask.value) {
        activeFocusTask.value.spentMinutes = (activeFocusTask.value.spentMinutes || 0) + 1;
        sessionSecondsElapsed = 0;
      }
      saveTasks();
    } else {
      isSprintRunning.value = true;
      if (activeFocusTask.value && (!activeFocusTask.value.status || activeFocusTask.value.status === 'todo' || activeFocusTask.value.status === 'backlog')) {
        activeFocusTask.value.status = 'in_progress';
        saveTasks();
      }
      sprintTimer = setInterval(() => {
        if (sprintTimeRemaining.value > 0) {
          sprintTimeRemaining.value--;
          if (activeFocusTask.value) {
            sessionSecondsElapsed++;
            if (sessionSecondsElapsed >= 60) {
              activeFocusTask.value.spentMinutes = (activeFocusTask.value.spentMinutes || 0) + 1;
              sessionSecondsElapsed -= 60;
              saveTasks();
            }
          }
        } else {
          clearInterval(sprintTimer);
          sprintTimer = null;
          isSprintRunning.value = false;
          if (activeFocusTask.value && sessionSecondsElapsed >= 1) {
            activeFocusTask.value.spentMinutes = (activeFocusTask.value.spentMinutes || 0) + Math.max(1, Math.round(sessionSecondsElapsed / 60));
            sessionSecondsElapsed = 0;
          }
          saveTasks();
          settingsStore.triggerSyncToast(
            settingsStore.language === 'EN' ? '✦ Focus Sprint Completed!' : '✦ Спринт фокуса завершен!',
            undefined,
            true
          );
        }
      }, 1000);
    }
  };

  const resetSprintTimer = () => {
    clearInterval(sprintTimer);
    sprintTimer = null;
    isSprintRunning.value = false;
    sprintTimeRemaining.value = sprintDurationMinutes.value * 60;
    sessionSecondsElapsed = 0;
  };

  const setSprintDurationMinutes = (minutes: number) => {
    const clamped = Math.max(1, Math.min(180, minutes));
    sprintDurationMinutes.value = clamped;
    if (!isSprintRunning.value) {
      sprintTimeRemaining.value = clamped * 60;
    }
  };

  const adjustSprintTime = (deltaSeconds: number) => {
    const newSeconds = Math.max(60, Math.min(180 * 60, sprintTimeRemaining.value + deltaSeconds));
    sprintTimeRemaining.value = newSeconds;
    if (!isSprintRunning.value) {
      sprintDurationMinutes.value = Math.max(1, Math.round(newSeconds / 60));
    }
  };

  const setCustomSprintSeconds = (totalSeconds: number) => {
    const clamped = Math.max(5, Math.min(180 * 60, totalSeconds));
    sprintTimeRemaining.value = clamped;
    if (!isSprintRunning.value) {
      sprintDurationMinutes.value = Math.max(1, Math.ceil(clamped / 60));
    }
  };

  onUnmounted(() => {
    if (sprintTimer) clearInterval(sprintTimer);
  });

  return {
    activeFocusTaskId,
    sprintDurationMinutes,
    sprintTimeRemaining,
    isSprintRunning,
    activeFocusTask,
    startFocusSprint,
    toggleSprintTimer,
    resetSprintTimer,
    setSprintDurationMinutes,
    adjustSprintTime,
    setCustomSprintSeconds
  };
}

export const useFocusSession = useFocusSprint;
