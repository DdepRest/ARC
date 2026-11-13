import re
from silero_number_converter import convert_numbers
from english_pronunciation_dict import ENGLISH_PRONUNCIATION_DICT

# IT/English mapping
it_dict = {
    r'\bJSON\b': 'джейсон',
    r'\bSpaceX\b': 'спейс экс',
    r'\bAPI\b': 'апи',
    r'\bCPU\b': 'си пи ю',
    r'\bGPU\b': 'джи пи ю',
    r'\bYouTube\b': 'ютуб',
    r'\bPayPal\b': 'пэйпэл',
    r'\bInstagram\b': 'инстаграм',
    r'\bGoogle\b': 'гугл',
    r'\bNetflix\b': 'нетфликс',
    r'\bTikTok\b': 'тикток',
    r'\bFacebook\b': 'фейсбук',
    r'\bWhatsApp\b': 'ватсап',
    r'\bTesla\b': 'тесла',
    r'\bMicrosoft\b': 'майкрософт',
    r'\bGitHub\b': 'гитхаб',
    r'\bNode\b': 'ноуд',
    r'\bPython\b': 'питон',
    r'\bVue\b': 'вью',
    r'\bReact\b': 'реакт',
    r'\bTypeScript\b': 'тайпскрипт',
    r'\bJavaScript\b': 'джаваскрипт',
    r'\bElectron\b': 'электрон',
    r'\bCreator\b': 'криэйтор',
    r'\bCreators\b': 'криэйторы',
    r'\bWebAudio\b': 'веб аудио',
    r'\bWebSocket\b': 'вебсокет',
    r'\bZustand\b': 'зустанд',
    r'\bLangChain\b': 'лэнгчейн',
    r'\bLinux\b': 'линукс',
    r'\bWindows\b': 'виндовс',
    r'\bmacOS\b': 'макос',
    r'\bbrowser\b': 'браузер',
    r'\bserver\b': 'сервер',
    r'\bdatabase\b': 'датабейз',
    r'\bfrontend\b': 'фронтенд',
    r'\bbackend\b': 'бэкенд',
    r'\bframework\b': 'фреймворк',
    r'\blibrary\b': 'библиотека',
    r'\binterface\b': 'интерфейс',
    r'\bOK\b': 'окей',
    r'\bhello\b': 'хеллоу',
    r'\bworld\b': 'ворлд',
    r'\boffline\b': 'офлайн',
    r'\bonline\b': 'онлайн',
    r'\bvideo\b': 'видео',
    r'\bvideos\b': 'видео',
    r'\bviral\b': 'вирусный',
    r'\bchannel\b': 'канал',
    r'\bchannels\b': 'каналы',
    r'\bcontent\b': 'контент',
    r'\bstream\b': 'стрим',
    r'\bstreams\b': 'стримы',
    r'\bstreamer\b': 'стример',
    r'\bstreamers\b': 'стримеры',
    r'\binfluencing\b': 'инфлюенсинг',
    r'\binfluence\b': 'инфлюенс',
    r'\binfluencer\b': 'инфлюенсер',
    r'\bByteDance\b': 'байтданс',
    r'\buser\b': 'юзер',
    r'\busers\b': 'юзеры',
    r'\bservice\b': 'сервис',
    r'\bservices\b': 'сервисы',
    r'\bsite\b': 'сайт',
    r'\bsites\b': 'сайты',
    r'\bwebsite\b': 'вебсайт',
    r'\bplatform\b': 'платформа',
    r'\bblog\b': 'блог',
    r'\bblogger\b': 'блогер',
    r'\bbloggers\b': 'блогеры',
    r'\bapp\b': 'приложение',
    r'\bmusic\b': 'музыка',
    r'\btrack\b': 'трек',
    r'\btracks\b': 'треки',
    r'\bpodcast\b': 'подкаст',
    r'\bpodcasts\b': 'подкасты',
    r'\bmedia\b': 'медиа',
    r'\bchat\b': 'чат',
    r'\bbot\b': 'бот',
    r'\bbots\b': 'боты',
    r'\bnetwork\b': 'сеть',
    r'\binternet\b': 'интернет',
    r'\bAWS\b': 'а-вэ-эс',
    r'\bAzure\b': 'ажур',
    r'\bGCP\b': 'джи-си-пи',
    r'\bHeroku\b': 'хироку',
    r'\bVercel\b': 'версель',
    r'\bNetlify\b': 'нетлифай',
    r'\bCloudflare\b': 'клаудфлэр',
    r'\bDigitalOcean\b': 'диджитал оушен',
    r'\bMongoDB\b': 'монго ди-би',
    r'\bPostgreSQL\b': 'постгрес',
    r'\bMySQL\b': 'май-эскью-эл',
    r'\bRedis\b': 'редис',
    r'\bSQLite\b': 'эскью-лайт',
    r'\bMariaDB\b': 'мария ди-би',
    r'\bOracle\b': 'оракл',
    r'\bDocker\b': 'докер',
    r'\bKubernetes\b': 'кубернетис',
    r'\bTerraform\b': 'терраформ',
    r'\bAnsible\b': 'ансибл',
    r'\bJenkins\b': 'дженкинс',
    r'\bGitLab\b': 'гитлаб',
    r'\bAngular\b': 'ангулар',
    r'\bSvelte\b': 'свелт',
    r'\bNext\.js\b': 'некст джей-эс',
    r'\bNuxt\.js\b': 'накст джей-эс',
    r'\bExpress\b': 'экспресс',
    r'\bFastify\b': 'фастифай',
    r'\bNestJS\b': 'нест джей-эс',
    r'\bDjango\b': 'джанго',
    r'\bFlask\b': 'фласк',
    r'\bSpring\b': 'спринг',
    r'\bnpm\b': 'эн-пи-эм',
    r'\byarn\b': 'ярн',
    r'\bwebpack\b': 'вебпак',
    r'\bbabel\b': 'бабел',
    r'\beslint\b': 'и-эс-линт',
    r'\bprettier\b': 'претье',
    r'\bjest\b': 'джест',
    r'\bmocha\b': 'мока',
    r'\bcypress\b': 'сайпрес',
    r'\bREST\b': 'рест',
    r'\bGraphQL\b': 'граф-кью-эл',
    r'\bSOAP\b': 'соуп',
    r'\bHTTP\b': 'эйч-ти-ти-пи',
    r'\bHTTPS\b': 'эйч-ти-ти-пи-эс',
    r'\bMQTT\b': 'эм-кью-ти-ти',
    r'\bAMQP\b': 'эй-эм-кью-пи',
    r'\bJava\b': 'джава',
    r'\bKotlin\b': 'котлин',
    r'\bSwift\b': 'свифт',
    r'\bRust\b': 'раст',
    r'\bGo\b': 'го',
    r'\bScala\b': 'скала',
    r'\bRuby\b': 'руби',
    r'\bPHP\b': 'пи-эйч-пи',
    r'\bC\+\+\b': 'си-плюс-плюс',
    r'\bC#\b': 'си-шарп',
    r'\bDart\b': 'дарт',
    r'\bFlutter\b': 'флаттер',
    r'\bOAuth\b': 'о-аут',
    r'\bJWT\b': 'джей-дабл-ю-ти',
    r'\bSAML\b': 'самл',
    r'\bLDAP\b': 'эл-дап',
    r'\bSSL\b': 'эс-эс-эл',
    r'\bTLS\b': 'ти-эл-эс',
    r'\bMicroservices\b': 'микросервисы',
    r'\bMonolith\b': 'монолит',
    r'\bServerless\b': 'серверлесс',
    r'\bCDN\b': 'си-ди-эн',
    r'\bLoad Balancer\b': 'лоуд балансер',
    r'\bUnit Test\b': 'юнит тест',
    r'\bIntegration Test\b': 'интегрейшн тест',
    r'\bE2E\b': 'и-ту-и',
    r'\bSelenium\b': 'селениум',
    r'\bPlaywright\b': 'плейрайт',
    r'\bPrometheus\b': 'прометеус',
    r'\bGrafana\b': 'графана',
    r'\bELK\b': 'и-эл-кей',
    r'\bDatadog\b': 'датадог',
    r'\bNew Relic\b': 'нью релик',
    r'\bTensorFlow\b': 'тенсорфлоу',
    r'\bPyTorch\b': 'пайторч',
    r'\bKeras\b': 'керас',
    r'\bScikit-learn\b': 'сайкит-лёрн',
    r'\bPandas\b': 'пандас',
    r'\bNumPy\b': 'нампай',
    r'\bJupyter\b': 'джупитер',
    r'\bColab\b': 'колаб',
    r'\bdebug\b': 'дебаг',
    r'\bdeploy\b': 'деплой',
    r'\bcommit\b': 'коммит',
    r'\bpush\b': 'пуш',
    r'\bpull\b': 'пул',
    r'\bmerge\b': 'мёрдж',
    r'\bfork\b': 'форк',
    r'\bbranch\b': 'бранч',
    r'\bissue\b': 'ишью',
    r'\bPR\b': 'пи-ар',
    r'\bbug\b': 'баг',
    r'\bfeature\b': 'фича',
    r'\brefactor\b': 'рефактор',
    r'\bcode review\b': 'код ревью',
    r'\bsprint\b': 'спринт',
    r'\bscrum\b': 'скрам',
    r'\bkanban\b': 'канбан',
    r'\bagile\b': 'аджайл',
    r'\bwaterfall\b': 'вотерфол',
}

