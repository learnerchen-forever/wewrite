// Guard tests for the provider option tables.
//
// The provider set used to be written out four times — the type, the Zod enum,
// and the dropdown in each of the two settings paths. Adding a provider to one
// place compiled cleanly while another silently omitted it, and one dropdown
// hardcoded Chinese labels. These tests fail the moment the tables, the schema
// and the translations stop agreeing.

import {
  AI_PROVIDER_OPTIONS,
  IMAGE_PROVIDER_OPTIONS,
  type AIProviderType,
  type ImageGenProviderType,
} from '../../../src/core/interfaces';
import { SettingsManager } from '../../../src/core/settings-manager';
import en from '../../../src/i18n/en.json';
import zh from '../../../src/i18n/zh-CN.json';

const ALL_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
  ...AI_PROVIDER_OPTIONS,
  ...IMAGE_PROVIDER_OPTIONS,
];

function textAccount(provider: AIProviderType) {
  return { id: 't1', name: 'Test', provider, baseUrl: 'https://example.test', apiKey: 'k', model: 'm' };
}

function imageAccount(provider: ImageGenProviderType) {
  return { id: 'i1', name: 'Test', provider, baseUrl: 'https://example.test', apiKey: 'k', model: 'm' };
}

describe('provider option tables', () => {
  it('labels every provider in both locales', () => {
    for (const option of ALL_OPTIONS) {
      expect(en[option.labelKey as keyof typeof en]).toBeTruthy();
      expect(zh[option.labelKey as keyof typeof zh]).toBeTruthy();
    }
  });

  it('offers no duplicate values within a provider list', () => {
    // `openai` deliberately appears in both lists — they describe different
    // domains (text models vs image models) — so the check is per list.
    for (const list of [AI_PROVIDER_OPTIONS, IMAGE_PROVIDER_OPTIONS]) {
      const values = list.map((option) => option.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it.each([...AI_PROVIDER_OPTIONS])('accepts text provider $value', async ({ value }) => {
    const manager = new SettingsManager('2.0.0');
    const result = await manager.load({ aiTextAccounts: [textAccount(value)] });
    expect(result.settings.aiTextAccounts).toHaveLength(1);
    expect(result.settings.aiTextAccounts[0].provider).toBe(value);
  });

  it.each([...IMAGE_PROVIDER_OPTIONS])('accepts image provider $value', async ({ value }) => {
    const manager = new SettingsManager('2.0.0');
    const result = await manager.load({ aiImageGenAccounts: [imageAccount(value)] });
    expect(result.settings.aiImageGenAccounts).toHaveLength(1);
    expect(result.settings.aiImageGenAccounts[0].provider).toBe(value);
  });
});
