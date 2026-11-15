export interface HotkeyCandidate {
  id: string;
  label?: string;
  category?: string;
  keys?: string[];
}

export interface HotkeyConflictCommand {
  id: string;
  label: string;
  category?: string;
  rawCombos: string[];
}

export interface HotkeyConflict {
  normalizedCombo: string;
  displayCombo: string;
  commands: HotkeyConflictCommand[];
}

export interface HotkeyConflictReport {
  checkedCount: number;
  conflicts: HotkeyConflict[];
  conflictsByCommandId: Record<string, string[]>;
}

const MODIFIER_ORDER = ['Control', 'Meta', 'Shift', 'Alt'] as const;
type CanonicalModifier = (typeof MODIFIER_ORDER)[number];

const MODIFIER_ALIASES: Record<string, CanonicalModifier> = {
  ctrl: 'Control',
  control: 'Control',
  cmd: 'Meta',
  command: 'Meta',
  meta: 'Meta',
  win: 'Meta',
  windows: 'Meta',
  super: 'Meta',
  shift: 'Shift',
  alt: 'Alt',
  option: 'Alt',
  opt: 'Alt'
};

const KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  spacebar: 'space',
  esc: 'escape',
  ret: 'enter',
  return: 'enter',
  del: 'delete'
};

export function normalizeHotkeyCombo(combo: string): string | null {
  if (typeof combo !== 'string') return null;
  if (!combo.trim()) return null;

  const rawParts = combo
    .split('+')
    .map((p) => (p === ' ' ? ' ' : p.trim()))
    .filter((p) => p.length > 0);
  if (rawParts.length === 0) return null;

  const modifiers = new Set<CanonicalModifier>();
  const primaryKeys: string[] = [];

  for (const part of rawParts) {
    const lower = part.toLowerCase();
    const mappedModifier = MODIFIER_ALIASES[lower];
    if (mappedModifier) {
      modifiers.add(mappedModifier);
    } else {
      primaryKeys.push(KEY_ALIASES[lower] ?? lower);
    }
  }

  // Malformed: modifiers only without a primary key, or multiple non-modifier keys
  if (primaryKeys.length !== 1) {
    return null;
  }

  const orderedModifiers = MODIFIER_ORDER.filter((mod) => modifiers.has(mod));
  return [...orderedModifiers, primaryKeys[0]].join('+');
}

export function formatNormalizedComboDisplay(normalizedCombo: string): string {
  return normalizedCombo
    .split('+')
    .map((part) => {
      if (part === 'Control') return 'Ctrl';
      if (part === 'Meta') return 'Cmd/Win';
      if (part === 'Shift' || part === 'Alt') return part;
      return part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1);
    })
    .join(' + ');
}

export function detectHotkeyConflicts(hotkeys: HotkeyCandidate[]): HotkeyConflictReport {
  const byNormalizedCombo = new Map<string, Map<string, HotkeyConflictCommand>>();

  for (const hk of hotkeys || []) {
    if (!hk || !hk.id || !Array.isArray(hk.keys)) continue;

    // Group unique normalized combos within the same command ID so alternative
    // combos on the same command never cause a false self-conflict.
    const uniqueCombosForCommand = new Map<string, Set<string>>();
    for (const rawKey of hk.keys) {
      const normalized = normalizeHotkeyCombo(rawKey);
      if (!normalized) continue;
      if (!uniqueCombosForCommand.has(normalized)) {
        uniqueCombosForCommand.set(normalized, new Set());
      }
      uniqueCombosForCommand.get(normalized)!.add(rawKey.trim());
    }

    for (const [normalized, rawSet] of uniqueCombosForCommand.entries()) {
      if (!byNormalizedCombo.has(normalized)) {
        byNormalizedCombo.set(normalized, new Map());
      }
      byNormalizedCombo.get(normalized)!.set(hk.id, {
        id: hk.id,
        label: hk.label || hk.id,
        category: hk.category,
        rawCombos: Array.from(rawSet)
      });
    }
  }

  const conflicts: HotkeyConflict[] = [];
  const conflictsByCommandId: Record<string, string[]> = {};

  for (const [normalizedCombo, cmdMap] of byNormalizedCombo.entries()) {
    if (cmdMap.size < 2) continue;
    const commands = Array.from(cmdMap.values());
    conflicts.push({
      normalizedCombo,
      displayCombo: formatNormalizedComboDisplay(normalizedCombo),
      commands
    });
    for (const cmd of commands) {
      if (!conflictsByCommandId[cmd.id]) {
        conflictsByCommandId[cmd.id] = [];
      }
      if (!conflictsByCommandId[cmd.id].includes(normalizedCombo)) {
        conflictsByCommandId[cmd.id].push(normalizedCombo);
      }
    }
  }

  return {
    checkedCount: Array.isArray(hotkeys) ? hotkeys.length : 0,
    conflicts,
    conflictsByCommandId
  };
}
