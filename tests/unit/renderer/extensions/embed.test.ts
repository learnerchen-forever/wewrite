import { parseEmbedParams } from '../../../../src/renderer/extensions/embed';

describe('parseEmbedParams', () => {
  it('returns empty result for empty alt', () => {
    const result = parseEmbedParams('');
    expect(result.displayAlt).toBe('');
    expect(result.width).toBeUndefined();
    expect(result.height).toBeUndefined();
    expect(result.align).toBeUndefined();
  });

  it('parses width-only dimension', () => {
    const result = parseEmbedParams('200');
    expect(result.width).toBe(200);
    expect(result.height).toBeUndefined();
    expect(result.displayAlt).toBe('');
  });

  it('parses width×height dimension', () => {
    const result = parseEmbedParams('200x150');
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
  });

  it('parses width×height with multiplication sign ×', () => {
    const result = parseEmbedParams('300×200');
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
  });

  it('parses alignment keywords', () => {
    expect(parseEmbedParams('left').align).toBe('left');
    expect(parseEmbedParams('right').align).toBe('right');
    expect(parseEmbedParams('center').align).toBe('center');
    expect(parseEmbedParams('LEFT').align).toBe('left');
    expect(parseEmbedParams('Center').align).toBe('center');
  });

  it('parses width + alignment', () => {
    const result = parseEmbedParams('200|left');
    expect(result.width).toBe(200);
    expect(result.align).toBe('left');
    expect(result.displayAlt).toBe('');
  });

  it('parses width + alignment + caption', () => {
    const result = parseEmbedParams('200|left|My vacation photo');
    expect(result.width).toBe(200);
    expect(result.align).toBe('left');
    expect(result.displayAlt).toBe('My vacation photo');
  });

  it('parses width×height + alignment', () => {
    const result = parseEmbedParams('200x150|center');
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
    expect(result.align).toBe('center');
  });

  it('handles SVG icon sizing', () => {
    const result = parseEmbedParams('16');
    expect(result.width).toBe(16);
    expect(result.height).toBeUndefined();
    expect(result.displayAlt).toBe('');
  });

  it('last dimension and alignment win on duplicates', () => {
    const result = parseEmbedParams('100|300|left|right');
    expect(result.width).toBe(300);
    expect(result.align).toBe('right');
  });

  it('handles plain caption only', () => {
    const result = parseEmbedParams('A beautiful sunset');
    expect(result.width).toBeUndefined();
    expect(result.height).toBeUndefined();
    expect(result.align).toBeUndefined();
    expect(result.displayAlt).toBe('A beautiful sunset');
  });

  it('joins multiple caption tokens with pipe', () => {
    const result = parseEmbedParams('Photo | by Steve');
    expect(result.displayAlt).toBe('Photo | by Steve');
  });
});
