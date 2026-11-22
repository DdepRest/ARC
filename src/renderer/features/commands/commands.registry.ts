import { isStopCommand, isGratitudeCommand } from '../../../shared/utils/stop-command';
import { Task, SubTask } from '../tasks/types';
import { generateArcIdentityResponse, generateGratitudeResponse, levenshteinDistance, calculateSimilarity, findTaskOrSubtask } from './commands.utils';
import { normalizeRussianNumbers, normalizeMediaPhonetics } from '../../../shared/utils/ru-number-parser';
import { resolveSiteQueryToUrl } from '../../../shared/utils/url-normalizer';

export async function executeCommandRegistry(rawText: string, stores: any): Promise<{ handled: boolean; response?: string } | null> {
  const { uiStore, settingsStore, tasksStore } = stores;
  const {
    tasks, recommendedTask, totalSpentMinutes, activeCount,
    startRestTimer, toggleRestTimer, stopRestTimer, adjustRestTime, setSubtaskRestSeconds, setAllSubtasksRestSeconds,
    startFocusSprint, toggleSprintTimer, resetSprintTimer, setSprintDurationMinutes,
    addTask, addSubtask, decomposeTaskWithAI, applyStepTemplate, toggleTask, toggleSubtask,
    deleteTask, duplicateTask, addCategory
  } = tasksStore;

    if (!rawText || !rawText.trim()) return null;

    const isEn = settingsStore.language === 'EN';
    let text = normalizeMediaPhonetics(
      normalizeRussianNumbers(rawText.trim().toLowerCase()).replace(/[.,!?]/g, '')
    );

    const setTaskViewMode = (mode: string) => {
      if (tasksStore) {
        if (typeof tasksStore.setViewMode === 'function') tasksStore.setViewMode(mode);
        else if (tasksStore.viewMode && typeof tasksStore.viewMode === 'object' && 'value' in tasksStore.viewMode) tasksStore.viewMode.value = mode;
        else tasksStore.viewMode = mode;
      }
    };
    const setTaskFilter = (filter: string) => {
      if (tasksStore) {
        if (typeof tasksStore.setActiveFilter === 'function') tasksStore.setActiveFilter(filter);
        else if (tasksStore.activeFilter && typeof tasksStore.activeFilter === 'object' && 'value' in tasksStore.activeFilter) tasksStore.activeFilter.value = filter;
        else tasksStore.activeFilter = filter;
      }
    };
    const setTaskSearch = (query: string) => {
      if (tasksStore) {
        if (typeof tasksStore.setSearchQuery === 'function') tasksStore.setSearchQuery(query);
        else if (tasksStore.searchQuery && typeof tasksStore.searchQuery === 'object' && 'value' in tasksStore.searchQuery) tasksStore.searchQuery.value = query;
        else tasksStore.searchQuery = query;
      }
    };

    const logAndReturn = (responseStr: string) => {
      if ((window as any).api && typeof (window as any).api.logDialog === 'function') {
        try {
          (window as any).api.logDialog(rawText, responseStr, { isVoiceCommand: true });
        } catch (err) {
          console.error('[VoiceCommands] Failed to log dialog:', err);
        }
      }
      return {
        handled: true,
        response: responseStr
      };
    };

    // Strip wake words if present (e.g., "арк", "a.r.c.", "арок", "ар", "компьютер")
    const wakeWords = ['арк', 'arc', 'а.р.к.', 'a.r.c.', 'арок', 'ар', 'арка', 'арко', 'акр', 'орк', 'арт', 'арц', 'компьютер', 'ассистент'];
    for (const w of wakeWords) {
      if (text.startsWith(w + ' ')) {
        text = text.substring(w.length + 1).trim();
      }
    }

    const isRepeatAnswer = /(?:повтори последний ответ|повтори что ты сказал|что ты сказал|повтори ответ|ещё раз что ты сказал|еще раз что ты сказал)/i.test(rawText);
    if (isRepeatAnswer) {
      if (uiStore.lastSpokenResponse) {
        return logAndReturn(uiStore.lastSpokenResponse);
      } else {
        return logAndReturn(isEn ? "I don't have a previous response to repeat." : "Мне нечего повторять.");
      }
    }

    const isRepeatAction = /^(?:ещё|еще|повтори|ещё раз|еще раз|давай ещё|давай еще|врубай еще|врубай ещё)$/i.test(text.trim()) && !/(?:ответ|сказал)/i.test(text);
    if (isRepeatAction) {
      if (uiStore.lastActionCommand) {
        // override rawText and text with the last action command
        rawText = uiStore.lastActionCommand;
        text = normalizeMediaPhonetics(
          normalizeRussianNumbers(rawText.trim().toLowerCase()).replace(/[.,!?]/g, '')
        );
        for (const w of wakeWords) {
          if (text.startsWith(w + ' ')) {
            text = text.substring(w.length + 1).trim();
          }
        }
      } else {
        return logAndReturn(isEn ? "No previous action to repeat." : "Нет предыдущего действия для повтора.");
      }
    } else {
      if (!isRepeatAnswer) {
        uiStore.lastActionCommand = rawText;
      }
    }

    // 0. GRATITUDE COMMANDS ("спасибо", "благодарю", "cgfcbf")
    if (isGratitudeCommand(rawText)) {
      const response = generateGratitudeResponse(isEn);
      console.log(`[VoiceFSM] Gratitude response: "${response}"`);
      uiStore.speak(response);
      window.dispatchEvent(new CustomEvent('arc:clear-dialogue-window'));
      return logAndReturn(response);
    }

    // 0. HARD STOP / SILENCE COMMANDS
    if (isStopCommand(rawText)) {
      console.log('[VoiceCommands] Hard STOP trigger detected. Silencing audio and resetting state.');
      window.dispatchEvent(new CustomEvent('arc:stop-audio'));
      uiStore.setSoftPaused(false);
      uiStore.setTimelineStep(null);
      uiStore.setReactorState('idle');
      return logAndReturn(isEn ? 'Stopped.' : 'Остановлено.');
    }

    // 0.1 CAMERA NAVIGATION COMMANDS ("открой камеру", "включи вебку", "покажи вебку", "камера")
    if (/(?:открой|включи|покажи|запусти)\s+(?:камеру|вебку|веб-камеру|оптику|оптический\s+мост)/i.test(rawText)) {
      uiStore.setActiveTab('vision');
      return logAndReturn(isEn ? 'Webcam vision optical bridge active.' : 'Камера и оптический мост активированы.');
    }

    // 0.2 HIGH-PRIORITY DELEGATION: User Macros/Scripts, Media/VK & System Volume
    // Run main-process classifier BEFORE website opener and task regexes unless the command explicitly targets renderer tasksStore
    const isRendererTaskOrTimerIntent = /(?:задач|подзадач|напоминани|в\s+список|в\s+план|в\s+дела|шаблон|декомпозир|канбан|эйзенхауэр|категори|фокус|спринт|отдых)/i.test(text);
    if (!isRendererTaskOrTimerIntent && window.api && typeof (window.api as any).classifyCommand === 'function') {
      try {
        const earlyCmdResponse = await (window.api as any).classifyCommand(rawText);
        if (earlyCmdResponse) {
          return logAndReturn(earlyCmdResponse);
        }
      } catch (e) {
        console.error('[VoiceCommands] Error in early main-process classification:', e);
      }
    }

    // Exclude general search / information queries ("найди информацию о...", "расскажи про...", "что такое...")
    const isSearchQuery = /(?:информаци|новости|факты|что такое|кто такой|кто такая|расскажи|почему|зачем|как |найди\s+(?:информацию|про|о|данные|сведения|рецепт))/i.test(rawText);
    const isNonSiteCommand = /(?:скрипт|сценари|макрос|команд|музык|трек|песн|плеер|вк\b|vk\b|вконтакте|громкост|звук|тише|громче|процент|%)/i.test(text);

    // 1. UNIVERSAL WEBSITE OPENER ("открой ютуб", "перейди на гитхаб", "открой сайт ...")
    const openSiteMatch = !isSearchQuery && !isNonSiteCommand && text.match(/(?:открой|открою|открывай|открой-ка|перейди|перейди на|зайди|зайди на|найди сайт|открой сайт|запусти сайт)\s+(?:сайт\s+)?(.+)/i);
    const internalTabs = ['настройки', 'задачи', 'цели', 'чат', 'дипломатию', 'файлы', 'память', 'консоль', 'видение', 'транскрипцию', 'аудио', 'команды', 'макросы', 'канбан', 'историю', 'история', 'эйзенхауэра', 'список задач'];
    const rawSiteCandidate = openSiteMatch ? openSiteMatch[1].trim().replace(/^[.,!?;:"'«»()[\]\s]+|[.,!?;:"'«»()[\]\s]+$/g, '') : '';
    if (openSiteMatch && rawSiteCandidate && !internalTabs.includes(rawSiteCandidate.toLowerCase())) {
      const siteQuery = rawSiteCandidate.replace(/^(?:сайт|страниц[уа])\s+/i, '').replace(/^[.,!?;:"'«»()[\]\s]+|[.,!?;:"'«»()[\]\s]+$/g, '').trim();

      // Meta / Word repeating check ("напиши слово...", "скажи...")
      const metaWordMatch = siteQuery.match(/^(?:слово|фразу|текст)?\s*["'«»]?([^"'+:]+?)["'«»]?$/i);
      if (rawText.toLowerCase().includes('напиши слово') || rawText.toLowerCase().includes('скажи слово')) {
        const word = metaWordMatch ? metaWordMatch[1].trim() : siteQuery;
        return logAndReturn(isEn ? word : word);
      }

      const { url: targetUrl, isKnown } = resolveSiteQueryToUrl(siteQuery);

      try {
        if (window.api && (window.api as any).openExternal) {
          (window.api as any).openExternal(targetUrl);
        } else {
          window.open(targetUrl, '_blank');
        }
      } catch (e) {
        window.open(targetUrl, '_blank');
      }

      const reply = isKnown 
        ? (isEn ? `Opening ${siteQuery}.` : `Открываю ${siteQuery}.`)
        : (isEn ? `Searching and opening ${siteQuery}.` : `Ищу и открываю ${siteQuery}.`);

      return logAndReturn(reply);
    }

    // 1.5 META REPEAT / DIRECT DICTATION COMMANDS ("напиши слово напиши", "скажи привет")
    const isDictationCandidate = !isSearchQuery && !/расскажи/i.test(rawText);
    const dictationMatch = isDictationCandidate ? rawText.match(/^(?:напиши|скажи|произнеси)\s+(?:слово|фразу|текст)?\s*["'«»]?([^"'+:]+?)["'«»]?$/i) : null;
    if (dictationMatch) {
      const targetWord = dictationMatch[1].trim();
      if (targetWord && !targetWord.startsWith('задач') && !targetWord.startsWith('цель')) {
        return logAndReturn(targetWord);
      }
    }

    // 1.6 WINDOW CONTROL COMMANDS ("закрою окно", "закрой приложение")
    if (/(?:закрою|закрой|сверни|разверни)\s+(?:окно|приложение|программу)?/i.test(rawText)) {
      if (window.api && (window.api as any).executeTool) {
        (window.api as any).executeTool('system_control', { action: 'key_press', key: 'Alt+F4' }).catch(() => {});
      }
      return logAndReturn(isEn ? 'Closing window.' : 'Закрываю окно.');
    }

    // 2. TASK & SUBTASK CREATION (STRICT: REQUIRES EXPLICIT TASK/SUBTASK KEYWORDS)
    const subtaskPrefixMatch = rawText.match(/^(?:добавь|создай|добавить|создать|впиши|вписать|поставь|поставить)\s+(?:(?:шаг|шаги|подзадач[уиаеы]|задач[уиаеы])\s+(?:к\s+задаче|в\s+задачу|для\s+задачи|к|в|для)|(?:к\s+задаче|в\s+задачу|для\s+задачи))\s*["']?([^"'.:]+?)["']?[:.]?\s*(.*)$/i);
    const subtaskSuffixMatch = !subtaskPrefixMatch ? rawText.match(/^(?:добавь|создай|добавить|создать|впиши|вписать|поставь|поставить)\s+(?:шаг|шаги|подзадач[уиаеы])\s+(.+?)\s+(?:к\s+задаче|в\s+задачу|для\s+задачи|к|в|для)\s*["']?([^"'.]+)["']?$/i) : null;

    if (subtaskPrefixMatch || subtaskSuffixMatch) {
      const taskQuery = (subtaskPrefixMatch ? subtaskPrefixMatch[1] : subtaskSuffixMatch![2]).trim();
      const subTextRaw = (subtaskPrefixMatch ? subtaskPrefixMatch[2] : subtaskSuffixMatch![1]).trim();

      let matched = findTaskOrSubtask(taskQuery, tasks.value);
      let parentTask = matched?.task;

      if (!parentTask && taskQuery.length > 0) {
        // Automatically create parent task if missing
        parentTask = addTask(taskQuery, 'medium');
      }

      if (parentTask) {
        uiStore.setActiveTab('tasks');
        
        let rawItems = subTextRaw
          .split(/(?:\d+[\.\)]\s*)/)
          .map(item => item.trim())
          .filter(item => item.length > 0);

        if (rawItems.length === 0 && subTextRaw.length > 0) {
          rawItems = [subTextRaw];
        }

        const addedSubtaskNames: string[] = [];

        for (const rawItem of rawItems) {
          let itemText = rawItem;
          let restSeconds: number | undefined = undefined;

          // Check for rest timer specification in subtask
          const restTimerRegex = /(?:,?\s*добавь\s+)?(?:таймер\s+)?отдых[аы]?\s*(?:на)?\s*(\d+)\s*(минут|мин|м|секунд|сек|с)?/i;
          const restMatch = itemText.match(restTimerRegex);
          if (restMatch) {
            const num = parseInt(restMatch[1], 10);
            const unit = (restMatch[2] || '').toLowerCase();
            restSeconds = (unit.startsWith('мин') || unit === 'м') ? num * 60 : num;
            itemText = itemText.replace(restTimerRegex, '');
          }

          itemText = itemText.replace(/^[\s.,!?'"-]+|[\s.,!?'"-]+$/g, '').trim();

          if (itemText.length > 0) {
            addSubtask(parentTask.id, itemText, restSeconds);
            const timerTag = restSeconds ? ` (отдых ${restSeconds}с)` : '';
            addedSubtaskNames.push(`«${itemText}»${timerTag}`);
          }
        }

        const subtaskCount = addedSubtaskNames.length;
        const subtaskList = addedSubtaskNames.join(', ');
        const reply = subtaskCount > 0
          ? (isEn 
              ? `Added ${subtaskCount} subtask(s) to task '${parentTask.text}': ${subtaskList}.` 
              : `Добавлено ${subtaskCount} подзадач к задаче «${parentTask.text}»: ${subtaskList}.`)
          : (isEn 
              ? `Task '${parentTask.text}' selected.` 
              : `Задача «${parentTask.text}» выбрана.`);

        return logAndReturn(reply);
      }
    }

    // Task Creation Intent: Strict matching requiring explicit task/list/plan keywords
    const actionVerbPattern = /(?:создай|создать|создание|добавь|добавить|добавление|запиши|записать|поставь|поставить|сделай|сделать|запланируй|запланировать|внести|вписать|впиши|введи|ввести)\s+(?:мне\s+)?(?:новую\s+)?(?:задач[уаеыи]|задание|задачку|напоминание)\s+(.+)/i;
    const listPattern = /(?:создай|создать|добавь|добавить|запиши|записать|поставь|поставить)\s+(?:мне\s+)?(?:в\s+)?(?:задачи|список(?:\s+задач|\s+дел)?|план|дела)\s+(.+)/i;
    const indirectPattern = /(?:нужно|надо|хочу|планирую|намереваюсь)\s+(?:сделать|создать|запланировать|поставить|записать|добавить)\s+(?:задач[уаеы]|задание|задачку|напоминание|в\s+задачи|в\s+список|в\s+план)\s+(.+)/i;
    const directPattern = /^(?:новая\s+)?(?:задач[ау]|напоминание)\s*[:\s]\s*(.+)/i;

    const matchedTaskIntent = rawText.match(actionVerbPattern)
      || rawText.match(listPattern)
      || rawText.match(indirectPattern)
      || rawText.match(directPattern);

    if (matchedTaskIntent) {
      let taskText = matchedTaskIntent[1].trim();
      taskText = taskText.replace(/^["'«»\s]+|["'«»\s]+$/g, '').trim();
      let priority: 'low' | 'medium' | 'high' = 'medium';

      if (/высоки[йи]|срочно|важно|high/i.test(taskText)) {
        priority = 'high';
        taskText = taskText.replace(/с высоким приоритетом|срочно|важно|high/gi, '').trim();
      } else if (/низкий|несрочно|low/i.test(taskText)) {
        priority = 'low';
        taskText = taskText.replace(/с низким приоритетом|несрочно|low/gi, '').trim();
      }

      if (taskText) {
        uiStore.setActiveTab('tasks');
        addTask(taskText, priority);
        const reply = isEn ? `Task '${taskText}' added to operational list.` : `Задача '${taskText}' добавлена в оперативный список.`;
        return logAndReturn(reply);
      }
    }

    // 3. SUBTASK & TASK SPECIFIC REST TIMER COMMANDS WITH FUZZY TYPO MATCHING
    // Matches: "запусти таймер на 1 минуту на подзадаче панка", "таймер 45 секунд для планки", "отдых 1 мин планка"
    const subtaskTimerMatch = text.match(/(?:запусти|поставь|начни|включи|сделай)?\s*(?:таймер|отдых)?\s*(?:на)?\s*(\d+)\s*(минут|мин|м|секунд|сек|с)?\s*(?:на|для|к)?\s*(?:подзадач[еуa]|шаг[еуa]|упражнени[еиy]|задач[еуa])?\s*(.+)/i);
    
    if (subtaskTimerMatch && (text.includes('таймер') || text.includes('отдых') || text.includes('минут') || text.includes('секунд') || text.includes('сек') || text.includes('мин'))) {
      const num = parseInt(subtaskTimerMatch[1], 10);
      const unit = (subtaskTimerMatch[2] || '').toLowerCase();
      const targetQuery = subtaskTimerMatch[3].trim();

      let seconds = num;
      if (unit.startsWith('мин') || unit === 'м') {
        seconds = num * 60;
      }

      // Try fuzzy matching task/subtask (e.g. "панка" -> "Планка")
      const matchedResult = findTaskOrSubtask(targetQuery, tasks.value);
      if (matchedResult) {
        uiStore.setActiveTab('tasks');
        const { task, subtask, matchedName } = matchedResult;
        
        if (task && subtask) {
          setSubtaskRestSeconds(task.id, subtask.id, seconds);
        } else if (task) {
          setAllSubtasksRestSeconds(task.id, seconds);
        }

        startRestTimer(seconds, matchedName);
        const reply = isEn 
          ? `Rest timer set for ${seconds} seconds on '${matchedName}'.` 
          : `Понял. Запустил таймер на ${num} ${unit || 'сек'} для «${matchedName}».`;
        return logAndReturn(reply);
      }
    }

    // General rest timer fallback
    const restTimerMatch = text.match(/(?:таймер )?отдых[аы]?\s*(?:на)?\s*(\d+)\s*(секунд|сек|с|минут|мин|м)?/i);
    if (restTimerMatch) {
      const num = parseInt(restTimerMatch[1], 10);
      const unit = (restTimerMatch[2] || '').toLowerCase();
      let seconds = num;
      if (unit.startsWith('мин') || unit === 'м') {
        seconds = num * 60;
      }
      uiStore.setActiveTab('tasks');
      startRestTimer(seconds, 'Отдых между подходами');
      const reply = isEn ? `Rest timer started for ${seconds} seconds.` : `Таймер отдыха на ${seconds} секунд запущен.`;
      return logAndReturn(reply);
    }

    if (text.includes('пауза отдыха') || text.includes('продолжи отдых') || text.includes('пауза таймера отдыха')) {
      toggleRestTimer();
      return {
        handled: true,
        response: isEn ? 'Rest timer state toggled.' : 'Состояние таймера отдыха изменено.'
      };
    }

    if (text.includes('стоп отдых') || text.includes('останови отдых') || text.includes('пропусти отдых') || text.includes('сбрось отдых')) {
      stopRestTimer();
      return {
        handled: true,
        response: isEn ? 'Rest timer stopped.' : 'Таймер отдыха остановлен.'
      };
    }

    if (text.includes('плюс 15 секунд') || text.includes('добавь 15 секунд') || text.includes('добавить 15 секунд')) {
      adjustRestTime(15);
      return {
        handled: true,
        response: isEn ? 'Added 15 seconds to rest timer.' : 'Добавлено 15 секунд к отдыху.'
      };
    }

    if (text.includes('запусти отдых') || text.includes('начни отдых') || text.includes('включи отдых')) {
      uiStore.setActiveTab('tasks');
      startRestTimer(60, 'Отдых');
      return {
        handled: true,
        response: isEn ? 'Rest timer started for 60 seconds.' : 'Таймер отдыха на 60 секунд запущен.'
      };
    }

    // 3. FOCUS SPRINT COMMANDS (Фокус-спринт)
    if (text.startsWith('запусти фокус') || text.startsWith('начни фокус') || text.startsWith('старт фокус') || text.startsWith('спринт фокус')) {
      uiStore.setActiveTab('tasks');
      setTaskViewMode('sprint');
      const targetQuery = text.replace(/^(запусти|начни|старт|спринт)\s+фокус(?:\s+для\s+задачи)?/i, '').trim();
      const matched = findTaskOrSubtask(targetQuery, tasks?.value || tasks || []);
      const target = matched?.task || recommendedTask?.value || (Array.isArray(tasks) ? tasks[0] : tasks?.value?.[0]);
      if (target) {
        startFocusSprint(target.id);
        return {
          handled: true,
          response: isEn ? `Focus sprint activated for task '${target.text}'.` : `Фокус-спринт запущен для задачи '${target.text}'.`
        };
      } else {
        return {
          handled: true,
          response: isEn ? 'No active task found for focus sprint.' : 'Не найдено активной задачи для запуска фокуса.'
        };
      }
    }

    if (text.includes('пауза фокуса') || text.includes('пауза спринта') || text.includes('продолжи фокус')) {
      toggleSprintTimer();
      return {
        handled: true,
        response: isEn ? 'Focus sprint timer toggled.' : 'Таймер фокус-спринта переключен.'
      };
    }

    if (text.includes('останови фокус') || text.includes('стоп фокус') || text.includes('сбрось фокус') || text.includes('заверши спринт')) {
      resetSprintTimer();
      return {
        handled: true,
        response: isEn ? 'Focus sprint reset.' : 'Фокус-спринт остановлен.'
      };
    }

    const focusTimeMatch = text.match(/фокус\s*(?:на)?\s*(\d+)\s*минут/i);
    if (focusTimeMatch) {
      const mins = parseInt(focusTimeMatch[1], 10);
      setSprintDurationMinutes(mins);
      return {
        handled: true,
        response: isEn ? `Focus sprint duration set to ${mins} minutes.` : `Длительность фокуса установлена на ${mins} минут.`
      };
    }

    // 4. UI TABS AND VIEW MODES NAVIGATION (Навигация и режимы)
    if (text.includes('открой канбан') || text.includes('покажи канбан') || text.includes('режим канбан') || text.includes('доска канбан')) {
      uiStore.setActiveTab('tasks');
      setTaskViewMode('kanban');
      return {
        handled: true,
        response: isEn ? 'Switched to Kanban view.' : 'Переключаю на режим Канбан-доски.'
      };
    }

    if (text.includes('открой историю') || text.includes('покажи историю') || text.includes('история задач')) {
      uiStore.setActiveTab('tasks');
      setTaskViewMode('history');
      return {
        handled: true,
        response: isEn ? 'Switched to Task History view.' : 'Переключаю на Историю выполненных задач.'
      };
    }

    if (text.includes('открой эйзенхауэра') || text.includes('матрица эйзенхауэра') || text.includes('покажи матрицу')) {
      uiStore.setActiveTab('tasks');
      setTaskViewMode('eisenhower');
      return {
        handled: true,
        response: isEn ? 'Switched to Eisenhower Matrix.' : 'Переключаю на Матрицу Эйзенхауэра.'
      };
    }

    if (text.includes('открой задачи') || text.includes('перейди в задачи') || text.includes('список задач') || text.includes('покажи задачи')) {
      uiStore.setActiveTab('tasks');
      setTaskViewMode('list');
      return {
        handled: true,
        response: isEn ? 'Task Manager opened.' : 'Раздел задач открыт.'
      };
    }

    if (text.includes('открой цели') || text.includes('перейди в цели')) {
      uiStore.setActiveTab('objectives');
      return {
        handled: true,
        response: isEn ? 'Strategic Objectives panel opened.' : 'Панель стратегических целей открыта.'
      };
    }

    if (text.includes('открой настройки') || text.includes('перейди в настройки')) {
      uiStore.setActiveTab('settings');
      return {
        handled: true,
        response: isEn ? 'Settings terminal opened.' : 'Терминал настроек открыт.'
      };
    }

    if (text.includes('открой чат') || text.includes('перейди в чат') || text.includes('открой диалог')) {
      uiStore.setActiveTab('chat');
      return {
        handled: true,
        response: isEn ? 'Main dialogue module active.' : 'Главный диалоговый модуль активен.'
      };
    }

    if (text.includes('открой транскрипцию') || text.includes('открой аудио')) {
      uiStore.setActiveTab('transcription');
      return {
        handled: true,
        response: isEn ? 'Audio transcription module active.' : 'Модуль аудио-транскрипции активен.'
      };
    }

    if (text.includes('открой файлы') || text.includes('покажи файлы')) {
      uiStore.setActiveTab('files');
      return {
        handled: true,
        response: isEn ? 'File manager opened.' : 'Файловый менеджер открыт.'
      };
    }

    if (text.includes('открой память') || text.includes('база знаний')) {
      uiStore.setActiveTab('memory');
      return {
        handled: true,
        response: isEn ? 'Core memory database opened.' : 'База данных оперативной памяти открыта.'
      };
    }

    if (text.includes('открой видение') || text.includes('открой зрение')) {
      uiStore.setActiveTab('vision');
      return {
        handled: true,
        response: isEn ? 'Vision system module active.' : 'Модуль визуального анализа активен.'
      };
    }

    if (text.includes('открой консоль') || text.includes('открой команды')) {
      uiStore.setActiveTab('commands');
      return {
        handled: true,
        response: isEn ? 'System console opened.' : 'Системная консоль открыта.'
      };
    }

    // 5. TASK FILTERS AND SEARCH
    if (text.includes('покажи задачи на сегодня') || text.includes('мои задачи на сегодня') || text.includes('задачи на сегодня')) {
      uiStore.setActiveTab('tasks');
      setTaskViewMode('list');
      setTaskFilter('my_day');
      return {
        handled: true,
        response: isEn ? 'Filtered tasks for Today.' : 'Показываю задачи, запланированные на сегодня.'
      };
    }

    if (text.includes('покажи важные задачи') || text.includes('важные задачи')) {
      uiStore.setActiveTab('tasks');
      setTaskViewMode('list');
      setTaskFilter('important');
      return {
        handled: true,
        response: isEn ? 'Filtered high priority tasks.' : 'Показываю важные задачи с высоким приоритетом.'
      };
    }

    if (text.includes('покажи просроченные задачи') || text.includes('просроченные задачи')) {
      uiStore.setActiveTab('tasks');
      setTaskViewMode('list');
      setTaskFilter('overdue');
      return {
        handled: true,
        response: isEn ? 'Filtered overdue tasks.' : 'Показываю просроченные задачи.'
      };
    }

    if (text.includes('сбрось фильтры') || text.includes('покажи все задачи')) {
      uiStore.setActiveTab('tasks');
      setTaskViewMode('list');
      setTaskFilter('all');
      setTaskSearch('');
      return {
        handled: true,
        response: isEn ? 'All filters reset, showing full task list.' : 'Фильтры сброшены, показываю полный список задач.'
      };
    }

    const searchMatch = text.match(/(?:найди|поиск)\s+(?:среди\s+)?задач[уиаеы]?\s+(.+)/i);
    if (searchMatch) {
      const q = searchMatch[1].trim();
      uiStore.setActiveTab('tasks');
      setTaskViewMode('list');
      setTaskSearch(q);
      return {
        handled: true,
        response: isEn ? `Searching tasks for '${q}'.` : `Поиск задач по запросу '${q}'.`
      };
    }

    // 7. TASK DECOMPOSITION WITH FUZZY TASK MATCHING
    const decomposeMatch = rawText.match(/(?:декомпозируй|разбей|распиши)\s+задачу\s+(.+)/i);
    if (decomposeMatch) {
      const matched = findTaskOrSubtask(decomposeMatch[1].trim(), tasks.value);
      if (matched && matched.task) {
        uiStore.setActiveTab('tasks');
        decomposeTaskWithAI(matched.task.id);
        return {
          handled: true,
          response: isEn ? `AI decomposition launched for task '${matched.task.text}'.` : `Запущена нейросетевая декомпозиция для задачи '${matched.task.text}'.`
        };
      }
    }

    const templateMatch = rawText.match(/примени шаблон\s+(фитнес|разработка|учеба|уборка|проект)\s+(?:к задачам|к задаче)\s+(.+)/i);
    if (templateMatch) {
      const tmpl = templateMatch[1].toLowerCase() as any;
      const matched = findTaskOrSubtask(templateMatch[2].trim(), tasks.value);
      if (matched && matched.task) {
        uiStore.setActiveTab('tasks');
        applyStepTemplate(matched.task.id, tmpl);
        return {
          handled: true,
          response: isEn ? `Template '${tmpl}' applied to task '${matched.task.text}'.` : `Шаблон '${tmpl}' применен к задаче '${matched.task.text}'.`
        };
      }
    }

    // 8. TASK COMPLETION & DELETION WITH FUZZY MATCHING & STT NOISE TOLERANCE
    if (
      /(?:удали|удалить|очисти|очистить|стереть|стирай|уничтожь|уничтожить|ударился|удалился)\s+(?:все\s+)?(?:задачи|список\s+задач|все\s+дела|все)/i.test(rawText) ||
      text === 'удали все' || text === 'очисти все' || text === 'удали все задачи' || text === 'очисти задачи'
    ) {
      uiStore.setActiveTab('tasks');
      const taskCount = tasks.value.length;
      tasks.value.forEach((t: Task) => deleteTask(t.id));
      return logAndReturn(isEn ? `All ${taskCount} tasks cleared from list.` : `Все задачи (${taskCount}) удалены из оперативного списка.`);
    }

    const completeMatch = rawText.match(/(?:выполни|выполнить|заверши|завершить|сделай|сделать|отметь|отметить|закончи|закончить|закрыть|закрой)\s+(?:задач[уаеы]|подзадач[уаеы]|задание|шаг)\s+(.+)/i)
      || rawText.match(/(?:задач[ау]|подзадач[ау]|шаг)\s+(.+?)\s+(?:выполнена|завершена|сделана|готова)/i);
    if (completeMatch) {
      const query = (completeMatch[1] || completeMatch[2] || '').trim();
      const matched = findTaskOrSubtask(query, tasks.value);
      if (matched && matched.task) {
        uiStore.setActiveTab('tasks');
        if (matched.subtask) {
          toggleSubtask(matched.task.id, matched.subtask.id);
          return logAndReturn(isEn ? `Subtask '${matched.subtask.text}' completed.` : `Подзадача «${matched.subtask.text}» отмечена как выполненная.`);
        } else {
          toggleTask(matched.task.id);
          return logAndReturn(isEn ? `Task '${matched.task.text}' marked as completed.` : `Задача «${matched.task.text}» отмечена как выполненная.`);
        }
      }
    }

    const deleteMatch = rawText.match(/(?:удали|удалить|удалился|удали-ка|а\s+удалить|стирай|стереть|убери|убрать|уничтожь|уничтожить)\s+(?:задач[уаеы]|подзадач[уаеы]|задание|шаг)\s*(.*)/i);
    if (deleteMatch) {
      let query = deleteMatch[1].trim().replace(/^["'«»\s]+|["'«»\s]+$/g, '').trim();
      if (query === 'все' || query === 'все задачи' || query === 'список' || query === 'список задач') {
        uiStore.setActiveTab('tasks');
        const count = tasks.value.length;
        tasks.value.forEach((t: Task) => deleteTask(t.id));
        return logAndReturn(isEn ? `All ${count} tasks cleared from list.` : `Все задачи (${count}) удалены из списка.`);
      }
      if (!query || query === 'задачу' || query === 'задача' || query === 'подзадачу') {
        uiStore.setActiveTab('tasks');
        if (tasks.value.length === 0) return logAndReturn(isEn ? 'Task list is empty.' : 'Список задач пуст.');
        if (tasks.value.length === 1) {
          const singleTask = tasks.value[0];
          deleteTask(singleTask.id);
          return logAndReturn(isEn ? `Task '${singleTask.text}' deleted.` : `Задача «${singleTask.text}» удалена из списка.`);
        }
        return logAndReturn(isEn ? 'Please specify which task to delete.' : 'Уточните название задачи, которую необходимо удалить.');
      }
      const matched = findTaskOrSubtask(query, tasks.value);
      if (matched && matched.task) {
        uiStore.setActiveTab('tasks');
        deleteTask(matched.task.id);
        return logAndReturn(isEn ? `Task '${matched.task.text}' deleted.` : `Задача «${matched.task.text}» удалена.`);
      }
    }



    const mouseClickMatch = rawText.match(/(?:кликни|нажми)\s+(?:мышкой?|курсор)?\s*(?:в\s+центр|правой\s+кнопкой|левой\s+кнопкой)?/i);
    if (mouseClickMatch) {
      const isRight = rawText.includes('правой');
      const clickType = isRight ? 'right' : 'left';
      if (window.api && (window.api as any).executeTool) {
        (window.api as any).executeTool('system_control', { action: 'mouse_click', click_type: clickType, x: 500, y: 500 }).catch(() => {});
      }
      return logAndReturn(isEn ? `Mouse ${clickType} click executed.` : `Команда клика мышкой (${clickType === 'right' ? 'правая' : 'левая'}) выполнена.`);
    }

    if (rawText.includes('прокрути вниз') || rawText.includes('проскролль вниз')) {
      if (window.api && (window.api as any).executeTool) {
        (window.api as any).executeTool('system_control', { action: 'mouse_scroll', scroll_direction: 'down' }).catch(() => {});
      }
      return logAndReturn(isEn ? 'Mouse scroll down executed.' : 'Прокрутка экрана вниз выполнена.');
    }

    if (rawText.includes('прокрути вверх') || rawText.includes('проскролль вверх')) {
      if (window.api && (window.api as any).executeTool) {
        (window.api as any).executeTool('system_control', { action: 'mouse_scroll', scroll_direction: 'up' }).catch(() => {});
      }
      return logAndReturn(isEn ? 'Mouse scroll up executed.' : 'Прокрутка экрана вверх выполнена.');
    }

    const duplicateMatch = rawText.match(/(?:дублируй|дублировать|скопируй|скопировать|продублируй|продублировать)\s+(?:задач[уаеы]|подзадач[уаеы])?\s*(.+)/i);
    if (duplicateMatch) {
      const matched = findTaskOrSubtask(duplicateMatch[1].trim(), tasks.value);
      if (matched && matched.task) {
        uiStore.setActiveTab('tasks');
        duplicateTask(matched.task.id);
        return {
          handled: true,
          response: isEn ? `Task '${matched.task.text}' duplicated.` : `Задача '${matched.task.text}' продублирована.`
        };
      }
    }

    if (text.includes('очисти выполненные задачи') || text.includes('удали сделанные задачи')) {
      uiStore.setActiveTab('tasks');
      const completedList = tasks.value.filter((t: Task) => t.completed || t.status === 'done');
      completedList.forEach((t: Task) => deleteTask(t.id));
      return {
        handled: true,
        response: isEn ? `Cleared ${completedList.length} completed tasks.` : `Очищено ${completedList.length} выполненных задач.`
      };
    }

    // 9. CATEGORY MANAGEMENT
    const addCatMatch = rawText.match(/(?:создай|добавь)\s+категорию\s+(.+)/i);
    if (addCatMatch) {
      const catName = addCatMatch[1].trim();
      addCategory(catName);
      return {
        handled: true,
        response: isEn ? `Category '${catName}' created.` : `Категория '${catName}' создана.`
      };
    }

    // 10. STATUS OVERVIEW & QUERYING
    if (text.includes('какие у меня задачи') || text.includes('что нужно сделать') || text.includes('список задач на сегодня')) {
      uiStore.setActiveTab('tasks');
      const rec = recommendedTask.value;
      let resp = isEn
        ? `You have ${activeCount.value} active tasks. `
        : `У вас ${activeCount.value} активных задач. `;
      if (rec) {
        resp += isEn 
          ? `Recommended focus task is '${rec.text}'. Shall I start the focus sprint?`
          : `Главная рекомендуемая задача: '${rec.text}'. Желаете запустить фокус-спринт?`;
      }
      return {
        handled: true,
        response: resp
      };
    }

    if (text.includes('сколько времени я потратил') || text.includes('потраченное время')) {
      return {
        handled: true,
        response: isEn 
          ? `Total time spent on tasks is ${totalSpentMinutes.value} minutes.`
          : `Общее затраченное время на выполнение задач составляет ${totalSpentMinutes.value} минут.`
      };
    }

    // Fallback to custom AI Intent Macros if available
    if (window.api && typeof (window.api as any).classifyCommand === 'function') {
      try {
        const cmdResponse = await (window.api as any).classifyCommand(rawText);
        if (cmdResponse) {
          return logAndReturn(cmdResponse);
        }
      } catch (e) {
        console.error('[VoiceCommands] Error delegating to main process classifier:', e);
      }
    }

    // Not a direct local command -> LLM Intent Understanding fallback
    return null;

}
