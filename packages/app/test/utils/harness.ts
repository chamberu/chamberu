/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent, IClock } from '@chamvi/core';
import { Container } from 'eldin';
import type { IContainer } from 'eldin';
import { Application } from 'orkos';
import type { IModule } from 'orkos';
import { AppToken } from '../../src/module/constants.ts';
import { createStoppedError, reportingModule } from '../../src/module/helpers.ts';
import type { AppContext, AppMode } from '../../src/module/types.ts';
import type { Env } from '../../src/env/types.ts';

export type Reported = { error: unknown; context?: Record<string, unknown> };

export type HarnessOptions = {
    mode?: AppMode;
    dev?: boolean;
    env?: Env;
    modules?: IModule[];
    agents?: Agent[];
    models?: AppContext['models'];
    /** Registered as `AppToken.CLOCK` before setup (a config module may replace it). */
    clock?: IClock;
};

export type Harness = {
    application: Application;
    container: IContainer;
    context: AppContext;
    controller: AbortController;
    reported: Reported[];
    /** Runs `application.setup()`; tears down and rethrows when it fails. */
    setup(): Promise<void>;
    /** Aborts the context signal (app_stopped) and tears every module down. */
    stop(): Promise<void>;
};

/**
 * An orkos Application over a fresh eldin Container with `AppToken.CONTEXT`
 * pre-registered, the modules wrapped by `reportingModule` like the app does.
 * Not set up yet; see `createHarness()`.
 */
export function buildHarness(options: HarnessOptions = {}): Harness {
    const reported: Reported[] = [];
    const controller = new AbortController();
    const report: AppContext['report'] = (error, context) => {
        reported.push({ error, context });
    };
    const context: AppContext = {
        mode: options.mode ?? 'start',
        dev: options.dev ?? false,
        env: options.env ?? {},
        signal: controller.signal,
        report,
        models: options.models,
        agents: options.agents ?? [],
    };

    const container = new Container();
    container.register(AppToken.CONTEXT, { useValue: context });
    if (options.clock) {
        container.register(AppToken.CLOCK, { useValue: options.clock });
    }

    const application = new Application({
        container,
        modules: (options.modules ?? []).map((module) => reportingModule(module, report)),
    });

    return {
        application,
        container,
        context,
        controller,
        reported,
        async setup() {
            try {
                await application.setup();
            } catch (error) {
                await application.teardown();
                throw error;
            }
        },
        async stop() {
            if (!controller.signal.aborted) {
                controller.abort(createStoppedError());
            }
            await application.teardown();
        },
    };
}

/** `buildHarness()` and `setup()` in one step. */
export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
    const harness = buildHarness(options);
    await harness.setup();
    return harness;
}
