// Shared font-family picker used by the theme editor and the theme wizard.
// A grouped <select> where every option renders in its own font stack,
// so users can preview the font before picking it.

import { FONT_FAMILY_OPTIONS, type FontFamilyCategory } from '../core/interfaces';
import { t } from '../i18n';

const GROUP_LABEL_KEYS: Record<FontFamilyCategory, string> = {
  sans: 'font_select.group_sans',
  serif: 'font_select.group_serif',
  mono: 'font_select.group_mono',
};

const CATEGORY_ORDER: FontFamilyCategory[] = ['sans', 'serif', 'mono'];

/**
 * Build a grouped font-family select.
 * Unknown/legacy values (e.g. a raw CSS stack stored by an older theme) are
 * preserved as an extra selected option so they round-trip without data loss.
 */
export function createFontFamilySelect(current: string, onChange: (id: string) => void): HTMLSelectElement {
  const select = document.createElement('select');
  select.style.cssText = 'flex:1;min-width:0;font-size:12px;padding:3px 6px';
  select.title = t('font_select.title');

  const known = FONT_FAMILY_OPTIONS.some((f) => f.id === current);
  if (current && !known) {
    const opt = select.createEl('option', { text: current, value: current });
    opt.selected = true;
  }

  for (const category of CATEGORY_ORDER) {
    const group = select.createEl('optgroup', { attr: { label: t(GROUP_LABEL_KEYS[category]) } });
    for (const font of FONT_FAMILY_OPTIONS) {
      if (font.category !== category) continue;
      const opt = group.createEl('option', { text: font.name, value: font.id });
      opt.style.fontFamily = font.css;
      if (font.id === current) opt.selected = true;
    }
  }

  select.addEventListener('change', () => onChange(select.value));
  return select;
}
