export function stemRussian(word: string): string {
  let w = word.toLowerCase();
  const rv = w.match(/^[а-яё]*?[аеиоуыэюяё](.*)$/);
  if (!rv) return w;
  let p = rv[1];
  
  let origP = p;
  p = p.replace(/(в|вши|вшись)$/, '');
  if (p === origP) {
    p = p.replace(/(ив|ивши|ившись|ыв|ывши|ывшись)$/, '');
  }
  if (p !== origP) {
    return w.slice(0, w.length - (origP.length - p.length));
  }
  
  origP = p;
  p = p.replace(/(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/, '');
  if (p !== origP) {
    let p2 = p.replace(/(ивш|ывш|ующ)$/, '');
    if (p2 === p) p2 = p.replace(/(ащ|ящ|вш)$/, '');
    p = p2;
  } else {
    origP = p;
    p = p.replace(/(ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)$/, '');
    if (p === origP) {
      p = p.replace(/(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)$/, '');
    }
    if (p === origP) {
      p = p.replace(/(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/, '');
    }
  }
  
  p = p.replace(/и$/, '');
  
  const der = p.match(/.*[^аеиоуыэюяё]+[аеиоуыэюяё].*ость?$/);
  if (der) {
    p = p.replace(/ость?$/, '');
  }
  
  p = p.replace(/(ейше|ейш)$/, '');
  p = p.replace(/ь$/, '');
  
  return w.slice(0, w.length - (rv[1].length - p.length));
}
