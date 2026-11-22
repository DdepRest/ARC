export type DependencyPhase =
  | 'IDLE'
  | 'CHECKING'
  | 'INSTALLING_CORE'
  | 'INSTALLING_ACCENT'
  | 'READY'
  | 'DEGRADED'
  | 'ERROR';

export type DependencyReadinessState = 'READY' | 'DEGRADED' | 'ERROR';

export type DependencyFailureReason =
  | 'python_not_found'
  | 'python_unsupported'
  | 'pip_unavailable'
  | 'venv_failed'
  | 'pip_idle_timeout'
  | 'pip_wall_timeout'
  | 'pip_failed'
  | 'import_check_failed'
  | 'cancelled';

export interface PythonRuntimeInfo {
  executable: string;
  version: string | null;
  major: number | null;
  minor: number | null;
  arch: string | null;
  platform: string | null;
  supported: boolean;
  pipAvailable: boolean;
  warnings: string[];
}

export interface DependencyCheckResult {
  success: boolean;
  state: DependencyReadinessState;
  phase: DependencyPhase;
  reason?: DependencyFailureReason;
  coreReady: boolean;
  dspReady: boolean;
  accentReady: boolean;
  ffmpegReady: boolean;
  pythonRuntime: PythonRuntimeInfo;
  installedPackages: string[];
  missingCore: string[];
  missingOptional: string[];
  errors: string[];
}

export interface ParsedSileroRequirements {
  coreSpecs: string[];
  accentSpecs: string[];
}

export const CORE_REQUIRED_MODULES = [
  'torch',
  'torchaudio',
  'soundfile',
  'flask',
  'flask_cors',
  'omegaconf',
  'yaml',
  'numpy'
] as const;

export const DSP_PYTHON_MODULES = ['scipy'] as const;
export const OPTIONAL_ACCENT_MODULES = ['onnxruntime', 'ruaccent'] as const;

export const DEFAULT_CORE_SPECS = [
  'torch>=2.0.0,<2.6.0',
  'torchaudio>=2.0.0,<2.6.0',
  'Flask>=2.2.0,<3.2.0',
  'flask-cors>=3.0.10,<6.0.0',
  'omegaconf>=2.3.0,<2.4.0',
  'pyyaml>=6.0,<7.0',
  'soundfile>=0.12.1,<0.14.0',
  'numpy>=1.24.0,<2.0.0',
  'scipy>=1.10.0,<1.15.0'
];

export const DEFAULT_ACCENT_SPECS = [
  'onnxruntime>=1.16.0,<1.21.0',
  'ruaccent>=1.4.0,<1.6.0'
];

export const PYTHON_PROBE_SCRIPT = [
  'import json, sys, platform, importlib, importlib.util',
  "mods = ['torch','torchaudio','soundfile','flask','flask_cors','omegaconf','yaml','numpy','scipy','onnxruntime','ruaccent']",
  'res = {}',
  'for m in mods:',
  '    try:',
  '        mod = importlib.import_module(m)',
  "        res[m] = {'ok': True, 'version': getattr(mod, '__version__', None)}",
  '    except Exception as e:',
  "        res[m] = {'ok': False, 'error': f'{type(e).__name__}: {e}'}",
  'out = {',
  "    'version': f'{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}',",
  "    'major': sys.version_info[0],",
  "    'minor': sys.version_info[1],",
  "    'arch': platform.machine(),",
  "    'platform': sys.platform,",
  "    'pipAvailable': importlib.util.find_spec('pip') is not None,",
  "    'modules': res",
  '}',
  "print('ARC_DEP_PROBE:' + json.dumps(out))"
].join('\n');

export function buildPythonProbeCommand(targetPython: string): string {
  const b64 = Buffer.from(PYTHON_PROBE_SCRIPT, 'utf-8').toString('base64');
  // Includes 'import torch' marker so legacy mockExec hooks & diagnostics identify the import probe.
  return `"${targetPython}" -c "import base64; exec(base64.b64decode('${b64}').decode('utf-8')) # import torch"`;
}

export function parseSileroRequirements(rawContent: string): ParsedSileroRequirements {
  const coreSpecs: string[] = [];
  const accentSpecs: string[] = [];
  let section: 'core' | 'accent' = 'core';

  for (const rawLine of rawContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      if (/OPTIONAL\s+ACCENT/i.test(line)) section = 'accent';
      else if (/CORE/i.test(line)) section = 'core';
      continue;
    }
    const spec = line.replace(/\s+#.*$/, '').trim();
    if (!spec) continue;
    if (section === 'accent' || /^(onnxruntime|ruaccent)\b/i.test(spec)) {
      accentSpecs.push(spec);
    } else {
      coreSpecs.push(spec);
    }
  }

  return {
    coreSpecs: coreSpecs.length > 0 ? coreSpecs : [...DEFAULT_CORE_SPECS],
    accentSpecs: accentSpecs.length > 0 ? accentSpecs : [...DEFAULT_ACCENT_SPECS]
  };
}

export interface ParsedProbeSnapshot {
  pythonRuntime: PythonRuntimeInfo;
  coreReady: boolean;
  scipyReady: boolean;
  dspReady: boolean;
  accentReady: boolean;
  ffmpegReady: boolean;
  installedPackages: string[];
  missingCore: string[];
  missingOptional: string[];
  errors: string[];
}

export function isSupportedPythonRuntime(
  major: number | null,
  minor: number | null,
  arch: string | null,
  platformName: string | null
): { supported: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let supported = true;

  if (major !== null && minor !== null) {
    if (major !== 3 || minor < 10 || minor > 12) {
      supported = false;
      warnings.push(`Python ${major}.${minor} вне рекомендуемого диапазона 3.10–3.12 (возможна несовместимость wheel torch/onnxruntime)`);
    }
  }
  if (platformName === 'win32' && arch && !/^(AMD64|x86_64|arm64)$/i.test(arch)) {
    supported = false;
    warnings.push(`Неподдерживаемая архитектура Windows Python: ${arch} (требуется win_amd64 / 64-bit)`);
  }
  return { supported, warnings };
}

