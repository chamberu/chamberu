/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';

export function assertPositiveQuantity(name: string, value: unknown, parse: (value: string) => number): void {
    if (typeof value !== 'string' || !(parse(value) > 0)) {
        throw new InvalidAgentDefinitionError(`limits.${name} must be a quantity above zero, got ${JSON.stringify(value)}.`);
    }
}
