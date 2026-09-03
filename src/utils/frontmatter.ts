// frontmatter.ts — Minimal YAML frontmatter helpers built on js-yaml.
//
// Replaces the gray-matter dependency: the plugin parses/serializes YAML
// frontmatter directly with js-yaml, so the dependency can be upgraded to the
// patched version (>= 4.3.1) without gray-matter's js-yaml ^3.x pin. `load`
// is the safe-by-default loader in js-yaml 4.x (and is also available in the
// currently-installed 3.x for the unit tests).

import yaml from 'js-yaml';

/** Extract the raw YAML body between the leading `---` delimiters, or null. */
export function extractFrontmatterBlock(content: string): string | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(content);
  return m ? m[1] : null;
}

/** Parse YAML frontmatter from markdown content; returns null when absent or
 *  not a YAML mapping. Malformed YAML resolves to null (callers may guard). */
export function parseFrontmatter(content: string): Record<string, unknown> | null {
  const block = extractFrontmatterBlock(content);
  if (block === null) return null;
  try {
    const data = yaml.load(block) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Split markdown content into its YAML frontmatter data and the body that
 *  follows, mirroring gray-matter's `matter(content)`. */
export function splitFrontmatter(content: string): { data: Record<string, unknown> | null; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(content);
  if (!m) return { data: null, body: content };
  const block = m[1];
  const body = content.slice(m[0].length);
  let data: Record<string, unknown> | null = null;
  try {
    const d = yaml.load(block) as unknown;
    if (d && typeof d === 'object' && !Array.isArray(d)) data = d as Record<string, unknown>;
  } catch {
    data = null;
  }
  return { data, body };
}

/** Serialize frontmatter `data` + `body` back into a markdown string. */
export function stringifyFrontmatter(body: string, data: Record<string, unknown>): string {
  return `---\n${yaml.dump(data)}---\n${body}`;
}
