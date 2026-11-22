import datetime
import json
import os
import re
import sqlite3
import threading
import urllib.request
from functools import lru_cache

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Active resolved paths (recomputed on init / reload without relying on os.getcwd())
DICTS_DIR = ''
USER_DICTS_DIR = ''
LOGS_DIR = ''
IT_DICT_PATH = ''
ABBR_DICT_PATH = ''
HOMO_DICT_PATH = ''
CMU_DB_PATH = ''
USER_CMU_DB_PATH = ''
UNKNOWN_WORDS_LOG = ''

# In-memory stores
_it_dict_compiled = []
_it_dict_raw = {}
_abbreviations = {}
_homographs = {}
_cmu_conn = None
_cmu_lock = threading.Lock()
_cmu_mode = 'none'  # 'read_only_bundled' | 'writable_user' | 'none'
_active_cmu_db_path = ''
_cmu_db_ready = False
_unknown_words = set()
_unknown_words_lock = threading.Lock()

_diagnostics_lock = threading.Lock()
_diagnostics = {
    'state': 'ERROR',
    'bundledDir': '',
    'userDir': '',
    'logsDir': '',
    'activeCmuDbPath': '',
    'cmuDbReady': False,
    'cmuDbMode': 'none',
    'bundledCounts': {
        'it': 0,
        'abbreviations': 0,
        'homographs': 0,
        'totalFilesLoaded': 0,
    },
    'userOverrideCounts': {
        'it': 0,
        'abbreviations': 0,
        'homographs': 0,
        'totalOverrides': 0,
    },
    'effectiveCounts': {
        'it': 0,
        'abbreviations': 0,
        'homographs': 0,
    },
    'files': {},
    'errors': [],
    'lastLoadedAt': None,
    'lastReloadResult': None,
}


def _now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _default_user_data_base():
    appdata = os.environ.get('APPDATA', '').strip()
    if appdata:
        return os.path.join(appdata, 'A.R.C.')
    xdg = os.environ.get('XDG_CONFIG_HOME', '').strip()
    if xdg:
        return os.path.join(xdg, 'A.R.C.')
    return os.path.join(os.path.expanduser('~'), '.config', 'A.R.C.')


def _resolve_paths():
    global DICTS_DIR, USER_DICTS_DIR, LOGS_DIR
    global IT_DICT_PATH, ABBR_DICT_PATH, HOMO_DICT_PATH
    global CMU_DB_PATH, USER_CMU_DB_PATH, UNKNOWN_WORDS_LOG

    env_bundled = os.environ.get('ARC_TTS_DICTS_DIR', '').strip()
    if env_bundled:
        DICTS_DIR = os.path.abspath(env_bundled)
    else:
        candidates = [
            os.path.join(_SCRIPT_DIR, 'Voice', 'dicts'),
            os.path.join(os.path.dirname(_SCRIPT_DIR), 'Voice', 'dicts'),
            os.path.join(_SCRIPT_DIR, 'app.asar.unpacked', 'Voice', 'dicts'),
        ]
        chosen = next((os.path.abspath(c) for c in candidates if os.path.isdir(c)), None)
        DICTS_DIR = chosen or os.path.abspath(candidates[0])

    env_user = os.environ.get('ARC_TTS_USER_DICTS_DIR', '').strip()
    USER_DICTS_DIR = os.path.abspath(env_user) if env_user else os.path.join(_default_user_data_base(), 'tts_dicts')

    env_logs = os.environ.get('ARC_TTS_LOGS_DIR', '').strip()
    LOGS_DIR = os.path.abspath(env_logs) if env_logs else os.path.join(_default_user_data_base(), 'logs')

    IT_DICT_PATH = os.path.join(DICTS_DIR, 'tts_dict_it.json')
    ABBR_DICT_PATH = os.path.join(DICTS_DIR, 'tts_dict_abbreviations.json')
    HOMO_DICT_PATH = os.path.join(DICTS_DIR, 'tts_dict_homographs.json')
    CMU_DB_PATH = os.path.join(DICTS_DIR, 'tts_pronunciation.db')
    USER_CMU_DB_PATH = os.path.join(USER_DICTS_DIR, 'tts_pronunciation.db')
    UNKNOWN_WORDS_LOG = os.path.join(LOGS_DIR, 'tts_unknown_words.log')


