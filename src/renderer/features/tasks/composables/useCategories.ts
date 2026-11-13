import { ref, computed } from 'vue';
import { TaskCategory, SelectOption } from '../types';

export function useCategories() {
  const defaultCategories: TaskCategory[] = [
    { id: 'general', name: 'Общее', color: 'emerald' },
    { id: 'work', name: 'Работа', color: 'cyan' },
    { id: 'personal', name: 'Личное', color: 'purple' },
    { id: 'dev', name: 'Разработка', color: 'blue' },
    { id: 'study', name: 'Учеба', color: 'amber' },
    { id: 'fitness', name: 'Спорт', color: 'rose' },
    { id: 'ops', name: 'Операции', color: 'emerald' },
    { id: 'core', name: 'Ядро', color: 'purple' },
    { id: 'sec', name: 'Безопасность', color: 'red' },
    { id: 'data', name: 'Данные', color: 'cyan' }
  ];

  const categories = ref<TaskCategory[]>([]);

  const loadCategories = () => {
    try {
      const saved = localStorage.getItem('arc_task_categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Ensure all default system categories exist so tasks never show blank category selects
          const merged = [...parsed];
          for (const defCat of defaultCategories) {
            if (!merged.some((c: any) => c && c.id === defCat.id)) {
              merged.push(defCat);
            }
          }
          categories.value = merged;
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load categories', e);
    }
    categories.value = [...defaultCategories];
  };

  const saveCategories = () => {
    try {
      localStorage.setItem('arc_task_categories', JSON.stringify(categories.value));
    } catch (e) {
      console.error('Failed to save categories', e);
    }
  };

  // Initialize on load
  loadCategories();

  const categoryOptions = computed<SelectOption[]>(() => {
    const opts = categories.value.map(c => ({
      label: c.name,
      value: c.id
    }));
    opts.push({ label: '+ Категории...', value: 'manage_categories' });
    return opts;
  });

  const getCategoryName = (id: string) => {
    if (!id || id === 'manage_categories') return 'Общее';
    const cat = categories.value.find(c => c.id === id) || defaultCategories.find(c => c.id === id);
    return cat ? cat.name : id;
  };

  const addCategory = (name: string, color?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return categories.value[0]?.id || 'general';
    const existing = categories.value.find(c => c.name.toLowerCase() === trimmed.toLowerCase() || c.id === trimmed.toLowerCase());
    if (existing) return existing.id;
    const colors = ['emerald', 'cyan', 'purple', 'rose', 'amber', 'blue', 'indigo', 'fuchsia'];
    const assignedColor = color || colors[categories.value.length % colors.length];
    const id = 'cat-' + Math.random().toString(36).substring(2, 9);
    categories.value.push({ id, name: trimmed, color: assignedColor });
    saveCategories();
    return id;
  };

  const deleteCategory = (id: string) => {
    categories.value = categories.value.filter(c => c.id !== id);
    saveCategories();
  };

  const getCategoryStyles = (cat: string) => {
    if (!cat) return 'bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)]';
    return 'bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)]';
  };

  return {
    categories,
    categoryOptions,
    getCategoryName,
    addCategory,
    deleteCategory,
    getCategoryStyles
  };
}
