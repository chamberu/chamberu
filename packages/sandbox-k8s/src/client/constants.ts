/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The exec protocol that can close stdin (Kubernetes 1.30+). */
export const STDIN_CLOSE_PROTOCOL = 'v5.channel.k8s.io';

/** Longest API error message kept in a SandboxError. */
export const API_MESSAGE_MAX_LENGTH = 500;
