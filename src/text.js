import { marked } from 'marked';

// Read Markdown as text, never as page HTML. Keep mathematical operators,
// list labels and line breaks instead of blindly removing every asterisk.
export function plainText(value) {
  const read = (tokens = []) =>
    tokens
      .map((token) => {
        switch (token.type) {
          case 'html':
            return '';
          case 'space':
          case 'br':
          case 'hr':
            return '\n';
          case 'code':
            return `${token.text}\n`;
          case 'codespan':
          case 'escape':
            return token.text;
          case 'paragraph':
          case 'heading':
          case 'blockquote':
            return `${read(token.tokens)}\n`;
          case 'list':
            return (
              token.items
                .map(
                  (item, i) =>
                    `${token.ordered ? `${Number(token.start) + i}. ` : ''}${read(item.tokens).trim()}`
                )
                .join('\n') + '\n'
            );
          case 'table':
            return (
              [token.header, ...token.rows]
                .map((row) => row.map((cell) => read(cell.tokens)).join(' · '))
                .join('\n') + '\n'
            );
          default:
            return token.tokens ? read(token.tokens) : token.text || '';
        }
      })
      .join('');
  const text = String(value ?? '').replace(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g, '$1$2');
  return read(marked.lexer(text))
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (entity) =>
        ({
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&apos;': "'",
          '&nbsp;': ' ',
        })[entity]
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function shortAnswer(text) {
  const clean = plainText(text)
    .replace(/^TYP:.*\n?/im, '')
    .trim();
  return (clean.match(/^ODPOWIED[ŹZ]:\s*(.+)/im)?.[1] || clean).trim();
}

export function expressResult(text, answerOnly = false) {
  if (!answerOnly) return shortAnswer(text);
  const source = String(text)
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```$/, '');
  try {
    const result = JSON.parse(source);
    if (typeof result.answer === 'string' && result.answer.trim()) return shortAnswer(result.answer);
  } catch {}
  // Some models return the requested short answer directly despite the JSON
  // instruction. Accept that; never guess an answer from a long explanation.
  const clean = shortAnswer(text);
  if (clean.length <= 300 && !/^[{[]/.test(clean) && !/\n\s*\n/.test(clean)) {
    const choice = clean.match(/^([A-H](?:\s*[,;]\s*[A-H])*)\s*(?:[.)]|[—–-]).*$/);
    return choice ? choice[1] : clean;
  }
  throw new Error(
    'Model nie zwrócił samej odpowiedzi. Ponów analizę albo wybierz krótki opis w ustawieniach Express.'
  );
}
