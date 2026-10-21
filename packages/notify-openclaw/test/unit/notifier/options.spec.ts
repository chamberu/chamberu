/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { openclaw } from '@chamvi/notify-openclaw';
import type { OpenclawNotifierOptions } from '@chamvi/notify-openclaw';
import { hookUrl } from '../../../src/notifier/helpers.ts';

const valid: OpenclawNotifierOptions = {
    baseUrl: 'http://openclaw:18789',
    hooksToken: 'hooks-token-0123456789',
    deliver: { channel: 'telegram', to: '12345' },
};

describe('openclaw options', () => {
    it('defaults its name to openclaw', () => {
        expect(openclaw(valid).name).toBe('openclaw');
        expect(openclaw({ ...valid, name: 'chat' }).name).toBe('chat');
    });

    it.each<[string, Partial<OpenclawNotifierOptions>]>([
        ['an empty hooksToken', { hooksToken: '' }],
        ['a relative baseUrl', { baseUrl: 'openclaw:18789/x' }],
        ['a non-URL baseUrl', { baseUrl: 'not a url' }],
        ['a ftp baseUrl', { baseUrl: 'ftp://openclaw' }],
        ['a baseUrl with credentials', { baseUrl: 'http://user:pass@openclaw:18789' }],
        ['a baseUrl with a query', { baseUrl: 'http://openclaw:18789/?a=1' }],
        ['a baseUrl with a hash', { baseUrl: 'http://openclaw:18789/#x' }],
        ['a hooksPath without a leading slash', { hooksPath: 'hooks' }],
        ['a hooksPath of /', { hooksPath: '/' }],
        ['an empty channel', { deliver: { channel: '', to: '12345' } }],
        ['the channel last', { deliver: { channel: 'last', to: '12345' } }],
        ['an empty to', { deliver: { channel: 'telegram', to: '' } }],
        ['an empty accountId', {
            deliver: {
                channel: 'telegram',
                to: '12345',
                accountId: '',
            },
        }],
        ['no deliver', { deliver: undefined as unknown as OpenclawNotifierOptions['deliver'] }],
        ['an empty agentId', { agentId: '' }],
        ['an empty name', { name: '' }],
        ['a zero timeoutMs', { timeoutMs: 0 }],
        ['a fractional timeoutMs', { timeoutMs: 1.5 }],
        ['a non-function resumeUrl', { resumeUrl: 'x' as unknown as OpenclawNotifierOptions['resumeUrl'] }],
    ])('rejects %s', (_label, patch) => {
        expect(() => openclaw({ ...valid, ...patch })).toThrow(InvalidAgentDefinitionError);
    });

    it('builds the hook url', () => {
        expect(hookUrl('http://openclaw:18789/', '/hooks')).toBe('http://openclaw:18789/hooks/agent');
        expect(hookUrl('http://openclaw:18789', '/hooks')).toBe('http://openclaw:18789/hooks/agent');
        expect(hookUrl('https://x.dev/oc', '/hooks')).toBe('https://x.dev/oc/hooks/agent');
        expect(hookUrl('https://x.dev/oc/', '/custom/hooks')).toBe('https://x.dev/oc/custom/hooks/agent');
    });
});
