// SVG tier classification by byte length.

export type SvgTier = 'tiny' | 'small' | 'medium' | 'large';

export interface SvgInfo {
  html: string;
  byteLength: number;
  tier: SvgTier;
  source: string;
}

const TIER_THRESHOLDS: Array<{ tier: SvgTier; maxBytes: number }> = [
  { tier: 'tiny', maxBytes: 1024 },
  { tier: 'small', maxBytes: 8192 },
  { tier: 'medium', maxBytes: 30720 },
  { tier: 'large', maxBytes: Infinity },
];

const TIER_ORDER: Record<SvgTier, number> = {
  large: 0,
  medium: 1,
  small: 2,
  tiny: 3,
};

export function classifySvg(svgHtml: string, source: string): SvgInfo {
  const byteLength = new TextEncoder().encode(svgHtml).length;
  let tier: SvgTier = 'large';
  for (const t of TIER_THRESHOLDS) {
    if (byteLength < t.maxBytes) {
      tier = t.tier;
      break;
    }
  }
  return { html: svgHtml, byteLength, tier, source };
}

/** Sort comparison: larger tiers first (for fallback cascade) */
export function compareByTierDesc(a: SvgInfo, b: SvgInfo): number {
  return TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
}
