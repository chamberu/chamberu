/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import type { IClock } from '../clock/index.ts';
import type { IArtifactStore } from '../store/types.ts';
import { assertArtifactInput } from './helpers.ts';
import type { Artifact, ArtifactInput, IRunArtifacts } from './types.ts';

/** Stores `input` (validated already) as a new artifact of the run. */
export async function storeArtifact(
    store: IArtifactStore,
    run: { id: string; agent: string },
    input: ArtifactInput,
    createdAt: Date,
): Promise<Artifact> {
    const artifact: Artifact = {
        id: randomUUID(),
        runId: run.id,
        agent: run.agent,
        mediaType: input.mediaType,
        ...(input.filename === undefined ? {} : { filename: input.filename }),
        size: input.data.byteLength,
        createdAt,
    };
    await store.putArtifact(artifact, input.data);
    return artifact;
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
