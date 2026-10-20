/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamberu/core';
import { parseRepo, stepOf, toolError } from '../../../src/tools/helpers.ts';
import { assistant } from '../../utils/tools.ts';

describe('stepOf', () => {
    it('counts the assistant messages', () => {
        expect(stepOf({ toolCallId: 'c', messages: [] })).toBe(0);
        expect(stepOf({ toolCallId: 'c', messages: [{ role: 'user', content: 'x' }, assistant()] })).toBe(1);
        expect(stepOf({ toolCallId: 'c', messages: [assistant(), { role: 'user', content: 'x' }, assistant()] })).toBe(2);
    });

    it('stops at the assistant message that requested the call (approval path)', () => {
        const before = [{ role: 'user' as const, content: 'x' }, assistant()];
        expect(stepOf({ toolCallId: 'c-7', messages: [...before, assistant('c-7')] })).toBe(1);
        expect(stepOf({ toolCallId: 'c-7', messages: [...before, assistant('c-7'), assistant()] })).toBe(1);
        // another call id: counted as an earlier step
        expect(stepOf({ toolCallId: 'c-8', messages: [...before, assistant('c-7')] })).toBe(2);
    });
});

describe('parseRepo', () => {
    it('splits owner and name', () => {
        expect(parseRepo('octo/demo')).toEqual({ owner: 'octo', repo: 'demo' });
        expect(parseRepo('my-org/my.repo_1')).toEqual({ owner: 'my-org', repo: 'my.repo_1' });
    });

    it('refuses anything else', () => {
        for (const repo of ['', 'octo', 'a/b/c', '/demo', 'octo/', 'a b/c', 42]) {
            expect(() => parseRepo(repo)).toThrow(ValidationError);
        }
    });
});

describe('toolError', () => {
    it('keeps status and message of a GitHub error, never the request', () => {
        const requestError = Object.assign(new Error('Not Found - https://docs.github.com/rest'), {
            name: 'HttpError',
            status: 404,
            request: { headers: { authorization: 'token ghs_1' } },
        });
        const error = toolError(requestError);
        expect(error.message).toBe('GitHub 404: Not Found - https://docs.github.com/rest');
        expect(JSON.stringify(error)).not.toContain('ghs_');
        expect('request' in error).toBe(false);
    });

    it('passes chamberu errors through', () => {
        const validation = new ValidationError('bad');
        expect(toolError(validation)).toBe(validation);
    });
});
