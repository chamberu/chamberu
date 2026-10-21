<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunStatusLiteral } from '@chamvi/core';
import { computed, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgents } from '../agents/composables.ts';
import type { RunListFilter } from '../api/types.ts';
import EmptyState from '../components/empty-state/EmptyState.vue';
import PageHead from '../components/page-head/PageHead.vue';
import RunsTable from '../components/runs-table/RunsTable.vue';
import { useAppContext } from '../context/module.ts';
import { useRunCounts, useRunList } from '../runs/composables.ts';
import {
    ALL_AGENTS,
    RUN_LIST_POLL_MS,
    RUN_STATUSES,
} from '../runs/constants.ts';
import { filterFromQuery, queryFromFilter } from '../runs/query.ts';

const { client } = useAppContext();
const route = useRoute();
const router = useRouter();

const filter = shallowRef<RunListFilter>(filterFromQuery(route.query));
watch(() => route.query, (query) => { filter.value = filterFromQuery(query); });

const {
    page,
    error,
    loading,
} = useRunList(client, filter);
const { agents } = useAgents(client);

// the cards count every agent, on one slower poller
const { counts } = useRunCounts(client, ['running', 'waiting', 'failed']);

const agentOptions = computed(() => [
    { value: ALL_AGENTS, label: 'all agents' },
    ...agents.value.map((agent) => ({ value: agent.name, label: agent.name })),
]);

function update(next: Partial<RunListFilter>): void {
    void router.replace({
        query: queryFromFilter({
            ...filter.value,
            offset: 0,
            ...next,
        }),
    });
}

const agent = computed({
    get: () => filter.value.agent ?? ALL_AGENTS,
    set: (value: string) => update({ agent: value === ALL_AGENTS ? undefined : value }),
});

function toggleStatus(status: RunStatusLiteral): void {
    const current = filter.value.status ?? [];
    update({ status: current.includes(status) ? current.filter((s) => s !== status) : [...current, status] });
}

const filtered = computed(() => !!filter.value.agent || !!filter.value.status?.length);
</script>

<template>
    <PageHead
        title="Runs"
        :lede="`Every run of every agent, newest first. Refreshes every ${RUN_LIST_POLL_MS / 1000} s.`"
    >
        <span :class="['live', { off: !!error }]">polling · {{ RUN_LIST_POLL_MS / 1000 }} s</span>
    </PageHead>

    <div
        v-if="error?.status === 403"
        class="card notice"
    >
        Listing runs needs <b class="mono">run:read</b>. Ask for it, or open a run or an approval by its link.
    </div>
    <template v-else>
        <div class="stats">
            <div class="card stat stat-run">
                <small>Running</small><b>{{ counts.running ?? '–' }}</b><span>right now</span>
            </div>
            <div class="card stat stat-wait">
                <small>Waiting</small><b>{{ counts.waiting ?? '–' }}</b><span>for an approval</span>
            </div>
            <div class="card stat stat-fail">
                <small>Failed</small><b>{{ counts.failed ?? '–' }}</b><span>all time</span>
            </div>
            <div class="card stat">
                <small>Shown</small><b>{{ page?.meta.total ?? '–' }}</b><span>match the filters</span>
            </div>
        </div>

        <div class="toolbar">
            <label class="field">
                <span class="field-label">Agent</span>
                <VCFormSelect
                    v-model="agent"
                    :options="agentOptions"
                    placeholder="all agents"
                />
            </label>
            <div
                class="field"
                style="min-width: 0; flex: 1"
            >
                <span class="field-label">Status</span>
                <div>
                    <div
                        class="seg"
                        role="group"
                        aria-label="Status filter"
                    >
                        <button
                            v-for="status in RUN_STATUSES"
                            :key="status"
                            type="button"
                            :data-status="status"
                            :aria-pressed="(filter.status ?? []).includes(status)"
                            @click="toggleStatus(status)"
                        >
                            {{ status }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <p
            v-if="error"
            class="err-line"
            style="margin-bottom: 12px"
        >
            {{ error.code }} · {{ error.message }}
        </p>
        <RunsTable
            :page="page"
            :agents="agents"
            :loading="loading"
            @page="(offset) => update({ offset, agent: filter.agent, status: filter.status })"
        >
            <template #empty>
                <EmptyState
                    :icon="filtered ? 'search' : 'play'"
                    :title="filtered ? 'No runs match these filters' : 'No runs yet'"
                    :text="filtered ? 'Widen the status filter or pick all agents.' : 'Runs appear here once a trigger starts one.'"
                >
                    <VCButton
                        v-if="filtered"
                        class="btn btn-sm"
                        @click="update({ agent: undefined, status: undefined })"
                    >
                        Clear filters
                    </VCButton>
                </EmptyState>
            </template>
        </RunsTable>
    </template>
</template>