def _load_json_entries(path, source_label):
    if not path or not os.path.exists(path):
        return {}, False, None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            return {}, True, f"{source_label} ({os.path.basename(path)}): expected JSON object"

        if 'data' in raw:
            entries = raw.get('data')
            if not isinstance(entries, dict):
                return {}, True, f"{source_label} ({os.path.basename(path)}): 'data' must be an object"
        elif source_label == 'user':
            entries = {
                k: v for k, v in raw.items()
                if isinstance(k, str) and isinstance(v, str)
            }
        else:
            entries = {}

        cleaned = {}
        for key, val in entries.items():
            if isinstance(key, str) and key and isinstance(val, str):
                cleaned[key] = val
        return cleaned, True, None
    except Exception as e:
        return {}, True, f"{source_label} ({os.path.basename(path)}): {e}"


def _build_readonly_uri(db_path):
    abs_path = os.path.abspath(db_path)
    file_url = urllib.request.pathname2url(abs_path)
    if not file_url.startswith('/'):
        file_url = '/' + file_url
    return f"file://{file_url}?immutable=1"


def _create_user_cmu_db_from_dicts(merged_it, merged_abbr, merged_homo):
    global _cmu_conn, _cmu_mode, _active_cmu_db_path
    if not USER_CMU_DB_PATH:
        return False, 'User dictionary directory is not configured'

    if _cmu_conn:
        try:
            _cmu_conn.close()
        except Exception:
            pass
        _cmu_conn = None

    try:
        os.makedirs(os.path.dirname(USER_CMU_DB_PATH), exist_ok=True)
    except Exception as dir_err:
        return False, f"Cannot create user dict dir for CMU DB: {dir_err}"

    if os.path.exists(USER_CMU_DB_PATH):
        try:
            import shutil
            shutil.copy2(USER_CMU_DB_PATH, USER_CMU_DB_PATH + '.bak')
        except Exception as bak_err:
            print(f"[TTS Dict Loader] Warning: could not backup {USER_CMU_DB_PATH}: {bak_err}", flush=True)

    for suffix in ['', '-wal', '-shm']:
        fpath = USER_CMU_DB_PATH + suffix
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
            except Exception as rem_err:
                print(f"[TTS Dict Loader] Warning: could not remove {fpath}: {rem_err}", flush=True)

    try:
        conn = sqlite3.connect(USER_CMU_DB_PATH, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, translit TEXT)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_words_word ON words(word)")

        for entries in (merged_it, merged_abbr, merged_homo):
            for word, translit in entries.items():
                if not word or not translit:
                    continue
                clean_word = word.replace('\\b', '').replace('\b', '').strip().lower()
                if clean_word:
                    cursor.execute(
                        'INSERT OR REPLACE INTO words (word, translit) VALUES (?, ?)',
                        (clean_word, str(translit).strip())
                    )

        conn.commit()
        _cmu_conn = conn
        _cmu_mode = 'writable_user'
        _active_cmu_db_path = USER_CMU_DB_PATH
        return True, None
    except Exception as init_err:
        if _cmu_conn:
            try:
                _cmu_conn.close()
            except Exception:
                pass
            _cmu_conn = None
        _cmu_mode = 'none'
        _active_cmu_db_path = ''
        return False, f"Failed to initialize writable user CMU DB: {init_err}"


def _open_readonly_bundled_db(db_path):
    uri = _build_readonly_uri(db_path)
    conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    conn.execute("PRAGMA query_only = ON;")
    cursor = conn.cursor()
    cursor.execute("PRAGMA quick_check;")
    qc = cursor.fetchone()
    if not qc or qc[0] != "ok":
        conn.close()
        raise sqlite3.DatabaseError(f"quick_check failed: {qc[0] if qc else 'unknown'}")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='words'")
    if cursor.fetchone() is None:
        conn.close()
        raise sqlite3.DatabaseError("missing 'words' table")
    return conn


