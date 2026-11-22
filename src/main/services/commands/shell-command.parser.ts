import fs from 'fs';
import path from 'path';
import type { ShellExecutionMode, StructuredShellCommand } from '../sandbox/types';

export type ShellCommandInput = string | StructuredShellCommand;

export interface ParsedShellCommand {
  executable: string;
  args: string[];
  cwd?: string;
  purpose?: string;
  shellMode: ShellExecutionMode;
  displayCommand: string;
  rawCommand?: string;
}

export interface ParseShellCommandResult {
  ok: boolean;
  value?: ParsedShellCommand;
  error?: string;
  reason?: string;
}

export interface TokenizeCommandResult {
  ok: boolean;
  tokens?: string[];
  error?: string;
  reason?: string;
}

export interface ExtractExecutableResult {
  ok: boolean;
  executable?: string;
  reason?: string;
}

export interface ValidateCwdResult {
  ok: boolean;
  cwd?: string;
  error?: string;
  reason?: string;
}

const CONTROL_OR_NEWLINE_REGEX = /[\0\r\n]/;
const SHELL_METACHAR_REGEX = /[;|&><`]/;
const SUBSHELL_OR_VAR_EXPANSION_REGEX = /\$\(|\$\{/;

export function containsShellMetacharacters(input: string): boolean {
  if (!input) return false;
  return (
    CONTROL_OR_NEWLINE_REGEX.test(input) ||
    SHELL_METACHAR_REGEX.test(input) ||
    SUBSHELL_OR_VAR_EXPANSION_REGEX.test(input)
  );
}

/**
 * Splits a legacy command string into [executable, ...args] respecting single and double quotes.
 * Rejects control chars, newlines, unclosed quotes, and shell metacharacters.
 */
export function tokenizeSafeCommandString(rawCommand: string): TokenizeCommandResult {
  if (typeof rawCommand !== 'string') {
    return { ok: false, error: 'Command must be a string or structured payload', reason: 'invalid_command_type' };
  }

  const trimmed = rawCommand.trim();
  if (!trimmed) {
    return { ok: false, error: 'Command is empty', reason: 'empty_command' };
  }

  if (CONTROL_OR_NEWLINE_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: 'Command contains disallowed control or newline characters',
      reason: 'shell_control_characters_not_allowed'
    };
  }

  if (containsShellMetacharacters(trimmed)) {
    return {
      ok: false,
      error: 'Shell metacharacters (;, |, &, >, <, `, $(, ${) are blocked in safe execution mode',
      reason: 'shell_metacharacters_not_allowed'
    };
  }

  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let tokenStarted = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < trimmed.length) {
        const next = trimmed[i + 1];
        if (next === '"' || next === '\\') {
          current += next;
          i++;
          continue;
        }
      }
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(ch)) {
      if (tokenStarted) {
        tokens.push(current);
        current = '';
        tokenStarted = false;
      }
      continue;
    }

    current += ch;
    tokenStarted = true;
  }

  if (quote !== null) {
    return {
      ok: false,
      error: 'Command contains unclosed quote',
      reason: 'unclosed_quote'
    };
  }

  if (tokenStarted) {
    tokens.push(current);
  }

  if (tokens.length === 0 || !tokens[0].trim()) {
    return { ok: false, error: 'Command executable is missing', reason: 'empty_command' };
  }

  return { ok: true, tokens };
}

export function extractExecutableToken(input: ShellCommandInput): ExtractExecutableResult {
  if (typeof input === 'string') {
    const tokenized = tokenizeSafeCommandString(input);
    if (!tokenized.ok || !tokenized.tokens || tokenized.tokens.length === 0) {
      return { ok: false, reason: tokenized.reason };
    }
    return { ok: true, executable: tokenized.tokens[0] };
  }

  if (!input || typeof input !== 'object' || typeof input.executable !== 'string') {
    return { ok: false, reason: 'invalid_command_payload' };
  }

  const trimmedExec = input.executable.trim();
  if (!trimmedExec) {
    return { ok: false, reason: 'empty_executable' };
  }
  if (containsShellMetacharacters(trimmedExec) || /\s/.test(trimmedExec)) {
    return { ok: false, reason: 'invalid_executable_token' };
  }
  return { ok: true, executable: trimmedExec };
}