# Abbreviations
abbreviations = {
    'АРК': 'арк',
    'A.R.C.': 'арк',
    'США': 'сша',
    'ООН': 'оон',
    'ВУЗ': 'вуз',
    'МИД': 'мид',
    'НАТО': 'нато',
    'ФСБ': 'эф эс бэ',
    'КГБ': 'ка гэ бэ',
    'МВД': 'эм вэ дэ',
    'U.S.A.': 'сша',
    'IT': 'ай-ти',
    'AI': 'эй-ай',
    'ML': 'эм-эл',
    'DL': 'ди-эл',
    'NLP': 'эн-эл-пи',
    'CV': 'си-ви',
    'UI': 'ю-ай',
    'UX': 'ю-экс',
    'SDK': 'эс-ди-кей',
    'IDE': 'ай-ди-и',
    'CLI': 'си-эл-ай',
    'GUI': 'джи-ю-ай',
    'CRUD': 'крад',
    'MVC': 'эм-ви-си',
    'MVVM': 'эм-ви-ви-эм',
    'SOLID': 'солид',
    'DRY': 'драй',
    'KISS': 'кисс',
    'YAGNI': 'ягни',
    'TDD': 'ти-ди-ди',
    'BDD': 'би-ди-ди',
    'CI': 'си-ай',
    'CD': 'си-ди',
    'DevOps': 'девопс',
    'SRE': 'эс-ар-и',
    'QA': 'кью-эй',
    'QC': 'кью-си',
    'EU': 'и-ю',
    'UK': 'ю-кей',
    'UN': 'ю-эн',
    'WHO': 'дабл-ю-эйч-о',
    'IMF': 'ай-эм-эф',
    'WTO': 'дабл-ю-ти-о',
    'ASEAN': 'асеан',
    'BRICS': 'брикс',
    'G7': 'джи-сэвен',
    'G20': 'джи-твенти',
    'VR': 'ви-ар',
    'AR': 'эй-ар',
    'MR': 'эм-ар',
    'XR': 'экс-ар',
    'IoT': 'ай-о-ти',
    '5G': 'файв-джи',
    '6G': 'сикс-джи',
    'Wi-Fi': 'вай-фай',
    'Bluetooth': 'блютус',
    'NFC': 'эн-эф-си',
    'RFID': 'ар-эф-ай-ди',
    'GPS': 'джи-пи-эс',
    'GLONASS': 'глонасс',
    'CEO': 'си-и-о',
    'CTO': 'си-ти-о',
    'CFO': 'си-эф-о',
    'COO': 'си-о-о',
    'CMO': 'си-эм-о',
    'HR': 'эйч-ар',
    'PR': 'пи-ар',
    'B2B': 'би-ту-би',
    'B2C': 'би-ту-си',
    'SaaS': 'саас',
    'PaaS': 'паас',
    'IaaS': 'аас',
    'ROI': 'ар-о-ай',
    'KPI': 'кей-пи-ай',
    'OKR': 'о-кей-ар',
}

