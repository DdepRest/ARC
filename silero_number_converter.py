import re

UNITS = {
    0: "ноль", 1: "один", 2: "два", 3: "три", 4: "четыре", 5: "пять",
    6: "шесть", 7: "семь", 8: "восемь", 9: "девять", 10: "десять",
    11: "одиннадцать", 12: "двенадцать", 13: "тринадцать", 14: "четырнадцать",
    15: "пятнадцать", 16: "шестнадцать", 17: "семнадцать", 18: "восемнадцать", 19: "девятнадцать"
}

TENS = {
    20: "двадцать", 30: "тридцать", 40: "сорок", 50: "пятьдесят",
    60: "шестьдесят", 70: "семьдесят", 80: "восемьдесят", 90: "девяносто"
}

HUNDREDS = {
    100: "сто", 200: "двести", 300: "триста", 400: "четыреста",
    500: "пятьсот", 600: "шестьсот", 700: "семьсот", 800: "восемьсот", 900: "девятьсот"
}

MAGNITUDES = [
    (10**9, "миллиард", "миллиарда", "миллиардов", "m"),
    (10**6, "миллион", "миллиона", "миллионов", "m"),
    (10**3, "тысяча", "тысячи", "тысяч", "f")
]

DAYS_GENITIVE = {
    1: "первого", 2: "второго", 3: "третьего", 4: "четвертого", 5: "пятого",
    6: "шестого", 7: "седьмого", 8: "восьмого", 9: "девятого", 10: "десятого",
    11: "одиннадцатого", 12: "двенадцатого", 13: "тринадцатого", 14: "четырнадцатого",
    15: "пятнадцатого", 16: "шестнадцатого", 17: "семнадцатого", 18: "восемнадцатого",
    19: "девятнадцатого", 20: "двадцатого", 21: "двадцать первого", 22: "двадцать второго",
    23: "двадцать третьего", 24: "двадцать четвертого", 25: "двадцать пятого",
    26: "двадцать шестого", 27: "двадцать седьмого", 28: "двадцать восьмого",
    29: "двадцать девятого", 30: "тридцатого", 31: "тридцать первого"
}

MONTHS_GENITIVE_PATTERN = r'(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)'

def pluralize(n, form1, form2, form5):
    n = abs(n) % 100
    n1 = n % 10
    if 10 < n < 20:
        return form5
    if 1 < n1 < 5:
        return form2
    if n1 == 1:
        return form1
    return form5

