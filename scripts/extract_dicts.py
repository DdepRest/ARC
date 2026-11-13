import json
import os
import sys

# Add root to path
sys.path.insert(0, os.getcwd())
sys.path.insert(0, os.path.join(os.getcwd(), 'myload'))
from ARC_TTS_normalizer import it_dict, abbreviations, homographs

os.makedirs('Voice/dicts', exist_ok=True)

with open('Voice/dicts/tts_dict_it.json', 'w', encoding='utf-8') as f:
    json.dump({
        "version": "1.0",
        "entries_count": len(it_dict),
        "data": it_dict
    }, f, ensure_ascii=False, indent=2)

with open('Voice/dicts/tts_dict_abbreviations.json', 'w', encoding='utf-8') as f:
    json.dump({
        "version": "1.0",
        "entries_count": len(abbreviations),
        "data": abbreviations
    }, f, ensure_ascii=False, indent=2)

with open('Voice/dicts/tts_dict_homographs.json', 'w', encoding='utf-8') as f:
    json.dump({
        "version": "1.0",
        "entries_count": len(homographs),
        "data": homographs
    }, f, ensure_ascii=False, indent=2)

print("Extracted dicts to JSON.")
