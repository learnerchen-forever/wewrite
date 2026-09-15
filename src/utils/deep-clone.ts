// Deep-clone utility.
//
// The codebase uses `JSON.parse(JSON.stringify(v))` in ~35 places to snapshot
// settings and decoration params before editing them. That idiom is correct at
// runtime, but `JSON.parse` is typed `any`, so the value silently escapes the
// type system and every consumer downstream has to cope with `any`.
//
// Wrapping it once restores the type at every call site while keeping the exact
// same runtime semantics — same JSON round-trip, same behaviour for
// `undefined` (dropped), `Date` (stringified) and cycles (throws).

/**
 * Deep-clone a JSON-serialisable value, preserving its type.
 *
 * Only use on values that are already JSON-serialisable: this is a JSON
 * round-trip, so class instances lose their prototype and functions are
 * dropped — exactly as before, now with a type that reflects it.
 */
export function deepClone<T>(value: T): T {
	const json = JSON.stringify(value);
	const parsed: unknown = JSON.parse(json);
	return parsed as T;
}
