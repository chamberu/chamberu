/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envInteger } from '@chamvi/app';
import { defineCommand } from 'citty';
import type { CommandDef } from 'citty';
import { loadApp, resolveEntry } from '../entry/module.ts';
import { assertKnownArgs } from '../run/helpers.ts';
import type { CliContext } from '../run/types.ts';
import { installSignalHandlers } from '../signals/module.ts';
import {
    ENTRY_ARG,
    FORCE_EXIT_MS,
    FORCE_EXIT_VARIABLE,
} from './constants.ts';

const RUN_JOB_ARGS = {
    agent: {
        type: 'positional',
        description: 'The agent whose cron trigger fires',
        required: true,
    },
    triggerId: {
        type: 'positional',
        description: 'The cron trigger id (default: the agent\'s only cron trigger)',
        required: false,
    },
    entry: ENTRY_ARG,
} as const;

/**
 * `chamvi run-job <agent> [triggerId]`: fires one cron trigger once and waits
 * for its run; exit 0 for completed, waiting, skipped, queued behind an
 * approval or interrupted by a signal, 1 for failed or cancelled.
 */
export function createRunJobCommand(context: CliContext): CommandDef<typeof RUN_JOB_ARGS> {
    return defineCommand({
        meta: {
            name: 'run-job',
            description: 'Fire one cron trigger once and wait for its run (Kubernetes CronJob)',
        },
        args: RUN_JOB_ARGS,
        async run({ args }) {
            assertKnownArgs(args, RUN_JOB_ARGS);
            const { env } = context;
            const forceExitMs = envInteger(env, FORCE_EXIT_VARIABLE, { default: FORCE_EXIT_MS });
            const entry = await resolveEntry({
                cwd: context.cwd,
                entry: args.entry,
                kind: 'built',
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

            let result;
            try {
                result = await app.runJob({
                    agent: args.agent,
                    ...(typeof args.triggerId === 'string' && { trigger: args.triggerId }),
                    env,
                });
            } catch (error) {
                if (handlers.signalled) {
                    return;
                }
                handlers.dispose();
                throw error;
            }

            if (handlers.signalled) {
                return;
            }
            handlers.dispose();

            const run = result.runId ? ` (run ${result.runId})` : '';
            context.stdout(`${args.agent}: ${result.status}${run}\n`);
            context.setExitCode(result.exitCode);
        },
    });
}
