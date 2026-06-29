// Per-SVG size-gated fallback — converts individual inline SVGs to PNG when
// they exceed a configurable byte threshold (default 100KB per SVG).
//
// Two reasons an SVG gets converted:
//  1. Non-inlineable — contains forbidden elements (<style>, <foreignObject>,
//     etc.) that WeChat strips. Always converted regardless of size.
//  2. Oversized — inlineable but larger than the per-SVG threshold. Converted
//     to save article space.
//
// After per-SVG conversion, if the total article still exceeds WeChat's 1MB
// hard limit, a cascade converts the remaining medium/large inline SVGs
// (largest first) until the article fits. Tiny and small SVGs are never
// cascaded — they're too small to help and lose vector quality if rasterized.

import { classifySvg, compareByTierDesc, type SvgInfo } from './svg-classifier';
import { canInlineSvg } from '../renderer/wechat-svg-sanitizer';
import { createLogger } from '../utils/logger';

const log = createLogger('SvgFallback');

/** Default per-SVG size threshold in bytes (100KB per SVG).
 *  Configurable via settings: svgFallbackThresholdKb. */
const DEFAULT_SVG_THRESHOLD_BYTES = 100_000;
// WeChat's absolute article size limit
export const MAX_CONTENT_BYTES = 1_000_000;

export interface SvgConversionItem {
  svgHtml: string;
  fingerprint: string;
  byteLength: number;
  tier: string;
  source: string;
  _pngPath?: string; // set during render phase after SVG→PNG conversion
}

export interface FallbackResult {
  html: string;
  conversions: SvgConversionItem[];
  finalByteLength: number;
  limitsOk: boolean;
  warnings: string[];
}

/** Extract all <svg> elements from HTML, classify by tier, check inline compatibility */
export function extractSvgs(html: string, sourceLabel: string): SvgInfo[] {
  const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
  const svgs: SvgInfo[] = [];
  let match: RegExpExecArray | null;
  while ((match = svgRegex.exec(html)) !== null) {
    const svgHtml = match[0];
    const info = classifySvg(svgHtml, sourceLabel);
    (info as unknown as Record<string, unknown>).canInline = canInlineSvg(svgHtml);
    svgs.push(info);
  }
  return svgs;
}

/** Apply per-SVG size-gated SVG→PNG fallback.
 *  @param svgSizeThreshold  Per-SVG byte threshold — inlineable SVGs larger
 *    than this are converted. Default 100KB. */
export function applySvgFallback(html: string, sourceLabel: string, svgSizeThreshold = DEFAULT_SVG_THRESHOLD_BYTES): FallbackResult {
  const warnings: string[] = [];
  const conversions: SvgConversionItem[] = [];
  const encoder = new TextEncoder();

  const allSvgs = extractSvgs(html, sourceLabel);
  if (allSvgs.length === 0) {
    const size = encoder.encode(html).length;
    return { html, conversions, finalByteLength: size, limitsOk: size < MAX_CONTENT_BYTES, warnings };
  }

  // Classify each SVG into one of three buckets
  const keepInline: SvgInfo[] = [];   // small enough, stays as inline SVG
  const mustConvert: SvgInfo[] = [];  // non-inlineable → must convert
  const oversized: SvgInfo[] = [];    // inlineable but too large → convert

  for (const svg of allSvgs) {
    const inlineable = (svg as unknown as Record<string, unknown>).canInline as boolean;
    if (!inlineable) {
      log.warn('applySvgFallback: SVG contains forbidden elements', {
        tier: svg.tier,
        byteLength: svg.byteLength,
        source: svg.source,
        svgStart: svg.html.slice(0, 200),
      });
      mustConvert.push(svg);
    } else if (svg.byteLength >= svgSizeThreshold) {
      oversized.push(svg);
    } else {
      keepInline.push(svg);
    }
  }

  log.info('SVG fallback classification', {
    totalSvgs: allSvgs.length,
    mustConvert: mustConvert.length,
    oversized: oversized.length,
    keepInline: keepInline.length,
    htmlSize: encoder.encode(html).length,
    svgSizeThreshold,
  });

  let workingHtml = html;

  // Per-SVG conversion for non-inlineable SVGs
  for (const svg of mustConvert) {
    const placeholder = `<img data-wewrite-svg="${conversions.length}" src="" style="max-width:100%" alt="SVG diagram">`;
    workingHtml = workingHtml.replace(svg.html, placeholder);
    conversions.push({
      svgHtml: svg.html, fingerprint: '',
      byteLength: svg.byteLength, tier: svg.tier, source: svg.source,
    });
    warnings.push(`SVG (${svg.source}, ${svg.tier}) cannot inline — converting to PNG`);
  }

  // Per-SVG conversion for oversized inlineable SVGs
  for (const svg of oversized) {
    const placeholder = `<img data-wewrite-svg="${conversions.length}" src="" style="max-width:100%" alt="SVG diagram">`;
    workingHtml = workingHtml.replace(svg.html, placeholder);
    conversions.push({
      svgHtml: svg.html, fingerprint: '',
      byteLength: svg.byteLength, tier: svg.tier, source: svg.source,
    });
    warnings.push(`SVG (${svg.source}, ${svg.tier}, ${(svg.byteLength / 1024).toFixed(1)}KB) exceeds per-SVG threshold → PNG`);
  }

  let currentSize = encoder.encode(workingHtml).length;

  // Article-level cascade: if total content still exceeds WeChat's 1MB hard
  // limit, convert the remaining medium/large inline SVGs largest-first until
  // we fit. Tiny and small SVGs are skipped — converting them loses vector
  // quality for negligible byte savings.
  if (currentSize >= MAX_CONTENT_BYTES && keepInline.length > 0) {
    const cascadable = keepInline.filter(s => s.tier === 'medium' || s.tier === 'large');
    if (cascadable.length > 0) {
      log.warn('SVG 1MB cascade triggered', { currentSize, cascadableCount: cascadable.length });
      const sorted = cascadable.sort(compareByTierDesc);
      for (const svg of sorted) {
        if (currentSize < MAX_CONTENT_BYTES) break;
        const placeholder = `<img data-wewrite-svg="${conversions.length}" src="" style="max-width:100%" alt="SVG diagram">`;
        workingHtml = workingHtml.replace(svg.html, placeholder);
        conversions.push({
          svgHtml: svg.html, fingerprint: '',
          byteLength: svg.byteLength, tier: svg.tier, source: svg.source,
        });
        currentSize = encoder.encode(workingHtml).length;
        warnings.push(`SVG (${svg.source}, ${svg.tier}) → PNG (article over 1MB limit)`);
      }
    }
  }

  const limitsOk = currentSize < MAX_CONTENT_BYTES;
  if (!limitsOk) {
    warnings.push(`Content still exceeds 1MB hard limit after all SVG→PNG conversions (${(currentSize / 1024).toFixed(1)}KB)`);
  }

  log.info('SVG fallback applied', {
    totalSvgs: allSvgs.length,
    converted: conversions.length,
    finalSize: currentSize,
    svgSizeThreshold,
    limitsOk,
  });

  return { html: workingHtml, conversions, finalByteLength: currentSize, limitsOk, warnings };
}
