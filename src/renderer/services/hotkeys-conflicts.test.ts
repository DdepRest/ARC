import { describe, it, expect } from 'vitest';
import {
  normalizeHotkeyCombo,
  formatNormalizedComboDisplay,
  detectHotkeyConflicts
} from './hotkeys-conflicts';

describe('normalizeHotkeyCombo', () => {
  it('normalizes case, whitespace, modifier aliases, and canonical modifier ordering', () => {
    expect(normalizeHotkeyCombo('shift + Ctrl + k')).toBe('Control+Shift+k');
    expect(normalizeHotkeyCombo('CONTROL+SHIFT+K')).toBe('Control+Shift+k');
    expect(normalizeHotkeyCombo('option + cmd + Return')).toBe('Meta+Alt+enter');
    expect(normalizeHotkeyCombo('Win + Alt +  Spacebar')).toBe('Meta+Alt+space');
    expect(normalizeHotkeyCombo('Esc')).toBe('escape');
  });

  it('returns null for empty, whitespace, or malformed combos', () => {
    expect(normalizeHotkeyCombo('')).toBeNull();
    expect(normalizeHotkeyCombo('   ')).toBeNull();
    expect(normalizeHotkeyCombo('Ctrl+Shift')).toBeNull();
    expect(normalizeHotkeyCombo('Ctrl+a+b')).toBeNull();
  });

  it('formats normalized combos for readable UI output', () => {
    expect(formatNormalizedComboDisplay('Control+Shift+space')).toBe('Ctrl + Shift + Space');
    expect(formatNormalizedComboDisplay('Meta+Alt+k')).toBe('Cmd/Win + Alt + K');
  });
});

describe('detectHotkeyConflicts', () => {
  it('reports zero conflicts when all commands have distinct normalized bindings', () => {
    const report = detectHotkeyConflicts([
      { id: 'voice-ptt', label: 'Push-to-Talk', keys: ['Ctrl+Space'] },
      { id: 'focus-input', label: 'Focus Command Bar', keys: ['Ctrl+K'] },
      { id: 'abort', label: 'Abort AI', keys: ['Esc'] }
    ]);

    expect(report.checkedCount).toBe(3);
    expect(report.conflicts).toEqual([]);
    expect(report.conflictsByCommandId).toEqual({});
  });

  it('ignores duplicate or differently cased alternative bindings within the SAME command id', () => {
    const report = detectHotkeyConflicts([
      {
        id: 'focus-input',
        label: 'Focus Command Bar',
        keys: ['Ctrl+K', 'control+k', 'Cmd+K', 'Meta+k']
      },
      {
        id: 'open-settings',
        label: 'Settings',
        keys: ['Ctrl+,']
      }
    ]);

    expect(report.conflicts).toHaveLength(0);
    expect(report.conflictsByCommandId).toEqual({});
  });

  it('detects collisions across DIFFERENT command ids regardless of modifier order or alias', () => {
    const report = detectHotkeyConflicts([
      { id: 'cmd-alpha', label: 'Command Alpha', category: 'Voice', keys: ['Shift + Ctrl + Spacebar'] },
      { id: 'cmd-beta', label: 'Command Beta', category: 'Navigation', keys: ['control+shift+ '] },
      { id: 'cmd-gamma', label: 'Command Gamma', category: 'System', keys: ['Alt+F4'] }
    ]);

    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].normalizedCombo).toBe('Control+Shift+space');
    expect(report.conflicts[0].displayCombo).toBe('Ctrl + Shift + Space');
    expect(report.conflicts[0].commands.map((c) => c.id)).toEqual(['cmd-alpha', 'cmd-beta']);
    expect(report.conflictsByCommandId['cmd-alpha']).toEqual(['Control+Shift+space']);
    expect(report.conflictsByCommandId['cmd-beta']).toEqual(['Control+Shift+space']);
    expect(report.conflictsByCommandId['cmd-gamma']).toBeUndefined();
  });
});
