/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Engine, IClock } from '@chamvi/core';
import type { AgentIssue } from '@chamvi/http';
import type { ILogger } from '../../logger/types.ts';
import type { ModelCheck } from '../../models/types.ts';

export type AgentsWatcherOptions = {
    /** The agents dir, absolute. */
    root: string;
    engine: Engine;
    /** The code agents' names: a folder of such a name is an issue, never loaded or removed. */
    codeNames: ReadonlySet<string>;
    check: ModelCheck;
    clock: IClock;
    logger: ILogger;
    pollMs: number;
    /** Aborts the boot load between folders. */
    signal?: AbortSignal;
};

export interface IAgentsWatcher {
    /**
     * Loads every folder and registers its agent (code agents win a name
     * clash), then removes every agent with a revision marker but neither a
     * folder nor a code agent. Load failures are issues; store failures throw.
     */
    boot(): Promise<void>;
    /** Polls every `pollMs` until stopped; idempotent, a no-op once stopped. */
    start(): void;
    /** Idempotent: no further poll; resolves once the poll in flight (a reload included) settled. */
    stop(): Promise<void>;
    /** Resolves once the poll in flight, if any, settled. */
    idle(): Promise<void>;
    /** The current load issues, as a fresh array. */
    issues(): AgentIssue[];
}
