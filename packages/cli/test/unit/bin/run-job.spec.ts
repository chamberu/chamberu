/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { 
    afterEach, 
    describe, 
    expect, 
    it, 
} from 'vitest';
import { RESUME_SECRET } from '../../utils/env.ts';
import { fixtureEntry, spawnCli } from '../../utils/spawn.ts';
import type { CliProcess } from '../../utils/spawn.ts';

describe('bin run-job', () => {
    let cli: CliProcess | undefined;

    afterEach(() => {
        cli?.kill();
        cli = undefined;
    });

    it('run-job echo exits 0', async () => {
        cli = spawnCli(['run-job', 'echo', '--entry', fixtureEntry('app')], { env: { RESUME_SECRET } });
        expect(await cli.exited()).toEqual({ code: 0, signal: null });
        expect(cli.stdout()).toContain('echo: completed');
    });

    it('run-job of an unknown agent exits 2', async () => {
        cli = spawnCli(['run-job', 'nope', '--entry', fixtureEntry('app')], { env: { RESUME_SECRET } });
        expect((await cli.exited()).code).toBe(2);
    });
});
