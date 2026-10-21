/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import path from 'node:path';
import { defineCommand } from 'citty';
import type { CommandDef } from 'citty';
import { resolveEntry } from '../entry/module.ts';
import { assertKnownArgs, createUsageError, isRecord } from '../run/helpers.ts';
import type { CliContext } from '../run/types.ts';
import {
    BUILD_OUT_DIR,
    ENTRY_ARG,
    MODULE_NOT_FOUND_CODE,
    TSDOWN_PACKAGE,
} from './constants.ts';

const BUILD_ARGS = {
    'entry': ENTRY_ARG,
    'out-dir': {
        type: 'string',
        description: `The output folder (default: ${BUILD_OUT_DIR})`,
        valueHint: 'path',
    },
} as const;

type TsdownBuild = (config: Record<string, unknown>) => Promise<unknown>;

/** Whether the error is the import of tsdown itself failing to resolve (not a module tsdown imports). */
function isTsdownMissing(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const { code } = error as { code?: unknown };
    return code === MODULE_NOT_FOUND_CODE && error.message.includes(`'${TSDOWN_PACKAGE}'`);
}

async function importTsdown(context: CliContext): Promise<TsdownBuild> {
    let exports: unknown;
    try {
        exports = await context.importModule(TSDOWN_PACKAGE);
    } catch (error) {
        if (isTsdownMissing(error)) {
            throw createUsageError(`chamvi build needs ${TSDOWN_PACKAGE}: npm install --save-dev ${TSDOWN_PACKAGE}`);
        }
        throw error;
    }

    const build = isRecord(exports) ? exports.build : undefined;
    if (typeof build !== 'function') {
        throw createUsageError(`${TSDOWN_PACKAGE} exports no build(): install tsdown ^0.23.1.`);
    }

    return build as TsdownBuild;
}

/**
 * `chamvi build`: bundles the source entry with tsdown into
 * `<out-dir>/index.mjs` (ESM, node22, source map); dependencies and peer
 * dependencies of the app's package.json stay external, the app's own
 * modules are inlined (C2).
 */
export function createBuildCommand(context: CliContext): CommandDef<typeof BUILD_ARGS> {
    return defineCommand({
        meta: {
            name: 'build',
            description: 'Bundle the app into dist/index.mjs (needs tsdown)',
        },
        args: BUILD_ARGS,
        async run({ args }) {
            assertKnownArgs(args, BUILD_ARGS);
            const entry = await resolveEntry({
                cwd: context.cwd,
                entry: args.entry,
                kind: 'source',
            });
            const build = await importTsdown(context);

            await build({
                cwd: context.cwd,
                config: false,
                entry: { index: path.relative(context.cwd, entry) },
                format: 'esm',
                platform: 'node',
                target: 'node22',
                outDir: args['out-dir'] || BUILD_OUT_DIR,
                fixedExtension: true,
                sourcemap: true,
                dts: false,
                clean: true,
                logLevel: 'warn',
            });
        },
    });
}