export function validateWorkingDirectory(cwd?: string): ValidateCwdResult {
  if (cwd === undefined) {
    return { ok: true, cwd: undefined };
  }
  if (typeof cwd !== 'string' || !cwd.trim()) {
    return { ok: false, error: 'Working directory must be a non-empty string', reason: 'invalid_cwd' };
  }
  if (CONTROL_OR_NEWLINE_REGEX.test(cwd)) {
    return { ok: false, error: 'Working directory contains invalid control characters', reason: 'invalid_cwd' };
  }

  const resolved = path.resolve(cwd.trim());
  try {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      return { ok: false, error: 'Working directory must be an existing non-symlink directory', reason: 'invalid_cwd' };
    }
    const canonical = fs.realpathSync(resolved);
    return { ok: true, cwd: canonical };
  } catch {
    return { ok: false, error: `Working directory does not exist: ${resolved}`, reason: 'cwd_not_found' };
  }
}

function formatDisplayCommand(executable: string, args: string[]): string {
  const quoteArg = (value: string): string => (/[\s"']/u.test(value) ? JSON.stringify(value) : value);
  return [quoteArg(executable), ...args.map(quoteArg)].join(' ');
}

export function parseShellCommand(
  input: ShellCommandInput,
  options?: { allowUnsafeRawShell?: boolean; cwd?: string }
): ParseShellCommandResult {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return { ok: false, error: 'Command is empty', reason: 'empty_command' };
    }

    if (options?.allowUnsafeRawShell) {
      if (CONTROL_OR_NEWLINE_REGEX.test(trimmed)) {
        return {
          ok: false,
          error: 'Unsafe raw shell command contains control or newline characters',
          reason: 'shell_control_characters_not_allowed'
        };
      }
      const cwdCheck = validateWorkingDirectory(options.cwd);
      if (!cwdCheck.ok) {
        return { ok: false, error: cwdCheck.error, reason: cwdCheck.reason };
      }
      const roughExec = trimmed.split(/\s+/)[0]?.replace(/^['"]|['"]$/g, '') || '';
      return {
        ok: true,
        value: {
          executable: roughExec,
          args: [],
          cwd: cwdCheck.cwd,
          shellMode: 'unsafe_raw_shell',
          displayCommand: trimmed,
          rawCommand: trimmed
        }
      };
    }

    const tokenized = tokenizeSafeCommandString(trimmed);
    if (!tokenized.ok || !tokenized.tokens) {
      return { ok: false, error: tokenized.error, reason: tokenized.reason };
    }

    const cwdCheck = validateWorkingDirectory(options?.cwd);
    if (!cwdCheck.ok) {
      return { ok: false, error: cwdCheck.error, reason: cwdCheck.reason };
    }

    const [executable, ...args] = tokenized.tokens;
    return {
      ok: true,
      value: {
        executable,
        args,
        cwd: cwdCheck.cwd,
        shellMode: 'direct',
        displayCommand: formatDisplayCommand(executable, args)
      }
    };
  }

  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Invalid command payload', reason: 'invalid_command_payload' };
  }

  if (input.unsafeRawShell && !options?.allowUnsafeRawShell) {
    return {
      ok: false,
      error: 'Unsafe raw shell execution mode is disabled by caller contract',
      reason: 'unsafe_raw_shell_not_enabled'
    };
  }

  const execRaw = typeof input.executable === 'string' ? input.executable.trim() : '';
  if (!execRaw) {
    return { ok: false, error: 'Executable is required', reason: 'empty_executable' };
  }
  if (CONTROL_OR_NEWLINE_REGEX.test(execRaw) || SHELL_METACHAR_REGEX.test(execRaw) || /\s/.test(execRaw)) {
    return {
      ok: false,
      error: 'Executable contains invalid whitespace or shell metacharacters',
      reason: 'invalid_executable_token'
    };
  }

  const rawArgs = input.args ?? [];
  if (!Array.isArray(rawArgs)) {
    return { ok: false, error: 'Command arguments must be an array of strings', reason: 'invalid_args' };
  }

  const args: string[] = [];
  for (const arg of rawArgs) {
    if (typeof arg !== 'string') {
      return { ok: false, error: 'Each command argument must be a string', reason: 'invalid_arg_type' };
    }
    if (CONTROL_OR_NEWLINE_REGEX.test(arg)) {
      return {
        ok: false,
        error: 'Command argument contains disallowed control or newline characters',
        reason: 'shell_control_characters_not_allowed'
      };
    }
    args.push(arg);
  }

  const cwdCheck = validateWorkingDirectory(input.cwd ?? options?.cwd);
  if (!cwdCheck.ok) {
    return { ok: false, error: cwdCheck.error, reason: cwdCheck.reason };
  }

  return {
    ok: true,
    value: {
      executable: execRaw,
      args,
      cwd: cwdCheck.cwd,
      purpose: typeof input.purpose === 'string' ? input.purpose.trim() || undefined : undefined,
      shellMode: 'direct',
      displayCommand: formatDisplayCommand(execRaw, args)
    }
  };
}
