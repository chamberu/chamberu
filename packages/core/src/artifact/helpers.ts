/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { FilePart, ModelMessage } from 'ai';
import { isObject } from 'smob';
import { ArtifactNotFoundError, ValidationError } from '../errors/index.ts';
import type { IArtifactStore } from '../store/types.ts';
import { ARTIFACT_URI_PREFIX } from './constants.ts';
import { isArtifactMediaType } from './media-type.ts';
import type { Artifact, ArtifactInput } from './types.ts';

/** Throws ValidationError unless `input` is an ArtifactInput (`what` names it in the message). */
export function assertArtifactInput(input: unknown, what = 'artifact'): asserts input is ArtifactInput {
    if (!isObject(input)) throw new ValidationError(`The ${what} must be an object.`);
    if (!isArtifactMediaType(input.mediaType)) {
        throw new ValidationError(`The ${what} needs a mediaType of the form type/subtype.`);
    }
    if (input.filename !== undefined && typeof input.filename !== 'string') {
        throw new ValidationError(`The ${what} filename must be a string.`);
    }
    if (!(input.data instanceof Uint8Array)) {
        throw new ValidationError(`The ${what} data must be a Uint8Array.`);
    }
}

/** The file part a checkpoint keeps for an artifact: the marker instead of the bytes. */
export function toFilePart(artifact: Artifact): FilePart {
    return {
        type: 'file',
        mediaType: artifact.mediaType,
        ...(artifact.filename === undefined ? {} : { filename: artifact.filename }),
        data: `${ARTIFACT_URI_PREFIX}${artifact.id}`,
    };
}

function artifactIdOf(part: unknown): string | undefined {
    if (!isObject(part) || part.type !== 'file') return undefined;
    const { data } = part;
    if (typeof data !== 'string' || !data.startsWith(ARTIFACT_URI_PREFIX)) return undefined;
    return data.slice(ARTIFACT_URI_PREFIX.length);
}

/**
 * A copy of `messages` for the model: every file part whose data is an
 * artifact marker carries the artifact's bytes instead. `messages` is not
 * changed. Throws ArtifactNotFoundError for a marker whose artifact is gone.
 */
export async function hydrateMessages(messages: ModelMessage[], store: IArtifactStore): Promise<ModelMessage[]> {
    const ids = new Set<string>();
    for (const message of messages) {
        if (typeof message.content === 'string') continue;
        for (const part of message.content) {
            const id = artifactIdOf(part);
            if (id !== undefined) ids.add(id);
        }
    }
    if (ids.size === 0) return messages;

    const bytes = new Map<string, Uint8Array>();
    for (const id of ids) {
        const data = await store.readArtifact(id);
        if (!data) throw new ArtifactNotFoundError(id);
        bytes.set(id, data);
    }
    return messages.map((message) => {
        if (typeof message.content === 'string') return message;
        return {
            ...message,
            content: message.content.map((part) => {
                const id = artifactIdOf(part);
                return id === undefined ? part : { ...part, data: bytes.get(id)! };
            }),
        } as ModelMessage;
    });
}
