import type { ModelMessage } from 'ai';
import type { TriggerEnvelope } from '../trigger/types.ts';

export type RunStatus =    'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

export interface Usage {
    inputTokens: number;
    outputTokens: number;
}

export interface Budget {
    maxSteps: number;
    maxTokens?: number;
    /**
     * Wall-clock limit per execution (not cumulative across resumes): each
     * execution of the run gets the full timeout again.
     */
    timeoutMs?: number;
}

export interface RunContext {
    runId: string;
    agent: string;
    trigger: TriggerEnvelope;
    signal: AbortSignal;
}

export interface WaitPoint {
    kind: 'approval';
    approvalId: string;
    toolName: string;
    input: unknown;
    expiresAt: Date;
    tokenId: string;
}

export interface Run {
    id: string;
    agent: string;
    status: RunStatus;
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
}

export interface Step {
    runId: string;
    index: number;
    kind: 'llm' | 'tool' | 'wait';
    name?: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    startedAt: Date;
    finishedAt: Date;
}

export interface Checkpoint {
    runId: string;
    stepIndex: number;
    messages: ModelMessage[];
    /** AI SDK finish reason of the step this checkpoint was taken after. */
    finishReason?: string;
    createdAt: Date;
}
