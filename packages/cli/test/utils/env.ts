/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Env } from '@chamvi/app';

export const RESUME_SECRET = 'a-resume-secret-of-at-least-32-characters';

export const TOKEN = 'a-static-token-of-16+';

/** The env a production start needs, on a loopback port. */
export function startEnv(port: number, extra: Env = {}): Env {
    return {
        RESUME_SECRET,
        CHAMVI_TOKENS: JSON.stringify([{
            value: TOKEN,
            id: 'ops',
            permissions: ['*'],
        }]),
        PORT: String(port),
        HOST: '127.0.0.1',
        ...extra,
    };
}
