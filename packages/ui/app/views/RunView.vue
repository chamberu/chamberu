<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { useAlertDialog, useToast } from '@vuecs/overlays';
import { computed, onScopeDispose, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useAgents } from '../agents/composables.ts';
import { ApiError } from '../api/error.ts';
import JsonBlock from '../components/json-block/JsonBlock.vue';
import StatusChip from '../components/status-chip/StatusChip.vue';
import StepItem from '../components/step-item/StepItem.vue';
import { errorText } from '../components/step-item/helpers.ts';
import UsageMeter from '../components/usage-meter/UsageMeter.vue';
import { useAppContext } from '../context/module.ts';
import { RouteName } from '../router/constants.ts';
import { useRunDetail } from '../runs/composables.ts';
import {
    canCancel,
    formatDuration,
    formatTokens,
    landedModelSteps,
    runDuration,
    shortId,
} from '../runs/helpers.ts';

const { client, session } = useAppContext();
const route = useRoute();
const confirm = useAlertDialog();
const toast = useToast();

const runId = computed(() => String(route.params.id));
const {
    state,
    error,
    live,
    cancel,
} = useRunDetail(client, runId);
const { agents } = useAgents(client);

const now = ref(Date.now());
const clock = setInterval(() => { now.value = Date.now(); }, 1000);
onScopeDispose(() => clearInterval(clock));

const run = computed(() => state.value?.run);
const budget = computed(() => agents.value.find((agent) => agent.name === run.value?.agent)?.budget);
const permissions = computed(() => session.principal.value?.permissions ?? []);
const cancellable = computed(() => !!run.value && canCancel(run.value, permissions.value));

const liveSteps = computed(() => {
    const { value } = state;
    if (!value) return [];
    return Object.entries(value.live)
        .map(([step, text]) => ({ step: Number(step), ...text }))
        .filter((entry) => entry.step >= landedModelSteps(value.steps))
        .sort((a, b) => a.step - b.step);
});
const nextIndex = computed(() => (state.value?.steps.at(-1)?.index ?? -1) + 1);

const tokens = computed(() => (run.value ? run.value.usage.inputTokens + run.value.usage.outputTokens : 0));
const llmSteps = computed(() => (state.value ? landedModelSteps(state.value.steps) : 0));
const elapsed = computed(() => (run.value ? runDuration(run.value, now.value) : undefined));
const timeValue = computed(() => {
    if (elapsed.value === undefined) return '—';
    const timeout = budget.value?.timeoutMs;
    return timeout ? `${formatDuration(elapsed.value)} / ${formatDuration(timeout)}` : formatDuration(elapsed.value);
});

async function onCancel(): Promise<void> {
    const ok = await confirm({
        title: 'Cancel this run?',
        description: 'The run stops after the current step. Its checkpoints stay; an effect already applied is not undone.',
        confirmLabel: 'Cancel run',
        cancelLabel: 'Keep running',
        tone: 'primary',
    });
    if (!ok) return;
    try {
        await cancel();
        toast.add({ title: `Cancel requested · run ${shortId(runId.value)}` });
    } catch (e) {
        toast.add({
            title: 'Cancel failed',
            description: e instanceof ApiError ? e.message : String(e),
            color: 'error',
        });
    }
}
</script>

