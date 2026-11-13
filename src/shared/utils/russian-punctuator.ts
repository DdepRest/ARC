/**
 * Intelligent Russian speech punctuation and capitalization restorer.
 * Transforms raw STT transcripts (e.g. from GigaAM CTC) into natural, grammatically structured Russian sentences.
 */

const RAW_CONJUNCTIONS = [
  'потому что', 'так как', 'как только',
  'а', 'но', 'однако', 'зато',
  'чтобы', 'если', 'хотя',
  'когда', 'куда', 'откуда', 'зачем', 'почему', 'где',
  'будто', 'словно'
];

// Sort descending by length so compound conjunctions match before single words
const CONJUNCTIONS = [...RAW_CONJUNCTIONS].sort((a, b) => b.length - a.length);

const RAW_RELATIVE_PRONOUNS = [
  'о котором', 'о которой', 'о которых',
  'который', 'которая', 'которое', 'которые',
  'которого', 'которой', 'которому', 'которым', 'которых'
];
const RELATIVE_PRONOUNS = [...RAW_RELATIVE_PRONOUNS].sort((a, b) => b.length - a.length);

const GREETINGS = [
  'добрый день', 'добрый вечер', 'доброе утро',
  'привет', 'здравствуй', 'здравствуйте',
  'слушай', 'эй'
].sort((a, b) => b.length - a.length);

const QUESTION_REGEX = /(?:^|(?:привет|здравствуй|здравствуйте|добрый\s+день|добрый\s+вечер|доброе\s+утро|слушай|эй|скажи|подскажи|арк)[,\s]+)(?:кто|что|как|где|когда|почему|зачем|сколько|какой|какая|какие|какое|куда|откуда|правда\s+ли|можешь\s+ли|знаешь\s+ли)(?=[^а-яёА-ЯЁa-zA-Z0-9]|$)/i;

const PROPER_NAME_ROOTS = [
  'лен(?:[аыеу]|ой|е)?', 'маш(?:[аыеу]|ей|е)?', 'даш(?:[аыеу]|ей|е)?', 'саш(?:[аыеу]|ей|е)?',
  'кат(?:[яею]|ей|е|и)?', 'пет(?:[яею]|ей|е|и)?', 'ван(?:[яею]|ей|е|и)?',
  'алексе(?:[йяю]|ем|е)?', 'дмитри(?:[йяю]|ем|е)?', 'москв(?:[аыеу]|ой|е)?',
  'росси(?:[яею]|ей|и)?', 'питер(?:[аеу]|ом)?', 'петербург(?:[аеу]|ом)?'
];

