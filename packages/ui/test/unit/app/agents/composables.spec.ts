/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { effectScope, ref } from 'vue';
import { ACTIVITY_LIMIT } from '../../../../app/agents/constants.ts';
import { useAgentDetail, useAgentRollups } from '../../../../app/agents/composables.ts';
import type {
    AgentWire,
    RunListFilter,
    RunPage,
    RunWire,
} from '../../../../app/api/types.ts';
import { apiError, fakeClient } from '../../../utils/client.ts';
import { wireRun } from '../../../utils/runs.ts';
import { flush } from '../../../utils/timers.ts';

const AGENTS: AgentWire[] = [
    {
        name: 'deploy',
        triggers: [{ source: 'http', id: 'http' }],
        budget: { maxSteps: 20 },
        approvals: ['deploy'],
        state: [],
    },
    {
        name: 'digest',
        triggers: [{ source: 'cron', id: 'cron:0 8 * * *' }],
        budget: { maxSteps: 12 },
        approvals: [],
        state: ['sent'],
    },
];

const page = (data: RunWire[], total = data.length): RunPage => ({
    data,
    meta: {
        total, 
        limit: 100, 
        offset: 0, 
    }, 
});

/** Runs per agent; a status filter narrows them, `total` counts them. */
function listRunsOver(runs: RunWire[], seen: RunListFilter[] = []) {
    return async (filter: RunListFilter): Promise<RunPage> => {
        seen.push(filter);
        const matching = runs.filter((run) => (!filter.agent || run.agent === filter.agent) &&
            (!filter.status || filter.status.includes(run.status)));
        return page(matching.slice(0, filter.limit), matching.length);
    };
}

const now = new Date().toISOString();

describe('useAgentRollups', () => {
    it('rolls up running, waiting, the last run and the activity per agent', async () => {
        const runs = [
            wireRun({
                id: 'd1', 
                agent: 'deploy', 
                status: 'waiting', 
                createdAt: now, 
            }),
            wireRun({
                id: 'd2', 
                agent: 'deploy', 
                status: 'running', 
                createdAt: now, 
            }),
            wireRun({
                id: 'd3', 
                agent: 'deploy', 
                status: 'completed', 
                createdAt: now, 
            }),
        ];
        const seen: RunListFilter[] = [];
        const client = fakeClient({
            listAgents: async () => AGENTS,
            listSchedules: async () => [{
                agent: 'digest',
                trigger: 'cron:0 8 * * *',
                expression: '0 8 * * *',
                overlap: 'skip',
                nextAt: now,
            }],
            listRuns: listRunsOver(runs, seen),
        });
        const scope = effectScope();
        const state = scope.run(() => useAgentRollups(client))!;
        await flush();
        expect(state.agents.value.map((a) => a.name)).toEqual(['deploy', 'digest']);
        const deploy = state.rollups.value.deploy!;
        expect(deploy).toMatchObject({ running: 1, waiting: 1 });
        expect(deploy.last?.id).toBe('d1');
        expect(deploy.activity.count).toBe(3);
        expect(state.rollups.value.digest).toMatchObject({ running: 0, waiting: 0 });
        expect(state.rollups.value.digest!.last).toBeUndefined();
        expect(state.rollups.value.digest!.nextFire?.trigger).toBe('cron:0 8 * * *');
        expect(seen.filter((f) => f.agent === 'deploy' && !f.status)[0]!.limit).toBe(ACTIVITY_LIMIT);
        scope.stop();
    });

    it('a 403 sets error without throwing', async () => {
        const client = fakeClient({
            listAgents: async () => { throw apiError(403, 'forbidden'); },
            listSchedules: async () => [],
        });
        const scope = effectScope();
        const state = scope.run(() => useAgentRollups(client))!;
        await flush();
        expect(state.error.value?.status).toBe(403);
        scope.stop();
    });
});

describe('useAgentDetail', () => {
    it('loads the agent, its runs, its waiting runs and its schedules', async () => {
        const runs = [
            wireRun({
                id: 'w1',
                agent: 'deploy',
                status: 'waiting',
                createdAt: now,
                waiting: {
                    kind: 'approval',
                    approvalId: 'a1',
                    toolName: 'deploy',
                    input: {},
                    expiresAt: now,
                    tokenId: 't1',
                },
            }),
            wireRun({
                id: 'x', 
                agent: 'digest', 
                status: 'waiting', 
                createdAt: now, 
            }),
            wireRun({
                id: 'c1', 
                agent: 'deploy', 
                status: 'completed', 
                createdAt: now, 
            }),
        ];
        const client = fakeClient({
            listAgents: async () => AGENTS,
            listSchedules: async () => [],
            listRuns: listRunsOver(runs),
        });
        const scope = effectScope();
        const detail = scope.run(() => useAgentDetail(client, ref('deploy')))!;
        await flush();
        expect(detail.agent.value?.name).toBe('deploy');
        expect(detail.totalRuns.value).toBe(2);
        expect(detail.recent.value.map((r) => r.id)).toEqual(['w1', 'c1']);
        expect(detail.waitingRuns.value.map((r) => r.id)).toEqual(['w1']);
        expect(detail.activity.value.count).toBe(2);
        expect(detail.notFound.value).toBe(false);
        scope.stop();
    });

    it('reports an unknown agent', async () => {
        const client = fakeClient({
            listAgents: async () => AGENTS,
            listSchedules: async () => [],
            listRuns: listRunsOver([]),
        });
        const scope = effectScope();
        const detail = scope.run(() => useAgentDetail(client, ref('nope')))!;
        await flush();
        expect(detail.notFound.value).toBe(true);
        scope.stop();
    });

    it('starts a run and refreshes', async () => {
        const runs: RunWire[] = [];
        const started: Array<[string, unknown]> = [];
        const client = fakeClient({
            listAgents: async () => AGENTS,
            listSchedules: async () => [],
            listRuns: listRunsOver(runs),
            startRun: async (name, body) => {
                started.push([name, body.payload]);
                runs.unshift(wireRun({
                    id: 'new', 
                    agent: name, 
                    status: 'queued', 
                    createdAt: now, 
                }));
                return { runId: 'new', deduplicated: false };
            },
        });
        const scope = effectScope();
        const detail = scope.run(() => useAgentDetail(client, ref('deploy')))!;
        await flush();
        expect(await detail.start({ env: 'prod' })).toEqual({ runId: 'new', deduplicated: false });
        await flush();
        expect(started).toEqual([['deploy', { env: 'prod' }]]);
        expect(detail.recent.value.map((r) => r.id)).toEqual(['new']);
        scope.stop();
    });
});
