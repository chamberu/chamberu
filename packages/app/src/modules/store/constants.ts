/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The purge timer's lifecycle hook. */
export const PURGE_HOOK_NAME = 'chamvi:purge';

export const MEMORY_STORE_WARNING = 'DATABASE_URL unset: MemoryStore keeps runs in memory; restarts lose them and replicas share nothing.';

/** The code of a store error rethrown with the database password masked. */
export const STORE_ERROR_CODE = 'store_error';
