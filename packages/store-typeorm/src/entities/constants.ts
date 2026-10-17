/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const TableName = {
    RUNS: 'chamberu_runs',
    STEPS: 'chamberu_steps',
    CHECKPOINTS: 'chamberu_checkpoints',
    IDEMPOTENCY_KEYS: 'chamberu_idempotency_keys',
    LOCKS: 'chamberu_locks',
    EFFECTS: 'chamberu_effects',
    KV: 'chamberu_kv',
    DOCS: 'chamberu_docs',
} as const;
