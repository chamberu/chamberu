/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { RunWire } from '../../../../app/api/types.ts';
import {
    notifiedLine,
    pendingApprovals,
} from '../../../../app/approvals/helpers.ts';
import { wireRun } from '../../../utils/runs.ts';

describe('pendingApprovals', () => {
    const waitingOn = (id: string, approvalId: string) => ({
        id,
        agent: 'deploy',
        status: 'waiting',
        waiting: { approvalId, toolName: 'deploy' },
    }) as unknown as RunWire;

    it('hides a run whose current approval was answered here', () => {
        const run = waitingOn('r1', 'a1');
        const other = waitingOn('r2', 'a1');
        expect(pendingApprovals([run, other], [{
            run, 
            result: 'answered', 
            approved: true, 
        }])).toEqual([other]);
    });

    it('shows the run again once it waits on its next approval', () => {
        const answered = waitingOn('r1', 'a1');
        const next = waitingOn('r1', 'a2');
        expect(pendingApprovals([next], [{
            run: answered, 
            result: 'answered', 
            approved: true, 
        }])).toEqual([next]);
    });

    it('keeps a run whose answer did not land and drops the linked run', () => {
        const run = waitingOn('r1', 'a1');
        const linked = waitingOn('r3', 'a9');
        expect(pendingApprovals([run, linked], [{
            run, 
            result: 'forbidden', 
            approved: true, 
        }], 'r3')).toEqual([run]);
    });
});

describe('notifiedLine', () => {
    const waiting = {
        kind: 'approval' as const,
        approvalId: 'call-1:0',
        toolName: 'deploy',
        toolCallId: 'call-1',
        title: 'Deploy prod?',
        expiresAt: '2026-10-22T10:00:00.000Z',
    };

    it('names the channel (and address) once sent', () => {
        expect(notifiedLine(wireRun({
            waiting: {
                ...waiting,
                channel: 'capture',
                notifiedAt: '2026-10-21T10:00:00.000Z',
            },
        }))).toEqual({ text: 'capture', warn: false });
        expect(notifiedLine(wireRun({
            waiting: {
                ...waiting,
                channel: 'github',
                address: 'acme/api#12',
                notifiedAt: '2026-10-21T10:00:00.000Z',
            },
        }))).toEqual({ text: 'github · acme/api#12', warn: false });
    });

    it('says inbox only without a channel, else that it retries', () => {
        expect(notifiedLine(wireRun({ waiting }))).toEqual({ text: 'inbox only', warn: false });
        expect(notifiedLine(wireRun({ waiting: { ...waiting, channel: 'capture' } }))).toEqual({ text: 'not sent (retrying)', warn: true });
    });
});