<template>
    <div class="crumbs">
        <RouterLink :to="{ name: RouteName.RUNS }">
            Runs
        </RouterLink>
        <span class="muted"> / {{ shortId(runId) }}</span>
    </div>

    <div
        v-if="error && !state"
        class="card notice"
    >
        <template v-if="error.status === 404">
            Run <b class="mono">{{ runId }}</b> does not exist.
        </template>
        <template v-else-if="error.status === 403">
            Reading this run needs <b class="mono">run:read</b> or <b class="mono">agent:&lt;agent&gt;:run</b>.
        </template>
        <template v-else>
            {{ error.code }} · {{ error.message }}
        </template>
    </div>

    <template v-if="state && run">
        <div class="card run-head">
            <div class="run-title">
                <h1 class="display">
                    Run <span class="mono">{{ shortId(run.id) }}</span>
                </h1>
                <StatusChip :status="run.status" />
                <VCButton
                    v-if="cancellable"
                    class="push"
                    variant="outline"
                    color="neutral"
                    @click="onCancel"
                >
                    Cancel run
                </VCButton>
            </div>
            <div class="kv-line">
                <span>agent <b>{{ run.agent }}</b></span>
                <span>trigger <b class="mono">{{ run.trigger.trigger }}</b></span>
                <span>source <b class="mono">{{ run.trigger.source }}</b></span>
                <span v-if="run.concurrencyKey">key <b class="mono">{{ run.concurrencyKey }}</b></span>
                <span v-if="run.trigger.invoker">
                    invoker <b>{{ run.trigger.invoker.name ?? run.trigger.invoker.id }}</b>
                    <span class="mono">({{ run.trigger.invoker.kind }})</span>
                </span>
                <span>created <b><VCTimeago :datetime="run.createdAt" /></b></span>
                <span v-if="run.finishedAt">finished <b><VCTimeago :datetime="run.finishedAt" /></b></span>
                <span>live <b :data-testid="'live'">{{ live ? 'SSE' : 'off' }}</b></span>
            </div>
            <div class="meters">
                <UsageMeter
                    label="Steps"
                    :value="budget ? `${llmSteps} / ${budget.maxSteps}` : String(llmSteps)"
                    :ratio="budget ? llmSteps / budget.maxSteps : 0"
                />
                <UsageMeter
                    label="Tokens"
                    :value="`${formatTokens(run.usage.inputTokens)} in · ${formatTokens(run.usage.outputTokens)} out`"
                    :ratio="budget?.maxTokens ? tokens / budget.maxTokens : 0"
                />
                <UsageMeter
                    label="Time"
                    :value="timeValue"
                    :ratio="elapsed !== undefined && budget?.timeoutMs ? elapsed / budget.timeoutMs : 0"
                />
            </div>
            <div
                v-if="run.error"
                class="err-line"
            >
                {{ errorText(run.error) }}
            </div>
        </div>

        <div
            v-if="run.status === 'waiting' && run.waiting"
            class="callout"
        >
            <div class="callout-head">
                <h2>{{ run.waiting.toolName }}</h2>
                <StatusChip status="waiting" />
                <span
                    class="muted"
                    style="font-size: 13px"
                >waits for an approval</span>
                <RouterLink
                    class="push"
                    :to="{ name: RouteName.APPROVALS }"
                >
                    Open the approvals
                </RouterLink>
            </div>
        </div>

        <h2 class="display section-h">
            Steps
        </h2>
        <ol
            class="timeline"
            data-testid="timeline"
        >
            <li class="step step-trigger">
                <span class="step-mark" />
                <VCCollapse class="card step-card">
                    <VCCollapseTrigger class="step-sum">
                        <span class="kind">trigger</span>
                        <span class="title">Envelope (first user message)</span>
                        <span class="meta">received <VCTimeago :datetime="run.trigger.receivedAt" /></span>
                    </VCCollapseTrigger>
                    <VCCollapseContent class="step-body">
                        <JsonBlock :value="{ source: run.trigger.source, trigger: run.trigger.trigger, payload: run.trigger.payload }" />
                    </VCCollapseContent>
                </VCCollapse>
            </li>
            <StepItem
                v-for="step in state.steps"
                :key="step.index"
                :step="step"
            />
            <li
                v-for="(entry, i) in liveSteps"
                :key="`live-${entry.step}`"
                class="step step-llm step-live"
                data-testid="live-step"
            >
                <span class="step-mark" />
                <div class="card step-card">
                    <div class="step-sum static">
                        <span class="step-index">#{{ nextIndex + i }}</span>
                        <span class="kind">llm</span>
                        <span class="streaming-tag">streaming</span>
                        <span class="meta">run.delta · {{ entry.reasoning ? 'reasoning, text' : 'text' }}</span>
                    </div>
                    <div class="stream">
                        <span
                            v-if="entry.reasoning"
                            class="reasoning"
                        >{{ entry.reasoning }}
                        </span><span>{{ entry.text }}</span><span class="caret" />
                    </div>
                </div>
            </li>
        </ol>

        <template v-if="run.status === 'completed' && run.output !== undefined">
            <h2 class="display section-h">
                Output
            </h2>
            <JsonBlock
                v-if="typeof run.output !== 'string'"
                :value="run.output"
            />
            <div
                v-else
                class="card"
                style="padding: 14px 16px; white-space: pre-wrap"
                data-testid="output"
            >
                {{ run.output }}
            </div>
        </template>
    </template>
</template>
