import re
from silero_number_converter import convert_numbers, int_to_words, decimal_to_words, pluralize
import tts_dict_loader

# Configuration
use_cmu_dict = True

SINGLE_LATIN_LETTERS = {
    'a': 'эй', 'b': 'би', 'c': 'си', 'd': 'ди', 'e': 'и',
    'f': 'эф', 'g': 'джи', 'h': 'эйч', 'i': 'ай', 'j': 'джей',
    'k': 'кей', 'l': 'эль', 'm': 'эм', 'n': 'эн', 'o': 'оу',
    'p': 'пи', 'q': 'кью', 'r': 'эр', 's': 'эс', 't': 'ти',
    'u': 'ю', 'v': 'ви', 'w': 'дабл-ю', 'x': 'икс', 'y': 'игрек', 'z': 'зет'
}

COMMON_TECH_WORDS = {
    'example': 'экзампл',
    'main': 'мэйн',
    'file': 'файл',
    'dot': 'точка',
    'com': 'ком',
    'ru': 'ру',
    'org': 'орг',
    'net': 'нет',
    'io': 'ио',
    'dev': 'дев',
    'ai': 'аи',
    'py': 'пай',
    'js': 'джей эс',
    'ts': 'ти эс',
    'json': 'джейсон',
    'txt': 'тхт',
    'html': 'хтмл',
    'css': 'цсс',
    'md': 'эмдэ',
    'src': 'исходники',
    'app': 'апп',
    'api': 'апи',
    'doc': 'док',
    'docs': 'документация'
}

def transliterate_root_or_dict(root):
    root_lower = root.lower()

    # 0. Single Latin letters by phonetic alphabet name
    if len(root_lower) == 1 and root_lower in SINGLE_LATIN_LETTERS:
        return SINGLE_LATIN_LETTERS[root_lower]

    # 1. Explicit project/IT dictionary has highest priority.
    it_dict_raw = tts_dict_loader.get_it_dict_raw()
    for pat, rep in it_dict_raw.items():
        clean_pat = pat.replace(r'\b', '').replace('\b', '')
        if clean_pat.lower() == root_lower:
            return rep

    # 2. Common tech words
    if root_lower in COMMON_TECH_WORDS:
        return COMMON_TECH_WORDS[root_lower]

    # 3. Large phonetic English lexicon (~125k words).
    if use_cmu_dict:
        cmu_translit = tts_dict_loader.lookup_cmu(root_lower)
        if cmu_translit:
            return cmu_translit

    # 4. Log unknown and use last-resort heuristic for truly unknown English tokens.
    tts_dict_loader.log_unknown_word(root_lower)
    return transliterate_english(root)

def transliterate_english(word):
    word = word.lower()
    if len(word) == 1 and word in SINGLE_LATIN_LETTERS:
        return SINGLE_LATIN_LETTERS[word]

    subs = {
        'creator': 'криэйтор', 'create': 'криэйт', 'great': 'грейт',
        'emergence': 'эмердженс', 'viral': 'вирусный', 'rise': 'райз',
        'professional': 'профессиональный', 'online': 'онлайн', 'video': 'видео',
        'the': 'зе', 'and': 'энд', 'of': 'оф', 'in': 'ин', 'on': 'он',
        'tion': 'шн', 'sion': 'жн', 'ph': 'ф', 'sh': 'ш', 'ch': 'ч', 
        'th': 'т', 'wh': 'в', 'ee': 'и', 'oo': 'у', 'ea': 'и',
        'ck': 'к', 'kn': 'н', 'wr': 'р', 'mb': 'м', 'ng': 'нг', 'ing': 'инг',
        'qu': 'кв', 'ay': 'ей', 'ey': 'ей', 'ow': 'оу', 'aw': 'о',
        'a': 'а', 'b': 'б', 'c': 'к', 'd': 'д', 'e': 'е', 'f': 'ф',
        'g': 'г', 'h': 'х', 'i': 'и', 'j': 'дж', 'k': 'к', 'l': 'л',
        'm': 'м', 'n': 'н', 'o': 'о', 'p': 'п', 'q': 'к', 'r': 'р',
        's': 'с', 't': 'т', 'u': 'у', 'v': 'в', 'w': 'в', 'x': 'кс',
        'y': 'й', 'z': 'з'
    }
    
    for k in sorted(subs.keys(), key=len, reverse=True):
        if len(k) > 1:
            word = word.replace(k, subs[k])
            
    res = ""
    for char in word:
        res += subs.get(char, char)
        
    return res

