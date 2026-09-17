// chunking.ts — Shared text chunking and bounded-concurrency helpers.
//
// Proofreading a long note and translating a long selection are the same
// problem: one model call has a size at which its output stays reliable, so
// the text is walked in chunks and the results are stitched back together.
// Both features therefore share this module — the splitting rule (never cut
// inside a paragraph if a paragraph break is available) is what keeps a
// correction or a sentence from being sliced in half by a chunk edge.

export interface TextChunk {
  /** The slice to send. */
  text: string;
  /** Where `text` starts in the source, so results can be shifted back. */
  offset: number;
}

/**
 * Split a document into request-sized chunks.
 *
 * Cuts at a paragraph break when one is available, otherwise at a line break,
 * so a correction is not sliced in half by a chunk edge. Text with neither —
 * one enormous line — is cut at the limit, which is the only option left.
 *
 * The slices are contiguous: `chunks[i].offset + chunks[i].text.length`
 * equals `chunks[i + 1].offset`, and concatenating them reproduces every
 * character of the input (each separator stays with the chunk that follows
 * it). Callers rely on that both to map offsets back and to reassemble.
 */
export function splitTextChunks(text: string, maxChars: number): TextChunk[] {
  const limit = Math.max(1, Math.floor(maxChars));
  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + limit, text.length);
    if (end < text.length) {
      const paragraph = text.lastIndexOf('\n\n', end);
      const line = text.lastIndexOf('\n', end);
      // `lastIndexOf` finds the break closest to the limit, so chunks stay
      // close to full whenever the source has any break at all.
      if (paragraph > start) end = paragraph;
      else if (line > start) end = line;
    }
    const slice = text.slice(start, end);
    if (slice.trim()) chunks.push({ text: slice, offset: start });
    start = end;
  }
  return chunks;
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };
  const size = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}
