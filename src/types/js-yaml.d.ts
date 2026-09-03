// js-yaml.d.ts — Minimal type shim for js-yaml.
//
// js-yaml (even 4.x) does not bundle its own TypeScript declarations; the
// community `@types/js-yaml` package supplies them. This local shim covers the
// small surface the plugin uses so the build type-checks without adding
// @types. Remove it if `@types/js-yaml` is added as a dependency.
declare module 'js-yaml' {
  export function load(input: string, options?: Record<string, unknown>): unknown;
  export function dump(obj: unknown, options?: Record<string, unknown>): string;
  const yaml: {
    load: typeof load;
    dump: typeof dump;
  };
  export default yaml;
}