def resolve_homographs(text):
    homographs = tts_dict_loader.get_homographs()
    for pattern, repl in homographs.items():
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)
    return text

def format_quantity(num_str, sign_str, one, two, five, is_female=False):
    num_clean = num_str.replace(',', '.')
    sign_prefix = 'плюс ' if sign_str == '+' else ('минус ' if sign_str == '-' else '')
    if '.' in num_clean:
        words = decimal_to_words(num_clean)
        unit = two
    else:
        val = int(num_clean)
        words = int_to_words(val, 'f' if is_female else 'm')
        unit = pluralize(val, one, two, five)
    return f"{sign_prefix}{words} {unit}".strip()

def normalize_units(text):
    # 1. Temperature: (+/-)N° or N° or N°C or (+/-)N °C
    def temp_rep(m):
        sign = m.group(1) or ''
        num = m.group(2)
        return ' ' + format_quantity(num, sign, 'градус', 'градуса', 'градусов') + ' '
    text = re.sub(r'(?:(?<=\s)|(?<=^)|(?<=[(\[,;]))([+-]?)\s*(\d+(?:[.,]\d+)?)\s*°\s*(?:[cCсС](?![a-zA-Zа-яА-Я]))?', temp_rep, text)

    # 2. Wind / Speed: N м/с, N м/сек
    def speed_ms_rep(m):
        num = m.group(1)
        return ' ' + format_quantity(num, '', 'метр в секунду', 'метра в секунду', 'метров в секунду') + ' '
    text = re.sub(r'(\d+(?:[.,]\d+)?)\s*(?:м/с(?:ек)?|м\s*/\s*с(?:ек)?)(?![a-zA-Zа-яА-Я])', speed_ms_rep, text, flags=re.IGNORECASE)

    # 3. Speed: N км/ч
    def speed_kmh_rep(m):
        num = m.group(1)
        return ' ' + format_quantity(num, '', 'километр в час', 'километра в час', 'километров в час') + ' '
    text = re.sub(r'(\d+(?:[.,]\d+)?)\s*(?:км/ч(?:ас)?|км\s*/\s*ч(?:ас)?)(?![a-zA-Zа-яА-Я])', speed_kmh_rep, text, flags=re.IGNORECASE)

    # 4. Pressure: N мм рт. ст.
    def pressure_rep(m):
        num = m.group(1)
        return ' ' + format_quantity(num, '', 'миллиметр ртутного столба', 'миллиметра ртутного столба', 'миллиметров ртутного столба') + ' '
    text = re.sub(r'(\d+(?:[.,]\d+)?)\s*(?:мм\.?\s*рт\.?\s*ст\.?)(?![a-zA-Zа-яА-Я])', pressure_rep, text, flags=re.IGNORECASE)

    # 5. Percent: N%
    def percent_rep(m):
        num = m.group(1)
        return ' ' + format_quantity(num, '', 'процент', 'процента', 'процентов') + ' '
    text = re.sub(r'(\d+(?:[.,]\d+)?)\s*%(?![a-zA-Zа-яА-Я])', percent_rep, text)

    # Standalone units without numbers
    text = re.sub(r'\b(?:м/с(?:ек)?|м\s*/\s*с(?:ек)?)\b', ' метров в секунду ', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:км/ч(?:ас)?|км\s*/\s*ч(?:ас)?)\b', ' километров в час ', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:мм\.?\s*рт\.?\s*ст\.?)\b', ' миллиметров ртутного столба ', text, flags=re.IGNORECASE)

    # Standalone signs before numbers: +21 -> плюс 21, -5 -> минус 5
    text = re.sub(r'(?:(?<=\s)|(?<=^))\+(\d+(?:[.,]\d+)?)\b', r'плюс \1', text)
    text = re.sub(r'(?:(?<=\s)|(?<=^))-(\d+(?:[.,]\d+)?)\b', r'минус \1', text)

    return text

