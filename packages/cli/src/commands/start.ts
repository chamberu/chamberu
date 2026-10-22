/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import * as nodeModule from 'node:module';
import path from 'node:path';
import { TIMER_MAX_MS, envInteger } from '@chamvi/app';
import { defineCommand } from 'citty';
import type { CommandDef } from 'citty';
import { loadApp, resolveEntry } from '../entry/module.ts';
import { assertKnownArgs } from '../run/helpers.ts';
import type { CliContext } from '../run/types.ts';
import { installSignalHandlers } from '../signals/module.ts';
import {
    DEV_FORCE_EXIT_MS,
    DOTENV_FILE,
    ENTRY_ARG,
    FORCE_EXIT_MS,
    FORCE_EXIT_VARIABLE,
} from './constants.ts';
import { loadDotEnv } from './helpers.ts';

const START_ARGS = {
    entry: ENTRY_ARG,
    dev: {
        type: 'boolean',
        description: 'Development mode (used by chamvi dev)',
    },
} as const;

/**
 * `chamvi start`: loads the entry, installs the signal handlers, then
 * `app.start()`. `--dev` reads `.env`, defaults to the source entry and
 * passes `dev` to the app (MemoryStore, random secret and token).
 */
export function createStartCommand(context: CliContext): CommandDef<typeof START_ARGS> {
    return defineCommand({
        meta: {
            name: 'start',
            description: 'Start the app: HTTP, scheduler and engine',
        },
        args: START_ARGS,
        async run({ args }) {
            assertKnownArgs(args, START_ARGS);
            const dev = args.dev === true;
            const { env } = context;

            if (dev) {
                // before the entry import: module factories read env when called
                await loadDotEnv(env, path.join(context.cwd, DOTENV_FILE));
            }
            const forceExitMs = envInteger(env, FORCE_EXIT_VARIABLE, {
                default: dev ? DEV_FORCE_EXIT_MS : FORCE_EXIT_MS,
                max: TIMER_MAX_MS,
            });

            (nodeModule as { setSourceMapsSupport?: (enabled: boolean) => void }).setSourceMapsSupport?.(true);
            const entry = await resolveEntry({
                cwd: context.cwd,
                entry: args.entry,
                kind: dev ? 'source' : 'built',
            });
            const app = await loadApp(entry, context.importModule);

            const handlers = installSignalHandlers({
                target: context.signals,
                clock: context.clock,
                forceExitMs,
                stop: () => app.stop(),
                setExitCode: context.setExitCode,
                exit: context.exit,
                stderr: context.stderr,
            });

            try {
                await app.start({ dev, env });
            } catch (error) {
                if (handlers.signalled) {
                    // stopped mid-setup: the handler sets the exit code
                    return;
                }
                handlers.dispose();
                throw error;
            }
        },
    });
}
