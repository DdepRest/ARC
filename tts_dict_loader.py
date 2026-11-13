import json
import os
import re
import sqlite3
import threading
from functools import lru_cache

# Paths
DICTS_DIR = os.path.join(os.getcwd(), 'Voice', 'dicts')
IT_DICT_PATH = os.path.join(DICTS_DIR, 'tts_dict_it.json')
ABBR_DICT_PATH = os.path.join(DICTS_DIR, 'tts_dict_abbreviations.json')
HOMO_DICT_PATH = os.path.join(DICTS_DIR, 'tts_dict_homographs.json')
CMU_DB_PATH = os.path.join(DICTS_DIR, 'tts_pronunciation.db')
UNKNOWN_WORDS_LOG = os.path.join(os.getcwd(), 'logs', 'tts_unknown_words.log')

# In-memory stores
_it_dict_compiled = []
_it_dict_raw = {}
_abbreviations = {}
_homographs = {}
_cmu_conn = None
_cmu_lock = threading.Lock()
_unknown_words = set()
_unknown_words_lock = threading.Lock()

def _load_json(path):
    if not os.path.exists(path):
        print(f"[TTS Dict Loader] Warning: {path} not found.")
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('data', {})
    except Exception as e:
        print(f"[TTS Dict Loader] Error loading {path}: {e}")
        return {}

def _purge_and_recreate_cmu_db():
    global _cmu_conn
    if _cmu_conn:
        try:
            _cmu_conn.close()
        except Exception:
            pass
        _cmu_conn = None

    # Backup .db before deletion to preserve any custom words
    if os.path.exists(CMU_DB_PATH):
        try:
            import shutil
            shutil.copy2(CMU_DB_PATH, CMU_DB_PATH + '.bak')
        except Exception as bak_err:
            print(f"[TTS Dict Loader] Warning: could not backup {CMU_DB_PATH}: {bak_err}")

    # Surgical triple purge: .db, .db-wal, .db-shm
    for suffix in ['', '-wal', '-shm']:
        fpath = CMU_DB_PATH + suffix
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
            except Exception as rem_err:
                print(f"[TTS Dict Loader] Warning: could not remove {fpath}: {rem_err}")

    try:
        _cmu_conn = sqlite3.connect(CMU_DB_PATH, check_same_thread=False)
        _cmu_conn.execute("PRAGMA journal_mode=WAL;")
        _cmu_conn.execute("PRAGMA synchronous=NORMAL;")
        cursor = _cmu_conn.cursor()
        cursor.execute("CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, translit TEXT)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_words_word ON words(word)")

        # Restore from bundled JSON files
        json_files = [
            ('tts_dict_it.json', 'it'),
            ('tts_dict_abbreviations.json', 'abbreviations'),
            ('tts_dict_homographs.json', 'homographs')
        ]

        for json_file, _category in json_files:
            json_path = os.path.join(DICTS_DIR, json_file)
            if os.path.exists(json_path):
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    entries = data.get('data', data) if isinstance(data, dict) else {}
                    loaded_count = 0
                    if isinstance(entries, dict):
                        for word, translit in entries.items():
                            if not word or not translit:
                                continue
                            clean_word = word.replace('\\b', '').replace('\b', '').strip().lower()
                            if clean_word:
                                cursor.execute(
                                    'INSERT OR REPLACE INTO words (word, translit) VALUES (?, ?)',
                                    (clean_word, str(translit).strip())
                                )
                                loaded_count += 1
                    print(f'[TTS Dict Loader] Loaded {loaded_count} entries from {json_file}')
                except Exception as e:
                    print(f'[TTS Dict Loader] Error loading {json_file}: {e}')

        _cmu_conn.commit()
        print('[TTS Dict Loader] Database recreated from bundled JSON files')
        return True
    except Exception as init_err:
        print(f"[TTS Dict Loader] Failed to initialize recreated CMU DB: {init_err}")
        return False

def _init_cmu_db():
    global _cmu_conn
    if _cmu_conn is None:
        if not os.path.exists(CMU_DB_PATH):
            print(f"[TTS Dict Loader] Warning: CMU SQLite DB not found at {CMU_DB_PATH}")
            return False
        try:
            # check_same_thread=False since we use a lock
            _cmu_conn = sqlite3.connect(CMU_DB_PATH, check_same_thread=False)
            _cmu_conn.execute("PRAGMA journal_mode=WAL;")
            _cmu_conn.execute("PRAGMA synchronous=NORMAL;")
            
            # Run integrity check
            cursor = _cmu_conn.cursor()
            cursor.execute("PRAGMA integrity_check;")
            result = cursor.fetchone()
            if result and result[0] != "ok":
                print(f"[TTS Dict Loader] CMU DB integrity check failed ({result[0]}). Auto-recreating...")
                return _purge_and_recreate_cmu_db()
            
            return True
        except (sqlite3.OperationalError, sqlite3.DatabaseError, Exception) as e:
            err_msg = str(e).lower()
            if "malformed" in err_msg or "corrupt" in err_msg or "locked" in err_msg:
                print(f"[TTS Dict Loader] CMU DB corrupted ({e}). Auto-recreating...")
                return _purge_and_recreate_cmu_db()
            print(f"[TTS Dict Loader] Error connecting to CMU DB: {e}")
            return False
    return True

def reload():
    global _it_dict_compiled, _it_dict_raw, _abbreviations, _homographs, _cmu_conn
    
    _it_dict_raw = _load_json(IT_DICT_PATH)
    _it_dict_compiled = []
    for pat, rep in _it_dict_raw.items():
        try:
            compiled = re.compile(pat, flags=re.IGNORECASE)
            _it_dict_compiled.append((compiled, pat, rep))
        except Exception as e:
            print(f"[TTS Dict Loader] Invalid regex in it_dict '{pat}': {e}")
            
    _abbreviations = _load_json(ABBR_DICT_PATH)
    _homographs = _load_json(HOMO_DICT_PATH)
    
    with _cmu_lock:
        if _cmu_conn:
            _cmu_conn.close()
            _cmu_conn = None
        _init_cmu_db()
        lookup_cmu.cache_clear()
        
    print(f"[TTS Dict Loader] Reloaded dictionaries. IT: {len(_it_dict_compiled)}, Abbr: {len(_abbreviations)}, Homographs: {len(_homographs)}")

@lru_cache(maxsize=2000)
def lookup_cmu(word):
    word = word.lower()
    with _cmu_lock:
        if not _init_cmu_db():
            return None
        try:
            cursor = _cmu_conn.cursor()
            cursor.execute("SELECT translit FROM words WHERE word=?", (word,))
            row = cursor.fetchone()
            if row:
                return row[0]
        except Exception as e:
            err_msg = str(e).lower()
            if "malformed" in err_msg or "corrupt" in err_msg or "locked" in err_msg:
                _purge_and_recreate_cmu_db()
                lookup_cmu.cache_clear()
    return None

def log_unknown_word(word):
    word = word.lower()
    with _unknown_words_lock:
        if word not in _unknown_words:
            _unknown_words.add(word)
            try:
                os.makedirs(os.path.dirname(UNKNOWN_WORDS_LOG), exist_ok=True)
                with open(UNKNOWN_WORDS_LOG, 'a', encoding='utf-8') as f:
                    f.write(f"{word}\n")
            except Exception as e:
                print(f"[TTS Dict Loader] Error writing to unknown words log: {e}")

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
