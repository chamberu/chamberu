/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** OpenClaw's default `hooks.path`. */
export const DEFAULT_HOOKS_PATH = '/hooks';

/** Bound of one send, below the engine's notify lock (`claimTtlMs`, 60 s). */
export const OPENCLAW_TIMEOUT_MS = 30_000;

/** `code` of every transport failure. */
export const OPENCLAW_REQUEST_ERROR_CODE = 'openclaw_request';

/** `Notification.body` is cut to this many characters (OpenClaw refuses bodies over 256 KiB). */
export const MESSAGE_BODY_MAX_LENGTH = 8_000;

export const DEFAULT_NOTIFIER_NAME = 'openclaw';

/** The hook `name`, OpenClaw's label in logs and completion events. */
export const HOOK_NAME = 'chamvi';

/** OpenClaw silently ignores a longer `Idempotency-Key`. */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 256;

/** Response text in a thrown error is cut to this many characters. */
export const ERROR_TEXT_MAX_LENGTH = 500;

/** An approval line without `approvalUrl` and `resumeTool`: how to answer, without the token. */
export const NO_TOKEN_HINT = 'Answer it in the chamvi UI (or through POST /runs/:id/approve); this message carries no resume token.';
