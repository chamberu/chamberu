/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { copyFixtureApp } from '../../utils/app.ts';
import type { TempApp } from '../../utils/app.ts';
import { freePort } from '../../utils/port.ts';
import { count, spawnCli, waitForOk } from '../../utils/spawn.ts';
import type { CliProcess } from '../../utils/spawn.ts';

const LISTENING = '"msg":"listening"';

describe('bin dev', () => {
    let app: TempApp;
    let cli: CliProcess | undefined;
    let port: number;

    beforeEach(async () => {
        app = await copyFixtureApp();
        port = await freePort();
    });

    afterEach(async () => {
        cli?.kill();
        cli = undefined;
        await app.remove();
    });

    function dev(): CliProcess {
        // a group of its own, signalled like a terminal signals its foreground group
        return spawnCli(['dev'], {
            cwd: app.cwd,
            env: { PORT: String(port), HOST: '127.0.0.1' },
            detached: true,
        });
    }

    it('dev restarts on a change and Ctrl-C stops it', async () => {
        cli = dev();
        await waitForOk(`http://127.0.0.1:${port}/readyz`);
        await cli.waitForOutput((output) => count(output, LISTENING) === 1);

        await appendFile(path.join(app.cwd, 'src/agents.ts'), '\n// changed\n');
        await cli.waitForOutput((output) => count(output, LISTENING) === 2);
        await waitForOk(`http://127.0.0.1:${port}/readyz`);

        process.kill(-cli.child.pid!, 'SIGINT');
        expect(await cli.exited(15_000)).toEqual({ code: 0, signal: null });
        expect(count(cli.stderr(), 'received SIGINT, stopping')).toBe(1);
        expect(cli.stderr()).not.toContain('forced exit');
    });

    it('dev restarts on a .env change', async () => {
        await writeFile(path.join(app.cwd, '.env'), 'CHAMVI_LOG_LEVEL=info\n');
        cli = dev();
        await cli.waitForOutput((output) => count(output, LISTENING) === 1);

        await writeFile(path.join(app.cwd, '.env'), 'CHAMVI_LOG_LEVEL=info\nCHAMVI_DRAIN_TIMEOUT_MS=1000\n');
        await cli.waitForOutput((output) => count(output, LISTENING) === 2);

        process.kill(-cli.child.pid!, 'SIGINT');
        expect((await cli.exited(15_000)).code).toBe(0);
    });

    it('the dev group ends when the CLI is killed without its exit hook', async () => {
        cli = dev();
        await waitForOk(`http://127.0.0.1:${port}/readyz`);

        // SIGKILL: no exit event, nothing forwarded; only the closed stdin pipe tells the group
        process.kill(cli.child.pid!, 'SIGKILL');
        await cli.exited(5_000);

        await waitForDown(`http://127.0.0.1:${port}/readyz`, 10_000);
    });
});

async function waitForDown(url: string, timeoutMs: number): Promise<void> {
    const until = Date.now() + timeoutMs;
    for (;;) {
        try {
            await fetch(url);
        } catch {
            return;
        }
        if (Date.now() > until) {
            throw new Error(`${url} still answers ${timeoutMs}ms after the CLI died`);
        }
        await new Promise((resolve) => { setTimeout(resolve, 200); });
    }
}
