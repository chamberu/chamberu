/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type StaticTokensOptions = {
    /** Bearer token (at least 16 characters) to the principal it stands for. */
    tokens: Record<string, { id: string; permissions: readonly string[] }>;
};
