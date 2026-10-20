/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent } from '../../agent/types.ts';
import type { IClock } from '../../clock/index.ts';
import type { Run, Step, Usage } from '../../run/types.ts';
import type { IStore } from '../../store/types.ts';
import type { RunDelta } from '../types.ts';

export type ExecuteContext = {
    run: Run;
    agent: Agent;
    store: IStore;
    clock: IClock;
    /** Aborted by engine.cancel(). */
    signal: AbortSignal;
    /**
     * Settles the run (expects it `running` and claimed by this execution) and
     * emits `run.updated`; resolves undefined without writing once the lease is lost.
     */
    finish: (patch: Partial<Run>) => Promise<Run | undefined>;
    /** Patches the still `running` run and emits `run.updated`. */
    update: (patch: Partial<Run>) => Promise<Run>;
    onStepAppended: (step: Step) => void;
    /** A text or reasoning delta of the model output, while the execution was not abandoned. */
    onDelta: (delta: RunDelta) => void;
    /**
     * Moves the still `running` run to `waiting` on `request` (releasing its
     * claim and slot) and notifies the owner.
     */
    pause: (request: ApprovalRequest, usage: Usage) => Promise<void>;
    /** HMAC secret the AI SDK signs approval requests with. */
    toolApprovalSecret?: string;
    /**
     * False once another owner took the run over (its lease expired and it was
     * recovered); checked before every step and checkpoint write.
     */
    ownsRun?: () => Promise<boolean>;
};

/** A tool call waiting for the owner's decision. */
export type ApprovalRequest = {
    approvalId: string;
    toolName: string;
    input: unknown;
};
