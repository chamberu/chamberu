/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '../../clock/index.ts';
import type { Run } from '../../run/types.ts';
import type { IStore } from '../../store/types.ts';

/** What the registry operations need from the engine. */
export type RegistryContext = {
    store: IStore;
    clock: IClock;
    /** The lock is retried every claimTtlMs / 3. */
    claimTtlMs: number;
    cancel: (runId: string) => Promise<void>;
    onError: (error: unknown, run?: Run) => void;
};
