/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { SandboxError, ValidationError } from '@chamberu/core';
import type { ExecResult } from '@chamberu/sandbox';
import type { GitFixture } from '@chamberu/test-kit';
import { createFixture, setupCoding } from '../../utils/setup.ts';
import type { CodingSetup } from '../../utils/setup.ts';

let fixture: GitFixture;
let s: CodingSetup;

beforeAll(async () => { fixture = await createFixture(); });
afterAll(async () => { await fixture.cleanup(); });
beforeEach(async () => { s = await setupCoding(fixture); });
afterEach(async () => { await s.cleanup(); });

describe('bash', () => {
    it('runs a command and reports the exit code', async () => {
        const result = await s.call<ExecResult>('bash', { command: 'echo hi && exit 4' });
        expect(result).toMatchObject({
            exitCode: 4,
            stdout: 'hi\n',
            stderr: '',
            stdoutTruncated: false,
            stderrTruncated: false,
            timedOut: false,
        });
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('runs in a cwd', async () => {
        await expect(s.call('bash', { command: 'ls', cwd: 'src' })).resolves.toMatchObject({ stdout: 'a.ts\n' });
        await expect(s.call('bash', { command: 'ls', cwd: '../' })).rejects.toThrow(ValidationError);
    });

    it('refuses timeouts out of range', async () => {
        await expect(s.call('bash', { command: 'true', timeoutMs: 0 })).rejects.toThrow(ValidationError);
        await expect(s.call('bash', { command: 'true', timeoutMs: 1_800_001 })).rejects.toThrow(ValidationError);
        await expect(s.call('bash', { command: '' })).rejects.toThrow(ValidationError);
    });

    it('times out', async () => {
        await expect(s.call('bash', { command: 'sleep 30', timeoutMs: 300 })).resolves.toMatchObject({ timedOut: true });
    });

    it('stops on abort', async () => {
        const controller = new AbortController();
        const started = Date.now();
        setTimeout(() => controller.abort(), 200);
        await expect(s.call('bash', { command: 'sleep 30' }, 'r1', controller.signal)).rejects.toThrow(SandboxError);
        expect(Date.now() - started).toBeLessThan(10_000);
    });
});
