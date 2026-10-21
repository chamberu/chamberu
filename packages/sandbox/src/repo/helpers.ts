/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The checkout as argv lists (Decisions: Checkout); only `git init` without a repo. */
export function checkoutCommands(repo?: string, ref?: string): string[][] {
    const commands: string[][] = [['git', 'init', '-q', '.']];
    if (repo === undefined) return commands;
    commands.push(
        ['git', 'remote', 'add', 'origin', repo],
        // the empty value resets every configured credential helper
        ['git', '-c', 'credential.helper=', 'fetch', '-q', '--depth', '1', 'origin', ref ?? 'HEAD'],
        ['git', '-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD'],
        ['git', 'rev-parse', 'HEAD'],
    );
    return commands;
}

export function parseUrl(input: string): URL | undefined {
    try {
        return new URL(input);
    } catch {
        return undefined;
    }
}

/**
 * Whether `repo` has the shape `normalizeRepo` returns: an https or
 * `file:///` URL without credentials, query, fragment or whitespace, so it
 * can neither be read as a git option nor leak a token through git's stderr.
 */
export function isNormalizedRepo(repo: unknown): boolean {
    if (typeof repo !== 'string' || hasUnsafeCharacter(repo)) return false;
    if (!repo.startsWith('https://') && !repo.startsWith('file:///')) return false;
    const url = parseUrl(repo);
    return !!url &&
        url.username === '' &&
        url.password === '' &&
        !repo.includes('?') &&
        !repo.includes('#');
}

/** Whitespace or a control character, which the URL parser would silently strip. */
export function hasUnsafeCharacter(input: string): boolean {
    for (let i = 0; i < input.length; i++) {
        const code = input.charCodeAt(i);
        if (code <= 0x20 || code === 0x7F) return true;
    }
    return false;
}
