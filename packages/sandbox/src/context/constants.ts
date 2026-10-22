/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineContextKey } from '@chamvi/core';
import type { IWorkspaceManager } from '../manager/types.ts';

/** The workspace manager provided on the engine (one per app). */
export const SANDBOX_CONTEXT = defineContextKey<IWorkspaceManager>('sandbox');
