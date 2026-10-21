/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Name of the one container of a workspace pod. */
export const CONTAINER_NAME = 'sandbox';

/** A workspace pod is named `chamvi-ws-<workspace id>`. */
export const POD_NAME_PREFIX = 'chamvi-ws-';

/** How long `create` waits for a pod to run. */
export const START_TIMEOUT_MS = 120_000;

/** Interval of the pod status reads while `create` waits. */
export const POLL_MS = 1_000;

/** Container waiting reasons that never resolve by waiting: `create` fails at once. */
export const FATAL_WAITING_REASONS: readonly string[] = Object.freeze([
    'ErrImagePull',
    'ImagePullBackOff',
    'InvalidImageName',
    'CreateContainerConfigError',
    'CreateContainerError',
]);
