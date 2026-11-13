import { computed } from 'vue';
import { useChatStore } from '../stores/chat.store';
import type { Message, FileAttachment, ExecutionStep, ValidatorFeedback } from '../../../../shared/types/models/chat';
import { useReactor } from '../../../composables/useReactor';
import { useUIStore } from '../../../stores/ui.store';
import { useSettingsStore } from '../../settings/stores/settings.store';
import { useSessionsStore } from '../stores/sessions.store';
import { useVoiceCommands } from '../../../composables/useVoiceCommands';
import { isStopCommand, isGratitudeCommand } from '../../../../shared/utils/stop-command';
import { formatFailureReason } from '../../../../shared/utils/failure-reason';
import { sanitizeRawContent, extractTextForTTS } from '../utils/markdown';
import { buildFileAttachmentPrompt, createInitialExecutionSteps, createValidatorStep, createGratitudeAssistantMessage, resolveDirectiveStrategy, ensureTtsMetaSubscription, consumePendingTtsMeta } from '../utils/chat-pipeline';
import { useComposerModels } from './useComposerModels';
import { useSystemStore } from '../../../stores/system.store';
let activeRemoveListener: (() => void) | null = null, lastProcessedText = '', lastProcessedTimestamp = 0;

export function useChat() {
  const store = useChatStore(), reactor = useReactor(), uiStore = useUIStore();
  const settingsStore = useSettingsStore();
  const { mode: composerMode, activeModel } = useComposerModels();
  const { processVoiceCommand } = useVoiceCommands();

  ensureTtsMetaSubscription(store);

  const sendMessage = async (text: string, attachments?: FileAttachment[] | boolean, isVoice: boolean = false, skipAddingUserMessage: boolean = false) => {
    const isVoiceMode = typeof attachments === 'boolean' ? attachments : isVoice;
    const realAttachments = Array.isArray(attachments) ? attachments : undefined;
    const hasAttachments = realAttachments && realAttachments.length > 0;
    if (!text?.trim() && !hasAttachments) return;
    const now = Date.now();
    const trimmedLower = (text || '').trim().toLowerCase();
    
    // Deduplication guard (only if not skipping user message)
    if (!skipAddingUserMessage && !hasAttachments && trimmedLower && trimmedLower === lastProcessedText && now - lastProcessedTimestamp < 1500) return;
    
    lastProcessedText = trimmedLower;
    lastProcessedTimestamp = now;
    if (!isVoiceMode || isStopCommand(text || '')) window.dispatchEvent(new CustomEvent('arc:stop-audio'));
    else if (window.api && typeof (window.api as any).stopSpeak === 'function') (window.api as any).stopSpeak().catch(() => {});
    
    // Handle stop/mute command
    if (isStopCommand(text || '')) {
      if (activeRemoveListener) { activeRemoveListener(); activeRemoveListener = null; }
      store.clearStreaming(); store.setAgentStatus('idle'); uiStore.setTimelineStep(null); reactor.setReactorState('idle');
      return;
    }

    // Handle gratitude expression (e.g. "Спасибо", "Благодарю")
    if (isGratitudeCommand(text || '')) {
      if (activeRemoveListener) { activeRemoveListener(); activeRemoveListener = null; }
      store.clearStreaming();
      uiStore.setTimelineStep(null);
      await store.addMessage({ id: Date.now().toString(), role: 'user', blockType: 'user_directive', timestamp: Date.now(), content: text || 'Спасибо' });
      const { reply, message } = createGratitudeAssistantMessage(settingsStore.language || 'RU');
      await store.addMessage(message);
      store.setAgentStatus('ready', 'Готово');
      setTimeout(() => store.setAgentStatus('idle'), 1500);
      void uiStore.speak(reply, undefined, { queryId: message.id });
      window.dispatchEvent(new CustomEvent('arc:clear-dialogue-window'));
      console.log('[VoiceFSM] Closed by gratitude closer in chat with polite response.');
      return;
    }
    
    if (activeRemoveListener) {
      activeRemoveListener();
      activeRemoveListener = null;
    }
    
    let userMsgId: string | null = null;
    if (!skipAddingUserMessage) {
      const userMsg: Message = {
        id: Date.now().toString(), role: 'user', blockType: 'user_directive', timestamp: Date.now(),
        content: text || (realAttachments && realAttachments.length > 0 ? `[Отправлено файлов: ${realAttachments.length}]` : ''),
        attachments: realAttachments && realAttachments.length > 0 ? [...realAttachments] : undefined
      };
      userMsgId = userMsg.id;
      await store.addMessage(userMsg);
    }
    
    const pipelineStartTime = Date.now();
    uiStore.setTimelineStep('VOICE_INPUT', 25);
    const m = activeModel.value;
    const directiveRes = resolveDirectiveStrategy(text, realAttachments, composerMode.value, m?.effort || 'Auto', m?.modelKey, m?.providerName, m?.isLocal);
    const execSteps: ExecutionStep[] = createInitialExecutionSteps(text, realAttachments);
    store.setExecutionSteps(execSteps);
    store.setAgentStatus('planning', directiveRes.statusLabel);
    // Voice command intent execution
    let commandResponse: string | null = null;
    if (!hasAttachments) {
      uiStore.setTimelineStep('CLASSIFIER', Date.now() - pipelineStartTime);
      const voiceResult = await processVoiceCommand(text);
      if (voiceResult && voiceResult.handled) {
        commandResponse = voiceResult.response || 'Команда выполнена.';
      } else if (window.api && typeof (window.api as any).classifyCommand === 'function') {
        commandResponse = await (window.api as any).classifyCommand(text);
      }
    }
    if (commandResponse) {
      uiStore.setTimelineStep('TOOL_API', Date.now() - pipelineStartTime);
      execSteps[0].status = 'success';
      execSteps[0].durationMs = Date.now() - pipelineStartTime;
      const cmdMsgId = (Date.now() + 1).toString();
      const assistantMsg: Message = {
        id: cmdMsgId, role: 'assistant', blockType: 'final_answer', timestamp: Date.now(),
        content: commandResponse, executionSteps: [...execSteps],
        meta: { provider: 'Локальный ответ', latency: Date.now() - pipelineStartTime, isCache: false, source: 'local', ...consumePendingTtsMeta(cmdMsgId) }
      };
      await store.addMessage(assistantMsg);
      store.setAgentStatus('ready', 'Готово');
      setTimeout(() => store.setAgentStatus('idle'), 2000);
      uiStore.setTimelineStep('RESPONSE', Date.now() - pipelineStartTime);
      uiStore.setTimelineStep('TTS', Date.now() - pipelineStartTime);
      void uiStore.speak(assistantMsg.content, undefined, { queryId: cmdMsgId });
      reactor.setReactorState('idle');
      return;
    }
    // Objective creation command
    if (trimmedLower.startsWith("создай цель:") || trimmedLower.startsWith("создай цель ")) {
      const title = text.substring(12).trim();
      if (title && window.api) {
        uiStore.setActiveTab('tasks');
        await window.api.objectiveCreate({ title, description: "Создано из голосовой команды", owner: "USER", priority: 50 });
        uiStore.setTimelineStep('TOOL_API', Date.now() - pipelineStartTime);
        execSteps[0].status = 'success';
        store.setAgentStatus('ready', 'Цель создана');
        setTimeout(() => store.setAgentStatus('idle'), 2000);
        void uiStore.speak("Цель успешно создана.");
        return;
      }
    }
    // Trigger reactor processing
    reactor.setReactorState('processing');
    store.isStreaming = true;
    const slowResponseTimer = setTimeout(() => {
      if (store.isStreaming && !firstChunkReceived) {
        store.currentResponse = store.currentResponse || '⌛ Ожидание ответа от провайдера...';
      }
    }, 5000);
    const verySlowTimer = setTimeout(() => {
      if (store.isStreaming && !firstChunkReceived) {
        store.currentResponse = '⌛ Провайдер медленно отвечает. Готовимся к переключению...';
      }
    }, 15000);
    store.setAgentStatus('planning', directiveRes.statusLabel);
    store.currentResponse = '';
    uiStore.setTimelineStep('ROUTER', Date.now() - pipelineStartTime);
    uiStore.setActiveRoute(null);
    uiStore.setLastRouterError(null);
    const reqId = Date.now().toString();
    let removeRouteListener: (() => void) | null = null;
    if (window.api && typeof window.api.onAiRouteInfo === 'function') {
      removeRouteListener = window.api.onAiRouteInfo((data: any) => {
        if (data && (data.reqId === reqId || !data.reqId)) {
          if (data.modelName) uiStore.setActiveModel(data.modelName);
          if (data.target && data.cause) {
            uiStore.setActiveRoute({
              target: data.target, cause: data.cause, hasError: data.hasError,
              errorBadge: data.errorBadge, errorNode: data.errorNode, lastRouterError: data.lastRouterError
            });
            if (!data.hasError && !data.lastRouterError) uiStore.setLastRouterError(null);
          }
          if (data.lastRouterError) uiStore.setLastRouterError(data.lastRouterError);
          if (data.step !== undefined) uiStore.setTimelineStep(data.step, data.latency || (Date.now() - pipelineStartTime));
        }
      });
    }
    const systemStore = useSystemStore();
    let firstChunkReceived = false;
    let recordedTtftMs: number | null = null;
    let doneHandled = false;
    let pendingChunkBuffer = '';
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let latestToolSource: any = null;
    const flushChunkBuffer = () => {
      if (pendingChunkBuffer) {
        store.currentResponse += pendingChunkBuffer;
        pendingChunkBuffer = '';
        uiStore.triggerPulse();
      }
      throttleTimer = null;
    };
    const finalizeStream = (data: any = {}) => {
      if (doneHandled) return;
      doneHandled = true;
      clearTimeout(slowResponseTimer);
      clearTimeout(verySlowTimer);
      if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
      flushChunkBuffer();
      if (store.currentResponse.startsWith('⌛ ')) store.currentResponse = '';
      if (!store.currentResponse.trim() && typeof data.fullResponse === 'string') store.currentResponse = data.fullResponse;
      
      const totalDuration = Date.now() - pipelineStartTime;
      const approxTokens = Math.max(1, Math.round((store.currentResponse || '').length / 3.8));
      const ttftToReport = recordedTtftMs ?? Math.round(totalDuration * 0.35);
      systemStore.recordModelInference(ttftToReport, approxTokens, totalDuration);

      let cleanedResponse = sanitizeRawContent(store.currentResponse)
        .replace(/Минуту, уточняю в энциклопедии\.?\.?\.?/gi, '')
        .replace(/[\n\s]*(?:чем\s+займ[её]мся\??|чем\s+(?:я\s+)?могу\s+помочь\??|что\s+будем\s+делать\??|какие\s+задачи\s+(?:у\s+нас|на\s+сегодня)\??)[\s.]*$/i, '')
        .trim();
      let validatorFeedback: ValidatorFeedback | undefined;
      const isError = !cleanedResponse;
      const execStep = execSteps.find(s => s.id === 'step-exec');
      if (execStep) {
        execStep.status = isError ? 'error' : 'success';
        execStep.durationMs = Date.now() - pipelineStartTime;
        if (isError) execStep.errorDetails = "Получен пустой ответ от модуля генерации.";
      }
      execSteps.forEach(s => {
        if (s.status === 'running') {
          if (s.id === 'step-tool') {
            s.status = (latestToolSource && latestToolSource.found === false) ? 'error' : 'success';
            if (s.status === 'error') s.errorDetails = "Источник не найден или недоступен.";
          } else s.status = isError ? 'error' : 'success';
        }
      });
      store.setAgentStatus('validating', 'Проверка результата...');
      const validatorStep = createValidatorStep(15);
      if (isError) { validatorStep.status = 'error'; validatorStep.errorDetails = "Отказ по причине пустого ответа или сбоя инструмента."; }
      execSteps.push(validatorStep);
      store.setExecutionSteps(execSteps);
      setTimeout(() => {
        if (isError) {
          store.setAgentStatus('error', 'Ошибка выполнения');
          setTimeout(() => store.setAgentStatus('idle'), 3500);
          cleanedResponse = "Ошибка выполнения директивы (сбой на этапе Executor)";
          validatorFeedback = {
            rejected: true, reason: "Executor не смог получить информацию или результат пуст.",
            details: "Это может быть вызвано тем, что запрошенный файл не найден, либо произошел сбой сети при вызове инструмента.",
            canRetry: true, canRefine: true
          };
        } else {
          store.setAgentStatus('ready', 'Ответ готов');
          setTimeout(() => store.setAgentStatus('idle'), 2500);
        }
        const isSystemOrError = !cleanedResponse || !data.meta?.provider || data.meta?.source === 'system';
        const baseMeta = isSystemOrError ? { source: 'system' as const } : data.meta;
        const assistantMsg = {
          id: Date.now().toString(), role: 'assistant', blockType: isSystemOrError ? 'system_status' : 'final_answer',
          timestamp: Date.now(), content: cleanedResponse, providerName: isSystemOrError ? undefined : uiStore.activeModel,
          providerTarget: uiStore.activeRoute?.target, cause: uiStore.activeRoute?.cause,
          latency: isSystemOrError ? undefined : (Date.now() - pipelineStartTime),
          toolSource: data.toolSource || latestToolSource || undefined, executionSteps: [...execSteps],
          validatorFeedback, meta: { ...baseMeta, ...consumePendingTtsMeta(reqId) }
        };
        store.addMessage(assistantMsg as any);
        store.clearStreaming();
        uiStore.setTimelineStep('TTS', Date.now() - pipelineStartTime);
        const ttsText = extractTextForTTS(cleanedResponse);
        if ((settingsStore.autoSpeak || isSystemOrError || data.meta?.source === 'local') && ttsText) {
          void uiStore.speak(ttsText, undefined, { queryId: reqId });
        }
      }, 300);
      removeListener();
      if (activeRemoveListener === removeListener) activeRemoveListener = null;
    };
    const removeChunkListener = window.api.onAiChunk((data: any) => {
      if (data.reqId !== reqId) return; 
      if (!firstChunkReceived && data.chunk) {
        firstChunkReceived = true;
        recordedTtftMs = Date.now() - pipelineStartTime;
        clearTimeout(slowResponseTimer);
        clearTimeout(verySlowTimer);
        if (store.currentResponse.startsWith('⌛ ')) store.currentResponse = '';
        execSteps[0].status = 'success';
        execSteps[0].durationMs = Date.now() - pipelineStartTime;
        const existingExec = execSteps.find(s => s.id === 'step-exec');
        if (existingExec) existingExec.status = 'running';
        else execSteps.push({ id: 'step-exec', description: 'Синтез структурированного ответа', status: 'running', executor: 'A.R.C. Core' });
        store.setExecutionSteps(execSteps);
        store.setAgentStatus('executing', 'Синтез и структурирование ответа...');
        uiStore.setTimelineStep('RESPONSE', Date.now() - pipelineStartTime);
      }
      if (data.toolSource) {
        latestToolSource = data.toolSource;
        const toolStep = execSteps.find(s => s.id === 'step-tool');
        if (!toolStep) {
          let toolExecutor = 'Инструмент';
          if (data.toolSource.tool) {
            const t = data.toolSource.tool.toLowerCase();
            if (t.includes('wiki')) toolExecutor = 'Wikipedia';
            else if (t.includes('web') || t.includes('search')) toolExecutor = 'Web Search';
            else if (t.includes('memory') || t.includes('память')) toolExecutor = 'База знаний (RAG)';
            else if (t.includes('file') || t.includes('read') || t.includes('write')) toolExecutor = 'Файловая система';
            else if (t.includes('task')) toolExecutor = 'Менеджер задач';
            else if (t.includes('weather')) toolExecutor = 'Погода';
            else toolExecutor = `Системный инструмент (${data.toolSource.tool})`;
          }
          execSteps.splice(1, 0, {
            id: 'step-tool', description: `Поиск: ${data.toolSource.tool || 'Сеть / База знаний'}`,
            status: 'running', executor: toolExecutor, inputData: data.toolSource.query,
            outputData: data.toolSource.found ? 'Данные получены' : 'Поиск завершен',
          });
          store.setExecutionSteps(execSteps);
        }
      }
      if (data.isSearching !== undefined) {
        store.isSearching = data.isSearching;
        if (data.isSearching) store.setAgentStatus('executing', 'Поиск информации в источниках...');
      }
      if (data.chunk) {
        pendingChunkBuffer += data.chunk;
        if (!throttleTimer) throttleTimer = setTimeout(flushChunkBuffer, 40);
      }
      if (data.done) finalizeStream(data);
    });
    const removeCorrectedListener = window.api.onAiTextCorrected((data: any) => {
      if (userMsgId) {
        const msg = store.messages.find(m => m.id === userMsgId);
        if (msg) msg.content = data.correctedText;
      }
    });
    const removeListener = () => {
      removeChunkListener();
      removeCorrectedListener();
      if (removeRouteListener) removeRouteListener();
    };
    activeRemoveListener = removeListener;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const context = store.messages.slice(-10).map(m => ({ role: m.role, content: sanitizeRawContent(m.content) }));
      const sessionsStore = useSessionsStore();
      const currentSessionId = sessionsStore.activeSessionId;
      const currentSession = sessionsStore.sessions.find(s => s.id === currentSessionId);
      if (currentSession && currentSession.summary) {
        context.unshift({ role: 'system', content: `Краткое содержание предыдущего диалога: ${currentSession.summary}` });
      }
      const settings = {
        useLocalLLM: settingsStore.useLocalLLM, localLLMModel: settingsStore.localLLMModel,
        builtinLLMModel: settingsStore.builtinLLMModel, language: settingsStore.language,
        forcedOfflineMode: settingsStore.forcedOfflineMode, vkAudioUrl: settingsStore.vkAudioUrl,
        aiPreprocessEnabled: isVoiceMode ? settingsStore.aiPreprocessEnabled : false,
        llmStreamingEnabled: settingsStore.llmStreamingEnabled,
        composerMode: composerMode.value, composerEffort: activeModel.value?.effort || 'Auto',
        activeModelName: activeModel.value?.name || 'Auto', activeModelKey: activeModel.value?.modelKey || '',
        attachmentCount: realAttachments?.length || 0
      };
      const promptPayload = buildFileAttachmentPrompt(text || '', hasAttachments ? realAttachments : undefined);
      watchdogTimer = setTimeout(() => {
        if (store.isStreaming) {
          console.warn('[useChat] Watchdog timeout (90s) — forcing stream end');
          store.isStreaming = false;
          if (typeof store.clearStreaming === 'function') store.clearStreaming();
          if (removeListener) removeListener();
        }
      }, 90000);
      const safeContext = JSON.parse(JSON.stringify(context));
      const safeSettings = JSON.parse(JSON.stringify({ ...settings, sessionId: currentSessionId }));
      const invokeRes = await window.api.aiRequest(String(promptPayload || ''), safeContext, reqId, safeSettings);
      if (!doneHandled && typeof invokeRes === 'string' && invokeRes.trim()) {
        finalizeStream({ fullResponse: invokeRes, meta: { provider: uiStore.activeModel || 'AI', source: 'live' } });
      }
    } catch (e: any) {
      removeListener();
      if (activeRemoveListener === removeListener) activeRemoveListener = null;
      if (e && e.message && e.message.includes('Aborted')) {
         store.clearStreaming();
         store.setAgentStatus('idle');
      } else {
         const errText = e.message || String(e);
         const statusMatch = errText.match(/\b(4\d\d|5\d\d)\b/);
         const codeStr = statusMatch ? statusMatch[1] : (errText.includes('Network') || errText.includes('timeout') ? 'Network' : '500');
         const providerName = uiStore.activeModel || 'Облако';
         const routerErrStr = `${codeStr} ${providerName}`;
         uiStore.setLastRouterError(routerErrStr);
         uiStore.showToast(`Ошибка ${routerErrStr}: ${errText.slice(0, 45)}`, 'error', 5000);
         store.setAgentStatus('error', 'Ошибка выполнения');
         execSteps.forEach(s => { if (s.status === 'running') { s.status = 'error'; s.errorDetails = errText; } });
         const failureReason = formatFailureReason(e);
         const errMsgId = Date.now().toString();
         store.addMessage({
           id: errMsgId, role: 'assistant', blockType: 'system_status', timestamp: Date.now(), content: failureReason,
           executionSteps: [...execSteps], validatorFeedback: { rejected: true, reason: failureReason, details: errText, canRetry: true },
           meta: { source: 'system', ...consumePendingTtsMeta(errMsgId) }
         });
         void uiStore.speak(failureReason, undefined, { queryId: errMsgId });
         if (store.isStreaming) { store.clearStreaming(); reactor.setReactorState('idle'); }
      }
    } finally {
      clearTimeout(slowResponseTimer);
      clearTimeout(verySlowTimer);
      if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
      store.isStreaming = false;
      if (!doneHandled) {
        if (typeof store.clearStreaming === 'function') store.clearStreaming();
        if (removeListener) removeListener();
      }
    }
  };
  return {
    messages: computed(() => store.messages),
    isStreaming: computed(() => store.isStreaming),
    currentResponse: computed(() => store.currentResponse),
    isSearching: computed(() => store.isSearching),
    agentStatus: computed(() => store.agentStatus),
    agentActionText: computed(() => store.agentActionText),
    sendMessage
  };
}