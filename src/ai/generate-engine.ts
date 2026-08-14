// generate-engine.ts — LLM generation of Obsidian-compatible Mermaid diagrams
// and math formulas, guided by the curated skills in skills.ts.

import type { AITextAccountLike, TextCallOptions } from './text-client';
import { chatComplete } from './text-client';
import { buildMermaidMessages, buildMathMessages } from './prompt-templates';

/** Trim a raw model reply to bare code: strip fences and surrounding prose. */
function cleanCodeOutput(raw: string): string {
  let s = raw.trim();
  // Strip a leading ```lang ... ``` fence pair if the model wrapped the code.
  if (s.startsWith('```')) {
    const lines = s.split('\n');
    lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim().startsWith('```')) {
      lines.pop();
    }
    s = lines.join('\n').trim();
  }
  // Strip trailing explanatory prose after the last code fence.
  const lastFence = s.lastIndexOf('```');
  if (lastFence !== -1 && s.indexOf('```') !== lastFence) {
    s = s.slice(0, lastFence).trim();
  }
  return s;
}

export interface GenerateOptions extends TextCallOptions {
  /** Selected note text used as context for the generation. */
  selection?: string;
}

/** Generate an Obsidian-compatible Mermaid diagram from a description. */
export async function generateMermaid(
  account: AITextAccountLike,
  description: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const raw = await chatComplete(account, buildMermaidMessages(description, opts.selection ?? ''), {
    temperature: opts.temperature ?? 0.4,
    onCall: opts.onCall,
  });
  return cleanCodeOutput(raw);
}

/** Generate an Obsidian-compatible LaTeX math formula from a description. */
export async function generateMath(
  account: AITextAccountLike,
  description: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const raw = await chatComplete(account, buildMathMessages(description, opts.selection ?? ''), {
    temperature: opts.temperature ?? 0.3,
    onCall: opts.onCall,
  });
  return cleanCodeOutput(raw);
}
