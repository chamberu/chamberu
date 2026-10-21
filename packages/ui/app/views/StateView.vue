<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgents } from '../agents/composables.ts';
import type { DocEntry, KvEntry } from '../api/types.ts';
import JsonBlock from '../components/json-block/JsonBlock.vue';
import PageHead from '../components/page-head/PageHead.vue';
import { useAppContext } from '../context/module.ts';
import { RouteName } from '../router/constants.ts';
import { useAgentState } from '../state/composables.ts';
import { DOC_PAGE_SIZE } from '../state/constants.ts';
import { docColumns, inlineJson } from '../state/helpers.ts';

const { client } = useAppContext();
const route = useRoute();
const router = useRouter();
const { agents, error: agentsError } = useAgents(client);

const agent = computed<string | undefined>({
    get: () => (typeof route.params.agent === 'string' && route.params.agent ? route.params.agent : undefined),
    set: (value) => { void router.replace({ name: RouteName.STATE, params: { agent: value } }); },
});

// without an agent in the path, show the first one
watch(agents, (list) => {
    if (!agent.value && list[0]) agent.value = list[0].name;
}, { immediate: true });

const state = useAgentState(client, agent);
const tab = ref<'kv' | 'collections'>('kv');
const collection = ref<string>();
const kvOpen = ref<string[]>([]);
const docOpen = ref<string[]>([]);

watch(state.collections, (list) => {
    collection.value = list[0];
}, { immediate: true });
watch(collection, (name) => {
    docOpen.value = [];
    if (name && !state.docs.value[name]) void state.loadCollection(name);
});

const docs = computed<DocEntry[]>(() => (collection.value ? state.docs.value[collection.value] ?? [] : []));
const docKeys = computed(() => docColumns(docs.value));
const options = computed(() => agents.value.map((a) => ({ value: a.name, label: a.name })));

function toggle(which: 'kv' | 'doc', key: string): void {
    const list = which === 'kv' ? kvOpen : docOpen;
    list.value = list.value.includes(key) ? list.value.filter((k) => k !== key) : [...list.value, key];
}
</script>

<template>
    <PageHead
        title="Agent state"
        lede="What an agent remembers between runs. Read-only for now."
    >
        <label
            class="field"
            style="width: 180px"
        >
            <span class="field-label">Agent</span>
            <VCFormSelect
                v-model="agent"
                :options="options"
                placeholder="agent"
            />
        </label>
    </PageHead>

    <div
        v-if="state.error.value?.status === 403 || agentsError?.status === 403"
        class="card notice"
    >
        Reading agent state needs <b class="mono">state:read</b> (and <b class="mono">run:read</b> for the agent list).
    </div>
    <template v-else-if="agent">
        <div
            class="tabs"
            role="tablist"
        >
            <button
                type="button"
                role="tab"
                :aria-selected="tab === 'kv'"
                @click="tab = 'kv'"
            >
                Key-value · {{ state.kv.value.length }}{{ state.moreKv.value ? '+' : '' }}
            </button>
            <button
                type="button"
                role="tab"
                :aria-selected="tab === 'collections'"
                @click="tab = 'collections'"
            >
                Collections · {{ state.collections.value.length }}
            </button>
        </div>

        <div
            v-if="tab === 'kv'"
            class="card"
            style="overflow: hidden"
        >
            <div class="table-wrap">
                <table
                    class="t"
                    data-testid="kv"
                >
                    <thead>
                        <tr>
                            <th style="width: 220px">
                                Key
                            </th>
                            <th>Value (JSON)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <template
                            v-for="entry in (state.kv.value as KvEntry[])"
                            :key="entry.key"
                        >
                            <tr
                                class="clickable"
                                :aria-expanded="kvOpen.includes(entry.key)"
                                @click="toggle('kv', entry.key)"
                            >
                                <td
                                    class="mono"
                                    style="font-size: 13px"
                                >
                                    {{ entry.key }}
                                </td>
                                <td><span class="json-inline">{{ inlineJson(entry.value) }}</span></td>
                            </tr>
                            <tr
                                v-if="kvOpen.includes(entry.key)"
                                class="expansion"
                            >
                                <td colspan="2">
                                    <JsonBlock :value="entry.value" />
                                </td>
                            </tr>
                        </template>
                        <tr v-if="state.kv.value.length === 0">
                            <td
                                colspan="2"
                                class="empty"
                            >
                                No key-value entries.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div
                v-if="state.moreKv.value"
                class="pager"
            >
                <span>{{ state.kv.value.length }} shown</span>
                <VCButton
                    size="sm"
                    variant="outline"
                    color="neutral"
                    @click="state.loadMoreKv()"
                >
                    Load more
                </VCButton>
            </div>
        </div>

        <div
            v-else
            class="split"
        >
            <ul class="list card">
                <li
                    v-for="name in state.collections.value"
                    :key="name"
                >
                    <button
                        type="button"
                        :aria-current="name === collection"
                        @click="collection = name"
                    >
                        <span>{{ name }}</span><span>{{ state.docs.value[name]?.length ?? '' }}</span>
                    </button>
                </li>
                <li
                    v-if="state.collections.value.length === 0"
                    class="hint"
                    style="padding: 7px 10px"
                >
                    No collections declared.
                </li>
            </ul>
            <div
                v-if="collection"
                style="min-width: 0"
            >
                <p
                    v-if="docs.length === DOC_PAGE_SIZE"
                    class="hint"
                    style="margin-bottom: 10px"
                >
                    Showing the first {{ DOC_PAGE_SIZE }} documents.
                </p>
                <div
                    class="card"
                    style="overflow: hidden"
                >
                    <div class="table-wrap">
                        <table class="t">
                            <thead>
                                <tr>
                                    <th
                                        v-for="key in docKeys"
                                        :key="key"
                                    >
                                        {{ key }}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <template
                                    v-for="doc in docs"
                                    :key="doc.id"
                                >
                                    <tr
                                        class="clickable"
                                        @click="toggle('doc', doc.id)"
                                    >
                                        <td
                                            v-for="key in docKeys"
                                            :key="key"
                                            class="mono"
                                            style="font-size: 13px"
                                        >
                                            <span class="json-inline">{{ doc[key] === undefined ? '' : inlineJson(doc[key]) }}</span>
                                        </td>
                                    </tr>
                                    <tr
                                        v-if="docOpen.includes(doc.id)"
                                        class="expansion"
                                    >
                                        <td :colspan="docKeys.length">
                                            <JsonBlock :value="doc" />
                                        </td>
                                    </tr>
                                </template>
                                <tr v-if="docs.length === 0">
                                    <td
                                        :colspan="docKeys.length"
                                        class="empty"
                                    >
                                        No documents.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </template>
    <div
        v-else
        class="card notice"
    >
        No agents registered.
    </div>
</template>
