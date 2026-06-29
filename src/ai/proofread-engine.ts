// Proofreading engine — LLM-based text correction with structured JSON output

import type { AITextAccount } from '../core/interfaces';
import type { LLMProviderManager } from './provider-manager';
import { createLogger } from '../utils/logger';

const log = createLogger('AI:Proofread');

export interface Correction {
  type: 'spelling' | 'grammar' | 'style';
  severity: 'major' | 'minor' | 'style';
  start: number;
  end: number;
  original: string;
  suggestion: string;
  description: string;
}

export interface ProofreadResult {
  corrections: Correction[];
}

const PROOFREAD_SYSTEM_PROMPT = `You are a precise proofreading assistant for Chinese text. Find spelling errors, grammar mistakes, and awkward phrasing. Output ONLY valid JSON.

For each issue found, provide:
- type: "spelling", "grammar", or "style"
- severity: "major" (must fix), "minor" (should fix), or "style" (optional improvement)
- start: character position (0-indexed) in the original text
- end: character position after the error
- original: the exact erroneous text
- suggestion: the corrected text
- description: brief explanation in Chinese

Rules:
1. Only flag genuine errors — if text is correct, return empty corrections array
2. Do NOT add content or rewrite style — proofreading only
3. Keep tone and meaning exactly as original
4. For each correction, provide exact character positions

Return format: {"corrections": [...]}`;

export class ProofreadEngine {
  private providerManager: LLMProviderManager;

  constructor(providerManager: LLMProviderManager) {
    this.providerManager = providerManager;
  }

  async proofread(
    account: AITextAccount,
    text: string,
    leftContext?: string,
    rightContext?: string,
    signal?: AbortSignal,
  ): Promise<ProofreadResult> {
    if (!text.trim()) return { corrections: [] };

    const userPrompt = buildProofreadPrompt(text, leftContext, rightContext);

    const response = await this.providerManager.chat(account, {
      messages: [
        { role: 'system', content: PROOFREAD_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      model: account.model,
      temperature: 0.2,
      responseFormat: 'json_object',
      signal,
    });

    const corrections = parseCorrections(response.content, text);
    return { corrections };
  }
}

function buildProofreadPrompt(text: string, leftCtx?: string, rightCtx?: string): string {
  let prompt = 'Please proofread the following text:\n\n"""\n';
  if (leftCtx) prompt += `...${leftCtx.slice(-50)}`;
  prompt += text;
  if (rightCtx) prompt += rightCtx.slice(0, 50);
  prompt += '\n"""';
  return prompt;
}

function parseCorrections(rawJson: string, originalText: string): Correction[] {
  try {
    // Extract JSON from possible markdown code blocks
    let json = rawJson.trim();
    if (json.startsWith('```json')) json = json.slice(7);
    if (json.startsWith('```')) json = json.slice(3);
    if (json.endsWith('```')) json = json.slice(0, -3);
    json = json.trim();

    const parsed = JSON.parse(json);
    const corrections: Correction[] = (parsed.corrections || []).map(
      (c: Record<string, unknown>) => ({
        type: (c.type as Correction['type']) || 'grammar',
        severity: (c.severity as Correction['severity']) || 'minor',
        start: c.start as number,
        end: c.end as number,
        original: c.original as string,
        suggestion: c.suggestion as string,
        description: c.description as string || '',
      }),
    );

    // Remap positions — LLM positions are often inaccurate
    for (const correction of corrections) {
      const actualStart = originalText.indexOf(correction.original, correction.start);
      if (actualStart >= 0) {
        correction.start = actualStart;
        correction.end = actualStart + correction.original.length;
      }
    }

    // Sort by position, remove overlaps
    corrections.sort((a, b) => a.start - b.start);
    const filtered: Correction[] = [];
    for (const c of corrections) {
      if (c.start >= 0 && c.start < c.end && c.original !== c.suggestion) {
        // Remove overlapping corrections
        if (filtered.length > 0 && c.start < filtered[filtered.length - 1].end) continue;
        filtered.push(c);
      }
    }

    return filtered;
  } catch (err) {
    log.warn('failed to parse proofread response', { err: String(err) });
    return [];
  }
}
