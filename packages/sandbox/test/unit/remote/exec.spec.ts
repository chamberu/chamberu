/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { SandboxError, ValidationError } from '@chamberu/core';
import { EXEC_GRACE_MS, OUTPUT_MAX_BYTES, createRemoteWorkspace } from '@chamberu/sandbox';
import type { TransportExecResult } from '@chamberu/sandbox';
import { ControllableClock } from '../../utils/clock.ts';
import { createFakeTransport } from '../../utils/transport.ts';
import type { FakeTransportHandler } from '../../utils/transport.ts';

const START = 1_000_000;

/** Lets already-queued callbacks settle; not a sleep. */
const flush = () => new Promise<void>((resolve) => { setImmediate(resolve); });

const encode = (text: string) => new TextEncoder().encode(text);

function setup(handler?: FakeTransportHandler, lifetimeMs = 1_800_000) {
    const clock = new ControllableClock(new Date(START));
    const transport = createFakeTransport(handler);
    const workspace = createRemoteWorkspace({
        id: 'ws-1',
        info: {
            runId: 'run-1',
            provider: 'remote',
            createdAt: new Date(START),
            expiresAt: new Date(START + lifetimeMs),
        },
        transport,
        clock,
    });
    return {
        clock,
        transport,
        workspace,
    };
}

/** A transport exec that never settles. */
const hang = () => new Promise<Partial<TransportExecResult>>(() => {
    // never settles
});

