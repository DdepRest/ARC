import sqlite3
import os
import sys

# Add myload to path
sys.path.insert(0, os.path.join(os.getcwd(), 'myload'))
from english_pronunciation_dict import ENGLISH_PRONUNCIATION_DICT

os.makedirs('Voice/dicts', exist_ok=True)
db_path = 'Voice/dicts/tts_pronunciation.db'

# Remove if exists
if os.path.exists(db_path):
    os.remove(db_path)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute('''
    CREATE TABLE words (
        word TEXT PRIMARY KEY,
        translit TEXT
    )
''')

cursor.execute('''
    CREATE TABLE metadata (
        version TEXT,
        entries_count INTEGER
    )
''')

count = 0
for k, v in ENGLISH_PRONUNCIATION_DICT.items():
    if not isinstance(k, str) or not isinstance(v, str):
        continue
    
    # Clean the word
    cleaned_word = k.strip().lower()
    # Remove accidental spaces inside word if they don't have hyphens
    if ' ' in cleaned_word and '-' not in cleaned_word:
        # Some CMU words might have spaces, but let's just keep them or replace with none?
        # Actually just trim and lower is fine, maybe replace ' ' with ''
        pass 
    
    if cleaned_word.endswith(" 's"):
        cleaned_word = cleaned_word.replace(" 's", "'s")
        
    try:
        cursor.execute('INSERT INTO words (word, translit) VALUES (?, ?)', (cleaned_word, v.strip()))
        count += 1
    except sqlite3.IntegrityError:
        # duplicate
        pass

cursor.execute('INSERT INTO metadata (version, entries_count) VALUES (?, ?)', ('1.0', count))

conn.commit()
conn.close()

print(f"Created SQLite DB with {count} entries.")
