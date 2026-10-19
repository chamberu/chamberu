/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { IssueCode } from '@ebec/core';
import { Container, ValidupError } from 'validup';
import { describe, expect, it } from 'vitest';
import { isBoolean, isDefined, isString } from '../../../src/request/validators.ts';
import type { ValidatorDescriptor } from 'validup';

async function run(validator: ValidatorDescriptor, input: Record<string, unknown>) {
    const container = new Container<{ k: unknown }>();
    container.mount('k', validator);
    return container.run(input);
}

async function rejects(validator: ValidatorDescriptor, input: Record<string, unknown>, code: string = IssueCode.VALUE_INVALID) {
    const error = await run(validator, input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidupError);
    expect((error as ValidupError).issues[0]).toMatchObject({ path: ['k'], code });
}

describe('validators', () => {
    it('isString checks type and length', async () => {
        const v = isString({ min: 1, max: 3 });
        expect(await run(v, { k: 'a' })).toEqual({ k: 'a' });
        expect(await run(v, { k: 'abc' })).toEqual({ k: 'abc' });
        await rejects(v, { k: '' });
        await rejects(v, { k: 'abcd' });
        await rejects(v, { k: 1 });
        await rejects(v, {});
    });

    it('isBoolean accepts booleans only', async () => {
        expect(await run(isBoolean(), { k: true })).toEqual({ k: true });
        expect(await run(isBoolean(), { k: false })).toEqual({ k: false });
        await rejects(isBoolean(), { k: 'yes' });
        await rejects(isBoolean(), { k: 0 });
    });

    it('isDefined accepts everything but undefined', async () => {
        expect(await run(isDefined(), { k: null })).toEqual({ k: null });
        expect(await run(isDefined(), { k: 0 })).toEqual({ k: 0 });
        expect(await run(isDefined(), { k: {} })).toEqual({ k: {} });
        await rejects(isDefined(), {}, IssueCode.REQUIRED);
    });
});
