/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import type { IClock } from '../clock/index.ts';
import { InvalidRunStateError } from '../errors/index.ts';
import type { IArtifactStore } from '../store/types.ts';
import { assertArtifactInput } from './helpers.ts';
import type { Artifact, ArtifactInput, IRunArtifacts } from './types.ts';

/**
 * Stores `input` (validated already) as an artifact of the run under `id`
 * (default a random UUID). The store's insert-if-absent decides a race: when
 * an artifact of this run already holds `id`, that stored artifact is
 * returned, so the caller never names metadata the store does not hold.
 */
export async function storeArtifact(
    store: IArtifactStore,
    run: { id: string; agent: string },
    input: ArtifactInput,
    createdAt: Date,
    id: string = randomUUID(),
): Promise<Artifact> {
    const artifact: Artifact = {
        id,
        runId: run.id,
        agent: run.agent,
        mediaType: input.mediaType,
        ...(input.filename === undefined ? {} : { filename: input.filename }),
        size: input.data.byteLength,
        createdAt,
    };
    if (await store.putArtifact(artifact, input.data)) return artifact;
    const stored = await store.getArtifact(id);
    if (stored?.runId !== run.id) throw new InvalidRunStateError(`The artifact id "${id}" belongs to another run.`);
    return stored;
}

/**
 * The ids of a dispatch's attachments: `<runId>.<index>`, the index
 * zero-padded to one width for the whole dispatch (at least 4 digits), so
 * the listing order (createdAt, then id) is the input order and a
 * concurrent healer of the same run writes to the same ids.
 */
export function attachmentIds(runId: string, count: number): string[] {
    const width = Math.max(4, String(Math.max(count - 1, 0)).length);
    return Array.from({ length: count }, (_, i) => `${runId}.${String(i).padStart(width, '0')}`);
}

/** The artifacts of one run, as tools get them. */
export function createRunArtifacts(
    store: IArtifactStore,
    run: { id: string; agent: string },
    clock: IClock,
): IRunArtifacts {
    return {
        async put(input) {
            assertArtifactInput(input);
            return storeArtifact(store, run, input, clock.now());
        },
        async get(id) {
            const artifact = await store.getArtifact(id);
            if (artifact?.runId !== run.id) return undefined;
            const data = await store.readArtifact(id);
            if (!data) return undefined;
            return { artifact, data };
        },
        list() {
            return store.listArtifacts(run.id);
        },
    };
}