# Homographs dictionary mapping specific word sequences to accents
# format: regex pattern -> replacement
homographs = {
    r'\bдверной\s+замок\b': r'дверной зам+ок',
    r'\bоткрыть\s+замок\b': r'открыть зам+ок',
    r'\bв\s+замок\b': r'в зам+ок', # Usually insert key into lock
    r'\bна\s+замок\b': r'на зам+ок', 
    r'\bсломать\s+замок\b': r'сломать зам+ок',
    r'\bзакрыт\s+на\s+замок\b': r'закрыт на зам+ок',
    
    r'\bсредневековый\s+замок\b': r'средневековый з+амок',
    r'\bстарый\s+замок\b': r'старый з+амок',
    r'\bкрасивый\s+замок\b': r'красивый з+амок',
    r'\bпостроить\s+замок\b': r'построить з+амок',
}

def transliterate_root_or_dict(root):
    # 1. Explicit project/IT dictionary has highest priority.
    root_lower = root.lower()
    for pat, rep in it_dict.items():
        clean_pat = pat.replace(r'\b', '').replace('\\b', '')
        if clean_pat.lower() == root_lower:
            return rep

    # 2. Large phonetic English lexicon (~125k words).
    phonetic = ENGLISH_PRONUNCIATION_DICT.get(root_lower)
    if phonetic:
        return phonetic

    # 3. Last-resort heuristic for truly unknown English tokens.
    return transliterate_english(root)