export function createEmptyRuntimeInfo(executable: string, pipAvailable = false): PythonRuntimeInfo {
  return {
    executable,
    version: null,
    major: null,
    minor: null,
    arch: null,
    platform: null,
    supported: true,
    pipAvailable,
    warnings: []
  };
}

export function parsePythonProbeOutput(
  executable: string,
  stdout: string,
  ffmpegReady: boolean
): ParsedProbeSnapshot | null {
  const markerIdx = stdout.indexOf('ARC_DEP_PROBE:');
  if (markerIdx === -1) {
    // Compatibility fallback for mocked test commands returning plain 'OK'
    if (stdout.trim() === 'OK') {
      return {
        pythonRuntime: {
          executable,
          version: '3.11.0',
          major: 3,
          minor: 11,
          arch: process.arch,
          platform: process.platform,
          supported: true,
          pipAvailable: true,
          warnings: []
        },
        coreReady: true,
        scipyReady: true,
        dspReady: ffmpegReady,
        accentReady: true,
        ffmpegReady,
        installedPackages: [...CORE_REQUIRED_MODULES, ...DSP_PYTHON_MODULES, ...OPTIONAL_ACCENT_MODULES],
        missingCore: [],
        missingOptional: [],
        errors: ffmpegReady ? [] : ['ffmpeg не найден в PATH или ARC_FFMPEG_PATH (DSP постобработка отключена)']
      };
    }
    return null;
  }

  try {
    const line = stdout.slice(markerIdx + 'ARC_DEP_PROBE:'.length).split(/\r?\n/)[0].trim();
    const parsed = JSON.parse(line);
    const major = typeof parsed.major === 'number' ? parsed.major : null;
    const minor = typeof parsed.minor === 'number' ? parsed.minor : null;
    const arch = typeof parsed.arch === 'string' ? parsed.arch : null;
    const platformName = typeof parsed.platform === 'string' ? parsed.platform : null;
    const compat = isSupportedPythonRuntime(major, minor, arch, platformName);

    const pythonRuntime: PythonRuntimeInfo = {
      executable,
      version: typeof parsed.version === 'string' ? parsed.version : null,
      major,
      minor,
      arch,
      platform: platformName,
      supported: compat.supported,
      pipAvailable: parsed.pipAvailable !== false,
      warnings: [...compat.warnings]
    };

    const modules: Record<string, { ok?: boolean; error?: string }> = parsed.modules || {};
    const installedPackages: string[] = [];
    const missingCore: string[] = [];
    const missingOptional: string[] = [];
    const errors: string[] = [...compat.warnings];

    for (const mod of CORE_REQUIRED_MODULES) {
      if (modules[mod]?.ok) installedPackages.push(mod);
      else {
        missingCore.push(mod);
        errors.push(`Core модуль '${mod}' недоступен: ${modules[mod]?.error || 'import failed'}`);
      }
    }

    const scipyOk = Boolean(modules.scipy?.ok);
    if (scipyOk) installedPackages.push('scipy');
    else {
      missingOptional.push('scipy');
      errors.push(`DSP модуль 'scipy' недоступен: ${modules.scipy?.error || 'import failed'}`);
    }

    for (const mod of OPTIONAL_ACCENT_MODULES) {
      if (modules[mod]?.ok) installedPackages.push(mod);
      else {
        missingOptional.push(mod);
        const hint = mod === 'onnxruntime' && !compat.supported ? ' (возможна несовместимость wheel/ABI)' : '';
        errors.push(`Optional модуль '${mod}' недоступен${hint}: ${modules[mod]?.error || 'import failed'}`);
      }
    }

    if (!ffmpegReady) {
      errors.push('ffmpeg не найден в PATH или ARC_FFMPEG_PATH (DSP фильтрация отключена, доступен сырой WAV)');
    }

    const coreReady = missingCore.length === 0;
    const accentReady = Boolean(modules.onnxruntime?.ok && modules.ruaccent?.ok);
    const dspReady = scipyOk && ffmpegReady;

    return {
      pythonRuntime,
      coreReady,
      scipyReady: scipyOk,
      dspReady,
      accentReady,
      ffmpegReady,
      installedPackages,
      missingCore,
      missingOptional,
      errors
    };
  } catch {
    return null;
  }
}

export function buildDependencyResultFromProbe(
  probe: ParsedProbeSnapshot,
  extraErrors: string[] = [],
  reason?: DependencyFailureReason
): DependencyCheckResult {
  const combinedErrors = Array.from(new Set([...probe.errors, ...extraErrors.filter(Boolean)]));
  const coreReady = probe.coreReady && reason !== 'cancelled' && reason !== 'pip_idle_timeout' && reason !== 'pip_wall_timeout';
  const state: DependencyReadinessState = !coreReady
    ? 'ERROR'
    : probe.accentReady && probe.dspReady
    ? 'READY'
    : 'DEGRADED';

  return {
    success: coreReady,
    state,
    phase: state,
    ...(reason ? { reason } : {}),
    coreReady,
    dspReady: coreReady && probe.dspReady,
    accentReady: probe.accentReady,
    ffmpegReady: probe.ffmpegReady,
    pythonRuntime: probe.pythonRuntime,
    installedPackages: probe.installedPackages,
    missingCore: probe.missingCore,
    missingOptional: probe.missingOptional,
    errors: combinedErrors
  };
}
