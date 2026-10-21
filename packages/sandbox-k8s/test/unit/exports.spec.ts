/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as k8s from '@chamberu/sandbox-k8s';

describe('public api', () => {
    it('exports the provider, the pod client and the constants', () => {
        expect(Object.keys(k8s).sort()).toEqual([
            'CONTAINER_NAME',
            'FATAL_WAITING_REASONS',
            'POD_NAME_PREFIX',
            'POLL_MS',
            'START_TIMEOUT_MS',
            'createKubernetesSandbox',
            'createPodClient',
        ]);
        expect(typeof k8s.createKubernetesSandbox).toBe('function');
        expect(typeof k8s.createPodClient).toBe('function');
        expect(k8s.CONTAINER_NAME).toBe('sandbox');
        expect(k8s.POD_NAME_PREFIX).toBe('chamberu-ws-');
        expect(k8s.START_TIMEOUT_MS).toBe(120_000);
        expect(k8s.POLL_MS).toBe(1_000);
        expect(k8s.FATAL_WAITING_REASONS).toEqual([
            'ErrImagePull',
            'ImagePullBackOff',
            'InvalidImageName',
            'CreateContainerConfigError',
            'CreateContainerError',
        ]);
    });

    it('keeps the pod builder, the client seam and the transport internal', () => {
        expect(k8s).not.toHaveProperty('buildPod');
        expect(k8s).not.toHaveProperty('createPodClientFrom');
        expect(k8s).not.toHaveProperty('createPodTransport');
    });
});