def transliterate_english(word):
    # Last-resort phonetic approximation for words absent from the large lexicon.
    # This is intentionally conservative: the lexicon above handles normal English.
    w = word.lower()

    special = {
        'th': 'т',
        'tion': 'шн',
        'sion': 'жн',
        'ture': 'чэр',
        'ough': 'оф',
        'eigh': 'эй',
        'igh': 'ай',
        'ph': 'ф',
        'sh': 'ш',
        'ch': 'ч',
        'ck': 'к',
        'qu': 'кв',
        'wh': 'в',
        'wr': 'р',
        'kn': 'н',
        'gn': 'н',
        'mb': 'м',
        'ng': 'нг',
        'ee': 'и',
        'ea': 'и',
        'oo': 'у',
        'ou': 'ау',
        'ow': 'ау',
        'aw': 'о',
        'ay': 'эй',
        'ey': 'эй',
        'oy': 'ой',
        'ai': 'эй',
        'oa': 'оу',
        'ar': 'ар',
        'er': 'эр',
        'ir': 'ёр',
        'ur': 'ёр',
    }

    for k in sorted(special, key=len, reverse=True):
        w = w.replace(k, special[k])

    subs = {
        'a': 'а', 'b': 'б', 'c': 'к', 'd': 'д', 'e': 'э', 'f': 'ф',
        'g': 'г', 'h': 'х', 'i': 'и', 'j': 'дж', 'k': 'к', 'l': 'л',
        'm': 'м', 'n': 'н', 'o': 'о', 'p': 'п', 'q': 'к', 'r': 'р',
        's': 'с', 't': 'т', 'u': 'у', 'v': 'в', 'w': 'в', 'x': 'кс',
        'y': 'й', 'z': 'з'
    }
    return ''.join(subs.get(ch, ch) for ch in w)

def resolve_homographs(text):
    for pattern, repl in homographs.items():
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)
    return text

def mark_keywords(text):
    # Simple heuristic to emphasize certain known project keywords
    text = re.sub(r'\b(система|ошибка|внимание|успешно)\b', r'+\1', text, flags=re.IGNORECASE)
    # A.R.C is converted to 'арк' in abbreviations, we can accent it too
    text = re.sub(r'\b(арк)\b', r'+\1', text, flags=re.IGNORECASE)
    return text

def normalize_text(text):
    # Strip markdown, URLs, paths
    text = re.sub(r'http[s]?://\S+', 'ссылка', text)
    text = re.sub(r'```[\s\S]*?```', 'блок кода', text)
    text = re.sub(r'`[^`]+`', 'код', text)
    text = re.sub(r'[A-Za-z]:\\[^\s]+', 'путь', text)
    
    # 0. Hybrids (Latin root + Cyrillic ending with hyphen or without, e.g. Creator-ы, YouTube-ом)
    def hybrid_replacer(m):
        return transliterate_root_or_dict(m.group(1)) + m.group(2)
    text = re.sub(r'\b([a-zA-Z]+)-?([А-Яа-яЁё]+)\b', hybrid_replacer, text)

    # 1. Abbreviations
    for abbr, rep in abbreviations.items():
        # custom word boundary that allows dots
        text = re.sub(r'(?<![а-яА-Яa-zA-Z])' + re.escape(abbr) + r'(?![а-яА-Яa-zA-Z])', rep, text, flags=re.IGNORECASE)
        
    # 2. Known IT/English words
    for pat, rep in it_dict.items():
        text = re.sub(pat, rep, text, flags=re.IGNORECASE)
        
    # 3. Handle remaining English words (detect and transliterate)
    def eng_replacer(m):
        return transliterate_root_or_dict(m.group(0))
    text = re.sub(r'\b[a-zA-Z]+\b', eng_replacer, text)
        
    # 4. Numbers
    text = convert_numbers(text)
    
    # 5. Homographs
    text = resolve_homographs(text)
    
    # 6. Keyword emphasis
    text = mark_keywords(text)
    
    # Remove unsupported symbols (preserve punctuation including colon and dash for pauses)
    text = re.sub(r'[^\w\sА-Яа-яЁё.,?!;:+\-%—]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text
