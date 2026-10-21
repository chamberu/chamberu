/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '../errors/index.ts';
import type { ConsoleNotifierOptions, INotifier } from './types.ts';

/**
 * A notifier for development: writes each notification (and an approval's
 * resume token) as a few lines to `write`, `console.log` by default. Never
 * throws, so a dev setup marks every approval notified at once. Development
 * only: the logged token approves the tool call, so keep it out of logs
 * others read.
 */
export function consoleNotifier(options: ConsoleNotifierOptions = {}): INotifier {
    const name = options.name ?? 'console';
    if (typeof name !== 'string' || name.length === 0) {
        throw new InvalidAgentDefinitionError('consoleNotifier: name must be a non-empty string.');
    }
    // eslint-disable-next-line no-console
    const write = options.write ?? ((line: string) => console.log(line));
    return {
        name,
        async notify(n, opts) {
            write(`[chamvi] ${n.kind}: ${n.title} (agent ${n.agent}, run ${n.runId}, key ${opts.idempotencyKey})`);
            write(n.body);
            if (n.resumeToken) {
                const expiry = n.expiresAt ? ` (expires ${n.expiresAt.toISOString()})` : '';
                write(`resume token: ${n.resumeToken}${expiry}`);
            }
        },
    };
}
