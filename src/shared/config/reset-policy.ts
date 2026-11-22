export type ResetMode = 'ui_settings_and_caches' | 'app_data_and_config';

export interface ResetScopeItem {
  id: string;
  label: string;
  detail: string;
}

export interface ResetScopeDisclosure {
  mode: ResetMode;
  title: string;
  subtitle: string;
  requiresRestart: boolean;
  willDelete: ResetScopeItem[];
  willPreserve: ResetScopeItem[];
}

export interface ResetOptions {
  clearModels?: boolean;
}

export interface ResetFailedTarget {
  target: string;
  error: string;
}

export interface ResetSystemResult {
  success: boolean;
  mode: 'app_data_and_config';
  clearModels: boolean;
  removedTargets: string[];
  preservedAssets: string[];
  failedTargets: ResetFailedTarget[];
  relaunched: boolean;
  error?: string;
}

/**
 * Canonical Variant A reset targets inside portable/userData `dataDir`.
 * Strictly excludes Secret Vault (`secrets.json`), logs (`logs/`, `csp-violations.log`),
 * DB backups (`backups/`), user TTS dictionaries (`tts_dicts/`), TTS privacy policy (`tts-policy.json`),
 * and ML models (`models/`) unless explicitly opted in via `clearModels: true`.
 */
export const APP_DATA_RESET_TARGETS = [
  'database',
  'config',
  'cache',
  'macros',
  'Partitions',
  'Local Storage',
  'IndexedDB',
  'Session Storage',
  'Network',
  'GPUCache',
  'arc.db',
  'arc.db-wal',
  'arc.db-shm',
  'arc.db_fallback.json',
  'arc-performance-settings.json'
] as const;

export const APP_DATA_RESET_OPTIONAL_MODELS_TARGET = 'models' as const;

export const APP_DATA_RESET_LEGACY_DIR_NAMES = ['a.r.c', 'A.R.C', 'arc'] as const;

export const APP_DATA_RESET_PRESERVED_ASSETS = [
  'secrets.json',
  'logs',
  'csp-violations.log',
  'backups',
  'tts_dicts',
  'tts-policy.json'
] as const;

const ALLOWED_RESET_OPTION_KEYS = new Set(['clearModels']);

export function normalizeResetOptions(
  raw: unknown
): { valid: true; options: { clearModels: boolean } } | { valid: false; error: string } {
  if (raw === undefined || raw === null) {
    return { valid: true, options: { clearModels: false } };
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      error: 'Некорректные параметры сброса: ожидается объект с полем clearModels.'
    };
  }

  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_RESET_OPTION_KEYS.has(key)) {
      return {
        valid: false,
        error: `Неподдерживаемый параметр сброса: "${key}".`
      };
    }
  }

  if (record.clearModels !== undefined && typeof record.clearModels !== 'boolean') {
    return {
      valid: false,
      error: 'Параметр clearModels должен иметь логическое значение (boolean).'
    };
  }

  return {
    valid: true,
    options: { clearModels: record.clearModels === true }
  };
}

export function getAppDataPreservedAssetList(options?: ResetOptions): string[] {
  const list: string[] = [...APP_DATA_RESET_PRESERVED_ASSETS];
  if (options?.clearModels !== true) {
    list.push(APP_DATA_RESET_OPTIONAL_MODELS_TARGET);
  }
  return list;
}

