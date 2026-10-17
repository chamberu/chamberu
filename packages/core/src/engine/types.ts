/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent } from '../agent/types.ts';
import type { IClock } from '../clock/index.ts';
import type { INotifier } from '../notify/types.ts';
import type { Run, Step } from '../run/types.ts';
import type { IStore } from '../store/types.ts';
import type { TriggerEnvelope } from '../trigger/types.ts';

export type RunEvent = { type: 'run.updated'; run: Run } | { type: 'step.appended'; step: Step };

export type RunEngineOptions = {
    store: IStore;
    agents: Agent[];
    notifiers?: Record<string, INotifier>;
    /** Default `${hostname}-${pid}`. */
    owner?: string;
    /** Default 4. */
    maxConcurrentRuns?: number;
    /** Default 60_000, renewed every ttl/3 while running. */
    claimTtlMs?: number;
    /** HMAC secret for resume tokens; must not be empty. */
    resumeSecret: string;
    clock?: IClock;
    /** Receives errors that have no caller to throw to. Default console.error. */
    onError?: (error: unknown, run?: Run) => void;
};

export type DispatchEnvelope = Omit<TriggerEnvelope, 'id' | 'receivedAt'> & Partial<Pick<TriggerEnvelope, 'id' | 'receivedAt'>>;

export type ResumeDecision = {
    approved: boolean;
    reason?: string;
};
