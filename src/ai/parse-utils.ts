// parse-utils.ts — Shared robust parsing helpers for LLM text responses.
// No lookbehind regexes or `d` flags (iOS 15.7 compatibility).

/**
 * Content of the first ```-fenced block in a reply, or null when there is
 * none. An unterminated fence (a truncated reply) yields everything after the
 * opening line rather than nothing — a partial diagram is still worth
 * showing, and the validators decide what to do with it.
 */
export function extractFencedCode(raw: string): string | null {
  const closed = /^[\s\S]*?```[^\n]*\n([\s\S]*?)```/.exec(raw);
  if (closed) return closed[1];
  const open = /^[\s\S]*?```[^\n]*\n([\s\S]*)$/.exec(raw);
  return open ? open[1] : null;
}

/** Strip a ```lang ... ``` code fence if present. */
export function stripCodeFence(raw: string): string {
  const s = raw.trim();
  if (!s.startsWith('```')) return s;
  const inner = extractFencedCode(s);
  // A reply that is *only* a fence normalises to its content; anything else
  // (prose + fence, or an unterminated fence) keeps the original text so the
  // caller can decide — the previous implementation silently dropped prose.
  return inner !== null && /```\s*$/.test(s) ? inner.trim() : s;
}

/**
 * Bare code from a model reply: the first fenced block when there is one, the
 * whole reply otherwise.
 *
 * The previous implementation only stripped a fence that started the reply and
 * then truncated at the *last* fence, which for "Here is the diagram:\n```mermaid
 * …```" left the prose and the opening fence in place.
 */
export function cleanCodeOutput(raw: string): string {
  return (extractFencedCode(raw) ?? raw).trim();
}

/** Find the first '{' and the last '}' and return that substring, or null. */export function extractOuterJsonObject(raw: string): string | null {
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return raw.slice(first, last + 1);
}

/** Find the first '[' and the last ']' and return that substring, or null. */
export function extractOuterJsonArray(raw: string): string | null {
  const first = raw.indexOf('[');
  const last = raw.lastIndexOf(']');
  if (first === -1 || last === -1 || last <= first) return null;
  return raw.slice(first, last + 1);
}
