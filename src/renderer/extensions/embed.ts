// Embed renderer — handles ![[note]] wiki-embeds and media embeds

export interface EmbedParams {
  displayAlt: string;
  width?: number;
  height?: number;
  align?: 'left' | 'right' | 'center';
}

const ALIGN_KEYWORDS = new Set(['left', 'right', 'center']);

/** Parse Obsidian embed pipe-delimited alt text into structured params */
export function parseEmbedParams(rawAlt: string): EmbedParams {
  const tokens = rawAlt.split('|').map(t => t.trim()).filter(Boolean);

  let width: number | undefined;
  let height: number | undefined;
  let align: 'left' | 'right' | 'center' | undefined;
  const captionParts: string[] = [];

  for (const token of tokens) {
    // Width×Height: e.g., "200x150"
    const dimsMatch = token.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    if (dimsMatch) {
      width = parseInt(dimsMatch[1]!, 10);
      height = parseInt(dimsMatch[2]!, 10);
      continue;
    }

    // Width only: e.g., "200"
    const widthMatch = token.match(/^(\d+)$/);
    if (widthMatch) {
      width = parseInt(widthMatch[1]!, 10);
      continue;
    }

    // Alignment keyword
    const lower = token.toLowerCase();
    if (ALIGN_KEYWORDS.has(lower)) {
      align = lower as 'left' | 'right' | 'center';
      continue;
    }

    // Everything else is caption text
    captionParts.push(token);
  }

  return {
    displayAlt: captionParts.join(' | '),
    width,
    height,
    align,
  };
}

