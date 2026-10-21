/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { inspect } from 'node:util';
import { ChamviError } from '@chamvi/core';
import { STORE_ERROR_CODE } from './constants.ts';

function passwordsOf(url: string): string[] {
    let password: string;
    try {
        ({ password } = new URL(url));
    } catch {
        return [];
    }

    if (password.length === 0) {
        return [];
    }

    try {
        return [...new Set([password, decodeURIComponent(password)])];
    } catch {
        return [password];
    }
}

/**
 * The error as is, unless anything it carries (message, stack, cause, fields)
 * holds the URL's password: then a ChamviError with the password masked as
 * `***` and nothing else of the original.
 */
export function maskPassword(error: unknown, url: string): unknown {
    const passwords = passwordsOf(url);
    if (passwords.length === 0) {
        return error;
    }

    const text = inspect(error, { depth: 5 });
    if (passwords.every((password) => !text.includes(password))) {
        return error;
    }

    let message = error instanceof Error ? error.message : String(error);
    for (const password of passwords) {
        message = message.replaceAll(password, '***');
    }

    return new ChamviError({ code: STORE_ERROR_CODE, message });
}