export function getUiResetDisclosure(): ResetScopeDisclosure {
  return {
    mode: 'ui_settings_and_caches',
    title: 'Сброс параметров интерфейса и кэшей',
    subtitle: 'Возвращает пользовательские настройки UI к значениям по умолчанию и очищает оперативные кэши без перезапуска приложения.',
    requiresRestart: false,
    willDelete: [
      {
        id: 'ui-settings',
        label: 'Параметры интерфейса и поведения',
        detail: 'Тема, звук, навигация, графика и флаги настроек в settings.store'
      },
      {
        id: 'llm-cache',
        label: 'Оперативный кэш ответов LLM',
        detail: 'Кэшированные ответы одиночных запросов'
      },
      {
        id: 'audio-cache',
        label: 'Кэш синтезированных аудиофраз TTS',
        detail: 'Буфер аудиофраз Silero TTS в памяти и на диске'
      }
    ],
    willPreserve: [
      {
        id: 'sqlite-db',
        label: 'База данных SQLite (arc.db)',
        detail: 'Все диалоги, задачи, долговременная память и цели'
      },
      {
        id: 'configs-macros',
        label: 'Файлы конфигураций и макросы',
        detail: 'Каталоги config/ и macros/, настройки провайдеров ИИ'
      },
      {
        id: 'secret-vault',
        label: 'Secret Vault (API-ключи DPAPI)',
        detail: 'Файл secrets.json не изменяется и не удаляется'
      },
      {
        id: 'logs-backups-models',
        label: 'Логи, резервные копии, словари и модели',
        detail: 'Каталоги logs/, backups/, tts_dicts/, models/, tts-policy.json и статус первичного запуска'
      }
    ]
  };
}

export function getAppDataResetDisclosure(options?: ResetOptions): ResetScopeDisclosure {
  const clearModels = options?.clearModels === true;

  const willDelete: ResetScopeItem[] = [
    {
      id: 'database',
      label: 'База данных SQLite и её файлы',
      detail: 'database/, arc.db, arc.db-wal, arc.db-shm, arc.db_fallback.json (диалоги, задачи, память, цели)'
    },
    {
      id: 'config',
      label: 'Конфигурация приложения и провайдеров',
      detail: 'config/ и arc-performance-settings.json (без Secret Vault)'
    },
    {
      id: 'macros',
      label: 'Пользовательские макросы',
      detail: 'Каталог macros/'
    },
    {
      id: 'cache-session',
      label: 'Кэши и хранилище сессии Chromium',
      detail: 'cache/, Local Storage, Session Storage, IndexedDB, Partitions, Network, GPUCache'
    },
    {
      id: 'legacy-appdata',
      label: 'Устаревшие профили AppData',
      detail: '%APPDATA%/a.r.c, A.R.C, arc (если не пересекаются с текущим каталогом данных)'
    }
  ];

  const willPreserve: ResetScopeItem[] = [
    {
      id: 'secret-vault',
      label: 'Secret Vault с API-ключами (DPAPI)',
      detail: 'secrets.json и карантинные копии secrets.json.corrupt.*.bak сохраняются'
    },
    {
      id: 'logs-audit',
      label: 'Журналы работы и аудита безопасности',
      detail: 'Каталог logs/ и файл csp-violations.log сохраняются'
    },
    {
      id: 'backups',
      label: 'Резервные копии и карантин БД',
      detail: 'Каталог backups/ (pre-migration snapshots и аварийные копии) сохраняется'
    },
    {
      id: 'tts-user-assets',
      label: 'Словари TTS и политика приватности речи',
      detail: 'Каталог tts_dicts/ и файл tts-policy.json сохраняются'
    }
  ];

  const modelsItem: ResetScopeItem = {
    id: 'models',
    label: 'Скачанные локальные ML-модели',
    detail: clearModels
      ? 'Каталог models/ (GGUF, STT, TTS) будет удалён по вашему выбору'
      : 'Каталог models/ (GGUF, STT, TTS) сохраняется без изменений'
  };

  if (clearModels) {
    willDelete.push(modelsItem);
  } else {
    willPreserve.push(modelsItem);
  }

  return {
    mode: 'app_data_and_config',
    title: 'Сброс данных и конфигурации приложения (Вариант A)',
    subtitle: 'Удаляет локальную базу данных, файлы конфигурации, макросы, кэши и профиль Chromium, затем перезапускает A.R.C. Secret Vault и журналы сохраняются.',
    requiresRestart: true,
    willDelete,
    willPreserve
  };
}
