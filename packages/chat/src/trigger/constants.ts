/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ChatEventKind } from './types.ts';

export const DEFAULT_CHANNEL_NAME = 'chat';

export const CHAT_EVENT_KINDS: readonly ChatEventKind[] = ['mention', 'message', 'direct'];
