/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { isPackageNotFound } from '../../../src/models/helpers.ts';

function withCode(message: string, code?: string): Error {
    const error = new Error(message);
    if (code) (error as Error & { code: string }).code = code;
    return error;
}

describe('isPackageNotFound', () => {
    it('reads Node\'s missing package', () => {
        const error = withCode('Cannot find package \'@ai-sdk/openai\' imported from /app/x.mjs', 'ERR_MODULE_NOT_FOUND');
        expect(isPackageNotFound(error, '@ai-sdk/openai')).toBe(true);
        expect(isPackageNotFound(error, '@ai-sdk/anthropic')).toBe(false);
    });

    it('reads Vite\'s unresolved import', () => {
        const error = withCode('Could not resolve "@ai-sdk/openai" imported by "@chamvi/app".');
        expect(isPackageNotFound(error, '@ai-sdk/openai')).toBe(true);
    });

    it('a missing file inside the package is no missing package', () => {
        const error = withCode(
            'Cannot find module \'/app/node_modules/@ai-sdk/openai/dist/index.mjs\' imported from /app/x.mjs',
            'ERR_MODULE_NOT_FOUND',
        );
        expect(isPackageNotFound(error, '@ai-sdk/openai')).toBe(false);
    });

    it('other errors are none', () => {
        expect(isPackageNotFound(new SyntaxError('Unexpected token'), '@ai-sdk/openai')).toBe(false);
        expect(isPackageNotFound('Cannot find package \'@ai-sdk/openai\'', '@ai-sdk/openai')).toBe(false);
        expect(isPackageNotFound(withCode('Could not resolve "@ai-sdk/openai"', 'ERR_OTHER'), '@ai-sdk/openai')).toBe(false);
    });
});
