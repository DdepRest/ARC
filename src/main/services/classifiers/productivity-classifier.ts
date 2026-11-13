import { BrowserWindow } from 'electron';
import { objectiveEngine } from '../objective/ObjectiveEngine';

export class ProductivityClassifier {
  static async classify(lower: string): Promise<string | null> {
    
    // UI Navigation Commands
    if (/(?:открой|перейди\s+(?:в|к|ко|во)|покажи|запусти|включи|активируй)\s+(?:оптический\s+мост\s+)?(настройк|задач|цел|чат|файл|памят|консол|виден|камер|вебк|веб-камер|транскрип|аудио|команд|макрос|канбан|истори|эйзенхауэр|список\s+задач)/i.test(lower)) {
      const match = lower.match(/(?:открой|перейди\s+(?:в|к|ко|во)|покажи|запусти|включи|активируй)\s+(?:оптический\s+мост\s+)?(настройк|задач|цел|чат|файл|памят|консол|виден|камер|вебк|веб-камер|транскрип|аудио|команд|макрос|канбан|истори|эйзенхауэр|список\s+задач)/i);
      if (match) {
        const name = match[1].toLowerCase().trim();
        let targetTab = 'core';
        if (name.includes('настройк')) targetTab = 'settings';
        else if (name.includes('задач') || name.includes('список') || name.includes('канбан') || name.includes('эйзенхауэр') || name.includes('истори')) targetTab = 'tasks';
        else if (name.includes('цел')) targetTab = 'objectives';
        else if (name.includes('чат')) targetTab = 'chat';
        else if (name.includes('файл')) targetTab = 'files';
        else if (name.includes('памят')) targetTab = 'memory';
        else if (name.includes('команд') || name.includes('макрос')) targetTab = 'commands';
        else if (name.includes('камер') || name.includes('вебк') || name.includes('виден')) targetTab = 'vision';
        else if (name.includes('транскрип') || name.includes('аудио')) targetTab = 'transcription';

        try {
          const wins = BrowserWindow.getAllWindows();
          wins.forEach(win => win.webContents.send('ui:navigate', { tab: targetTab }));
        } catch (e) { console.warn('Ignored error in catch', e); }

        const tabNamesRu: Record<string, string> = {
          settings: 'настройки',
          tasks: 'список задач',
          objectives: 'цели и стратегическую карту',
          chat: 'интерфейс связи',
          files: 'файловый менеджер',
          memory: 'базу долгосрочной памяти',
          commands: 'редактор макросов и сценариев',
          vision: 'оптический мост видения',
          transcription: 'панель транскрипции'
        };
        return `Переключаю интерфейс на ${tabNamesRu[targetTab] || 'главный экран'}.`;
      }
    }

    // Timer & Focus Sprint Commands
    if (/(?:запусти|начни|включи|активируй)\s+(?:фокус|таймер\s+фокуса|спринт|фокус-спринт)/i.test(lower)) {
      try {
        const wins = BrowserWindow.getAllWindows();
        wins.forEach(win => win.webContents.send('ui:timer-action', { action: 'start-focus' }));
      } catch (e) { console.warn('Ignored error in catch', e); }
      return `Запускаю фокус-спринт. Желаю продуктивной работы.`;
    }
    if (/(?:останови|прекрати|выключи|пауза|стоп)\s+(?:фокус|таймер\s+фокуса|спринт|фокус-спринт)/i.test(lower)) {
      try {
        const wins = BrowserWindow.getAllWindows();
        wins.forEach(win => win.webContents.send('ui:timer-action', { action: 'stop-focus' }));
      } catch (e) { console.warn('Ignored error in catch', e); }
      return `Фокус-спринт приостановлен.`;
    }
    if (/(?:запусти|начни|включи|активируй)\s+(?:отдых|таймер\s+отдыха|перерыв)/i.test(lower)) {
      try {
        const wins = BrowserWindow.getAllWindows();
        wins.forEach(win => win.webContents.send('ui:timer-action', { action: 'start-rest' }));
      } catch (e) { console.warn('Ignored error in catch', e); }
      return `Режим отдыха активирован. Отдохните немного.`;
    }
    if (/(?:останови|прекрати|выключи|пауза|стоп)\s+(?:отдых|таймер\s+отдыха|перерыв)/i.test(lower)) {
      try {
        const wins = BrowserWindow.getAllWindows();
        wins.forEach(win => win.webContents.send('ui:timer-action', { action: 'stop-rest' }));
      } catch (e) { console.warn('Ignored error in catch', e); }
      return `Режим отдыха отключен.`;
    }

    // Task Intent Match (STRICT: requires explicit task/list/plan keyword)
    if (
      /(?:удали|удалить|очисти|очистить|стереть|стирай|уничтожь|уничтожить|ударился|удалился)\s+(?:все\s+)?(?:задачи|список\s+задач|все\s+дела|все)/i.test(lower) ||
      lower === 'удали все' || lower === 'очисти все' || lower === 'удали все задачи' || lower === 'очисти задачи'
    ) {
      return `Все задачи удалены из оперативного списка.`;
    }

    const taskCreationMatch = lower.match(/(?:создай|создать|создание|добавь|добавить|добавление|запиши|записать|поставь|поставить|сделай|сделать|запланируй|запланировать|внести|вписать)\s+(?:мне\s+)?(?:новую\s+)?(?:задач[уаеыи]|задание|задачку|напоминание)\s+(.+)/i)
      || lower.match(/(?:создай|создать|добавь|добавить|запиши|записать|поставь|поставить|внести|вписать)\s+(?:мне\s+)?(?:в\s+)?(?:задачи|список(?:\s+задач|\s+дел)?|план|дела)\s+(.+)/i)
      || lower.match(/(?:нужно|надо|хочу)\s+(?:сделать|создать|запланировать|поставить|записать|добавить)\s+(?:задач[уаеы]|задание|задачку|напоминание|в\s+задачи|в\s+список|в\s+план)\s+(.+)/i)
      || lower.match(/^(?:новая\s+)?(?:задач[ау]|напоминание)\s*[:\s]\s*(.+)/i);

    if (taskCreationMatch) {
      let taskTitle = taskCreationMatch[1].replace(/^["'«»\s]+|["'«»\s]+$/g, '').trim();
      if (taskTitle && taskTitle !== 'задачу' && taskTitle !== 'все') {
        return `Задача «${taskTitle}» принята и добавлена в оперативный список.`;
      }
    }

    const taskCompleteMatch = lower.match(/(?:выполни|выполнить|заверши|завершить|сделай|сделать|отметь|отметить|закончи|закончить|закрыть|закрой)\s+(?:задач[уаеы]|подзадач[уаеы]|задание|шаг)\s+(.+)/i)
      || lower.match(/(?:задач[ау]|подзадач[ау]|шаг)\s+(.+?)\s+(?:выполнена|завершена|сделана|готова)/i);
    if (taskCompleteMatch) {
      const taskTitle = (taskCompleteMatch[1] || taskCompleteMatch[2] || '').trim();
      if (taskTitle) {
        return `Задача «${taskTitle}» отмечена как выполненная.`;
      }
    }

    const taskDeleteMatch = lower.match(/(?:удали|удалить|удалился|удали-ка|а\s+удалить|стирай|стереть|убери|убрать|уничтожь|уничтожить)\s+(?:задач[уаеы]|подзадач[уаеы]|задание|шаг)\s*(.*)/i);
    if (taskDeleteMatch) {
      const taskTitle = taskDeleteMatch[1].trim().replace(/^["'«»\s]+|["'«»\s]+$/g, '');
      if (taskTitle === 'все' || taskTitle === 'все задачи' || taskTitle === 'список') {
        return `Все задачи удалены из оперативного списка.`;
      }
      if (taskTitle && taskTitle !== 'задачу' && taskTitle !== 'задача') {
        return `Задача «${taskTitle}» удалена из списка.`;
      }
      return `Уточните название задачи, которую необходимо удалить.`;
    }

    // Objective Trigger Match
    if (lower.startsWith('создай цель') || lower.startsWith('добавь цель') || lower.startsWith('новая цель')) {
      const parts = lower.split(':');
      let title = lower.replace(/создай цель|добавь цель|новая цель/i, '').trim();
      let desc = '';
      if (parts.length > 1) {
        title = parts[0].replace(/создай цель|добавь цель|новая цель/i, '').trim();
        desc = parts[1].trim();
      }
      
      if (title.length > 0) {
        try {
          const obj = objectiveEngine.createObjective(title, desc || 'Сгенерировано из голосовой команды', 'SYSTEM_AUTO', 0);
          objectiveEngine.decomposeObjectiveDraft(obj.id, 'Авто-генерация задач для голосовой цели')
            .then(draft => objectiveEngine.setPendingDraft(draft))
            .catch(e => console.error("Draft generation failed in ProductivityClassifier:", e));
          return `Цель "${title}" создана. Черновик декомпозиции подготовлен для утверждения оператором.`;
        } catch (e) {
          console.error("Objective creation failed in ProductivityClassifier:", e);
          return "Ошибка при создании цели.";
        }
      } else {
        return "Уточните название цели после команды 'создай цель'.";
      }
    }

    return null;
  }
}