describe('remote workspace: exec', () => {
    it('wraps argv in timeout', async () => {
        const { transport, workspace } = setup();
        const result = await workspace.exec(['npm', 'test'], { timeoutMs: 1500 });
        expect(transport.calls).toHaveLength(1);
        expect(transport.calls[0]!.argv).toEqual(['timeout', '-k', '5', '1.5', 'npm', 'test']);
        expect(transport.calls[0]!.options).toMatchObject({ cwd: '/workspace', maxOutputBytes: OUTPUT_MAX_BYTES });
        expect(transport.calls[0]!.options.maxOutputBytes).toBe(65_536);
        expect(transport.calls[0]!.options.stdin).toBeUndefined();
        expect(result).toEqual({
            exitCode: 0,
            stdout: '',
            stderr: '',
            stdoutTruncated: false,
            stderrTruncated: false,
            timedOut: false,
            durationMs: 0,
        });
    });

    it('defaults to the exec timeout', async () => {
        const { transport, workspace } = setup();
        await workspace.exec(['true']);
        expect(transport.calls[0]!.argv).toEqual(['timeout', '-k', '5', '300', 'true']);
    });

    it('caps the timeout at the exec maximum', async () => {
        const { transport, workspace } = setup(undefined, 3_600_000);
        await workspace.exec(['true'], { timeoutMs: 7_200_000 });
        expect(transport.calls[0]!.argv.slice(0, 4)).toEqual(['timeout', '-k', '5', '1800']);
    });

    it('resolves cwd under the root', async () => {
        const { transport, workspace } = setup();
        await workspace.exec(['pwd'], { cwd: 'pkg' });
        await workspace.exec(['pwd'], { cwd: '/workspace/pkg/sub/' });
        await workspace.exec(['pwd'], { cwd: '/workspace' });
        expect(transport.calls.map((call) => call.options.cwd)).toEqual([
            '/workspace/pkg',
            '/workspace/pkg/sub',
            '/workspace',
        ]);

        for (const cwd of ['../x', '../..', '/etc', '', 'a\0b']) {
            await expect(workspace.exec(['pwd'], { cwd })).rejects.toBeInstanceOf(ValidationError);
        }
        expect(transport.calls).toHaveLength(3);
    });

    it('validates argv, stdin and timeoutMs before any call', async () => {
        const { transport, workspace } = setup();
        await expect(workspace.exec([])).rejects.toBeInstanceOf(ValidationError);
        await expect(workspace.exec([''])).rejects.toBeInstanceOf(ValidationError);
        await expect(workspace.exec(['echo', 'a\0b'])).rejects.toBeInstanceOf(ValidationError);
        await expect(workspace.exec(['echo', 1 as unknown as string])).rejects.toBeInstanceOf(ValidationError);
        await expect(workspace.exec(['cat'], { stdin: 1 as unknown as string })).rejects.toBeInstanceOf(ValidationError);
        await expect(workspace.exec(['true'], { timeoutMs: 0 })).rejects.toBeInstanceOf(ValidationError);
        await expect(workspace.exec(['true'], { timeoutMs: NaN })).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(0);
    });

    it('clamps to the expiry', async () => {
        const { transport, workspace } = setup(undefined, 10_000);
        await workspace.exec(['npm', 'test'], { timeoutMs: 60_000 });
        expect(transport.calls[0]!.argv).toEqual(['timeout', '-k', '5', '10', 'npm', 'test']);
    });

    it('rounds a fractional timeout up to whole milliseconds', async () => {
        const { transport, workspace } = setup();
        await workspace.exec(['true'], { timeoutMs: 1500.2 });
        expect(transport.calls[0]!.argv[3]).toBe('1.501');
    });

    it('reports a timeout', async () => {
        const slow = setup(() => {
            slow.clock.advance(1500);
            return { exitCode: 124 };
        });
        const timedOut = await slow.workspace.exec(['sleep', '30'], { timeoutMs: 1500 });
        expect(timedOut).toMatchObject({
            exitCode: 124,
            timedOut: true,
            durationMs: 1500,
        });

        const killed = setup(() => {
            killed.clock.advance(6500);
            return { exitCode: 137 };
        });
        expect(await killed.workspace.exec(['sleep', '30'], { timeoutMs: 1500 })).toMatchObject({ exitCode: 137, timedOut: true });

        const fast = setup(() => {
            fast.clock.advance(10);
            return { exitCode: 124 };
        });
        const own = await fast.workspace.exec(['sh', '-c', 'exit 124'], { timeoutMs: 1500 });
        expect(own).toMatchObject({
            exitCode: 124,
            timedOut: false,
            durationMs: 10,
        });

        const failed = setup(() => {
            failed.clock.advance(2000);
            return { exitCode: 1 };
        });
        expect(await failed.workspace.exec(['false'], { timeoutMs: 1500 })).toMatchObject({ exitCode: 1, timedOut: false });
    });

    it('guards a hung transport', async () => {
        const {
            clock, 
            transport, 
            workspace, 
        } = setup(hang);
        const pending = workspace.exec(['sleep', '30'], { timeoutMs: 1500 });
        await flush();
        expect(transport.calls).toHaveLength(1);
        const { signal } = transport.calls[0]!.options;
        expect(signal.aborted).toBe(false);

        clock.advance(1500 + EXEC_GRACE_MS - 1);
        await flush();
        expect(signal.aborted).toBe(false);

        clock.advance(1);
        const result = await pending;
        expect(result).toMatchObject({
            exitCode: 137,
            timedOut: true,
            durationMs: 1500 + EXEC_GRACE_MS,
        });
        expect(signal.aborted).toBe(true);
        expect(transport.calls).toHaveLength(1);
    });

    it('clears the guard when the exec settles', async () => {
        const {
            clock, 
            transport, 
            workspace, 
        } = setup();
        await workspace.exec(['true'], { timeoutMs: 1500 });
        clock.advance(1500 + EXEC_GRACE_MS);
        expect(transport.calls[0]!.options.signal.aborted).toBe(false);
    });

    it('decodes and flags output', async () => {
        const { workspace } = setup(() => ({
            exitCode: 2,
            stdout: encode('é'),
            stdoutTruncated: true,
            stderr: encode('boom\n'),
        }));
        expect(await workspace.exec(['x'])).toMatchObject({
            exitCode: 2,
            stdout: 'é',
            stderr: 'boom\n',
            stdoutTruncated: true,
            stderrTruncated: false,
        });
    });

    it('drops a multi-byte character the cap cut', async () => {
        const bytes = new Uint8Array(OUTPUT_MAX_BYTES);
        bytes.fill(0x61);
        bytes.set(encode('€').subarray(0, 2), OUTPUT_MAX_BYTES - 2);
        const { workspace } = setup(() => ({ stdout: bytes, stdoutTruncated: true }));
        const result = await workspace.exec(['x']);
        expect(result.stdout).toBe('a'.repeat(OUTPUT_MAX_BYTES - 2));
        expect(result.stdoutTruncated).toBe(true);
    });

    it('caps output a transport returns past the limit', async () => {
        const { workspace } = setup(() => ({ stdout: new Uint8Array(OUTPUT_MAX_BYTES + 10).fill(0x61) }));
        const result = await workspace.exec(['x']);
        expect(result.stdout).toHaveLength(OUTPUT_MAX_BYTES);
        expect(result.stdoutTruncated).toBe(true);
    });

    it('rejects after dispose and when expired', async () => {
        const { transport, workspace } = setup();
        await workspace.dispose();
        await workspace.dispose();
        expect(transport.removed).toBe(1);
        await expect(workspace.exec(['true'])).rejects.toBeInstanceOf(SandboxError);
        await expect(workspace.exec(['true'])).rejects.toThrow(/disposed/);
        await expect(workspace.readFile('a')).rejects.toBeInstanceOf(SandboxError);
        await expect(workspace.writeFile('a', 'x')).rejects.toBeInstanceOf(SandboxError);

        const expiring = setup(undefined, 10_000);
        expiring.clock.advance(10_000);
        await expect(expiring.workspace.exec(['true'])).rejects.toThrow(/expired/);
        await expect(expiring.workspace.exec(['true'])).rejects.toBeInstanceOf(SandboxError);
        await expect(expiring.workspace.readFile('a')).rejects.toBeInstanceOf(SandboxError);
        await expect(expiring.workspace.writeFile('a', 'x')).rejects.toBeInstanceOf(SandboxError);
        expect(expiring.transport.calls).toHaveLength(0);
    });

    it('turns a failing remove into SandboxError', async () => {
        const { transport, workspace } = setup();
        const cause = new Error('daemon down');
        transport.failNextRemove(cause);
        const error = await workspace.dispose().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SandboxError);
        expect((error as SandboxError).cause).toBe(cause);
    });

    it('tries a failed remove again on the next dispose', async () => {
        const { transport, workspace } = setup();
        transport.failNextRemove(new Error('daemon down'));
        await expect(workspace.dispose()).rejects.toBeInstanceOf(SandboxError);
        await expect(workspace.exec(['true'])).rejects.toThrow(/disposed/);

        await workspace.dispose();
        await workspace.dispose();
        expect(transport.removed).toBe(2);
        expect(transport.calls).toHaveLength(0);
    });

    it.each([
        ['resolves exit 137', () => ({ exitCode: 137 })],
        ['rejects a 404', () => { throw Object.assign(new Error('no such container'), { statusCode: 404 }); }],
    ])('settles in-flight execs on dispose (the transport then %s)', async (_name, after) => {
        const gate = Promise.withResolvers<void>();
        const { transport, workspace } = setup(async () => {
            await gate.promise;
            return after();
        });
        const pending = workspace.exec(['sleep', '30']);
        const settled = expect(pending).rejects.toThrow(/disposed/);
        await flush();
        const { signal } = transport.calls[0]!.options;

        await workspace.dispose();
        expect(signal.aborted).toBe(true);
        expect(transport.removed).toBe(1);
        gate.resolve();
        await settled;
        await expect(pending).rejects.toBeInstanceOf(SandboxError);
    });

    it('passes stdin as UTF-8 bytes', async () => {
        const { transport, workspace } = setup();
        await workspace.exec(['cat'], { stdin: 'piped ✓' });
        const { stdin } = transport.calls[0]!.options;
        expect(stdin).toBeInstanceOf(Uint8Array);
        expect(new TextDecoder().decode(stdin)).toBe('piped ✓');
        expect(stdin).toHaveLength(9);
    });

    it('turns a transport error into SandboxError', async () => {
        const cause = new Error('connection reset');
        const { workspace } = setup(() => { throw cause; });
        const error = await workspace.exec(['true']).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SandboxError);
        expect((error as SandboxError).message).toMatch(/connection reset/);
        expect((error as SandboxError).cause).toBe(cause);
    });

    it('keeps a SandboxError of the transport', async () => {
        const original = new SandboxError('exec refused');
        const { workspace } = setup(() => { throw original; });
        await expect(workspace.exec(['true'])).rejects.toBe(original);
    });

    it('detaches on abort', async () => {
        const { transport, workspace } = setup(hang);
        const controller = new AbortController();
        const pending = workspace.exec(['sleep', '30'], { signal: controller.signal });
        const settled = expect(pending).rejects.toThrow(/aborted/);
        await flush();
        const { signal } = transport.calls[0]!.options;
        expect(signal.aborted).toBe(false);

        controller.abort();
        await settled;
        await expect(pending).rejects.toBeInstanceOf(SandboxError);
        expect(signal.aborted).toBe(true);
        expect(transport.calls).toHaveLength(1);
        expect(transport.removed).toBe(0);
    });

    it('refuses an already aborted signal without a call', async () => {
        const { transport, workspace } = setup();
        await expect(workspace.exec(['true'], { signal: AbortSignal.abort() })).rejects.toThrow(/aborted/);
        expect(transport.calls).toHaveLength(0);
    });
});
