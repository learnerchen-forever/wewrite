// Semantic version comparison utilities

/**
 * Compare two semantic version strings.
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 * Handles missing segments (e.g., "1.0" ≈ "1.0.0").
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);

  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/**
 * Parse a semantic version string into [major, minor, patch].
 * Strips pre-release suffixes (e.g., "1.0.0-beta.1" → [1, 0, 0]).
 * Returns [0, 0, 0] for empty or unparseable strings.
 */
export function parseVersion(v: string): [number, number, number] {
  if (!v || typeof v !== 'string') return [0, 0, 0];

  // Strip pre-release suffix
  const base = v.split('-')[0];
  const parts = base.split('.');

  return [
    parseSegment(parts[0]),
    parseSegment(parts[1]),
    parseSegment(parts[2]),
  ];
}

function parseSegment(s: string | undefined): number {
  if (s === undefined || s === '') return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}
