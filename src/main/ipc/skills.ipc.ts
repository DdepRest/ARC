import { ipcMain, app } from 'electron';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

export interface SkillDefinition {
  id: string;
  title: string;
  desc: string;
  icon: string;
  enabled: boolean;
  triggers: string[];
}

export const skillsStore = new Map<string, SkillDefinition>();

const defaultSkills: SkillDefinition[] = [
  {
    id: 'web-search',
    title: 'Web Поиск',
    desc: 'Ищет информацию в интернете (Google, Wikipedia)',
    icon: 'Globe',
    enabled: true,
    triggers: ['найди в интернете', 'загугли', 'кто такой', 'что такое']
  },
  {
    id: 'files',
    title: 'Файловая Система',
    desc: 'Поиск и открытие файлов на локальном ПК',
    icon: 'Folder',
    enabled: true,
    triggers: ['открой файл', 'найди папку', 'где лежит']
  },
  {
    id: 'media',
    title: 'Управление Медиа',
    desc: 'Воспроизведение музыки, пауза, громкость',
    icon: 'Music',
    enabled: true,
    triggers: ['включи музыку', 'пауза', 'следующий трек', 'сделай тише']
  },
  {
    id: 'terminal',
    title: 'Терминал (Опасно)',
    desc: 'Выполнение команд в командной строке',
    icon: 'Terminal',
    enabled: true,
    triggers: ['выполни команду', 'в терминале', 'запусти скрипт']
  }
];

function getSkillsFilePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'skills.json');
}

export function loadSkills() {
  const filePath = getSkillsFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data) as SkillDefinition[];
      skillsStore.clear();
      parsed.forEach(skill => skillsStore.set(skill.id, skill));
      return;
    } catch (e) {
      console.error('Failed to load skills, falling back to defaults:', e);
    }
  }
  
  // Initialize with defaults if file doesn't exist or is corrupted
  skillsStore.clear();
  defaultSkills.forEach(skill => skillsStore.set(skill.id, skill));
  saveSkills();
}

export function saveSkills() {
  const filePath = getSkillsFilePath();
  try {
    const data = Array.from(skillsStore.values());
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save skills:', e);
  }
}

export function registerSkillsIpc() {
  // Load skills when IPC is registered (app is ready)
  loadSkills();

  ipcMain.handle('skills:list', () => {
    return Array.from(skillsStore.values());
  });

  ipcMain.handle('skills:toggle', (_event, id: string) => {
    const skill = skillsStore.get(id);
    if (skill) {
      skill.enabled = !skill.enabled;
      saveSkills();
    }
    return true;
  });

  ipcMain.handle('skills:updateTriggers', (_event, { id, triggers }: { id: string, triggers: string[] }) => {
    const skill = skillsStore.get(id);
    if (skill) {
      skill.triggers = triggers;
      saveSkills();
    }
    return true;
  });

  ipcMain.handle('skills:addTrigger', (_event, { id, phrase }: { id: string, phrase: string }) => {
    const skill = skillsStore.get(id);
    if (skill && !skill.triggers.includes(phrase)) {
      skill.triggers.push(phrase);
      saveSkills();
    }
    return true;
  });

  ipcMain.handle('skills:removeTrigger', (_event, { id, phrase }: { id: string, phrase: string }) => {
    const skill = skillsStore.get(id);
    if (skill) {
      skill.triggers = skill.triggers.filter(t => t !== phrase);
      saveSkills();
    }
    return true;
  });

  ipcMain.handle('skills:reset', (_event, id: string) => {
    skillsStore.clear();
    defaultSkills.forEach(skill => skillsStore.set(skill.id, { ...skill, triggers: [...skill.triggers] }));
    saveSkills();
    return true;
  });

  ipcMain.handle('skills:clone', (_event, id: string) => {
    const skill = skillsStore.get(id);
    if (skill) {
      const newId = randomUUID();
      skillsStore.set(newId, {
        ...skill,
        id: newId,
        title: skill.title + ' (Копия)',
        triggers: [...skill.triggers] // clone triggers array
      });
      saveSkills();
    }
    return true;
  });

  ipcMain.handle('skills:create', () => {
    const newId = randomUUID();
    const newSkill: SkillDefinition = {
      id: newId,
      title: 'Новый макрос',
      desc: 'Описание вашего макроса',
      icon: 'Play',
      enabled: true,
      triggers: []
    };
    skillsStore.set(newId, newSkill);
    saveSkills();
    return newId;
  });
}
