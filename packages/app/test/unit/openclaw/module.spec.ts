/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError, defineAgent, http } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { tool } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import {
    AppToken,
    ModuleName,
    configModule,
    engineModule,
    storeModule,
} from '@chamvi/app';
import { openclawModule } from '@chamvi/app/openclaw';
import { createFakeOpenclaw } from '../../../../notify-openclaw/test/utils/openclaw.ts';
import { SECRET } from '../../utils/app.ts';
import { createHarness } from '../../utils/harness.ts';
import type { Harness } from '../../utils/harness.ts';
import { createRecordingLogger } from '../../utils/logger.ts';
import { approvalModel } from '../../utils/model.ts';

const HOOKS_TOKEN = 'hooks-token-value';

function openclawEnv(patch: Record<string, string | undefined> = {}): Record<string, string | undefined> {
    return {
        OPENCLAW_BASE_URL: 'http://openclaw:18789',
        OPENCLAW_HOOKS_TOKEN: HOOKS_TOKEN,
        OPENCLAW_CHANNEL: 'telegram',
        OPENCLAW_TO: '12345',
        ...patch,
    };
}

let harnesses: Harness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((h) => h.stop()));
    harnesses = [];
    globalThis.AI_SDK_DEFAULT_PROVIDER = undefined;
});

describe('openclawModule', () => {
    it('is named after the notifier and depends on config', () => {
        const module = openclawModule({ env: openclawEnv() });
        expect(module.name).toBe('chamvi:notifier:openclaw');
        expect(module.dependencies).toEqual([ModuleName.CONFIG]);
    });

    it.each([
        ['OPENCLAW_BASE_URL'],
        ['OPENCLAW_HOOKS_TOKEN'],
        ['OPENCLAW_CHANNEL'],
        ['OPENCLAW_TO'],
    ])('reads env when called and names a missing %s', (name) => {
        expect(() => openclawModule({ env: openclawEnv({ [name]: '' }) }))
            .toThrow(new InvalidAgentDefinitionError(`${name} is required.`));
    });

    it('a malformed OPENCLAW_BASE_URL names it', () => {
        expect(() => openclawModule({ env: openclawEnv({ OPENCLAW_BASE_URL: 'openclaw' }) }))
            .toThrow('OPENCLAW_BASE_URL must be an absolute URL.');
    });

    it.each([
        ['OPENCLAW_HOOKS_TOKEN', 'tok\n', 'OPENCLAW_HOOKS_TOKEN must not hold control characters'],
        ['OPENCLAW_CHANNEL', 'last', 'OPENCLAW_CHANNEL must name a channel'],
        ['OPENCLAW_HOOKS_PATH', 'hooks', 'OPENCLAW_HOOKS_PATH must start with "/"'],
    ])('a malformed %s throws when called, naming the variable', (name, value, message) => {
        let error: unknown;
        try {
            openclawModule({ env: openclawEnv({ [name]: value }) });
        } catch (e) {
            error = e;
        }
        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((error as Error).message.startsWith(message)).toBe(true);
    });

    it('a malformed option keeps the option name', () => {
        expect(() => openclawModule({ env: openclawEnv(), hooksToken: ' padded' }))
            .toThrow('openclaw: hooksToken must not hold');
    });

    it('options win over env', () => {
        expect(() => openclawModule({
            env: {},
            baseUrl: 'http://openclaw',
            hooksToken: HOOKS_TOKEN,
            deliver: { channel: 'slack', to: 'ops' },
        })).not.toThrow();
    });

    it('delivers through the fake gateway', async () => {
        const clock = new ControllableClock(new Date('2026-10-21T09:00:00Z'));
        const fake = createFakeOpenclaw({
            token: HOOKS_TOKEN,
            hooksPath: '/oc',
            clock,
        });
        const agent = defineAgent({
            name: 'deploy',
            model: approvalModel('ship'),
            instructions: 'deploy',
            triggers: [http()],
            tools: {
                ship: tool({
                    inputSchema: z.object({}),
                    execute: async () => 'shipped',
                }),
            },
            approvals: { ship: 'user' },
            notify: 'openclaw',
        });
        const harness = await createHarness({
            env: { RESUME_SECRET: SECRET, CHAMVI_PUBLIC_URL: 'https://chamvi.example' },
            agents: [agent],
            modules: [
                configModule({ clock, logger: createRecordingLogger(clock) }),
                storeModule(),
                engineModule(),
                openclawModule({
                    env: openclawEnv({ OPENCLAW_HOOKS_PATH: '/oc', OPENCLAW_ACCOUNT_ID: 'bot' }),
                    fetch: fake.fetch,
                }),
            ],
        });
        harnesses.push(harness);

        const engine = harness.container.resolve(AppToken.ENGINE);
        const { runId } = await engine.dispatch({
            agent: 'deploy',
            trigger: 'http',
            source: 'http',
            payload: {},
        });
        await engine.idle();
        expect((await engine.getRun(runId))?.status).toBe('waiting');

        expect(fake.dispatched).toHaveLength(1);
        const [body] = fake.dispatched;
        expect(body).toMatchObject({
            channel: 'telegram',
            to: '12345',
            accountId: 'bot',
        });
        expect(body!.message).toContain(`https://chamvi.example/ui/approvals?run=${runId}&approval=`);
    });

    it('two names give two modules', async () => {
        const a = openclawModule({ env: openclawEnv() });
        const b = openclawModule({ env: openclawEnv(), name: 'ops' });
        expect(a.name).toBe('chamvi:notifier:openclaw');
        expect(b.name).toBe('chamvi:notifier:ops');

        const harness = await createHarness({
            env: { RESUME_SECRET: SECRET },
            modules: [configModule({ logger: createRecordingLogger() }), a, b],
        });
        harnesses.push(harness);
        expect(harness.container.resolveAll(AppToken.NOTIFIERS).map((n) => n.name)).toEqual(['openclaw', 'ops']);
    });
});
