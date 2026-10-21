/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { shallowRef } from 'vue';
import type { ApiError } from '../api/error.ts';
import type { AgentWire, IApiClient } from '../api/types.ts';
import { toApiError } from '../runs/composables.ts';

/** The registered agents (`GET /agents`, needs `run:read`), loaded once per call site. */
export function useAgents(client: IApiClient) {
    const agents = shallowRef<AgentWire[]>([]);
    const error = shallowRef<ApiError>();
    const loaded = (async () => {
        try {
            agents.value = await client.listAgents();
        } catch (e) {
            error.value = toApiError(e);
        }
    })();
    return {
        agents,
        error,
        loaded,
    };
}
