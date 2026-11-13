import { ref, onUnmounted, watch, toRaw, shallowRef } from 'vue';
import { storeToRefs } from 'pinia';
import { LGraph, LGraphCanvas, LiteGraph } from 'litegraph.js';
import 'litegraph.js/css/litegraph.css';
import { useMacrosStore } from '../stores/macros.store';
import { registerMacroNodes } from '../utils/macroNodes';

export function useMacroEditor() {
  const macrosStore = useMacrosStore();
  const { isEditorOpen: isOpen, editingMacroId } = storeToRefs(macrosStore);

  const macroName = ref('Новый макрос');
  const macroDesc = ref('Сценарий автоматизации');
  const selectedNode = shallowRef<any>(null);
  const mainRef = ref<HTMLElement | null>(null);
  const isRunning = ref(false);
  const nodeCount = ref(0);

  const focusCanvas = () => {
    const canvasEl = document.getElementById('macro-canvas');
    if (canvasEl) {
      canvasEl.focus();
    }
  };

  const getPropLabel = (key: string) => {
    const map: Record<string, string> = {
      phrase: 'Голосовая фраза (Устарело)',
      phrases: 'Фразы (каждая с новой строки)',
      time: 'Временной штамп (ЧЧ:ММ)',
      appPath: 'Путь к приложению',
      url: 'Ссылка URL',
      text: 'Озвучиваемый текст / Тело уведомления',
      command: 'Команда терминала',
      ms: 'Задержка (миллисекунды)',
      condition: 'Выражение условия (true/false)',
      bias: 'Вероятность выхода А (0.0 - 1.0)',
      title: 'Заголовок уведомления',
      path: 'Путь к файлу или папке',
      limit: 'Лимит срабатываний',
      resetOnLimit: 'Сбросить после лимита',
      intent: 'Описание намерения (ИИ)'
    };
    return map[key] || key;
  };

  const handleRun = async () => {
    if (!editingMacroId.value || isRunning.value) return;
    isRunning.value = true;
    try {
      if (graph) {
        const data = graph.serialize();
        data.name = macroName.value;
        
        const triggers: string[] = [];
        const nodes = graph._nodes;
        if (nodes) {
          for (const n of nodes) {
            if (n.type === 'triggers/voice') {
              if (n.properties?.phrases) {
                const parsed = n.properties.phrases.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                triggers.push(...parsed);
              } else if (n.properties?.phrase) {
                triggers.push(n.properties.phrase);
              }
            } else if (n.type === 'triggers/timer' && n.properties?.time) {
              triggers.push(`Таймер в ${n.properties.time}`);
            }
          }
        }
        data.triggers = triggers;
        
        await macrosStore.saveMacro(editingMacroId.value, data);
      }
      await window.api.macrosExecute(editingMacroId.value);
    } catch (err) {
      console.error('Failed to execute macro:', err);
    } finally {
      setTimeout(() => {
        isRunning.value = false;
      }, 1500);
    }
  };

  let graph: any = null;
  let canvas: any = null;
  let resizeObserver: ResizeObserver | null = null;

  const nodeGroups = [
    {
      name: 'Триггеры',
      nodes: [
        { type: 'triggers/voice', title: 'Голосовая фраза', desc: 'Срабатывает при произнесении фразы', icon: 'MessageSquare' },
        { type: 'triggers/timer', title: 'Таймер', desc: 'Срабатывает в указанное время', icon: 'Clock' },
        { type: 'triggers/ai_intent', title: 'ИИ-Интент', desc: 'Срабатывает по семантике (Gemini/AI)', icon: 'Sparkles' }
      ]
    },
    {
      name: 'Действия',
      nodes: [
        { type: 'actions/launch', title: 'Запуск приложения', desc: 'Запуск программы', icon: 'Play' },
        { type: 'actions/url', title: 'Открыть URL', desc: 'Открытие ссылки в браузере', icon: 'Globe' },
        { type: 'actions/speak', title: 'Озвучить текст', desc: 'Проговаривание текста через TTS', icon: 'MessageSquare' },
        { type: 'actions/shell', title: 'Команда терминала', desc: 'Выполнение консольного скрипта', icon: 'Terminal' },
        { type: 'actions/notification', title: 'Уведомление', desc: 'Всплывающее уведомление на ПК', icon: 'MessageSquare' },
        { type: 'actions/open_file', title: 'Открыть файл/папку', desc: 'Открыть файл или папку на ПК', icon: 'Folder' }
      ]
    },
    {
      name: 'Логика',
      nodes: [
        { type: 'logic/delay', title: 'Задержка', desc: 'Пауза перед следующим шагом', icon: 'Clock' },
        { type: 'logic/if', title: 'Условие (IF)', desc: 'Ветвление логики', icon: 'Cpu' },
        { type: 'logic/toggle', title: 'Переключатель', desc: 'Переключение выходов ON/OFF', icon: 'Cpu' },
        { type: 'logic/random', title: 'Рандомизатор', desc: 'Разделение на случайные пути', icon: 'Cpu' },
        { type: 'logic/counter', title: 'Счетчик', desc: 'Счетчик итераций и лимитов', icon: 'Cpu' }
      ]
    }
  ];

  const templates = [
    {
      name: 'Голосовой старт',
      desc: 'Запуск веб-сервиса с голосовым приветствием',
      icon: 'MessageSquare',
      data: {
        last_node_id: 3,
        last_link_id: 2,
        nodes: [
          {
            id: 1,
            type: 'triggers/voice',
            pos: [100, 200],
            size: [190, 48],
            flags: {},
            order: 0,
            mode: 0,
            outputs: [{ name: 'exec', type: -1, links: [1] }],
            properties: { phrases: 'привет ассистент\nоткрой систему' }
          },
          {
            id: 2,
            type: 'actions/speak',
            pos: [350, 200],
            size: [200, 48],
            flags: {},
            order: 1,
            mode: 0,
            inputs: [{ name: 'exec', type: -1, link: 1 }],
            outputs: [{ name: 'done', type: -1, links: [2] }],
            properties: { text: 'Рад приветствовать вас! Открываю консоль разработчика.' }
          },
          {
            id: 3,
            type: 'actions/url',
            pos: [610, 200],
            size: [220, 52],
            flags: {},
            order: 2,
            mode: 0,
            inputs: [{ name: 'exec', type: -1, link: 2 }],
            outputs: [{ name: 'done', type: -1, links: null }],
            properties: { url: 'https://ai.studio/build' }
          }
        ],
        links: [
          [1, 1, 0, 2, 0, -1],
          [2, 2, 0, 3, 0, -1]
        ]
      }
    },
    {
      name: 'ИИ Семантика',
      desc: 'Интеллектуальный парсинг намерения и запуск команды',
      icon: 'Sparkles',
      data: {
        last_node_id: 2,
        last_link_id: 1,
        nodes: [
          {
            id: 1,
            type: 'triggers/ai_intent',
            pos: [100, 200],
            size: [190, 48],
            flags: {},
            order: 0,
            mode: 0,
            outputs: [{ name: 'exec', type: -1, links: [1] }],
            properties: { intent: 'Пользователь хочет запустить сборку проекта' }
          },
          {
            id: 2,
            type: 'actions/shell',
            pos: [350, 200],
            size: [220, 52],
            flags: {},
            order: 1,
            mode: 0,
            inputs: [{ name: 'exec', type: -1, link: 1 }],
            outputs: [{ name: 'done', type: -1, links: null }],
            properties: { command: 'npm run build' }
          }
        ],
        links: [
          [1, 1, 0, 2, 0, -1]
        ]
      }
    },
    {
      name: 'Умный таймер',
      desc: 'Запуск сценария по расписанию с уведомлением',
      icon: 'Clock',
      data: {
        last_node_id: 3,
        last_link_id: 2,
        nodes: [
          {
            id: 1,
            type: 'triggers/timer',
            pos: [100, 200],
            size: [190, 48],
            flags: {},
            order: 0,
            mode: 0,
            outputs: [{ name: 'exec', type: -1, links: [1] }],
            properties: { time: '09:00' }
          },
          {
            id: 2,
            type: 'logic/delay',
            pos: [350, 200],
            size: [190, 52],
            flags: {},
            order: 1,
            mode: 0,
            inputs: [{ name: 'exec', type: -1, link: 1 }],
            outputs: [{ name: 'done', type: -1, links: [2] }],
            properties: { ms: 1500 }
          },
          {
            id: 3,
            type: 'actions/notification',
            pos: [600, 200],
            size: [220, 52],
            flags: {},
            order: 2,
            mode: 0,
            inputs: [{ name: 'exec', type: -1, link: 2 }],
            outputs: [{ name: 'done', type: -1, links: null }],
            properties: { title: 'Утренний чек-ин', text: 'Время проверить статус систем.' }
          }
        ],
        links: [
          [1, 1, 0, 2, 0, -1],
          [2, 2, 0, 3, 0, -1]
        ]
      }
    }
  ];

  const updateNodeCount = () => {
    if (graph) {
      nodeCount.value = graph._nodes?.length || 0;
    } else {
      nodeCount.value = 0;
    }
  };

  const loadTemplate = (templateData: any) => {
    if (!graph) return;
    graph.clear();
    graph.configure(JSON.parse(JSON.stringify(templateData)));
    const nodes = graph._nodes;
    if (nodes) {
      for (const n of nodes) {
        if (n.type === 'triggers/voice') {
          n.size = [190, 48];
        } else if (n.type === 'triggers/timer' || n.type === 'triggers/ai_intent') {
          n.size = [190, 48];
        } else if (n.type === 'actions/launch' || n.type === 'actions/url' || n.type === 'actions/shell') {
          n.size = [220, 52];
        } else if (n.type === 'actions/speak') {
          n.size = [200, 48];
        } else if (n.type === 'logic/delay') {
          n.size = [190, 52];
        } else if (n.type === 'logic/if') {
          n.size = [180, 72];
        }
      }
    }
    if (canvas) {
      canvas.setDirty(true, true);
    }
    updateNodeCount();
  };

  const getBezierPoint = (t: number, p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number]): [number, number] => {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    
    const x = mt3 * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t3 * p3[0];
    const y = mt3 * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t3 * p3[1];
    return [x, y];
  };

  const getAccentColorForNode = (node: any) => {
    if (!node || !node.type) return '#ef4444';
    if (node.type.startsWith('actions/')) {
      return '#a855f7';
    }
    if (node.type.startsWith('logic/')) {
      return '#34d399';
    }
    return '#ef4444';
  };

  const initGraph = () => {
    if (graph) return;

    LiteGraph.NODE_DEFAULT_BGCOLOR = '#111111';
    LiteGraph.NODE_DEFAULT_COLOR = '#1a1a1a';
    LiteGraph.NODE_DEFAULT_BOXCOLOR = '#333333';
    LiteGraph.NODE_DEFAULT_SHAPE = 'round';
    LiteGraph.NODE_TITLE_COLOR = '#f4f4f5';
    LiteGraph.NODE_TEXT_COLOR = '#a1a1aa';
    LiteGraph.NODE_TITLE_HEIGHT = 34;
    LiteGraph.NODE_TITLE_TEXT_Y = 20;
    LiteGraph.DEFAULT_SHADOW_COLOR = 'rgba(0, 0, 0, 0.4)';
    LiteGraph.NODE_TEXT_SIZE = 12;
    LiteGraph.LINK_COLOR = '#242424';
    LiteGraph.EVENT_LINK_COLOR = '#ef4444';
    (LiteGraph as any).WIDGET_BGCOLOR = '#080808';
    (LiteGraph as any).WIDGET_OUTLINE_COLOR = '#27272a';
    (LiteGraph as any).WIDGET_TEXT_COLOR = '#f4f4f5';
    (LiteGraph as any).WIDGET_SECONDARY_TEXT_COLOR = '#71717a';
    
    graph = new LGraph();
    canvas = new LGraphCanvas('#macro-canvas', graph);

    graph.onNodeAdded = () => {
      updateNodeCount();
    };
    graph.onNodeRemoved = () => {
      updateNodeCount();
    };

    canvas.links_render_mode = 2;
    canvas.background_image = '';
    canvas.clear_background = true;
    canvas.clear_background_color = '#050505';

    canvas.render_shadows = false;
    canvas.use_gradients = false;
    canvas.round_radius = 12;

    const FONT_FAMILY = '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    (LiteGraph as any).NODE_TEXT_FONT = FONT_FAMILY;
    canvas.title_text_font = `600 12.5px ${FONT_FAMILY}`;
    canvas.inner_text_font = `500 10.5px ${FONT_FAMILY}`;
    
    canvas.drawNode = function(node: any, ctx: CanvasRenderingContext2D) {
      const current_canvas = this || canvas;
      if (!current_canvas) return;
      const is_selected = node.is_selected || (current_canvas.selected_nodes && current_canvas.selected_nodes[node.id]);
      const mouse_over = current_canvas.node_over === node;
      const is_collapsed = node.flags.collapsed;
      
      let bodyBgSolid = '#09090b';
      let borderColor = mouse_over ? '#3f3f46' : '#27272a';
      let accentColor = '#ef4444';
      let accentRgb = '239, 68, 68';
      
      if (node.type && node.type.startsWith('actions/')) {
        accentColor = '#a855f7';
        accentRgb = '168, 85, 247';
      } else if (node.type && node.type.startsWith('logic/')) {
        accentColor = '#34d399';
        accentRgb = '52, 211, 153';
      }

      if (is_selected) {
        borderColor = accentColor;
      }
      
      const size = [node.size[0], node.size[1]];
      const title_height = 34;
      const w = size[0];
      const h = is_collapsed ? 0 : size[1];
      
      ctx.save();
      
      if (is_selected) {
        ctx.shadowColor = `rgba(${accentRgb}, 0.2)`;
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
      } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
      }
      
      ctx.fillStyle = bodyBgSolid;
      ctx.beginPath();
      ctx.roundRect(0, -title_height, w, h + title_height, [8]);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(0, -title_height, w, h + title_height, [8]);
      ctx.stroke();

      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.roundRect(0, -title_height, 4, h + title_height, [8, 0, 0, 8]);
      ctx.fill();
      
      const icon_x = 12;
      const icon_y = -title_height + 10;
      
      ctx.fillStyle = `rgba(${accentRgb}, 0.15)`;
      ctx.beginPath();
      ctx.roundRect(icon_x - 4, icon_y - 2, 18, 18, [4]);
      ctx.fill();

      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (node.type === 'triggers/voice') {
        ctx.beginPath();
        ctx.arc(icon_x + 5, icon_y + 4.5, 2.0, 0, Math.PI, true);
        ctx.lineTo(icon_x + 3.0, icon_y + 7.5);
        ctx.arc(icon_x + 5, icon_y + 7.5, 2.0, Math.PI, 0, true);
        ctx.closePath();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(icon_x + 5, icon_y + 7.0, 4.0, 0, Math.PI, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(icon_x + 5, icon_y + 11.0);
        ctx.lineTo(icon_x + 5, icon_y + 13.0);
        ctx.moveTo(icon_x + 2.5, icon_y + 13.0);
        ctx.lineTo(icon_x + 7.5, icon_y + 13.0);
        ctx.stroke();
      } else if (node.type === 'triggers/timer') {
        ctx.beginPath();
        ctx.arc(icon_x + 5, icon_y + 7, 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(icon_x + 5, icon_y + 7);
        ctx.lineTo(icon_x + 5, icon_y + 4.2);
        ctx.lineTo(icon_x + 7.2, icon_y + 7);
        ctx.stroke();
      } else if (node.type === 'triggers/ai_intent') {
        ctx.beginPath();
        ctx.moveTo(icon_x + 5, icon_y + 1.5);
        ctx.quadraticCurveTo(icon_x + 5, icon_y + 5, icon_x + 8.5, icon_y + 5);
        ctx.quadraticCurveTo(icon_x + 5, icon_y + 5, icon_x + 5, icon_y + 8.5);
        ctx.quadraticCurveTo(icon_x + 5, icon_y + 5, icon_x + 1.5, icon_y + 5);
        ctx.quadraticCurveTo(icon_x + 5, icon_y + 5, icon_x + 5, icon_y + 1.5);
        ctx.closePath();
        ctx.stroke();
      } else if (node.type === 'actions/launch') {
        ctx.fillStyle = accentColor + '30';
        ctx.beginPath();
        ctx.moveTo(icon_x + 2.5, icon_y + 2.5);
        ctx.lineTo(icon_x + 9.5, icon_y + 7);
        ctx.lineTo(icon_x + 2.5, icon_y + 11.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (node.type === 'actions/url') {
        ctx.beginPath();
        ctx.arc(icon_x + 5, icon_y + 7, 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(icon_x + 5, icon_y + 7, 1.8, 4.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(icon_x + 0.5, icon_y + 7);
        ctx.lineTo(icon_x + 9.5, icon_y + 7);
        ctx.stroke();
      } else if (node.type === 'actions/speak') {
        ctx.beginPath();
        ctx.roundRect(icon_x + 0.5, icon_y + 2.5, 9, 6.5, [1.5]);
        ctx.moveTo(icon_x + 2.5, icon_y + 9);
        ctx.lineTo(icon_x + 2.5, icon_y + 11.5);
        ctx.lineTo(icon_x + 5.5, icon_y + 9);
        ctx.stroke();
      } else if (node.type === 'actions/shell') {
        ctx.beginPath();
        ctx.moveTo(icon_x + 1.5, icon_y + 3.5);
        ctx.lineTo(icon_x + 4.5, icon_y + 6.5);
        ctx.lineTo(icon_x + 1.5, icon_y + 9.5);
        ctx.moveTo(icon_x + 5.0, icon_y + 9.5);
        ctx.lineTo(icon_x + 9.0, icon_y + 9.5);
        ctx.stroke();
      } else if (node.type === 'logic/delay') {
        ctx.beginPath();
        ctx.moveTo(icon_x + 2, icon_y + 2.5);
        ctx.lineTo(icon_x + 8, icon_y + 2.5);
        ctx.lineTo(icon_x + 2, icon_y + 11.5);
        ctx.lineTo(icon_x + 8, icon_y + 11.5);
        ctx.closePath();
        ctx.stroke();
      } else if (node.type === 'logic/if') {
        ctx.beginPath();
        ctx.moveTo(icon_x + 1.5, icon_y + 7);
        ctx.lineTo(icon_x + 4.5, icon_y + 7);
        ctx.lineTo(icon_x + 8.5, icon_y + 3);
        ctx.moveTo(icon_x + 4.5, icon_y + 7);
        ctx.lineTo(icon_x + 8.5, icon_y + 11);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(icon_x + 5, icon_y + 7, 4.0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      
      const title = node.getTitle ? node.getTitle() : node.title;
      if (title) {
        const current_canvas = this || canvas;
        ctx.font = (current_canvas && current_canvas.title_text_font) || `600 12.5px ${(LiteGraph as any).NODE_TEXT_FONT}`;
        ctx.fillStyle = LiteGraph.NODE_TITLE_COLOR;
        ctx.textAlign = 'left';
        ctx.fillText(title, 38, -title_height + 21);
      }
      
      if (mouse_over) {
        const btn_x = w - 18;
        const btn_y = -title_height + 17;
        
        ctx.save();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.beginPath();
        ctx.arc(btn_x, btn_y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.25;
        ctx.stroke();
        
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(btn_x - 3.5, btn_y - 3.5);
        ctx.lineTo(btn_x + 3.5, btn_y + 3.5);
        ctx.moveTo(btn_x + 3.5, btn_y - 3.5);
        ctx.lineTo(btn_x - 3.5, btn_y + 3.5);
        ctx.stroke();
        ctx.restore();
      }
      
      if (!is_collapsed) {
        const slot_pos = [0, 0];
        const current_canvas = this || canvas;
        ctx.font = (current_canvas && current_canvas.inner_text_font) || `500 10.5px ${(LiteGraph as any).NODE_TEXT_FONT}`;
        
        if (node.inputs) {
          for (let i = 0; i < node.inputs.length; i++) {
            const slot = node.inputs[i];
            const pos = node.getConnectionPos(true, i, slot_pos);
            const rx = pos[0] - node.pos[0];
            const ry = pos[1] - node.pos[1];
            const is_connected = slot.link !== null;
            
            ctx.beginPath();
            ctx.arc(rx, ry, is_connected ? 5 : 4, 0, Math.PI * 2);
            ctx.fillStyle = is_connected ? accentColor : '#18181b';
            ctx.fill();
            ctx.strokeStyle = is_connected ? accentColor : '#52525b';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            if (is_connected) {
              ctx.beginPath();
              ctx.arc(rx, ry, 2, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
            }
            
            if (slot.name) {
              ctx.textAlign = 'left';
              ctx.fillStyle = is_connected ? '#f4f4f5' : '#a1a1aa';
              ctx.fillText(slot.name, rx + 12, ry + 3.5);
            }
          }
        }
        
        if (node.outputs) {
          for (let i = 0; i < node.outputs.length; i++) {
            const slot = node.outputs[i];
            const pos = node.getConnectionPos(false, i, slot_pos);
            const rx = pos[0] - node.pos[0];
            const ry = pos[1] - node.pos[1];
            const is_connected = slot.links && slot.links.length > 0;
            
            ctx.beginPath();
            ctx.arc(rx, ry, is_connected ? 5 : 4, 0, Math.PI * 2);
            ctx.fillStyle = is_connected ? accentColor : '#18181b';
            ctx.fill();
            ctx.strokeStyle = is_connected ? accentColor : '#52525b';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            if (is_connected) {
              ctx.beginPath();
              ctx.arc(rx, ry, 2, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
            }
            
            if (slot.name) {
              ctx.textAlign = 'right';
              ctx.fillStyle = is_connected ? '#f4f4f5' : '#a1a1aa';
              ctx.fillText(slot.name, rx - 12, ry + 3.5);
            }
          }
        }
        
        if (node.widgets) {
          let max_y = 0;
          if (node.inputs) {
            max_y = Math.max(max_y, node.inputs.length * 20);
          }
          if (node.outputs) {
            max_y = Math.max(max_y, node.outputs.length * 20);
          }
          max_y = Math.max(max_y, 10);
          
          let widgets_y = max_y + 10;
          if (node.widgets_start_y != null) {
            widgets_y = node.widgets_start_y;
          }
          
          ctx.save();
          this.drawNodeWidgets(
            node,
            widgets_y,
            ctx,
            this.node_widget && this.node_widget[0] == node ? this.node_widget[1] : null
          );
          ctx.restore();
        }

        let previewText = '';
        if (node.type === 'triggers/voice') {
          const raw = node.properties?.phrases || node.properties?.phrase || '';
          const parsed = raw.split(/[\n,]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          if (parsed.length > 1) {
            previewText = `"${parsed[0]}" (+${parsed.length - 1})`;
          } else {
            previewText = `"${parsed[0] || ''}"`;
          }
        } else if (node.type === 'triggers/timer' && node.properties?.time) {
          previewText = `⏱ ${node.properties.time}`;
        } else if (node.type === 'actions/launch' && node.properties?.appPath) {
          previewText = node.properties.appPath;
        } else if (node.type === 'actions/url' && node.properties?.url) {
          previewText = node.properties.url;
        } else if (node.type === 'actions/speak' && node.properties?.text) {
          previewText = `🗣 "${node.properties.text}"`;
        } else if (node.type === 'actions/shell' && node.properties?.command) {
          previewText = `$ ${node.properties.command}`;
        } else if (node.type === 'logic/delay' && node.properties?.ms) {
          previewText = `⏳ ${node.properties.ms} ms`;
        } else if (node.type === 'logic/if' && node.properties?.condition) {
          previewText = `IF: ${node.properties.condition}`;
        }

        if (previewText) {
          ctx.save();
          const maxTextLen = 25;
          let textToDraw = previewText;
          if (textToDraw.length > maxTextLen) {
            textToDraw = textToDraw.substring(0, maxTextLen - 3) + '...';
          }
          
          const px = 12;
          const py = h - 22;
          const pw = w - 24;
          const ph = 16;
          
          ctx.fillStyle = `rgba(${accentRgb}, 0.15)`;
          ctx.strokeStyle = `rgba(${accentRgb}, 0.2)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(px, py, pw, ph, [6]);
          ctx.fill();
          ctx.stroke();
          
          ctx.font = `500 9.5px ${(LiteGraph as any).NODE_TEXT_FONT}`;
          ctx.fillStyle = `rgba(${accentRgb}, 0.95)`;
          ctx.textAlign = 'center';
          ctx.fillText(textToDraw, px + pw / 2, py + 11);
          ctx.restore();
        }
      }
      
      if (node.onDrawBackground) {
        ctx.save();
        node.onDrawBackground(ctx, this, this.canvas, this.graph_mouse);
        ctx.restore();
      }
      
      ctx.restore();
    };

    canvas.renderLink = function(
      ctx: CanvasRenderingContext2D,
      a: [number, number],
      b: [number, number],
      link: any,
      skip_border: boolean,
      flow: any,
      color: string,
      start_dir: any,
      end_dir: any,
      num_sublines: number
    ) {
      if (link) {
        if (!this.visible_links) {
          this.visible_links = [];
        }
        this.visible_links.push(link);
      }

      const start_dir_val = start_dir || LiteGraph.RIGHT;
      const end_dir_val = end_dir || LiteGraph.LEFT;

      const current_graph = this.graph || graph;
      const start_node = current_graph ? current_graph.getNodeById(link ? link.origin_id : null) : null;
      const end_node = current_graph ? current_graph.getNodeById(link ? link.target_id : null) : null;

      const start_color = getAccentColorForNode(start_node);
      const end_color = getAccentColorForNode(end_node);

      const is_selected = link != null && this.highlighted_links[link.id];
      const is_hovered = this.over_link_center === link;

      const dist = Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);

      let start_offset_x = 0;
      let start_offset_y = 0;
      let end_offset_x = 0;
      let end_offset_y = 0;

      switch (start_dir_val) {
        case LiteGraph.LEFT: start_offset_x = dist * -0.25; break;
        case LiteGraph.RIGHT: start_offset_x = dist * 0.25; break;
        case LiteGraph.UP: start_offset_y = dist * -0.25; break;
        case LiteGraph.DOWN: start_offset_y = dist * 0.25; break;
      }
      switch (end_dir_val) {
        case LiteGraph.LEFT: end_offset_x = dist * -0.25; break;
        case LiteGraph.RIGHT: end_offset_x = dist * 0.25; break;
        case LiteGraph.UP: end_offset_y = dist * -0.25; break;
        case LiteGraph.DOWN: end_offset_y = dist * 0.25; break;
      }

      const cp1x = a[0] + start_offset_x;
      const cp1y = a[1] + start_offset_y;
      const cp2x = b[0] + end_offset_x;
      const cp2y = b[1] + end_offset_y;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, b[0], b[1]);
      ctx.lineWidth = is_selected || is_hovered ? 9 : 5;
      ctx.strokeStyle = start_color + '20';
      ctx.stroke();

      const grad = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      grad.addColorStop(0, start_color);
      grad.addColorStop(1, end_color);

      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, b[0], b[1]);
      ctx.lineWidth = is_selected ? 3.5 : (is_hovered ? 2.75 : 1.75);
      ctx.strokeStyle = is_selected ? '#ffffff' : grad;
      ctx.stroke();

      const now = LiteGraph.getTime();
      const speed = 0.0008;
      const t = (now * speed) % 1.0;
      
      const p1 = getBezierPoint(t, a, [cp1x, cp1y], [cp2x, cp2y], b);
      
      ctx.beginPath();
      ctx.arc(p1[0], p1[1], 4.5, 0, Math.PI * 2);
      ctx.fillStyle = start_color;
      ctx.shadowColor = start_color;
      ctx.shadowBlur = 6;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p1[0], p1[1], 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.restore();
    };

    canvas.render_title_colored = false;
    
    canvas.default_connection_color = {
      input_off: 'rgba(255, 255, 255, 0.15)',
      input_on: '#ef4444',
      output_off: 'rgba(255, 255, 255, 0.15)',
      output_on: '#ef4444'
    };

    canvas.default_connection_color_byType = {
      "-1": "#ef4444",
    };
    canvas.default_connection_color_byTypeOff = {
      "-1": "rgba(255, 255, 255, 0.15)",
    };

    canvas.onDrawBackground = function(ctx: CanvasRenderingContext2D, visible_area: any) {
      if (this.clear_background) {
        ctx.fillStyle = this.clear_background_color;
        ctx.fillRect(
          visible_area[0],
          visible_area[1],
          visible_area[2],
          visible_area[3]
        );
      }
      
      const step = 28;
      const start_x = Math.floor(visible_area[0] / step) * step;
      const end_x = visible_area[0] + visible_area[2];
      const start_y = Math.floor(visible_area[1] / step) * step;
      const end_y = visible_area[1] + visible_area[3];
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let x = start_x; x < end_x; x += step) {
        for (let y = start_y; y < end_y; y += step) {
          ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
        }
      }
    };

    canvas.onDropItem = function(e: DragEvent) {
      e.preventDefault();
      const type = e.dataTransfer?.getData('nodeType') || draggedNodeType;
      const current_graph = this.graph || graph;
      if (type && current_graph) {
        const node = LiteGraph.createNode(type);
        if (node) {
          const current_canvas = this || canvas;
          if (current_canvas && current_canvas.convertEventToCanvasOffset) {
            const canvasPos = current_canvas.convertEventToCanvasOffset(e);
            node.pos = [canvasPos[0], canvasPos[1]];
          } else {
            node.pos = [100, 100];
          }
          current_graph.add(node);
          if (current_canvas) {
            current_canvas.setDirty(true, true);
          }
          draggedNodeType = null;
          return true;
        }
      }
      return false;
    };

    canvas.onSelectionChange = (selected_nodes: any) => {
      const list = Object.values(selected_nodes);
      selectedNode.value = list.length > 0 ? list[0] : null;
    };

    registerMacroNodes(LiteGraph, () => graph, () => canvas, selectedNode);
  };

  let draggedNodeType: string | null = null;
  const handleDragStart = (e: DragEvent, node: any) => {
    draggedNodeType = node.type;
    e.dataTransfer?.setData('nodeType', node.type);
  };

  const addNodeToCanvas = (nodeDef: any) => {
    if (!graph || !canvas) return;
    const node = LiteGraph.createNode(nodeDef.type);
    if (node) {
      let x = 100;
      let y = 100;
      
      if (canvas.ds && canvas.canvas) {
          const ds = canvas.ds;
          x = -ds.offset[0] + (canvas.canvas.width / 2) / ds.scale - LiteGraph.NODE_WIDTH / 2;
          y = -ds.offset[1] + (canvas.canvas.height / 2) / ds.scale - 50; 
      }
      
      node.pos = [x, y];
      graph.add(node);
      canvas.setDirty(true, true);
    }
  };

  const updateNodeProperty = () => {
      if (canvas) {
          canvas.setDirty(true, true);
      }
  };

  const deleteSelectedNode = () => {
    if (selectedNode.value && graph) {
      const rawNode = toRaw(selectedNode.value);
      const id = rawNode?.id ?? selectedNode.value?.id;
      if (id !== undefined) {
        const realNode = graph.getNodeById(id);
        if (realNode) {
          if (canvas) {
            canvas.deselectNode(realNode);
          }
          graph.remove(realNode);
          selectedNode.value = null;
          if (canvas) {
            canvas.setDirty(true, true);
          }
        }
      }
    }
  };

  const handleSave = async () => {
      if (!graph) return;
      const data = graph.serialize();
      data.name = macroName.value;
      data.description = macroDesc.value;
      
      const triggers: string[] = [];
      const nodes = graph._nodes;
      if (nodes) {
        for (const n of nodes) {
          if (n.type === 'triggers/voice') {
            const raw = n.properties?.phrases || n.properties?.phrase || '';
            if (raw) {
              const parsed = raw.split(/[\n,]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
              triggers.push(...parsed);
            }
          } else if (n.type === 'triggers/timer' && n.properties?.time) {
            triggers.push(`Таймер в ${n.properties.time}`);
          } else if (n.type === 'triggers/ai_intent' && n.properties?.intent) {
            triggers.push(`ИИ-Интент: "${n.properties.intent}"`);
          }
        }
      }
      data.triggers = triggers;

      const id = editingMacroId.value || `macro-${Date.now()}`;
      await macrosStore.saveMacro(id, data);
      macrosStore.closeEditor();
  };

  const handleClose = () => {
    macrosStore.closeEditor();
  };

  watch(isOpen, async (val) => {
    if (val) {
      setTimeout(async () => {
        initGraph();
        if (editingMacroId.value) {
          const data = await window.api.macrosLoad(editingMacroId.value);
          if (data) {
            graph.configure(data);
            macroName.value = data.name || 'Macro';
            macroDesc.value = data.description || 'Сценарий автоматизации';
            
            const nodes = graph._nodes;
            if (nodes) {
              for (const n of nodes) {
                if (n.type === 'triggers/voice') {
                  n.size = [190, 48];
                  if (n.properties?.phrase && !n.properties?.phrases) {
                    n.properties.phrases = n.properties.phrase.split(',').map((s: string) => s.trim()).join('\n');
                    delete n.properties.phrase;
                  }
                } else if (n.type === 'triggers/timer' || n.type === 'triggers/ai_intent') {
                  n.size = [190, 48];
                } else if (n.type === 'actions/launch' || n.type === 'actions/url' || n.type === 'actions/shell') {
                  n.size = [220, 52];
                } else if (n.type === 'actions/speak') {
                  n.size = [200, 48];
                } else if (n.type === 'logic/delay') {
                  n.size = [190, 52];
                } else if (n.type === 'logic/if') {
                  n.size = [180, 72];
                }
              }
            }
            if (canvas) {
              canvas.setDirty(true, true);
            }
          }
        } else {
          graph.clear();
          macroName.value = 'Новый макрос';
          macroDesc.value = 'Сценарий автоматизации';
        }

        updateNodeCount();

        if (mainRef.value && canvas) {
          canvas.resize(mainRef.value.clientWidth, mainRef.value.clientHeight);
          
          resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
              if (canvas) {
                canvas.resize(entry.contentRect.width, entry.contentRect.height);
              }
            }
          });
          resizeObserver.observe(mainRef.value);
        }
      }, 100);
    } else {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (graph) {
        graph.stop();
        graph = null;
      }
      canvas = null;
    }
  });

  onUnmounted(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    if (graph) {
      graph.stop();
      graph = null;
    }
    canvas = null;
  });

  return {
    isOpen,
    editingMacroId,
    macroName,
    macroDesc,
    nodeCount,
    templates,
    loadTemplate,
    selectedNode,
    mainRef,
    isRunning,
    nodeGroups,
    focusCanvas,
    getPropLabel,
    handleRun,
    handleDragStart,
    addNodeToCanvas,
    updateNodeProperty,
    deleteSelectedNode,
    handleSave,
    handleClose,
    getAccentColorForNode
  };
}
