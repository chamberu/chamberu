/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';

export type WebhookTriggerOptions = {
    /** Starts with `/`; the trigger id is `webhook:<path>`. */
    path: string;
    /** Validates the delivered payload. */
    schema?: StandardSchemaV1;
    idempotencyKey?: (payload: unknown) => string | undefined;
    concurrencyKey?: (payload: unknown) => string | undefined;
};
