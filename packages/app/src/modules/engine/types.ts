/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type EngineModuleOptions = {
    /** Claim owner; default the engine's `${hostname}-${pid}`. */
    owner?: string;
    /** Claim lease; default the engine's 60 s. */
    claimTtlMs?: number;
};
