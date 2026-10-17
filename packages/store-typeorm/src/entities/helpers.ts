/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * A \u escape that Postgres jsonb rejects: NUL, or a surrogate. JSON.stringify
 * writes surrogate pairs as raw characters, so an escaped surrogate is always
 * a lone one. The leading group keeps an escaped backslash (`\\u0000` is the
 * text "\u0000", not a NUL) out of the match.
 */
const UNSUPPORTED_JSONB_ESCAPE = /(?<!\\)((?:\\\\)*)\\u(?:0000|d[89a-f][0-9a-f]{2})/g;

/**
 * JSON text for a jsonb value: NUL characters and lone surrogates, which
 * jsonb cannot hold, become U+FFFD.
 */
export function json(value: unknown): string {
    return JSON.stringify(value).replace(UNSUPPORTED_JSONB_ESCAPE, '$1\\ufffd');
}

/**
 * The value the Postgres driver serializes for a jsonb column. The driver
 * writes JSON.stringify(value) for anything but null and undefined (which
 * become SQL NULL), so a JSON null and the sanitized text both travel
 * through toJSON.
 */
export function toJsonParameter(value: unknown): { toJSON: () => unknown } {
    const text = json(value);
    return { toJSON: () => JSON.parse(text) };
}
