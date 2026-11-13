<template>
  <div class="flex flex-col h-full w-full max-w-full p-2 md:p-4 z-10 overflow-hidden gap-4 relative bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[16px]">
    
    <!-- Floating Rest Timer Banner -->
    <RestTimerBanner />

    <!-- Sub-Header / Summary bar -->
    <TaskHeaderBar
      v-model:viewMode="viewMode"
      :translations="translations"
      :completedCount="completedCount"
      :tasksCount="tasks.length"
      :completionRatio="completionRatio"
      :isRailVisible="shouldShowRail"
      @openAnalytics="isAnalyticsModalOpen = true"
      @toggleRail="toggleContextRail"
    />

    <!-- Task Analytics & Metrics Modal (lazy-mounted only when open) -->
    <Suspense v-if="isAnalyticsModalOpen">
      <TaskAnalyticsModal
        :show="isAnalyticsModalOpen"
        @close="isAnalyticsModalOpen = false"
      />
    </Suspense>

    <!-- Category Manager Modal -->
    <ArcModal
      v-if="isCategoryModalOpen"
      :show="isCategoryModalOpen"
      title="Управление Категориями"
      @close="isCategoryModalOpen = false"
    >
      <CategoryModal
        :categories="categories"
        :getCategoryStyles="getCategoryStyles"
        @createCategory="handleCreateCategoryInModal"
        @deleteCategory="deleteCategory"
        @close="isCategoryModalOpen = false"
      />
    </ArcModal>

    <!-- Recurrence Manager Modal -->
    <ArcModal
      v-if="isRecurrenceModalOpen"
      :show="isRecurrenceModalOpen"
      title="Настройка повторения и графика"
      @close="isRecurrenceModalOpen = false"
    >
      <RecurrenceModal
        :rule="targetTaskIdForRecurrenceModal ? (tasks || []).find(t => t.id === targetTaskIdForRecurrenceModal)?.recurrence : newTaskRecurrence"
        @save="handleSaveRecurrenceInModal"
        @close="isRecurrenceModalOpen = false"
      />
    </ArcModal>

    <!-- Main Container Layout: Active Workspace + Context Rail -->
    <div class="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 items-stretch overflow-hidden">
      
      <!-- Primary Workspace -->
      <div class="flex-1 min-w-0 min-h-0 flex flex-col gap-3 overflow-hidden">
        
        <TaskConsole
          :translations="translations"
          v-model:viewMode="viewMode"
          v-model:newTaskText="newTaskText"
          v-model:newTaskCategory="newTaskCategory"
          v-model:newTaskPriority="newTaskPriority"
          v-model:newTaskDueDate="newTaskDueDate"
          :newTaskRecurrence="newTaskRecurrence"
          v-model:searchQuery="searchQuery"
          v-model:sortBy="sortBy"
          v-model:activeFilter="activeFilter"
          :categoryOptions="categoryOptions"
          :completedCount="completedCount"
          :filterCount="filterCount"
          :objectives="tasksStore.objectives"
          @addTask="addTask"
          @clearCompleted="clearCompleted"
          @loadPresetTemplate="loadPresetTemplate"
          @openCategoryModal="openCategoryModal"
          @openRecurrenceModal="openRecurrenceModal"
        />

        <div 
          class="flex-1 min-h-0 pr-0.5"
          :class="viewMode === 'kanban' ? 'h-full flex flex-col overflow-hidden' : 'overflow-y-auto custom-scrollbar'"
        >
          <!-- MODE 1: Tactical List View -->
          <TaskList
            v-if="viewMode === 'list' || viewMode === 'eisenhower'"
            :tasks="filteredTasks"
          />

          <!-- MODE 2: Kanban Board -->
          <KanbanBoard
            v-else-if="viewMode === 'kanban'"
            :tasks="filteredTasks"
            @updateTaskStatus="updateTaskStatus"
            @decomposeTaskWithAI="decomposeTaskWithAI"
            @startFocusSprint="startFocusSprint"
          />

          <!-- MODE 3: Focus Sprint Engine -->
          <FocusSprintView v-else-if="viewMode === 'sprint'" />

          <!-- MODE 4: History View -->
          <TaskHistoryView
            v-else-if="viewMode === 'history'"
            :tasks="tasks"
            :categoryOptions="categoryOptions"
          />
        </div>

      </div>

      <!-- Right Column: Context Rail (Task Inspector when selected / Operational Summary otherwise) -->
      <div 
        v-if="shouldShowRail"
        class="w-full lg:w-[310px] xl:w-[330px] shrink-0 min-h-0 h-full transition-all duration-200"
      >
        <TaskContextRail 
          @closeRail="isRailOpen = false"
          @openCategoryModal="openCategoryModal"
        />
      </div>

    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useTasksStore } from '../stores/tasks.store';
