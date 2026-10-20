/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as sandbox from '@chamberu/sandbox';

describe('public api', () => {
    it.each([
        'createOutputCollector',
        'resolveWorkspacePath',
        'normalizeRepo',
        'assertGitRef',
        'prepareWorkspace',
        'resolveLimits',
        'parseCpu',
        'parseMemory',
        'assertSandboxEnv',
    ])('exports %s', (name) => {
        expect(sandbox).toHaveProperty(name);
        expect(sandbox[name as keyof typeof sandbox]).toBeTypeOf('function');
    });

    it('exports the workspace constants', () => {
        expect(sandbox.WORKSPACE_ROOT).toBe('/workspace');
        expect(sandbox.OUTPUT_MAX_BYTES).toBe(65_536);
        expect(sandbox.FILE_MAX_BYTES).toBe(1_048_576);
        expect(sandbox.EXEC_TIMEOUT_MS).toBe(300_000);
        expect(sandbox.EXEC_TIMEOUT_MAX_MS).toBe(1_800_000);
        expect(sandbox.SANDBOX_ENV).toEqual({
            HOME: '/tmp',
            GIT_TERMINAL_PROMPT: '0',
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_COUNT: '1',
            GIT_CONFIG_KEY_0: 'safe.directory',
            GIT_CONFIG_VALUE_0: '/workspace',
            NPM_CONFIG_UPDATE_NOTIFIER: 'false',
            CI: 'true',
        });
        expect(sandbox.SANDBOX_ENV.GIT_CONFIG_NOSYSTEM).toBe('1');
    });

    it('exports the provider constants', () => {
        expect(sandbox.DEFAULT_LIMITS).toEqual({
            cpu: '1',
            memory: '2Gi',
            storage: '4Gi',
            pids: 512,
            timeoutMs: 1_800_000,
        });
        expect(sandbox.DEFAULT_SANDBOX_IMAGE).toBe('ghcr.io/chamberu/sandbox-node:24');
        expect(sandbox.TMP_SIZE).toBe('512Mi');
        expect(sandbox.SANDBOX_LABELS).toEqual({
            'app.kubernetes.io/managed-by': 'chamberu',
            'app.kubernetes.io/component': 'sandbox',
        });
        expect(sandbox.RUN_LABEL).toBe('chamberu.dev/run');
        expect(sandbox.WORKSPACE_LABEL).toBe('chamberu.dev/workspace');
        expect(sandbox.EXPIRES_AT_KEY).toBe('chamberu.dev/expires-at');
    });

    it('freezes the shared constants', () => {
        expect(Object.isFrozen(sandbox.SANDBOX_ENV)).toBe(true);
        expect(Object.isFrozen(sandbox.SANDBOX_LABELS)).toBe(true);
        expect(Object.isFrozen(sandbox.DEFAULT_LIMITS)).toBe(true);
    });

    it.each([
        'checkoutCommands',
    ])('keeps %s internal', (name) => {
        expect(sandbox).not.toHaveProperty(name);
    });
});
