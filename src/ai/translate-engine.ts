// translate-engine.ts — LLM translation of the selected text.

import type { AITextAccountLike, TextCallOptions } from './text-client';
import { chatComplete } from './text-client';
import { buildTranslateMessages } from './prompt-templates';

/** Translate `text` into `targetLanguage` (a human-readable language name). */
export async function translateText(
  account: AITextAccountLike,
  text: string,
  targetLanguage: string,
  opts: TextCallOptions = {},
): Promise<string> {
  return chatComplete(account, buildTranslateMessages(text, targetLanguage), {
    temperature: opts.temperature ?? 0.3,
    onCall: opts.onCall,
  });
}
