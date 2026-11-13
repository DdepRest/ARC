import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface SkillDefinition {
  id: string;
  title: string;
  desc: string;
  icon: string;
  enabled: boolean;
  triggers: string[];
}

export const useSkillsStore = defineStore('skills', () => {
  const skills = ref<SkillDefinition[]>([]);
  const loading = ref(false);
  const expandedSkillId = ref<string | null>(null);

  async function fetchSkills() {
    loading.value = true;
    try {
      skills.value = await window.api.skillsList();
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    } finally {
      loading.value = false;
    }
  }

  async function toggleSkill(id: string) {
    const skill = skills.value.find(s => s.id === id);
    if (!skill) {
      console.warn(`Skill with id ${id} not found in store`);
      return;
    }
    
    // Optimistic update for instant feedback
    const originalState = skill.enabled;
    skill.enabled = !skill.enabled;

    try {
      const success = await window.api.skillsToggle(id);
      if (!success) {
        console.error(`Backend failed to toggle skill ${id}`);
        skill.enabled = originalState; // Rollback
      }
    } catch (err) {
      console.error('IPC toggle error:', err);
      skill.enabled = originalState; // Rollback
    }
  }

  async function updateTriggers(id: string, triggers: string[]) {
    const success = await window.api.skillsUpdateTriggers(id, triggers);
    if (success) {
      const skill = skills.value.find(s => s.id === id);
      if (skill) skill.triggers = triggers;
    }
  }

  async function addTrigger(id: string, phrase: string) {
    const success = await window.api.skillsAddTrigger(id, phrase);
    if (success) {
      const skill = skills.value.find(s => s.id === id);
      if (skill && !skill.triggers.includes(phrase)) skill.triggers.push(phrase);
    }
  }

  async function removeTrigger(id: string, phrase: string) {
    const success = await window.api.skillsRemoveTrigger(id, phrase);
    if (success) {
      const skill = skills.value.find(s => s.id === id);
      if (skill) skill.triggers = skill.triggers.filter(t => t !== phrase);
    }
  }

  async function resetSkill(id: string) {
    await window.api.skillsReset(id);
    await fetchSkills();
  }

  async function cloneSkill(id: string) {
    await window.api.skillsClone(id);
    await fetchSkills();
  }

  async function createSkill() {
    const newId = await window.api.skillsCreate();
    if (newId) {
      await fetchSkills();
      expandedSkillId.value = newId; // Open the new skill for editing
    }
  }

  return {
    skills,
    loading,
    expandedSkillId,
    fetchSkills,
    toggleSkill,
    updateTriggers,
    addTrigger,
    removeTrigger,
    resetSkill,
    cloneSkill,
    createSkill
  };
});
