// proofread-engine.ts — LLM proofreading: structured corrections + position resolution.
//
// The LLM returns corrections as JSON with character offsets that are often
// slightly off. This module parses the response robustly and re-anchors every
// correction onto the source text via indexOf(original) so the editor can
// apply suggestions exactly.

import type { AITextAccountLike, TextCallOptions } from './text-client';
import { chatComplete } from './text-client';
import { buildProofreadMessages } from './prompt-templates';
import { stripCodeFence, extractOuterJsonObject } from './parse-utils';

export interface ProofCorrection {
  type: string;
  start: number;
  end: number;
  original: string;
  description: string;
  suggestion: string;
}

export interface ProofreadOptions extends TextCallOptions {
  contextBefore?: string;
  contextAfter?: string;
}

// ── JSON extraction ──

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toCorrection(item: unknown): ProofCorrection | null {
  if (!isRecord(item)) return null;
  const original = typeof item.original === 'string' ? item.original : '';
  const suggestion = typeof item.suggestion === 'string' ? item.suggestion : '';
  if (!original || !suggestion) return null;
  const start = typeof item.start === 'number' ? item.start : NaN;
  const end = typeof item.end === 'number' ? item.end : NaN;
  return {
    type: typeof item.type === 'string' ? item.type : '',
    start: Number.isFinite(start) ? start : -1,
    end: Number.isFinite(end) ? end : -1,
    original,
    description: typeof item.description === 'string' ? item.description : '',
    suggestion,
  };
}

/**
 * Parse an LLM proofread response into corrections. Handles:
 *  - ```json fences
 *  - {"corrections": [...]} wrapper
 *  - a bare [...] array
 *  - per-item regex fallback (best effort)
 */
export function parseProofreadResponse(raw: string): ProofCorrection[] {
  if (!raw) return [];
  const cleaned = stripCodeFence(raw);

  const corrections: ProofCorrection[] = [];

  // 1. Full object with "corrections" key.
  const objText = extractOuterJsonObject(cleaned);
  if (objText) {
    try {
      const parsed = JSON.parse(objText) as unknown;
      if (isRecord(parsed)) {
        const list = parsed.corrections;
        if (Array.isArray(list)) {
          for (const item of list) {
            const c = toCorrection(item);
            if (c) corrections.push(c);
          }
          return corrections;
        }
      }
    } catch { /* fall through to array / regex */ }
  }

  // 2. Bare array.
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const arrText = cleaned.slice(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(arrText) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const c = toCorrection(item);
          if (c) corrections.push(c);
        }
        if (corrections.length > 0) return corrections;
      }
    } catch { /* fall through to regex */ }
  }

  // 3. Per-item regex fallback: { "start":N, "end":N, "original":"..", "suggestion":"..", ... }.
  const itemPattern = /\{\s*"start"\s*:\s*(\d+)[\s\S]*?"end"\s*:\s*(\d+)[\s\S]*?"original"\s*:\s*"([^"]*)"[\s\S]*?"suggestion"\s*:\s*"([^"]*)"[\s\S]*?\}/g;
  let match = itemPattern.exec(cleaned);
  while (match) {
    corrections.push({
      type: '',
      start: parseInt(match[1], 10),
      end: parseInt(match[2], 10),
      original: match[3],
      description: '',
      suggestion: match[4],
    });
    match = itemPattern.exec(cleaned);
  }
  return corrections;
}

// ── Position resolution ──

/**
 * Re-anchor correction offsets onto the source text. Returns a new array
 * sorted by start position with overlapping/duplicate entries removed and
 * entries whose original cannot be located dropped.
 */
export function resolveCorrectionOffsets(
  corrections: ProofCorrection[],
  text: string,
): ProofCorrection[] {
  const resolved: ProofCorrection[] = [];

  for (const c of corrections) {
    // Exact offset already matches the original text.
    if (
      Number.isInteger(c.start) && Number.isInteger(c.end) &&
      c.start >= 0 && c.end > c.start && c.end <= text.length &&
      text.slice(c.start, c.end) === c.original
    ) {
      resolved.push(c);
      continue;
    }

    // Re-anchor: search for the original substring.
    const searchFrom = Number.isInteger(c.start) && c.start > 0 ? c.start : 0;
    let idx = text.indexOf(c.original, searchFrom);
    if (idx === -1) idx = text.indexOf(c.original);
    if (idx === -1) {
      // Leniency: leading/trailing whitespace mismatch.
      const trimmed = c.original.trim();
      if (trimmed && trimmed !== c.original) {
        idx = text.indexOf(trimmed);
        if (idx !== -1) {
          resolved.push({ ...c, start: idx, end: idx + trimmed.length, original: trimmed });
          continue;
        }
      }
      continue; // cannot locate — drop
    }
    resolved.push({ ...c, start: idx, end: idx + c.original.length });
  }

  // Sort by start, then drop overlaps (keep the first / earliest).
  resolved.sort((a, b) => a.start - b.start || a.end - b.end);
  const deduped: ProofCorrection[] = [];
  let lastEnd = -1;
  for (const c of resolved) {
    if (c.start < lastEnd) continue; // overlaps a previously kept correction
    deduped.push(c);
    lastEnd = c.end;
  }
  return deduped;
}

// ── Engine entry ──

/**
 * Run a full proofread: build messages → chat → parse → resolve offsets.
 * Returns corrections sorted by position, ready for the review UI.
 */
export async function proofreadCorrections(
  account: AITextAccountLike,
  text: string,
  opts: ProofreadOptions = {},
): Promise<ProofCorrection[]> {
  const messages = buildProofreadMessages(text, opts.contextBefore, opts.contextAfter);
  const raw = await chatComplete(account, messages, {
    temperature: opts.temperature ?? 0.2,
    jsonMode: true,
    onCall: opts.onCall,
  });
  const parsed = parseProofreadResponse(raw);
  return resolveCorrectionOffsets(parsed, text);
}
