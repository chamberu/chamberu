/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { constants } from 'node:os';
import { join } from 'node:path';
import { SANDBOX_ENV } from '@chamvi/sandbox';
import { FALLBACK_PATH } from './constants.ts';

/** Kills the process group led by `pid`. Best effort: a gone group (ESRCH) is fine. */
export function killGroup(pid: number): void {
    try {
        process.kill(-pid, 'SIGKILL');
    } catch {
        // ESRCH: the group is gone already
    }
}

/**
 * Whether the process group led by `pid` still has a member this user may
 * signal. A group of another user (EPERM) is not ours: its id was reused.
 */
export function groupAlive(pid: number): boolean {
    try {
        process.kill(-pid, 0);
        return true;
    } catch {
        return false;
    }
}

/** The exit code a shell reports: the code, or 128 + the signal number. */
export function exitCodeOf(code: number | null, signal: NodeJS.Signals | null): number {
    if (code !== null) return code;
    const number = signal ? constants.signals[signal] : undefined;
    return 128 + (number ?? 0);
}

/**
 * The whole environment of a local exec: the host PATH, `SANDBOX_ENV`
 * without its container-only entries (HOME and `safe.directory`), HOME and
 * TMPDIR inside the workspace folder, then the configured `env`.
 */
export function buildEnv(dir: string, env: Record<string, string>): Record<string, string> {
    const base: Record<string, string> = { PATH: process.env.PATH || FALLBACK_PATH };
    for (const [key, value] of Object.entries(SANDBOX_ENV)) {
        if (key === 'HOME' || (key.startsWith('GIT_CONFIG_') && key !== 'GIT_CONFIG_NOSYSTEM')) continue;
        base[key] = value;
    }
    return {
        ...base,
        HOME: join(dir, 'home'),
        TMPDIR: join(dir, 'tmp'),
        ...env,
    };
}

export function errnoCode(error: unknown): string | undefined {
    const { code } = (error ?? {}) as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
}
