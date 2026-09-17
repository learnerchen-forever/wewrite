// The image window ships half on / half off among the built-in presets and
// among the packaged theme notes, so both behaviours stay visible: a run of
// images with no blank line between them becomes one swipeable row where the
// switch is on, and a stack of separate images where it is off.

import * as fs from 'fs';
import * as path from 'path';
import { parseFrontmatter } from '../../../src/utils/frontmatter';
import { parseImageFrontmatter } from '../../../src/core/image-config';
import { BUILTIN_PRESETS } from '../../../src/styles/style-template';

const THEMES_DIR = path.join(__dirname, '..', '..', '..', 'themes');
/** The packaged theme notes listed in themes/themes.json. */
const THEME_FILES = [
  '001-晨曦蓝调.md',
  '002-青竹雅韵.md',
  '003-落日熔金.md',
  '004-星河夜航.md',
  '005-雨过天青.md',
  '006-素笺工笔.md',
  '007-鎏金古典.md',
  '008-樱粉温柔.md',
  '009-深海静谧.md',
  '010-麦浪秋色.md',
];

describe('image window switch — packaged coverage', () => {
  it('splits the built-in presets half on / half off', () => {
    const ids = Object.keys(BUILTIN_PRESETS);
    const on = ids.filter((id) => BUILTIN_PRESETS[id].imageConfig?.slider === true);

    expect(ids).toHaveLength(10);
    expect(on).toHaveLength(5);
    for (const id of ids) {
      expect(typeof BUILTIN_PRESETS[id].imageConfig?.slider).toBe('boolean');
    }
  });

  it('splits the packaged themes half on / half off', () => {
    const sliders = THEME_FILES.map((file) => {
      const content = fs.readFileSync(path.join(THEMES_DIR, file), 'utf8');
      const fm = parseFrontmatter(content) as Record<string, unknown>;
      return { file, config: parseImageFrontmatter(fm).config };
    });

    expect(sliders).toHaveLength(10);
    expect(sliders.filter((s) => s.config.slider === true)).toHaveLength(5);
    expect(sliders.filter((s) => s.config.slider === false)).toHaveLength(5);
    // Every packaged theme still selects an image decoration; the switch is an
    // addition to it, not a replacement.
    for (const { file, config } of sliders) {
      expect(config.decoration ?? `missing in ${file}`).toBeTruthy();
      // No theme pins the margin: absent means the 0.5rem default.
      expect(config.marginY).toBeUndefined();
    }
  });

  it('falls back to independent images when a theme omits the key', () => {
    const { config } = parseImageFrontmatter({ 'media.image.decoration': 'lightShadow' });
    expect(config.slider).toBeUndefined();
  });
});
