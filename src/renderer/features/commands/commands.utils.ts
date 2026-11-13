import { Task, SubTask } from '../tasks/types';

export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Calculates similarity coefficient (0.0 - 1.0) between two strings
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  return maxLength === 0 ? 1.0 : 1.0 - distance / maxLength;
}

/**
 * Generates dynamic, varied responses to user gratitude ("спасибо", "благодарю")
 */
export function generateGratitudeResponse(isEn: boolean = false): string {
  if (isEn) {
    const enResponses = [
      'Glad to help.',
      'Always glad to assist.',
      'Anytime.',
      'You are welcome.'
    ];
    return enResponses[Math.floor(Math.random() * enResponses.length)];
  }
  const ruResponses = [
    'Рад помочь.',
    'Пожалуйста.',
    'Всегда рад.',
    'Обращайтесь.',
    'На связи.'
  ];
  return ruResponses[Math.floor(Math.random() * ruResponses.length)];
}

/**
 * Generates dynamic, varied responses to questions about A.R.C.'s identity and mission
 */
export function generateArcIdentityResponse(isEn: boolean = false): string {
  if (isEn) {
    return 'I am here. Ready to help with information, tasks, or automation.';
  }
  return 'Я на связи. Помогу найти информацию, структурировать задачи или автоматизировать рутину.';
}


export const findTaskOrSubtask = (query: string, tasks: Task[]): { task?: Task; subtask?: SubTask; matchedName: string; similarity: number } | null => {
  if (!query) return null;
  const clean = query.trim().toLowerCase();
  
  const numMatch = clean.match(/(?:задач[уаеы]|номер|#)?\s*(\d+)/i);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < tasks.length) {
      return { task: tasks[idx], matchedName: tasks[idx].text, similarity: 1.0 };
    }
  }

  let bestMatch: any = null;
  let highestSim = 0;

  for (const task of tasks) {
    const taskSim = calculateSimilarity(clean, task.text);
    if (taskSim > highestSim) {
      highestSim = taskSim;
      bestMatch = { task, matchedName: task.text, similarity: taskSim };
    }
    if (task.subtasks) {
      for (const sub of task.subtasks) {
        const subSim = calculateSimilarity(clean, sub.text);
        if (subSim > highestSim) {
          highestSim = subSim;
          bestMatch = { task, subtask: sub, matchedName: sub.text, similarity: subSim };
        }
      }
    }
  }

  if (bestMatch && highestSim >= 0.55) {
    return bestMatch;
  }
  return null;
};
