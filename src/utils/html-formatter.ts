// Lightweight HTML indenter for debug dump readability.
// No dependencies, no DOM — pure string processing.

const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'dd', 'details',
  'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header',
  'html', 'legend', 'li', 'main', 'nav', 'ol', 'p', 'pre',
  'section', 'style', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'title', 'tr', 'ul',
]);

export function formatHtml(html: string): string {
  const tokens = html.split(/(<[^>]+>)/g).filter(Boolean);
  let indent = 0;
  const out: string[] = [];

  for (const token of tokens) {
    if (!token.startsWith('<')) {
      const trimmed = token.trim();
      if (trimmed) out.push('  '.repeat(indent) + trimmed);
      continue;
    }

    const isClose = token.startsWith('</');
    const isSelfClose = token.endsWith('/>');
    const tagMatch = token.match(/^<\/?(\w+)/);
    const tagName = tagMatch ? tagMatch[1].toLowerCase() : '';

    if (isClose && BLOCK.has(tagName)) {
      indent = Math.max(0, indent - 1);
    }

    out.push('  '.repeat(indent) + token);

    if (!isClose && !isSelfClose && BLOCK.has(tagName)) {
      indent++;
    }
  }

  return out.join('\n');
}
