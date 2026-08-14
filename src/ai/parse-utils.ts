// parse-utils.ts — Shared robust parsing helpers for LLM text responses.
// No lookbehind regexes or `d` flags (iOS 15.7 compatibility).

/** Strip a ```lang ... ``` code fence if present. */
export function stripCodeFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    const lines = s.split('\n');
    lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim().startsWith('```')) {
      lines.pop();
    }
    s = lines.join('\n').trim();
  }
  return s;
}

/** Find the first '{' and the last '}' and return that substring, or null. */
export function extractOuterJsonObject(raw: string): string | null {
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
