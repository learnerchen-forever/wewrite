// Stringification helpers for `unknown` values.
//
// Both helpers exist to make the *intent* of a stringification explicit, and to
// replace bare `String(x)` / template interpolation of `unknown` — which
// silently produce the useless "[object Object]" for any non-primitive.
//
// Pick by intent:
//   - toDisplayString   → logs, warnings, diagnostics. Show whatever there is.
//   - toPrimitiveString → config / CSS values. Non-primitives are not usable,
//                         so the caller gets `undefined` and can skip them.

/** Render any value as text for logs and diagnostics. */
export function toDisplayString(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}
	if (value === null) return 'null';
	if (value === undefined) return '';
	if (typeof value === 'symbol') return value.toString();
	try {
		// `JSON.stringify` returns undefined for functions and symbols.
		return JSON.stringify(value) ?? Object.prototype.toString.call(value);
	} catch {
		// Circular structures.
		return Object.prototype.toString.call(value);
	}
}

/**
 * Render a value that is expected to be a primitive.
 *
 * Returns `undefined` for objects, arrays, functions and symbols, so callers can
 * skip the value instead of emitting "[object Object]" into CSS or config.
 * Numbers and booleans are accepted and stringified — YAML frontmatter routinely
 * yields `id: 3` as a number where a string is meant.
 */
export function toPrimitiveString(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}
	return undefined;
}
