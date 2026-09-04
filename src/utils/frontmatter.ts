// frontmatter.ts — Minimal YAML frontmatter helpers.
//
// The plugin parses/serializes YAML frontmatter with the maintained `yaml`
// package (eemeli/yaml), replacing the earlier gray-matter/js-yaml stack.
// `parse` is the safe default in `yaml`; duplicate keys throw, which the
// theme loader avoids by deduping top-level keys before parsing.

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

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
    const data = parseYaml(block);
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
    const d = parseYaml(block);
    if (d && typeof d === 'object' && !Array.isArray(d)) data = d as Record<string, unknown>;
  } catch {
    data = null;
  }
  return { data, body };
}

/** Serialize frontmatter `data` + `body` back into a markdown string. */
export function stringifyFrontmatter(body: string, data: Record<string, unknown>): string {
  return `---\n${stringifyYaml(data)}---\n${body}`;
}
