import { defineStore } from 'pinia';

export type LogLevel = 'INFO' | 'VOICE' | 'EXEC' | 'WARN' | 'ERROR';

export interface TerminalLog {
  id: string;
  timestamp: Date | string | number;
  level: LogLevel;
  message: string;
  details?: any;
}

export const useTerminalStore = defineStore('terminal', {
  state: () => ({
    logs: [] as TerminalLog[],
    isTerminalVisible: false,
    filter: 'ALL' as LogLevel | 'ALL'
  }),
  actions: {
    addLog(level: LogLevel, message: string, details?: any) {
      const log: TerminalLog = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level,
        message,
        details
      };
      this.logs.push(log);
      if (this.logs.length > 500) {
        this.logs.shift(); // Keep max 500 logs
      }
    },
    clearLogs() {
      this.logs = [];
    },
    toggleTerminal() {
      this.isTerminalVisible = !this.isTerminalVisible;
    },
    setFilter(filter: LogLevel | 'ALL') {
      this.filter = filter;
    }
  },
  getters: {
    filteredLogs: (state) => {
      if (state.filter === 'ALL') return state.logs;
      return state.logs.filter(log => log.level === state.filter);
    }
  }
});