def _init_cmu_db(merged_it, merged_abbr, merged_homo):
    global _cmu_conn, _cmu_mode, _active_cmu_db_path, _cmu_db_ready
    errors = []

    if _cmu_conn is not None:
        _cmu_db_ready = True
        return True, errors

    # 1. Writable user-space CMU DB (if present in userData/tts_dicts)
    if USER_CMU_DB_PATH and os.path.exists(USER_CMU_DB_PATH):
        try:
            conn = sqlite3.connect(USER_CMU_DB_PATH, check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            cursor = conn.cursor()
            cursor.execute("PRAGMA integrity_check;")
            res = cursor.fetchone()
            if not res or res[0] != "ok":
                conn.close()
                raise sqlite3.DatabaseError(f"integrity_check failed: {res[0] if res else 'unknown'}")
            _cmu_conn = conn
            _cmu_mode = 'writable_user'
            _active_cmu_db_path = USER_CMU_DB_PATH
            _cmu_db_ready = True
            return True, errors
        except Exception as user_err:
            errors.append(f"user tts_pronunciation.db corrupted/unreadable ({user_err}); recreating in userData")
            ok, rec_err = _create_user_cmu_db_from_dicts(merged_it, merged_abbr, merged_homo)
            _cmu_db_ready = ok
            if rec_err:
                errors.append(rec_err)
            return ok, errors

    # 2. Bundled read-only CMU DB (never write WAL/SHM/locks into installation directory)
    if CMU_DB_PATH and os.path.exists(CMU_DB_PATH):
        try:
            conn = _open_readonly_bundled_db(CMU_DB_PATH)
            _cmu_conn = conn
            _cmu_mode = 'read_only_bundled'
            _active_cmu_db_path = CMU_DB_PATH
            _cmu_db_ready = True
            return True, errors
        except Exception as ro_err:
            errors.append(f"bundled tts_pronunciation.db failed read-only check ({ro_err}); creating writable fallback in userData")
            ok, rec_err = _create_user_cmu_db_from_dicts(merged_it, merged_abbr, merged_homo)
            _cmu_db_ready = ok
            if rec_err:
                errors.append(rec_err)
            return ok, errors

    errors.append(f"optional CMU SQLite DB not found at {CMU_DB_PATH}")
    _cmu_mode = 'none'
    _active_cmu_db_path = ''
    _cmu_db_ready = False
    return False, errors


def reload():
    global _it_dict_compiled, _it_dict_raw, _abbreviations, _homographs
    global _cmu_conn, _cmu_mode, _active_cmu_db_path, _cmu_db_ready, _diagnostics

    _resolve_paths()
    errors = []

    if not os.path.isdir(DICTS_DIR):
        errors.append(f"bundled dicts directory not found: {DICTS_DIR}")

    dict_specs = [
        ('it', 'tts_dict_it.json', IT_DICT_PATH, True),
        ('abbreviations', 'tts_dict_abbreviations.json', ABBR_DICT_PATH, False),
        ('homographs', 'tts_dict_homographs.json', HOMO_DICT_PATH, True),
    ]

    bundled_counts = {'it': 0, 'abbreviations': 0, 'homographs': 0, 'totalFilesLoaded': 0}
    user_override_counts = {'it': 0, 'abbreviations': 0, 'homographs': 0, 'totalOverrides': 0}
    effective_counts = {'it': 0, 'abbreviations': 0, 'homographs': 0}
    files_diag = {}

    merged_stores = {}

    for key, filename, bundled_path, compile_regex in dict_specs:
        bundled_entries, bundled_exists, bundled_err = _load_json_entries(bundled_path, 'bundled')
        if bundled_err:
            errors.append(bundled_err)
        elif not bundled_exists:
            errors.append(f"bundled dictionary missing: {filename}")
        else:
            bundled_counts['totalFilesLoaded'] += 1

        user_path = os.path.join(USER_DICTS_DIR, filename) if USER_DICTS_DIR else ''
        user_entries, user_exists, user_err = _load_json_entries(user_path, 'user')
        if user_err:
            errors.append(user_err)

        merged = {}
        valid_bundled = 0
        for pat, rep in bundled_entries.items():
            if compile_regex:
                try:
                    re.compile(pat, flags=re.IGNORECASE)
                except Exception as reg_err:
                    errors.append(f"bundled ({filename}) invalid regex '{pat}': {reg_err}")
                    continue
            merged[pat] = rep
            valid_bundled += 1

        valid_user = 0
        for pat, rep in user_entries.items():
            if compile_regex:
                try:
                    re.compile(pat, flags=re.IGNORECASE)
                except Exception as reg_err:
                    errors.append(f"user ({filename}) invalid regex '{pat}': {reg_err}")
                    continue
            merged[pat] = rep
            valid_user += 1

        bundled_counts[key] = valid_bundled
        user_override_counts[key] = valid_user
        user_override_counts['totalOverrides'] += valid_user
        effective_counts[key] = len(merged)
        merged_stores[key] = merged

        files_diag[key] = {
            'filename': filename,
            'bundledExists': bundled_exists,
            'userExists': user_exists,
            'bundledEntries': valid_bundled,
            'userEntries': valid_user,
            'effectiveEntries': len(merged),
            'error': user_err or bundled_err,
        }

    compiled_it = []
    for pat, rep in merged_stores['it'].items():
        compiled_it.append((re.compile(pat, flags=re.IGNORECASE), pat, rep))

    _it_dict_raw = merged_stores['it']
    _it_dict_compiled = compiled_it
    _abbreviations = merged_stores['abbreviations']
    _homographs = merged_stores['homographs']

    with _cmu_lock:
        if _cmu_conn:
            try:
                _cmu_conn.close()
            except Exception:
                pass
            _cmu_conn = None
        _cmu_mode = 'none'
        _active_cmu_db_path = ''
        _cmu_db_ready = False
        cmu_ok, cmu_errors = _init_cmu_db(_it_dict_raw, _abbreviations, _homographs)
        errors.extend(cmu_errors)
        lookup_cmu.cache_clear()

    files_diag['cmu_db'] = {
        'filename': 'tts_pronunciation.db',
        'bundledExists': bool(CMU_DB_PATH and os.path.exists(CMU_DB_PATH)),
        'userExists': bool(USER_CMU_DB_PATH and os.path.exists(USER_CMU_DB_PATH)),
        'mode': _cmu_mode,
        'activePath': _active_cmu_db_path,
        'ready': bool(cmu_ok),
        'error': cmu_errors[0] if cmu_errors else None,
    }

    bundled_dir_ok = os.path.isdir(DICTS_DIR)
    if not bundled_dir_ok or (bundled_counts['totalFilesLoaded'] == 0 and not cmu_ok):
        state = 'ERROR'
    elif bundled_counts['totalFilesLoaded'] == 3 and cmu_ok and len(errors) == 0:
        state = 'READY'
    else:
        state = 'DEGRADED'

    ts = _now_iso()
    diag_snapshot = {
        'state': state,
        'bundledDir': DICTS_DIR,
        'userDir': USER_DICTS_DIR,
        'logsDir': LOGS_DIR,
        'activeCmuDbPath': _active_cmu_db_path,
        'cmuDbReady': bool(cmu_ok),
        'cmuDbMode': _cmu_mode,
        'bundledCounts': bundled_counts,
        'userOverrideCounts': user_override_counts,
        'effectiveCounts': effective_counts,
        'files': files_diag,
        'errors': errors,
        'lastLoadedAt': ts if state != 'ERROR' else _diagnostics.get('lastLoadedAt'),
        'lastReloadResult': {
            'ok': state != 'ERROR',
            'state': state,
            'timestamp': ts,
            'errorsCount': len(errors),
        },
    }

    with _diagnostics_lock:
        _diagnostics = diag_snapshot

    print(
        f"[TTS Dict Loader] state={state} bundledDir='{DICTS_DIR}' userDir='{USER_DICTS_DIR}' "
        f"IT={effective_counts['it']} (user={user_override_counts['it']}) "
        f"Abbr={effective_counts['abbreviations']} (user={user_override_counts['abbreviations']}) "
        f"Homo={effective_counts['homographs']} (user={user_override_counts['homographs']}) "
        f"CMU={_cmu_mode} errors={len(errors)}",
        flush=True,
    )
    if errors:
        print(f"[TTS Dict Loader] Diagnostics errors: {errors}", flush=True)

    return get_diagnostics()


def get_diagnostics():
    with _diagnostics_lock:
        return json.loads(json.dumps(_diagnostics))


@lru_cache(maxsize=2000)
def lookup_cmu(word):
    word = word.lower()
    with _cmu_lock:
        if _cmu_conn is None and not _cmu_db_ready:
            return None
        try:
            cursor = _cmu_conn.cursor()
            cursor.execute("SELECT translit FROM words WHERE word=?", (word,))
            row = cursor.fetchone()
            if row:
                return row[0]
        except Exception as e:
            err_msg = str(e).lower()
            if _cmu_mode == 'writable_user' and ("malformed" in err_msg or "corrupt" in err_msg or "locked" in err_msg):
                _create_user_cmu_db_from_dicts(_it_dict_raw, _abbreviations, _homographs)
                lookup_cmu.cache_clear()
    return None


def log_unknown_word(word):
    if not UNKNOWN_WORDS_LOG:
        return
    word = word.lower()
    with _unknown_words_lock:
        if word not in _unknown_words:
            _unknown_words.add(word)
            try:
                os.makedirs(os.path.dirname(UNKNOWN_WORDS_LOG), exist_ok=True)
                with open(UNKNOWN_WORDS_LOG, 'a', encoding='utf-8') as f:
                    f.write(f"{word}\n")
            except Exception as e:
                print(f"[TTS Dict Loader] Error writing to unknown words log: {e}", flush=True)


def get_it_dict_compiled():
    return _it_dict_compiled


def get_it_dict_raw():
    return _it_dict_raw


def get_abbreviations():
    return _abbreviations


def get_homographs():
    return _homographs


# Initialize on import
reload()
