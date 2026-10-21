<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgents } from '../agents/composables.ts';
import AgentStatePanel from '../components/agent-state/AgentStatePanel.vue';
import PageHead from '../components/page-head/PageHead.vue';
import { useAppContext } from '../context/module.ts';
import { RouteName } from '../router/constants.ts';
import { useAgentState } from '../state/composables.ts';

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
const options = computed(() => agents.value.map((a) => ({ value: a.name, label: a.name })));
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
        v-if="agentsError?.status === 403"
        class="card notice"
    >
        Listing agents needs <b class="mono">run:read</b>.
    </div>
    <AgentStatePanel
        v-else-if="agent"
        :agent="agent"
        :state="state"
    />
    <div
        v-else
        class="card notice"
    >
        No agents registered.
    </div>
</template>
