/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ModelMessage } from 'ai';
import type { TriggerEnvelope } from '../trigger/types.ts';
import type { RunStatus } from './constants.ts';

export type RunStatusLiteral = `${RunStatus}`;

export type Usage = {
    inputTokens: number;
    outputTokens: number;
};

export type Budget = {
    maxSteps: number;
    maxTokens?: number;
    /**
     * Wall-clock limit per execution (not cumulative across resumes): each
     * execution of the run gets the full timeout again.
     */
    timeoutMs?: number;
};

export type RunContext = {
    runId: string;
    agent: string;
    trigger: TriggerEnvelope;
    /** Aborts on cancel, drain, a lost lease or the run timeout, and once the execution has ended. */
    signal: AbortSignal;
};

export type WaitPoint = {
    kind: 'approval';
    approvalId: string;
    toolName: string;
    input: unknown;
    expiresAt: Date;
    tokenId: string;
    /** Set once the agent's notifier accepted the approval request; tick() re-sends until then. */
    notifiedAt?: Date;
};

export type Run = {
    id: string;
    agent: string;
    status: RunStatusLiteral;
    trigger: TriggerEnvelope;
    concurrencyKey?: string;
    thread?: string;
    output?: unknown;
    error?: { code: string; message: string };
    usage: Usage;
    waiting?: WaitPoint;
    claim?: { owner: string; expiresAt: Date };
    /**
     * Set by cancel() on a replica that does not execute the run: the owner
     * aborts it on its next poll, and a later execution settles it cancelled.
     */
    cancelRequested?: boolean;
    createdAt: Date;
    updatedAt: Date;
    startedAt?: Date;
    finishedAt?: Date;
};

export type Step = {
    runId: string;
    index: number;
    kind: 'llm' | 'tool' | 'wait';
    name?: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    startedAt: Date;
    finishedAt: Date;
};

export type Checkpoint = {
    runId: string;
    stepIndex: number;
    messages: ModelMessage[];
    /** AI SDK finish reason of the step this checkpoint was taken after. */
    finishReason?: string;
    createdAt: Date;
};
