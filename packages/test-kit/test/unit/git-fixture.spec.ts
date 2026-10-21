/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamberu/core';
import { createGitFixture } from '@chamberu/test-kit';

describe('createGitFixture', () => {
    it('refuses file names that leave the repository', async () => {
        const outside = `chamberu-git-fixture-escape-${process.pid}`;
        await expect(createGitFixture({ [`../${outside}`]: 'x' })).rejects.toBeInstanceOf(ValidationError);
        await expect(createGitFixture({ [join(tmpdir(), outside)]: 'x' })).rejects.toBeInstanceOf(ValidationError);
        await expect(createGitFixture({ '': 'x' })).rejects.toBeInstanceOf(ValidationError);
        expect(existsSync(join(tmpdir(), outside))).toBe(false);
    });

    it('writes nested files and cleans up', async () => {
        const fixture = await createGitFixture({ 'src/a.txt': 'a' });
        expect(existsSync(join(fixture.path, 'src/a.txt'))).toBe(true);
        await fixture.cleanup();
        expect(existsSync(fixture.path)).toBe(false);
    });
});
