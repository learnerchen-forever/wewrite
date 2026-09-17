// The image pickers shared by the cover zones and the note commands
// (src/views/image-picker.ts).
//
// Only the pure part is covered here — the two pickers open an Obsidian modal
// and the OS file chooser, which need a browser. What is worth pinning down is
// the MIME repair, because it is what makes images picked on Android usable at
// all.

import { ensureImageMimeType } from '../../../src/views/image-picker';

describe('ensureImageMimeType', () => {
  it('keeps a file the browser already typed', () => {
    const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    expect(ensureImageMimeType(file)).toBe(file);
  });

  it('derives the type from the extension when the picker left it empty', () => {
    // Android's chooser hands a webp over with an empty `type`, and a File
    // without one is rejected by the format check and by WeChat's uploader.
    const file = new File([new Uint8Array([1])], 'photo.webp', { type: '' });
    expect(ensureImageMimeType(file).type).toBe('image/webp');
  });

  it('treats application/octet-stream as unknown rather than as image data', () => {
    const file = new File([new Uint8Array([1])], 'photo.jpg', { type: 'application/octet-stream' });
    expect(ensureImageMimeType(file).type).toBe('image/jpeg');
  });

  it('keeps the bytes and the name of what it rewrites', async () => {
    const bytes = new Uint8Array([7, 8, 9]);
    const file = new File([bytes], 'photo.bmp', { type: '' });
    const typed = ensureImageMimeType(file);
    expect(typed.name).toBe('photo.bmp');
    expect(new Uint8Array(await typed.arrayBuffer())).toEqual(bytes);
  });

  it('leaves a format it does not know alone', () => {
    // Nothing to derive: the caller's format check is what rejects it, with a
    // message about the format rather than about a missing MIME type.
    const file = new File([new Uint8Array([1])], 'notes.txt', { type: '' });
    expect(ensureImageMimeType(file)).toBe(file);
  });
});
