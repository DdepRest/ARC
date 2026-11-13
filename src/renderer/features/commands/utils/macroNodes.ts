import type { Ref } from 'vue';
import { safeEval } from '@shared/utils/safeExpressionParser';

export function registerMacroNodes(
  LiteGraph: any,
  getGraph: () => any,
  getCanvas: () => any,
  selectedNode: Ref<any>
) {
  // Node categories colors
  const TRIGGER_COLOR = '#27272a'; // zinc-800
  const TRIGGER_BG = '#09090b';    // zinc-950
  
  const ACTION_COLOR = '#3f3f46';  // zinc-700
  const ACTION_BG = '#18181b';     // zinc-900
  
  const LOGIC_COLOR = '#3f3f46';   // zinc-700
  const LOGIC_BG = '#27272a';      // zinc-800

  const handleNodeMouseDown = function(this: any, e: MouseEvent, pos: [number, number], graphcanvas: any) {
    const size = this.size || [100, 50];
    const title_height = 34; // custom node title height
    
    // Hit-test region with cursor cushioning padding for reliable clicks
    const btn_min_x = size[0] - 30;
    const btn_max_x = size[0] - 6;
    const btn_min_y = -title_height + 5;
    const btn_max_y = -title_height + 29;
    
    if (pos[0] >= btn_min_x && pos[0] <= btn_max_x && pos[1] >= btn_min_y && pos[1] <= btn_max_y) {
      e.stopPropagation();
      e.preventDefault();
      
      const graph = getGraph();
      const canvas = getCanvas();
      if (graph) {
        if (canvas) {
          canvas.deselectNode(this);
        }
        graph.remove(this);
        selectedNode.value = null;
        if (canvas) {
          canvas.setDirty(true, true);
        }
      }
      return true;
    }
    return false;
  };

  // Register custom nodes
  function VoiceTrigger(this: any) {
    this.addOutput('exec', LiteGraph.EVENT as any);
    this.properties = { phrases: 'запусти утренний ритуал\nдоброе утро' };
    this.color = TRIGGER_COLOR;
    this.bgcolor = TRIGGER_BG;
    this.size = [200, 48];
  }
  VoiceTrigger.title = 'Голосовая фраза';
  VoiceTrigger.prototype.onExecute = function(this: any) {
    this.triggerSlot(0);
  };
  VoiceTrigger.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('triggers/voice', VoiceTrigger);

  function AIIntentTrigger(this: any) {
    this.addOutput('exec', LiteGraph.EVENT as any);
    this.properties = { intent: 'Пользователь хочет расслабиться и включить музыку' };
    this.color = TRIGGER_COLOR;
    this.bgcolor = TRIGGER_BG;
    this.size = [220, 52];
  }
  AIIntentTrigger.title = 'ИИ-Интент';
  AIIntentTrigger.prototype.onExecute = function(this: any) {
    this.triggerSlot(0);
  };
  AIIntentTrigger.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('triggers/ai_intent', AIIntentTrigger);

  function TimerTrigger(this: any) {
    this.addOutput('exec', LiteGraph.EVENT as any);
    this.properties = { time: '08:00' };
    this.color = TRIGGER_COLOR;
    this.bgcolor = TRIGGER_BG;
    this.size = [190, 48];
  }
  TimerTrigger.title = 'Таймер';
  TimerTrigger.prototype.onExecute = function(this: any) {
    this.triggerSlot(0);
  };
  TimerTrigger.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('triggers/timer', TimerTrigger);

  function LaunchAction(this: any) {
    this.addInput('exec', LiteGraph.ACTION as any);
    this.addOutput('done', LiteGraph.EVENT as any);
    this.properties = { appPath: '' };
    this.color = ACTION_COLOR;
    this.bgcolor = ACTION_BG;
    this.size = [220, 52];
  }
  LaunchAction.title = 'Запуск приложения';
  LaunchAction.prototype.onAction = function(this: any) {
    console.log('Action: Launch', this.properties.appPath);
    this.triggerSlot(0);
  };
  LaunchAction.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('actions/launch', LaunchAction);

  function UrlAction(this: any) {
    this.addInput('exec', LiteGraph.ACTION as any);
    this.addOutput('done', LiteGraph.EVENT as any);
    this.properties = { url: 'https://' };
    this.color = ACTION_COLOR;
    this.bgcolor = ACTION_BG;
    this.size = [220, 52];
  }
  UrlAction.title = 'Открыть URL';
  UrlAction.prototype.onAction = function(this: any) {
    console.log('Action: URL', this.properties.url);
    this.triggerSlot(0);
  };
  UrlAction.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('actions/url', UrlAction);

  function SpeakAction(this: any) {
    this.addInput('exec', LiteGraph.ACTION as any);
    this.addOutput('done', LiteGraph.EVENT as any);
    this.properties = { text: 'Привет!' };
    this.color = ACTION_COLOR;
    this.bgcolor = ACTION_BG;
    this.size = [200, 52];
  }
  SpeakAction.title = 'Озвучить текст';
  SpeakAction.prototype.onAction = function(this: any) {
    console.log('Action: Speak', this.properties.text);
    this.triggerSlot(0);
  };
  SpeakAction.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('actions/speak', SpeakAction);

  function ShellAction(this: any) {
    this.addInput('exec', LiteGraph.ACTION as any);
    this.addOutput('done', LiteGraph.EVENT as any);
    this.properties = { command: 'echo "hello"' };
    this.color = ACTION_COLOR;
    this.bgcolor = ACTION_BG;
    this.size = [220, 52];
  }
  ShellAction.title = 'Команда терминала';
  ShellAction.prototype.onAction = function(this: any) {
    console.log('Action: Shell', this.properties.command);
    this.triggerSlot(0);
  };
  ShellAction.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('actions/shell', ShellAction);

  function DelayLogic(this: any) {
    this.addInput('exec', LiteGraph.ACTION as any);
    this.addOutput('done', LiteGraph.EVENT as any);
    this.properties = { ms: 1000 };
    this.color = LOGIC_COLOR;
    this.bgcolor = LOGIC_BG;
    this.size = [190, 52];
  }
  DelayLogic.title = 'Задержка';
  DelayLogic.prototype.onAction = function(this: any) {
    setTimeout(() => {
      this.triggerSlot(0);
    }, this.properties.ms);
  };
  DelayLogic.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('logic/delay', DelayLogic);

  function IfLogic(this: any) {
    this.addInput('exec', LiteGraph.ACTION as any);
    this.addOutput('true', LiteGraph.EVENT as any);
    this.addOutput('false', LiteGraph.EVENT as any);
    this.properties = { condition: 'true' };
    this.color = LOGIC_COLOR;
    this.bgcolor = LOGIC_BG;
    this.size = [180, 72];
  }
  IfLogic.title = 'Условие (IF)';
  IfLogic.prototype.onAction = function(this: any) {
    let cond = false;
    try {
      const rawStyle = String(this.properties.condition).trim().toLowerCase();
      if (rawStyle === 'true' || rawStyle === '1' || rawStyle === 'yes' || rawStyle === 'on') {
        cond = true;
      } else if (rawStyle === 'false' || rawStyle === '0' || rawStyle === 'no' || rawStyle === 'off') {
        cond = false;
      } else {
        cond = safeEval(rawStyle, {});
      }
    } catch (e) {
      console.error('Failed to parse condition:', e);
      cond = false;
    }
    
    if (cond) {
      this.triggerSlot(0);
    } else {
      this.triggerSlot(1);
    }
  };
  IfLogic.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('logic/if', IfLogic);

  function NotificationAction(this: any) {
    this.addInput('exec', LiteGraph.ACTION as any);
    this.addOutput('done', LiteGraph.EVENT as any);
    this.properties = { title: 'A.R.C. Сигнал', text: 'Уведомление отправлено!' };
    this.color = ACTION_COLOR;
    this.bgcolor = ACTION_BG;
    this.size = [220, 52];
  }
  NotificationAction.title = 'Показать уведомление';
  NotificationAction.prototype.onAction = function(this: any) {
    console.log('Action: Notification', this.properties.title, this.properties.text);
    this.triggerSlot(0);
  };
  NotificationAction.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('actions/notification', NotificationAction);

  function OpenFileAction(this: any) {
    this.addInput('exec', LiteGraph.ACTION as any);
    this.addOutput('done', LiteGraph.EVENT as any);
    this.properties = { path: '' };
    this.color = ACTION_COLOR;
    this.bgcolor = ACTION_BG;
    this.size = [220, 52];
  }
  OpenFileAction.title = 'Открыть файл/папку';
  OpenFileAction.prototype.onAction = function(this: any) {
    console.log('Action: Open File', this.properties.path);
    this.triggerSlot(0);
  };
  OpenFileAction.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('actions/open_file', OpenFileAction);

  function ToggleLogic(this: any) {
    this.addInput('exec', LiteGraph.ACTION as any);
    this.addOutput('Включено (ON)', LiteGraph.EVENT as any);
    this.addOutput('Выключено (OFF)', LiteGraph.EVENT as any);
    this.properties = { state: false };
    this.color = LOGIC_COLOR;
    this.bgcolor = LOGIC_BG;
    this.size = [190, 72];
  }
  ToggleLogic.title = 'Переключатель';
  ToggleLogic.prototype.onAction = function(this: any) {
    this.properties.state = !this.properties.state;
    console.log('Logic: Toggle', this.properties.state);
    if (this.properties.state) {
      this.triggerSlot(0);
    } else {
      this.triggerSlot(1);
    }
  };
  ToggleLogic.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('logic/toggle', ToggleLogic);

  function RandomLogic(this: any) {
    this.addInput('exec', LiteGraph.ACTION as any);
    this.addOutput('Выход A', LiteGraph.EVENT as any);
    this.addOutput('Выход B', LiteGraph.EVENT as any);
    this.properties = { bias: 0.5 };
    this.color = LOGIC_COLOR;
    this.bgcolor = LOGIC_BG;
    this.size = [190, 72];
  }
  RandomLogic.title = 'Рандомизатор';
  RandomLogic.prototype.onAction = function(this: any) {
    const val = Math.random();
    console.log('Logic: Randomizer', val, this.properties.bias);
    if (val < this.properties.bias) {
      this.triggerSlot(0);
    } else {
      this.triggerSlot(1);
    }
  };
  RandomLogic.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('logic/random', RandomLogic);

  function CounterLogic(this: any) {
    this.addInput('exec', LiteGraph.ACTION as any);
    this.addOutput('done', LiteGraph.EVENT as any);
    this.addOutput('limit reached', LiteGraph.EVENT as any);
    this.properties = { limit: 3, resetOnLimit: true };
    this.color = LOGIC_COLOR;
    this.bgcolor = LOGIC_BG;
    this.size = [200, 72];
    this._count = 0;
  }
  CounterLogic.title = 'Счетчик';
  CounterLogic.prototype.onAction = function(this: any) {
    if (this._count === undefined) this._count = 0;
    this._count++;
    console.log('Logic: Counter value:', this._count, 'limit:', this.properties.limit);
    if (this._count >= this.properties.limit) {
      this.triggerSlot(1);
      if (this.properties.resetOnLimit) {
        this._count = 0;
      }
    } else {
      this.triggerSlot(0);
    }
  };
  CounterLogic.prototype.onMouseDown = handleNodeMouseDown;
  LiteGraph.registerNodeType('logic/counter', CounterLogic);
};
