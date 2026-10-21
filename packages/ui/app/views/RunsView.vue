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
import type { RunListFilter, RunWire } from '../api/types.ts';
import PageHead from '../components/page-head/PageHead.vue';
import StatusChip from '../components/status-chip/StatusChip.vue';
import { useAppContext } from '../context/module.ts';
import { RouteName } from '../router/constants.ts';
import { useRunList } from '../runs/composables.ts';
import { RUN_LIST_PAGE_SIZE, RUN_LIST_POLL_MS, RUN_STATUSES } from '../runs/constants.ts';
import { formatTokens, shortId } from '../runs/helpers.ts';
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

// the cards count every agent: one small query per status
const counts = (status: RunStatusLiteral) => useRunList(client, shallowRef({ status: [status], limit: 1 })).page;
const running = counts('running');
const waiting = counts('waiting');
const failed = counts('failed');

const agentOptions = computed(() => [
    { value: '', label: 'all agents' },
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
    get: () => filter.value.agent ?? '',
    set: (value: string) => update({ agent: value || undefined }),
});

function toggleStatus(status: RunStatusLiteral): void {
    const current = filter.value.status ?? [];
    update({ status: current.includes(status) ? current.filter((s) => s !== status) : [...current, status] });
}

function maxTokensOf(run: RunWire): number | undefined {
    return agents.value.find((a) => a.name === run.agent)?.budget.maxTokens;
}

function inOut(run: RunWire): string {
    return `${formatTokens(run.usage.inputTokens)} in · ${formatTokens(run.usage.outputTokens)} out`;
}

function tokens(run: RunWire): number {
    return run.usage.inputTokens + run.usage.outputTokens;
}

function triggerLabel(run: RunWire): string {
    return run.trigger.trigger === run.trigger.source ? run.trigger.source : `${run.trigger.source} · ${run.trigger.trigger}`;
}

function open(run: RunWire): void {
    void router.push({ name: RouteName.RUN, params: { id: run.id } });
}

const columns = [
    { key: 'id', label: 'Run' },
    { key: 'agent', label: 'Agent · trigger' },
    { key: 'status', label: 'Status' },
    { key: 'usage', label: 'Usage' },
    { key: 'createdAt', label: 'Started' },
];

const range = computed(() => {
    const meta = page.value?.meta;
    if (!meta || meta.total === 0) return '0 runs';
    return `${meta.offset + 1}–${Math.min(meta.offset + meta.limit, meta.total)} of ${meta.total}`;
});

function load(meta: { offset: number }): void {
    update({
        offset: meta.offset, 
        agent: filter.value.agent, 
        status: filter.value.status, 
    });
}
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
            <div class="card stat">
                <small>Running</small><b>{{ running?.meta.total ?? '–' }}</b>
            </div>
            <div class="card stat">
                <small>Waiting</small><b style="color: var(--ch-warn)">{{ waiting?.meta.total ?? '–' }}</b>
            </div>
            <div class="card stat">
                <small>Failed</small><b>{{ failed?.meta.total ?? '–' }}</b>
            </div>
            <div class="card stat">
                <small>Shown</small><b>{{ page?.meta.total ?? '–' }}</b>
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
                <div
                    class="seg"
                    role="group"
                    aria-label="Status filter"
                >
                    <button
                        v-for="status in RUN_STATUSES"
                        :key="status"
                        type="button"
                        :aria-pressed="(filter.status ?? []).includes(status)"
                        @click="toggleStatus(status)"
                    >
                        {{ status }}
                    </button>
                </div>
            </div>
        </div>

        <div
            class="card"
            style="overflow: hidden"
        >
            <div class="table-wrap">
                <VCTable
                    class="t"
                    :columns="columns"
                    :data="page?.data ?? []"
                    :busy="loading && !page"
                    row-clickable
                    responsive
                    data-testid="runs"
                    @row-click="(row: RunWire) => open(row)"
                >
                    <template #cell-id="{ row }">
                        <span class="id">{{ shortId((row as RunWire).id) }}</span>
                        <div
                            v-if="(row as RunWire).concurrencyKey"
                            class="muted mono"
                            style="font-size: 12px"
                        >
                            {{ (row as RunWire).concurrencyKey }}
                        </div>
                    </template>
                    <template #cell-agent="{ row }">
                        <b style="font-weight: 500">{{ (row as RunWire).agent }}</b>
                        <div
                            class="muted"
                            style="font-size: 12px"
                        >
                            {{ triggerLabel(row as RunWire) }}
                        </div>
                    </template>
                    <template #cell-status="{ row }">
                        <StatusChip :status="(row as RunWire).status" />
                    </template>
                    <template #cell-usage="{ row }">
                        <div class="usage">
                            <div
                                class="meter-top"
                                style="font-size: 12px"
                            >
                                <span class="muted">{{ inOut(row as RunWire) }}</span>
                                <span class="mono">{{ formatTokens(tokens(row as RunWire)) }} tok</span>
                            </div>
                            <div
                                v-if="maxTokensOf(row as RunWire)"
                                class="usage-bar"
                            >
                                <i :style="{ width: `${Math.min(100, Math.round(tokens(row as RunWire) / maxTokensOf(row as RunWire)! * 100))}%` }" />
                            </div>
                        </div>
                    </template>
                    <template #cell-createdAt="{ row }">
                        <span
                            class="muted"
                            style="font-size: 13px; white-space: nowrap"
                        >
                            <VCTimeago :datetime="(row as RunWire).createdAt" />
                        </span>
                    </template>
                </VCTable>
                <p
                    v-if="page && page.data.length === 0"
                    class="empty muted"
                    style="text-align: center; padding: 28px; margin: 0"
                >
                    No runs match these filters.
                </p>
                <p
                    v-if="error"
                    class="err-line"
                    style="margin: 12px"
                >
                    {{ error.code }} · {{ error.message }}
                </p>
            </div>
            <div class="pager">
                <span>{{ range }}</span>
                <VCPagination
                    v-if="page && page.meta.total > RUN_LIST_PAGE_SIZE"
                    :total="page.meta.total"
                    :limit="page.meta.limit"
                    :offset="page.meta.offset"
                    @load="load"
                />
            </div>
        </div>
    </template>
</template>
