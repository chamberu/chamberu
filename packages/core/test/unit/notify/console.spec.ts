/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError, consoleNotifier } from '@chamvi/core';
import type { Notification, NotifyOptions, TriggerEnvelope } from '@chamvi/core';

const trigger: TriggerEnvelope = {
    id: 'e1',
    agent: 'release',
    trigger: 'http',
    source: 'http',
    payload: {},
    receivedAt: new Date('2026-10-21T09:00:00Z'),
};

const opts: NotifyOptions = { idempotencyKey: 'r1:a1', trigger };

function collect() {
    const lines: string[] = [];
    return { lines, write: (line: string) => { lines.push(line); } };
}

describe('consoleNotifier', () => {
    it('writes one block per notification', async () => {
        const { lines, write } = collect();
        const n: Notification = {
            kind: 'approval',
            agent: 'release',
            runId: 'r1',
            title: 'Approval required: deploy',
            body: 'Agent "release" wants to call "deploy".',
            resumeToken: 'tok',
            expiresAt: new Date('2026-10-21T10:00:00Z'),
        };
        await consoleNotifier({ write }).notify(n, opts);
        expect(lines).toEqual([
            '[chamvi] approval: Approval required: deploy (agent release, run r1, key r1:a1)',
            'Agent "release" wants to call "deploy".',
            'resume token: tok (expires 2026-10-21T10:00:00.000Z)',
        ]);
    });

    it('omits the token line without a token', async () => {
        const { lines, write } = collect();
        await consoleNotifier({ write }).notify({
            kind: 'info',
            agent: 'release',
            runId: 'r1',
            title: 'Hello',
            body: 'world',
        }, opts);
        expect(lines).toEqual([
            '[chamvi] info: Hello (agent release, run r1, key r1:a1)',
            'world',
        ]);
    });

    it('writes a token without an expiry', async () => {
        const { lines, write } = collect();
        await consoleNotifier({ write }).notify({
            kind: 'approval',
            agent: 'release',
            runId: 'r1',
            title: 't',
            body: 'b',
            resumeToken: 'tok',
        }, opts);
        expect(lines[2]).toBe('resume token: tok');
    });

    it('defaults its name to console', () => {
        expect(consoleNotifier().name).toBe('console');
    });

    it('takes a name', () => {
        expect(consoleNotifier({ name: 'dev' }).name).toBe('dev');
    });

    it('rejects an empty name', () => {
        expect(() => consoleNotifier({ name: '' })).toThrow(InvalidAgentDefinitionError);
    });
});
