/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export {
    DEFAULT_HOOKS_PATH,
    MESSAGE_BODY_MAX_LENGTH,
    OPENCLAW_CHANNEL_NAME,
    OPENCLAW_REQUEST_ERROR_CODE,
    OPENCLAW_TIMEOUT_MS,
} from './constants.ts';
export * from './module.ts';
export type {
    OpenclawApprovalRef,
    OpenclawChannelOptions,
    OpenclawDelivery,
    OpenclawHookBody,
} from './types.ts';