import TaskHeaderBar from './TaskHeaderBar.vue';
import TaskConsole from './TaskConsole.vue';
import TaskList from './TaskList.vue';
import TaskContextRail from './TaskContextRail.vue';
import TaskAnalyticsModal from './TaskAnalyticsModal.vue';
import KanbanBoard from './KanbanBoard.vue';
import FocusSprintView from './FocusSprintView.vue';
import TaskHistoryView from './TaskHistoryView.vue';
import CategoryModal from './CategoryModal.vue';
import RecurrenceModal from './RecurrenceModal.vue';
import ArcModal from '../../../components/ui/ArcModal.vue';
import RestTimerBanner from './RestTimerBanner.vue';
import { RecurrenceRule } from '../types';

const tasksStore = useTasksStore();
const {
  tasks,
  expandedTaskId,
  viewMode,
  newTaskText,
  newTaskPriority,
  newTaskCategory,
  newTaskDueDate,
  newTaskRecurrence,
  activeFilter,
  searchQuery,
  sortBy,
  completedCount,
  completionRatio,
  translations,
  filteredTasks,
  categories,
  categoryOptions,
} = storeToRefs(tasksStore);

const {
  filterCount,
  getCategoryStyles,
  addTask,
  clearCompleted,
  saveTasks,
  decomposeTaskWithAI,
  startFocusSprint,
  updateTaskStatus,
  loadPresetTemplate,
  addCategory,
  deleteCategory,
} = tasksStore;

const isRailOpen = ref(true);

const shouldShowRail = computed(() => {
  if (expandedTaskId.value) return true;
  if (viewMode.value === 'kanban' || viewMode.value === 'sprint') {
    return false;
  }
  return isRailOpen.value;
});

const toggleContextRail = () => {
  if (expandedTaskId.value) {
    tasksStore.expandedTaskId = null;
  } else if (viewMode.value === 'sprint') {
    isRailOpen.value = true;
    const focusId = tasksStore.activeFocusTaskId || tasks.value.find(t => !t.completed)?.id || tasks.value[0]?.id;
    if (focusId) {
      tasksStore.expandedTaskId = focusId;
    }
  } else if (viewMode.value === 'kanban') {
    isRailOpen.value = !isRailOpen.value;
    if (tasks.value.length > 0 && !expandedTaskId.value) {
      const target = tasks.value.find(t => !t.completed && (t.status === 'in_progress' || (t.spentMinutes || 0) > 0)) || tasks.value[0];
      tasksStore.expandedTaskId = target.id;
    }
  } else {
    isRailOpen.value = !isRailOpen.value;
  }
};

const isAnalyticsModalOpen = ref(false);
const isCategoryModalOpen = ref(false);
const targetTaskIdForModal = ref<string | undefined>(undefined);

const openCategoryModal = (taskId?: string) => {
  targetTaskIdForModal.value = taskId;
  isCategoryModalOpen.value = true;
};

const handleCreateCategoryInModal = (name: string, color?: string) => {
  const newCat = addCategory(name, color);
  if (newCat) {
    if (targetTaskIdForModal.value) {
      const task = tasks.value.find(t => t.id === targetTaskIdForModal.value);
      if (task) {
        task.category = newCat.id;
        saveTasks();
      }
    } else {
      newTaskCategory.value = newCat.id;
    }
  }
};

const isRecurrenceModalOpen = ref(false);
const targetTaskIdForRecurrenceModal = ref<string | undefined>(undefined);

const openRecurrenceModal = (taskId?: string) => {
  targetTaskIdForRecurrenceModal.value = taskId;
  isRecurrenceModalOpen.value = true;
};

const handleSaveRecurrenceInModal = (rule: RecurrenceRule | undefined) => {
  if (targetTaskIdForRecurrenceModal.value) {
    const task = tasks.value.find(t => t.id === targetTaskIdForRecurrenceModal.value);
    if (task) {
      task.recurrence = rule;
      saveTasks();
    }
  } else {
    newTaskRecurrence.value = rule;
  }
};
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--arc-hairline);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--arc-border);
}
</style>