def normalize_text(text):
    # 0. Weather, speed, pressure, and unit normalization (before generic stripping/punctuation rules)
    text = normalize_units(text)

    # 0.1 Strip scheme / www and normalize brackets & underscores
    text = re.sub(r'https?://', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\bwww\.', '', text, flags=re.IGNORECASE)
    text = re.sub(r'```[\s\S]*?```', ' блок кода ', text)
    text = re.sub(r'`([^`]+)`', r' \1 ', text)
    text = re.sub(r'[A-Za-z]:\\[^\s]+', ' путь к файлу ', text)
    text = re.sub(r'_+', ' ', text)

    # Brackets to pauses
    text = re.sub(r'[()[\]{}]', ', ', text)

    # 1. URLs, Domains, File Extensions, and Version numbers
    text = re.sub(r'\bdot\b', ' точка ', text, flags=re.IGNORECASE)
    text = re.sub(r'(?i)\bv?(\d+)\.(\d+)\.(\d+)\b', r'\1 точка \2 точка \3', text)
    text = re.sub(r'(?i)\b(?:v|версия\s+)(\d+)\.(\d+)\b', r'версия \1 точка \2', text)
    text = re.sub(r'\.com\b', ' точка ком ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.ru\b', ' точка ру ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.org\b', ' точка орг ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.net\b', ' точка нет ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.io\b', ' точка ио ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.dev\b', ' точка дев ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.ai\b', ' точка аи ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.py\b', ' точка пай ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.js\b', ' точка джей эс ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.ts\b', ' точка ти эс ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.json\b', ' точка джейсон ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.txt\b', ' точка тхт ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.html\b', ' точка хтмл ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.css\b', ' точка цсс ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.md\b', ' точка эмдэ ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.gguf\b', ' точка ггуф ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.onnx\b', ' точка оннкс ', text, flags=re.IGNORECASE)
    text = re.sub(r'\.pt\b', ' точка пт ', text, flags=re.IGNORECASE)

    # Separate adjacent letters and digits (e.g. qwen2 -> qwen 2, 5b -> 5 b, q4 -> q 4)
    text = re.sub(r'([a-zA-ZА-Яа-яЁё])(\d)', r'\1 \2', text)
    text = re.sub(r'(\d)([a-zA-ZА-Яа-яЁё])', r'\1 \2', text)

    # 2. Hybrids (Latin root + Cyrillic ending with hyphen or without, e.g. Creator-ы, YouTube-ом)
    def hybrid_replacer(m):
        return transliterate_root_or_dict(m.group(1)) + m.group(2)
    text = re.sub(r'\b([a-zA-Z]+)-?([А-Яа-яЁё]+)\b', hybrid_replacer, text)

    # 3. Abbreviations
    abbreviations = tts_dict_loader.get_abbreviations()
    for abbr, rep in abbreviations.items():
        text = re.sub(r'(?<![а-яА-Яa-zA-Z])' + re.escape(abbr) + r'(?![а-яА-Яa-zA-Z])', rep, text, flags=re.IGNORECASE)

    # 4. Known IT/English words
    it_dict_compiled = tts_dict_loader.get_it_dict_compiled()
    for compiled_pat, pat, rep in it_dict_compiled:
        text = compiled_pat.sub(rep, text)

    # 5. Handle remaining English tokens / words / isolated letters (even if adjacent to punctuation/hyphens)
    def eng_replacer(m):
        return transliterate_root_or_dict(m.group(0))
    text = re.sub(r'[a-zA-Z]+', eng_replacer, text)

    # 6. Numbers (including convert_numbers for remaining integers and any residual digits)
    text = convert_numbers(text)
    text = re.sub(r'\d+', lambda m: int_to_words(int(m.group(0))) if len(m.group(0)) <= 9 else ' '.join(int_to_words(int(d)) for d in m.group(0)), text)

    # 7. Homographs
    text = resolve_homographs(text)

    # 8. Strict Cyrillic filter for Silero v5_6_ru.pt (no Latin, digits, or underscores allowed)
    text = re.sub(r'[^А-Яа-яЁё\s.,?!;:+\-—]', ' ', text)
    text = re.sub(r'\+(?![аеёиоуыэюяАЕЁИОУЫЭЮЯ])', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text
