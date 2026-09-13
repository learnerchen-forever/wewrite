/**
 * jsdom ships no type declarations of its own, and `@types/jsdom` could not be
 * installed here (npm's cache is unwritable in this environment). The test
 * suite only uses `new JSDOM(html)` and the resulting `.window`, so that is
 * all this declares.
 *
 * Replace this file with the real package as soon as it can be installed:
 *   npm i -D @types/jsdom
 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { url?: string; runScripts?: string });
    readonly window: Window & typeof globalThis;
    serialize(): string;
  }
}
