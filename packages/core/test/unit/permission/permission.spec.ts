/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    hasPermission,
    matchesPermission,
    requireToolPermission,
    toolPermission,
} from '@chamberu/core';
import type { Invoker, RunContext } from '@chamberu/core';

describe('hasPermission', () => {
    it.each([
        [['*'], 'agent:x:run', true],
        [['agent:*:run'], 'agent:x:run', true],
        [['agent:*:run'], 'agent:x:approve', false],
        [['agent:*'], 'agent:x:run', false],
        [['run:read'], 'run:read', true],
        [['run:read'], 'run:cancel', false],
        [['Run:read'], 'run:read', false],
        [[], 'run:read', false],
        [['run:*', 'agent:x:run'], 'agent:x:run', true],
    ])('%j grants %s: %s', (granted, permission, expected) => {
        expect(hasPermission(granted, permission)).toBe(expected);
    });
});

describe('matchesPermission', () => {
    it.each([
        ['*', 'tool:a:b', true],
        ['*', 'x', true],
        ['tool:*:b', 'tool:a:b', true],
        ['tool:*', 'tool:a:b', false],
        ['tool:a:b:c', 'tool:a:b', false],
        ['tool:a:b', 'tool:a:c', false],
        ['*:*:*', 'tool:a:b', true],
    ])('%s matches %s: %s', (granted, wanted, expected) => {
        expect(matchesPermission(granted, wanted)).toBe(expected);
    });
});

describe('toolPermission', () => {
    it('builds tool:<agent>:<tool>', () => {
        expect(toolPermission('release', 'deploy')).toBe('tool:release:deploy');
    });
});

describe('requireToolPermission', () => {
    const run = (invoker?: Invoker): { run: RunContext } => ({
        run: {
            runId: 'r1',
            agent: 'release',
            trigger: {
                id: 't',
                agent: 'release',
                trigger: 'http',
                source: 'http',
                payload: {},
                receivedAt: new Date(0),
                invoker,
            },
            signal: new AbortController().signal,
        },
    });
    const invoker = (permissions: string[]): Invoker => ({
        id: 'u1',
        kind: 'user',
        permissions,
    });

    it.each([
        ['granted', ['tool:release:deploy'], true],
        ['wildcard segment', ['tool:release:*'], true],
        ['wildcard agent', ['tool:*:deploy'], true],
        ['everything', ['*'], true],
        ['missing', ['tool:release:other'], false],
        ['other agent', ['tool:other:deploy'], false],
        ['nothing', [], false],
    ])('%s', (_label, permissions, expected) => {
        expect(requireToolPermission()('deploy', run(invoker(permissions)))).toBe(expected);
    });

    it('denies runs without an invoker by default', () => {
        expect(requireToolPermission()('deploy', run())).toBe(false);
        expect(requireToolPermission({ withoutInvoker: 'deny' })('deploy', run())).toBe(false);
    });

    it('allows runs without an invoker on withoutInvoker allow', () => {
        expect(requireToolPermission({ withoutInvoker: 'allow' })('deploy', run())).toBe(true);
        // an invoker still has to hold the permission
        expect(requireToolPermission({ withoutInvoker: 'allow' })('deploy', run(invoker([])))).toBe(false);
    });
});
