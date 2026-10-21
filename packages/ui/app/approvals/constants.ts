/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { InjectionKey } from 'vue';
import type { useApprovals } from './composables.ts';

/** A deep link's resume token between the address bar and the answer. */
export const RESUME_STORAGE_KEY = 'chamvi.resume';

export const INBOX_POLL_MS = 5000;

export const INBOX_PAGE_SIZE = 100;

/** The shell's inbox, shared with the approvals view (one poller for both). */
export const INBOX: InjectionKey<ReturnType<typeof useApprovals>> = Symbol('chamvi.inbox');
