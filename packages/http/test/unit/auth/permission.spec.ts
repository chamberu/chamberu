/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { agentPermission, hasPermission } from '@chamberu/http';
import type { Principal } from '@chamberu/http';

const principal = (permissions: string[]): Principal => ({
    id: 'p',
    kind: 'token',
    permissions,
});

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
    ])('%j grants %s: %s', (granted, permission, expected) => {
        expect(hasPermission(principal(granted), permission)).toBe(expected);
    });
});

describe('agentPermission', () => {
    it('builds agent:<name>:<action>', () => {
        expect(agentPermission('triage', 'approve')).toBe('agent:triage:approve');
        expect(agentPermission('triage', 'run')).toBe('agent:triage:run');
    });
});
