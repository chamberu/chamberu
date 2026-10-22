/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { AppToken, consoleNotifierModule } from '@chamvi/app';
import { createHarness } from '../../../utils/harness.ts';

describe('consoleNotifierModule', () => {
    it('contributes a notifier named console', async () => {
        const module = consoleNotifierModule();
        expect(module.name).toBe('chamvi:notifier:console');
        expect(module.dependencies ?? []).toEqual([]);

        const harness = await createHarness({ modules: [module] });
        const notifiers = harness.container.resolveAll(AppToken.NOTIFIERS);
        expect(notifiers.map((notifier) => notifier.name)).toEqual(['console']);
        await harness.stop();
    });

    it('module name follows the notifier name', async () => {
        const lines: string[] = [];
        const module = consoleNotifierModule({ name: 'ops', write: (line) => { lines.push(line); } });
        expect(module.name).toBe('chamvi:notifier:ops');

        const harness = await createHarness({ modules: [module] });
        const [notifier] = harness.container.resolveAll(AppToken.NOTIFIERS);
        expect(notifier!.name).toBe('ops');
        await notifier!.notify({
            kind: 'result',
            agent: 'a',
            runId: 'r',
            title: 'done',
            body: 'ok',
        }, { idempotencyKey: 'k', trigger: undefined as never });
        expect(lines.length).toBeGreaterThan(0);
        await harness.stop();
    });
});
