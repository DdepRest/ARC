export function getToolsPrompt(toolDefs: any): string {
    return `Вы имеете доступ к следующим инструментам и функциям:
${JSON.stringify(toolDefs, null, 2)}

Инструкции по приоритету и выбору инструментов:
1. Энциклопедические запросы (определения, биографии, компании, история, наука, термины, "что такое", "кто такой") → ВСЕГДА вызывайте "wikipedia".
2. Актуальные события, новости, курсы валют/акций, свежая информация, "что происходит сегодня" → ВСЕГДА вызывайте "web_search".
3. Поиск по накопленным фактам и личным заметкам пользователя → "memory:search".
4. Если пользователю требуется создать, посмотреть, завершить или удалить задачу / напоминание → "task_management".
   ВАЖНО ПО ЗАДАЧАМ: Категорически запрещено придумывать или досочинять задачи. Если инструмент вернул "Список задач пуст" или "0 активных задач" — строго так и ответьте пользователю: "Список задач пуст".
5. Системное управление (звук, приложения, окно) → "system_control".
6. Прогноз погоды (температура, осадки, "какая погода") → ВСЕГДА вызывайте "get_weather". Инструмент "web_search" для погоды не использовать. ЦИТИРУЙТЕ числа ДОСЛОВНО из результата. Если данные о погоде уже получены или переданы в системном сообщении, КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО повторно вызывать get_weather или web_search, ответьте сразу готовым прогнозом.

Формат вызова:
Сначала вы можете написать короткое вежливое уведомление (например: "Минуту, уточняю в энциклопедии..." или "Секунду, ищу актуальные новости..."), а затем на новой строке обязательно указать вызов инструмента в формате:
TOOL: имя_инструмента {"параметр": "значение"}

Примеры вызовов:
- "Что такое PayPal?" → TOOL: wikipedia {"query": "PayPal"}
- "История PayPal" → TOOL: wikipedia {"query": "PayPal"}
- "Кто такой Илон Маск?" → TOOL: wikipedia {"query": "Elon Musk"}
- "Новости PayPal" → TOOL: web_search {"query": "PayPal новости"}
- "Акции PayPal сегодня" → TOOL: web_search {"query": "PayPal stock price"}
- "Что происходит с курсом доллара?" → TOOL: web_search {"query": "курс доллара новости"}
- "Какая погода в Москве?" → TOOL: get_weather {"location": "Москва"}
- "Создай задачу: подготовить отчёт к пятнице" → TOOL: task_management {"action": "create_task", "text": "Подготовить отчёт к пятнице", "priority": "high", "due_date": "2026-09-04"}
- "Покажи список задач" → TOOL: task_management {"action": "list_tasks"}
- "Отметь задачу как выполненную" → TOOL: task_management {"action": "complete_task", "text": "Подготовить отчёт"}
- "Удали задачу таблица" → TOOL: task_management {"action": "delete_task", "text": "таблица"}`;
}

export function parseToolCall(responseText: string): { isToolCall: boolean, toolName: string, params: any, responseTextBeforeTool: string } {
    let isToolCall = false;
    let toolName = '';
    let params: any = {};
    let responseTextBeforeTool = responseText;

    // 1. Try to match TOOL: format (support tool names with colons and underscores like memory:search)
    if (responseText.includes('TOOL:')) {
      const match = responseText.match(/TOOL:\s*([\w:_-]+)\s*(\{[\s\S]*?\})/i) || responseText.match(/TOOL:\s*([\w:_-]+)\s*(\{.*)/i);
      if (match) {
        isToolCall = true;
        toolName = match[1].trim();
        try {
          params = JSON.parse(match[2].trim());
        } catch (e) {
          params = { query: match[2].trim() };
        }
        responseTextBeforeTool = responseText.substring(0, match.index).trim();
      }
    }

    // 2. Try to match <|tool_call_start|> format
    if (!isToolCall && responseText.includes('<|tool_call_start|>')) {
      const toolCallRegex = /<\|tool_call_start\|>\s*\[?\s*([\w:_-]+)\s*\(\s*(?:query\s*=\s*)?['"]?([\s\S]*?)['"]?\s*\)\s*\]?\s*<\|tool_call_end\|>/i;
      const match = responseText.match(toolCallRegex);
      if (match) {
        isToolCall = true;
        toolName = match[1].trim();
        params = { query: match[2].trim() };
        responseTextBeforeTool = responseText.substring(0, match.index).trim();
      } else {
        const generalRegex = /<\|tool_call_start\|>([\s\S]*?)<\|tool_call_end\|>/i;
        const genMatch = responseText.match(generalRegex);
        if (genMatch) {
          isToolCall = true;
          const inner = genMatch[1].trim();
          const innerMatch = inner.match(/\[?([\w:_-]+)\((?:query=)?['"]?(.*?)['"]?\)/i);
          if (innerMatch) {
            toolName = innerMatch[1].trim();
            params = { query: innerMatch[2].trim() };
          } else {
            toolName = 'wikipedia';
            params = { query: inner };
          }
          responseTextBeforeTool = responseText.substring(0, genMatch.index).trim();
        }
      }
    }

    return { isToolCall, toolName, params, responseTextBeforeTool };
}
