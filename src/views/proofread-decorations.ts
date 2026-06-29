// CodeMirror 6 proofreading decorations — inline error highlighting for AI proofreading
// Three severity levels: red (major/拼写), orange (minor/语法), purple (style/建议)

import type { Correction } from '../ai/proofread-engine';

// CSS classes for severity levels
export const SEVERITY_CLASSES: Record<string, string> = {
  major: 'ww-proofread-major',   // Red underline — spelling errors
  minor: 'ww-proofread-minor',   // Orange underline — grammar errors
  style: 'ww-proofread-style',   // Purple underline — style suggestions
};

/** Create a decoration spec from a proofreading correction */
export interface ProofreadDecoration {
  from: number;
  to: number;
  correction: Correction;
  className: string;
}

/** Convert ProofreadResult corrections to decoration specs */
export function correctionsToDecorations(
  corrections: Correction[],
  baseOffset: number = 0,
): ProofreadDecoration[] {
  return corrections.map((c) => ({
    from: baseOffset + c.start,
    to: baseOffset + c.end,
    correction: c,
    className: SEVERITY_CLASSES[c.severity] || SEVERITY_CLASSES.minor,
  }));
}

/** Accumulate decoration ranges across edits (track positions) */
export function mapDecorationsThroughChanges(
  decorations: ProofreadDecoration[],
  from: number,
  to: number,
  insertLength: number,
): ProofreadDecoration[] {
  const delta = insertLength - (to - from);
  return decorations
    .map((d) => {
      // Decorations before the change: unchanged
      if (d.to <= from) return d;
      // Decorations after the change: shift by delta
      if (d.from >= to) {
        return { ...d, from: d.from + delta, to: d.to + delta };
      }
      // Decorations overlapping the change: remove
      return null;
    })
    .filter((d): d is ProofreadDecoration => d !== null);
}

/** Check if two decoration ranges overlap */
export function rangesOverlap(d1: ProofreadDecoration, d2: ProofreadDecoration): boolean {
  return d1.from < d2.to && d2.from < d1.to;
}

// CSS for proofreading decorations (injected into Obsidian)
export const PROOFREAD_CSS = `
.ww-proofread-major {
  text-decoration: underline wavy #da615c;
  text-underline-offset: 3px;
}
.ww-proofread-minor {
  text-decoration: underline wavy #e9b35f;
  text-underline-offset: 3px;
}
.ww-proofread-style {
  text-decoration: underline dotted #8981f3;
  text-underline-offset: 3px;
}

.ww-proofread-tooltip {
  position: absolute;
  z-index: 1000;
  background: #ffffff;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  padding: 12px 16px;
  max-width: 360px;
  font-size: 13px;
  line-height: 1.5;
}

.ww-proofread-tooltip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-weight: 600;
}

.ww-proofread-tooltip-severity {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.ww-proofread-tooltip-severity.major { background: #da615c; }
.ww-proofread-tooltip-severity.minor { background: #e9b35f; }
.ww-proofread-tooltip-severity.style { background: #8981f3; }

.ww-proofread-tooltip-original {
  color: #656d76;
  text-decoration: line-through;
  margin-bottom: 4px;
}

.ww-proofread-tooltip-suggestion {
  color: #1a7f37;
  font-weight: 500;
  margin-bottom: 8px;
}

.ww-proofread-tooltip-desc {
  color: #656d76;
  font-size: 12px;
  margin-bottom: 10px;
}

.ww-proofread-tooltip-actions {
  display: flex;
  gap: 8px;
}

.ww-proofread-tooltip-btn {
  padding: 4px 12px;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  background: #f6f8fa;
  cursor: pointer;
  font-size: 12px;
}

.ww-proofread-tooltip-btn.accept {
  background: #1a7f37;
  color: #fff;
  border-color: #1a7f37;
}

.ww-proofread-tooltip-btn:hover {
  opacity: 0.85;
}
`;
