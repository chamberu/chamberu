/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { Run } from '@chamberu/core';
import { serializeRun } from '../../../src/runs/helpers.ts';

describe('serializeRun', () => {
    it('drops the claim and keeps every other key', () => {
        const now = new Date(0);
        const run: Run = {
            id: 'r1',
            agent: 'gate',
            status: 'waiting',
            trigger: {
                id: 't1',
                agent: 'gate',
                trigger: 'http',
                source: 'http',
                payload: undefined,
                receivedAt: now,
            },
            usage: { inputTokens: 1, outputTokens: 1 },
            waiting: {
                kind: 'approval',
                approvalId: 'a1',
                toolName: 'deploy',
                input: {},
                expiresAt: now,
                tokenId: 'tok',
            },
            claim: { owner: 'h-1', expiresAt: now },
            createdAt: now,
            updatedAt: now,
        };
        const view = serializeRun(run);
        expect(view).not.toHaveProperty('claim');
        expect(view).toEqual({ ...run, claim: undefined });
        expect(Object.keys(view)).toEqual(Object.keys(run).filter((key) => key !== 'claim'));
        expect(view.waiting?.tokenId).toBe('tok');
    });
});
