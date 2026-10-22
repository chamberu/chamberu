/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { Authenticator } from '@chamvi/http';
import type { IContainer } from 'eldin';
import { AppToken } from '../../module/constants.ts';

/** Every `AUTHENTICATORS` contribution, lowest `order` first (stable); none is an error. */
export function resolveAuthenticators(container: IContainer): Authenticator[] {
    const entries = container.resolveAll(AppToken.AUTHENTICATORS)
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => a.entry.order - b.entry.order || a.index - b.index);

    if (entries.length === 0) {
        throw new InvalidAgentDefinitionError('No authenticator: set CHAMVI_TOKENS, or add staticTokensModule(), authupModule() or oidcModule().');
    }

    return entries.map(({ entry }) => entry.authenticator);
}