def int_to_words(n, gender="m"):
    if n == 0:
        return UNITS[0]
    
    words = []
    if n < 0:
        words.append("минус")
        n = abs(n)
        
    for mag, f1, f2, f5, mag_gen in MAGNITUDES:
        if n >= mag:
            count = n // mag
            words.append(int_to_words(count, mag_gen))
            words.append(pluralize(count, f1, f2, f5))
            n %= mag
            
    if n == 0 and words:
        return " ".join(words)
        
    if n >= 100:
        words.append(HUNDREDS[(n // 100) * 100])
        n %= 100
        
    if n >= 20:
        words.append(TENS[(n // 10) * 10])
        n %= 10
        
    if n > 0:
        if gender == "f":
            if n == 1:
                words.append("одна")
            elif n == 2:
                words.append("две")
            else:
                words.append(UNITS[n])
        elif gender == "n":
            if n == 1:
                words.append("одно")
            else:
                words.append(UNITS[n])
        else:
            words.append(UNITS[n])
            
    return " ".join(words)

def int_to_words_genitive(n, gender="m"):
    if n == 0:
        return "ноля"
    words = []
    if n < 0:
        words.append("минус")
        n = abs(n)
        
    for mag, f1, f2, f5, mag_gen in MAGNITUDES:
        if n >= mag:
            count = n // mag
            words.append(int_to_words_genitive(count, mag_gen))
            words.append(f5 if count % 10 == 0 or (count % 100 in range(11, 20)) or count % 10 >= 5 else f2)
            n %= mag
            
    if n == 0 and words:
        return " ".join(words)
        
    if n >= 100:
        HUNDREDS_GEN = {
            100: "ста", 200: "двухсот", 300: "трехсот", 400: "четырехсот",
            500: "пятисот", 600: "шестисот", 700: "семисот", 800: "восьмисот", 900: "девятисот"
        }
        words.append(HUNDREDS_GEN[(n // 100) * 100])
        n %= 100
        
    if n >= 20:
        TENS_GEN = {
            20: "двадцати", 30: "тридцати", 40: "сорока", 50: "пятидесяти",
            60: "шестидесяти", 70: "семидесяти", 80: "восьмидесяти", 90: "девяноста"
        }
        words.append(TENS_GEN[(n // 10) * 10])
        n %= 10
        
    if n > 0:
        if 10 <= n <= 19:
            TEENS_GEN = {
                10: "десяти", 11: "одиннадцати", 12: "двенадцати", 13: "тринадцати",
                14: "четырнадцати", 15: "пятнадцати", 16: "шестнадцати",
                17: "семнадцати", 18: "восемнадцати", 19: "девятнадцати"
            }
            words.append(TEENS_GEN[n])
        else:
            UNITS_GEN = {
                1: "одной" if gender == "f" else "одного",
                2: "двух", 3: "трех", 4: "четырех", 5: "пяти",
                6: "шести", 7: "семи", 8: "восьми", 9: "девяти"
            }
            words.append(UNITS_GEN[n])
            
    return " ".join(words)

def decimal_to_words(n_str):
    if '.' in n_str:
        parts = n_str.split('.')
    else:
        parts = n_str.split(',')
        
    if len(parts) != 2:
        return int_to_words(int(n_str))
        
    int_part = int(parts[0]) if parts[0] else 0
    frac_part_str = parts[1]
    
    if not frac_part_str:
        return int_to_words(int_part)
        
    frac_part = int(frac_part_str)
    
    int_word = int_to_words(int_part, "f")
    int_label = pluralize(int_part, "целая", "целых", "целых")
    
    power = len(frac_part_str)
    
    if power == 1:
        frac_label = pluralize(frac_part, "десятая", "десятых", "десятых")
    elif power == 2:
        frac_label = pluralize(frac_part, "сотая", "сотых", "сотых")
    elif power == 3:
        frac_label = pluralize(frac_part, "тысячная", "тысячных", "тысячных")
    else:
        return int_to_words(int_part) + " точка " + " ".join([UNITS[int(d)] for d in frac_part_str])
        
    frac_word = int_to_words(frac_part, "f")
    return f"{int_word} {int_label} {frac_word} {frac_label}"

def get_ordinal_year(year_str, form, prep=""):
    prefix = year_str[:2]
    suffix = int(year_str[2:])
    if prefix == "19":
        base = "тысяча девятьсот"
    else:
        base = "две тысячи"

    # forms: 0: Nom (год), 1: Gen (года), 2: Dat (году - к), 3: Ins (годом), 4: Prep (году - в/на)
    form_idx = 0
    if form == "год": 
        form_idx = 0
    elif form == "года": 
        form_idx = 1
    elif form in ["году", "годе"]:
        prep_lower = prep.strip().lower()
        if prep_lower in ["к", "по", "благодаря"]:
            form_idx = 2
        else:
            form_idx = 4
    elif form == "годом": 
        form_idx = 3

    if suffix == 0:
        hundred_forms_19 = ["тысяча девятисотый", "тысяча девятисотого", "тысяча девятисотому", "тысяча девятисотым", "тысяча девятисотом"]
        hundred_forms_20 = ["двухтысячный", "двухтысячного", "двухтысячному", "двухтысячным", "двухтысячном"]
        return hundred_forms_19[form_idx] if prefix == "19" else hundred_forms_20[form_idx]

    tens = suffix // 10
    units = suffix % 10
    TENS_CARDINAL = {2: "двадцать", 3: "тридцать", 4: "сорок", 5: "пятьдесят", 6: "шестьдесят", 7: "семьдесят", 8: "восемьдесят", 9: "девяносто"}
    
    # 0:Nom, 1:Gen, 2:Dat, 3:Ins, 4:Prep
    TEENS = {
        10: ["десятый", "десятого", "десятому", "десятым", "десятом"],
        11: ["одиннадцатый", "одиннадцатого", "одиннадцатому", "одиннадцатым", "одиннадцатом"],
        12: ["двенадцатый", "двенадцатого", "двенадцатому", "двенадцатым", "двенадцатом"],
        13: ["тринадцатый", "тринадцатого", "тринадцатому", "тринадцатым", "тринадцатом"],
        14: ["четырнадцатый", "четырнадцатого", "четырнадцатому", "четырнадцатым", "четырнадцатом"],
        15: ["пятнадцатый", "пятнадцатого", "пятнадцатому", "пятнадцатым", "пятнадцатом"],
        16: ["шестнадцатый", "шестнадцатого", "шестнадцатому", "шестнадцатым", "шестнадцатом"],
        17: ["семнадцатый", "семнадцатого", "семнадцатому", "семнадцатым", "семнадцатом"],
        18: ["восемнадцатый", "восемнадцатого", "восемнадцатому", "восемнадцатым", "восемнадцатом"],
        19: ["девятнадцатый", "девятнадцатого", "девятнадцатому", "девятнадцатым", "девятнадцатом"]
    }
    UNITS_ORDINAL = {
        1: ["первый", "первого", "первому", "первым", "первом"],
        2: ["второй", "второго", "второму", "вторым", "втором"],
        3: ["третий", "третьего", "третьему", "третьим", "третьем"],
        4: ["четвертый", "четвертого", "четвертому", "четвертым", "четвертом"],
        5: ["пятый", "пятого", "пятому", "пятым", "пятом"],
        6: ["шестой", "шестого", "шестому", "шестым", "шестом"],
        7: ["седьмой", "седьмого", "седьмому", "седьмым", "седьмом"],
        8: ["восьмой", "восьмого", "восьмому", "восьмым", "восьмом"],
        9: ["девятый", "девятого", "девятому", "девятым", "девятом"]
    }
    TENS_ORDINAL = {
        2: ["двадцатый", "двадцатого", "двадцатому", "двадцатым", "двадцатом"],
        3: ["тридцатый", "тридцатого", "тридцатому", "тридцатым", "тридцатом"],
        4: ["сороковой", "сорокового", "сороковому", "сороковым", "сороковом"],
        5: ["пятидесятый", "пятидесятого", "пятидесятому", "пятидесятым", "пятидесятом"],
        6: ["шестидесятый", "шестидесятого", "шестидесятому", "шестидесятым", "шестидесятом"],
        7: ["семидесятый", "семидесятого", "семидесятому", "семидесятым", "семидесятом"],
        8: ["восьмидесятый", "восьмидесятого", "восьмидесятому", "восьмидесятым", "восьмидесятом"],
        9: ["девяностый", "девяностого", "девяностому", "девяностым", "девяностом"]
    }
    
    parts = [base]
    if 10 <= suffix <= 19:
        parts.append(TEENS[suffix][form_idx])
    else:
        if tens > 0:
            if units == 0:
                parts.append(TENS_ORDINAL[tens][form_idx])
            else:
                parts.append(TENS_CARDINAL[tens])
        if units > 0:
            parts.append(UNITS_ORDINAL[units][form_idx])
    return " ".join(parts)

def convert_dates(text):
    def date_repl(m):
        day = int(m.group(1))
        month = m.group(2)
        day_word = DAYS_GENITIVE.get(day, str(day))
        return f"{day_word} {month}"

    text = re.sub(r'\b([1-9]|[12]\d|3[01])\s+' + MONTHS_GENITIVE_PATTERN + r'\b', date_repl, text, flags=re.IGNORECASE)
    return text

def convert_magnitudes(text):
    def mag_repl(m):
        prefix_prep = m.group(1) or ""
        num_str = m.group(2).replace(',', '.')
        mag_raw = m.group(3).lower()
        
        is_genitive = bool(prefix_prep and re.match(r'(более|менее|свыше|около|от|до|из)', prefix_prep, re.IGNORECASE))
        
        if mag_raw.startswith('млрд') or mag_raw.startswith('миллиард'):
            mag_type = 'b'
        elif mag_raw.startswith('млн') or mag_raw.startswith('миллион'):
            mag_type = 'm'
        elif mag_raw.startswith('тыс') or mag_raw.startswith('тысяч'):
            mag_type = 't'
        elif mag_raw.startswith('трлн') or mag_raw.startswith('триллион'):
            mag_type = 'tr'
        else:
            return m.group(0)
            
        is_float = '.' in num_str
        if is_float:
            parts = num_str.split('.')
            int_part = int(parts[0]) if parts[0] else 0
            frac_part = parts[1]
            
            if frac_part == '5':
                if int_part == 1:
                    num_words = "полторы" if mag_type == 't' else ("полутора" if is_genitive else "полтора")
                else:
                    int_words = int_to_words_genitive(int_part) if is_genitive else int_to_words(int_part)
                    num_words = f"{int_words} с половиной"
                    
                if mag_type == 'b':
                    noun = "миллиардов" if is_genitive else "миллиарда"
                elif mag_type == 'm':
                    noun = "миллионов" if is_genitive else "миллиона"
                elif mag_type == 't':
                    noun = "тысяч" if is_genitive else "тысячи"
                elif mag_type == 'tr':
                    noun = "триллионов" if is_genitive else "триллиона"
            else:
                num_words = decimal_to_words(num_str)
                if mag_type == 'b': noun = "миллиарда"
                elif mag_type == 'm': noun = "миллиона"
                elif mag_type == 't': noun = "тысячи"
                elif mag_type == 'tr': noun = "триллиона"
        else:
            val = int(num_str)
            if is_genitive:
                num_words = int_to_words_genitive(val, 'f' if mag_type == 't' else 'm')
                if mag_type == 'b': noun = pluralize(val, "миллиарда", "миллиардов", "миллиардов")
                elif mag_type == 'm': noun = pluralize(val, "миллиона", "миллионов", "миллионов")
                elif mag_type == 't': noun = pluralize(val, "тысячи", "тысяч", "тысяч")
                elif mag_type == 'tr': noun = pluralize(val, "триллиона", "триллионов", "триллионов")
            else:
                num_words = int_to_words(val, 'f' if mag_type == 't' else 'm')
                if mag_type == 'b': noun = pluralize(val, "миллиард", "миллиарда", "миллиардов")
                elif mag_type == 'm': noun = pluralize(val, "миллион", "миллиона", "миллионов")
                elif mag_type == 't': noun = pluralize(val, "тысяча", "тысячи", "тысяч")
                elif mag_type == 'tr': noun = pluralize(val, "триллион", "триллиона", "триллионов")
                
        res = f"{num_words} {noun}"
        if prefix_prep:
            res = f"{prefix_prep} {res}"
        return res

    text = re.sub(
        r'(?i)(?:\b(более|менее|свыше|около|от|до|превышает|составляет|составила|составил|достигает|достиг|достигла)\s+)?(\d+(?:[.,]\d+)?)\s*(млрд|миллиард(?:а|ов|у|ом|е)?|млн|миллион(?:а|ов|у|ом|е)?|тыс|тысяч(?:а|и|у|ей|е)?|трлн|триллион(?:а|ов|у|ом|е)?)\.?',
        mag_repl,
        text
    )
    return text

def convert_numbers(text):
    # 1. Dates and Magnitudes first
    text = convert_dates(text)
    text = convert_magnitudes(text)

    # 2. Year protection with ordinals
    def year_repl(m):
        prep = m.group(1) or ""
        year_str = m.group(2)
        form = m.group(3).lower()
        ordinal_year = get_ordinal_year(year_str, form, prep)
        return f"{prep} {ordinal_year} {form}" if prep else f"{ordinal_year} {form}"
        
    text = re.sub(r'(?i)(?:\b(в|с|к|до|от|по|об|о|на)\s+)?\b(19\d{2}|20\d{2})\s+(год[ауем]?)\b', year_repl, text)
    
    # 3. Ordinal suffixes (2026-й, 2027-го, etc)
    def ordinal_suffix_repl(m):
        num_str = m.group(1)
        suffix = m.group(2).lower()
        
        form = "год"
        prep = ""
        if suffix in ["й"]: form = "год"
        elif suffix in ["го"]: form = "года"
        elif suffix in ["му"]: 
            form = "году"
            prep = "к"
        elif suffix in ["м"]: form = "годом"
        elif suffix in ["ом"]: 
            form = "году"
            prep = "в"
        
        if len(num_str) == 4 and (num_str.startswith("20") or num_str.startswith("19")):
            return get_ordinal_year(num_str, form, prep)
        return num_str
            
    text = re.sub(r'\b(19\d{2}|20\d{2})-([йм]|го|му|ом)\b', ordinal_suffix_repl, text, flags=re.IGNORECASE)

    # 4. Fallback for years without "год" (only pure 4 digits not attached to anything)
    text = re.sub(r'\b19(\d{2})(?![\-а-яА-Я0-9])\b', r'девятнадцать \1', text)
    text = re.sub(r'\b20(\d{2})(?![\-а-яА-Я0-9])\b', r'две тысячи \1', text)

    # 5. Currency replacements
    def cur_rep(m):
        amount_str = m.group(1).replace(',', '.')
        is_float = '.' in amount_str
        num = float(amount_str) if is_float else int(amount_str)
        cur = m.group(2).lower()
        
        if is_float:
            words = decimal_to_words(amount_str)
        else:
            words = int_to_words(num)
            
        if 'руб' in cur or cur == '₽':
            words += " " + pluralize(int(num), "рубль", "рубля", "рублей")
        elif 'долл' in cur or cur == '$':
            words += " " + pluralize(int(num), "доллар", "доллара", "долларов")
        elif '%' in cur:
            words += " " + pluralize(int(num), "процент", "процента", "процентов")
        return words

    text = re.sub(r'(\d+(?:[.,]\d+)?)\s*(руб\.?|долл\.?|%|₽)(?:\b|\s|$)', lambda m: cur_rep(m) + (" " if m.group(0).endswith(" ") else ""), text, flags=re.IGNORECASE)
    text = re.sub(r'\$\s*(\d+(?:[.,]\d+)?)', lambda m: m.group(1) + ' $', text)
    text = re.sub(r'(\d+(?:[.,]\d+)?)\s*(\$)', cur_rep, text)

    # 6. Units
    def unit_rep(m):
        num = int(m.group(1))
        unit = m.group(2)
        words = int_to_words(num)
        if unit == 'кг':
            words += " " + pluralize(num, "килограмм", "килограмма", "килограммов")
        return words
    text = re.sub(r'\b(\d+)\s*(кг)\b', unit_rep, text)

    # 7. Decimals
    def dec_rep(m):
        return decimal_to_words(m.group(1))
    text = re.sub(r'\b(\d+[.,]\d+)\b', dec_rep, text)

    # 8. Ranges (10-20 -> от десяти до двадцати)
    def range_rep(m):
        w1 = int_to_words_genitive(int(m.group(1)))
        w2 = int_to_words_genitive(int(m.group(2)))
        return f"от {w1} до {w2}"
    text = re.sub(r'\b(\d+)-(\d+)\b', range_rep, text)
    
    # 9. Phone Numbers (+7...)
    text = re.sub(
        r'\+7\s*[\(\-]?\d{3}[\)\-]?\s*\d{3}[-]?\d{2}[-]?\d{2}',
        lambda m: "плюс семь, " + ", ".join([" ".join([UNITS[int(d)] for d in part if d.isdigit()]) for part in re.split(r'[- \(\)]+', m.group(0)[2:]) if part]),
        text
    )

    # 10. Minus sign
    text = re.sub(r'(?<!\d)-(?=\d)', 'минус ', text)

    # 11. Remaining Integers
    def int_rep(m):
        n_str = m.group(1)
        if len(n_str) > 9:
            return " ".join([UNITS[int(d)] for d in n_str])
        if n_str.startswith('0') and len(n_str) > 1:
            return " ".join([UNITS[int(d)] for d in n_str])
        return int_to_words(int(n_str))

    text = re.sub(r'\b(\d+)\b', int_rep, text)
    
    return text