export function restorePunctuation(text: string): string {
  if (!text || !text.trim()) return '';

  let result = text.trim().replace(/\s+/g, ' ');

  // 1. Normalize assistant name aliases (e.g., "a.r.c." -> "АРК")
  result = result.replace(/(?<=^|[^а-яёА-ЯЁa-zA-Z0-9])(?:a\.r\.c\.|a\s+r\s+c|arc|арк)(?=[^а-яёА-ЯЁa-zA-Z0-9]|$)/gi, 'АРК');

  // Proper names inflection capitalization
  for (const root of PROPER_NAME_ROOTS) {
    const regex = new RegExp(`(?<=^|[^а-яёА-ЯЁa-zA-Z0-9])(${root})(?=[^а-яёА-ЯЁa-zA-Z0-9]|$)`, 'gi');
    result = result.replace(regex, (_, m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
  }

  // Introduction patterns: "хочу познакомить тебя с [Имя] знакомься ..."
  result = result.replace(
    /хочу\s+познакомить\s+(?:тебя|вас)\s+с\s+([а-яёА-ЯЁ]+)\s+знакомься/gi,
    'Хочу познакомить тебя с $1. Знакомься'
  );
  result = result.replace(
    /(?<=^|[.!?]\s*)знакомься[,:\s]+(АРК|[а-яёА-ЯЁ]+)/gi,
    'Знакомься: $1'
  );

  // Address before "это": "[Имя] это [Имя/АРК]" -> "[Имя], это [Имя/АРК]"
  result = result.replace(/(?<=[а-яёА-ЯЁa-zA-Z0-9])\s+это\s+(АРК|[а-яёА-ЯЁ]+)/gi, ', это $1');

  // Reciprocal introductions: "Знакомься: АРК, это [Имя]. [Имя], это АРК"
  result = result.replace(
    /(Знакомься:\s*АРК[,\s]+это\s+[а-яёА-ЯЁ]+)[,\s]+([а-яёА-ЯЁ]+)[,\s]+это(?:,\s*|\s+)АРК/gi,
    '$1. $2, это АРК'
  );

  // Fix any "это, АРК" or "это, [Имя]"
  result = result.replace(/это,\s*АРК/gi, 'это АРК');
  result = result.replace(/это,\s*([а-яёА-ЯЁ]+)/gi, 'это $1');

  // 2. Greetings at the start of sentence
  for (const greeting of GREETINGS) {
    const escaped = greeting.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^(${escaped})\\s+(?=[а-яёА-ЯЁa-zA-Z0-9])`, 'i');
    if (regex.test(result)) {
      result = result.replace(regex, '$1, ');
      break;
    }
  }

  // 3. Address to assistant inside sentence ("... АРК ...")
  // Do not add comma before АРК if preceded by "это", "—", or terminal punctuation
  result = result.replace(/(?<![.,!?;:—\s]|это)\s+АРК\s+(?=[а-яёА-ЯЁa-zA-Z0-9])/gi, ', АРК, ');
  result = result.replace(/(?<![.,!?;:—\s]|это)\s+АРК(?=[.!?]?$)/gi, ', АРК');

  // 4. Conjunctions and relative pronouns
  for (const conj of CONJUNCTIONS) {
    const escaped = conj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![.,!?;:—])\\s+(${escaped})\\s+`, 'gi');
    result = result.replace(regex, ', $1 ');
  }

  // Subordinate "что", but avoid duplicating comma in "потому что" or "так что"
  result = result.replace(/(?<!потому|так|[.,!?;:—])\s+что\s+/gi, ', что ');

  for (const rel of RELATIVE_PRONOUNS) {
    const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![.,!?;:—])\\s+(${escaped})\\s+`, 'gi');
    result = result.replace(regex, ', $1 ');
  }

  // 5. Parenthetical "пожалуйста"
  result = result.replace(/(?<![.,!?;:—])\s+(пожалуйста)\s+/gi, ', $1, ');
  result = result.replace(/(?<![.,!?;:—])\s+(пожалуйста)(?=[.!?]?$)/gi, ', $1');

  // 6. Demonstrative and definition structures with "это"
  // Keep reciprocal introduction clean
  result = result.replace(/это,\s*АРК/gi, 'это АРК');
  result = result.replace(/это,\s*([а-яёА-ЯЁ]+)/gi, 'это $1');

  // 7. Clean up redundant spaces and punctuation marks
  result = result.replace(/\s*([.,!?;:—])\s*/g, '$1 ');
  result = result.replace(/\s+([.,!?;:])/g, '$1');
  result = result.replace(/,\s*,+/g, ',');
  result = result.replace(/([.!?])\s*,/g, '$1');
  result = result.replace(/,\s*([.!?])/g, '$1');
  result = result.replace(/\s+/g, ' ').trim();

  // 8. Capitalization: capitalize proper names and sentence boundaries
  for (const root of PROPER_NAME_ROOTS) {
    const regex = new RegExp(`(?<=^|[^а-яёА-ЯЁa-zA-Z0-9])(${root})(?=[^а-яёА-ЯЁa-zA-Z0-9]|$)`, 'gi');
    result = result.replace(regex, (_, m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
  }

  // Capitalize first letter of whole sentence
  if (result.length > 0) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  // Capitalize letters following sentence delimiters (. ! ?)
  result = result.replace(/(?<=[.!?]\s+)([а-яёa-z])/g, m => m.toUpperCase());

  // 9. Sentence terminal punctuation
  const lastChar = result.slice(-1);
  if (!['.', '!', '?'].includes(lastChar)) {
    const isQuestion = QUESTION_REGEX.test(result);
    result += isQuestion ? '?' : '.';
  }

  return result;
}
