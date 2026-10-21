import{_ as n,o as a,c as e,a2 as l}from"./chunks/framework.Di-jvWLj.js";const E=JSON.parse('{"title":"@chamberu/scheduler","description":"","frontmatter":{},"headers":[],"relativePath":"reference/scheduler.md","filePath":"reference/scheduler.md","lastUpdated":1792569132000}'),p={name:"reference/scheduler.md"};function o(c,s,t,r,i,d){return a(),e("div",null,[...s[0]||(s[0]=[l(`<h1 id="chamberu-scheduler" tabindex="-1">@chamberu/scheduler <a class="header-anchor" href="#chamberu-scheduler" aria-label="Permalink to &quot;@chamberu/scheduler&quot;">​</a></h1><p>Fires chamberu cron triggers once per tick across replicas, on hubwire. The public API of <code>packages/scheduler/src/index.ts</code>.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#E6DFDE;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamberu/scheduler</span><span style="color:#E7C58C;"> @chamberu/core</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p><code>@chamberu/core</code> is a peer dependency. See <a href="/guide/scheduler">Cron Scheduling</a> for the behaviour.</p><h2 id="createscheduler" tabindex="-1">createScheduler <a class="header-anchor" href="#createscheduler" aria-label="Permalink to &quot;createScheduler&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> createScheduler(opts: SchedulerOptions): IScheduler;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> SCHEDULE_LOCK_TTL_MS: </span><span style="color:#E7C58C;">600_000</span><span style="color:#E6DFDE;">;</span></span></code></pre></div><p>Schedules <code>engine.listAgents()</code> (or only the agents named in <code>agents</code>) and locks over <code>engine.store</code>. Throws <code>InvalidAgentDefinitionError</code> for a cron trigger the scheduler cannot use (expression, timezone, <code>lockTtlMs</code>) and for a name in <code>agents</code> the engine lacks or that is given twice.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { Engine } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@chamberu/core&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> SchedulerErrorContext = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    agent: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    trigger: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> SchedulerOptions = {</span></span>
<span class="line"><span style="color:#958A8B;">    /** Its agents&#39; cron triggers are scheduled; its store holds the tick locks. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    engine: Engine;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Names of the engine&#39;s agents to schedule, e.g. to split cron triggers</span></span>
<span class="line"><span style="color:#958A8B;">     * across deployments. Default: every agent of the engine.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    agents?: string[];</span></span>
<span class="line"><span style="color:#958A8B;">    /** Lock owner. Default \`\${hostname()}-\${pid}\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    owner?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * How long a tick&#39;s lock key is held; a tick whose timer fires this late or</span></span>
<span class="line"><span style="color:#958A8B;">     * later is skipped. Default SCHEDULE_LOCK_TTL_MS.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    lockTtlMs?: number;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Receives a failing tick (lock store, overlap check or dispatch). Ticks</span></span>
<span class="line"><span style="color:#958A8B;">     * another replica won are not errors and are not reported.</span></span>
<span class="line"><span style="color:#958A8B;">     * Default console.error(&#39;[chamberu]&#39;, error, ctx).</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    onError?: (error: unknown, ctx: SchedulerErrorContext) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> void;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> interface</span><span style="color:#E6DFDE;"> IScheduler {</span></span>
<span class="line"><span style="color:#958A8B;">    /** Schedules every cron trigger; never fires on start. Idempotent. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    start(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Unschedules every trigger, then waits for ticks in flight. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    stop(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span></code></pre></div><h2 id="runjob" tabindex="-1">runJob <a class="header-anchor" href="#runjob" aria-label="Permalink to &quot;runJob&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> runJob(opts: RunJobOptions): Promise&lt;RunJobResult&gt;;</span></span></code></pre></div><p>Rejects with <code>InvalidAgentDefinitionError</code> when the trigger is missing or ambiguous.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> {</span></span>
<span class="line"><span style="color:#E6DFDE;">    Agent,</span></span>
<span class="line"><span style="color:#E6DFDE;">    Engine,</span></span>
<span class="line"><span style="color:#E6DFDE;">    RunStatusLiteral,</span></span>
<span class="line"><span style="color:#E6DFDE;">} </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@chamberu/core&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> RunJobOptions = {</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Not started yet; runJob starts and drains it, also when the tick is</span></span>
<span class="line"><span style="color:#958A8B;">     * skipped. Its store is polled and its clock gives scheduledAt and drives</span></span>
<span class="line"><span style="color:#958A8B;">     * the poll.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    engine: Engine;</span></span>
<span class="line"><span style="color:#E6DFDE;">    agent: Agent;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Cron trigger id; optional when the agent has exactly one cron trigger. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    trigger?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Fallback poll of engine.getRun, default 1_000. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    pollMs?: number;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Passed to engine.drain, default 30_000. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    drainTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> RunJobResult = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    runId?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * The run&#39;s status when the job returned: \`completed\`, \`failed\`,</span></span>
<span class="line"><span style="color:#958A8B;">     * \`cancelled\`, \`waiting\`, \`queued\` (behind a run of its concurrency key</span></span>
<span class="line"><span style="color:#958A8B;">     * that waits for an approval), or &#39;skipped&#39; (overlap).</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    status: RunStatusLiteral | </span><span style="color:#E7C58C;">&#39;skipped&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#958A8B;">    /** 0 for completed, waiting, queued and skipped; 1 for failed and cancelled. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    exitCode: </span><span style="color:#E7C58C;">0</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">1</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><h2 id="building-blocks" tabindex="-1">Building blocks <a class="header-anchor" href="#building-blocks" aria-label="Permalink to &quot;Building blocks&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> fireCronTrigger(ctx: CronTickContext): Promise&lt;CronTickResult&gt;;</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> readCronOptions(agent: Agent, trigger: TriggerDefinition): CronTriggerOptions;</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> createStoreScheduleLock(store: ILockStore, owner: string): IScheduleLock;</span></span></code></pre></div><p><code>fireCronTrigger</code> is one tick (overlap check and dispatch) for an explicit <code>scheduledAt</code>; <code>createScheduler</code> and <code>runJob</code> both call it. <code>createStoreScheduleLock</code> adapts core&#39;s <code>ILockStore</code> to hubwire&#39;s <code>IScheduleLock</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> {</span></span>
<span class="line"><span style="color:#E6DFDE;">    Agent,</span></span>
<span class="line"><span style="color:#E6DFDE;">    Engine,</span></span>
<span class="line"><span style="color:#E6DFDE;">    OverlapPolicy,</span></span>
<span class="line"><span style="color:#E6DFDE;">    TriggerDefinition,</span></span>
<span class="line"><span style="color:#E6DFDE;">} </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@chamberu/core&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> CronTriggerOptions = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    expression: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    timezone?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    overlap: OverlapPolicy;</span></span>
<span class="line"><span style="color:#E6DFDE;">    payload?: unknown;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> CronTickContext = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    engine: Engine;</span></span>
<span class="line"><span style="color:#E6DFDE;">    agent: Agent;</span></span>
<span class="line"><span style="color:#E6DFDE;">    trigger: TriggerDefinition;</span></span>
<span class="line"><span style="color:#958A8B;">    /** The tick&#39;s planned fire time; forms the idempotency key. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    scheduledAt: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> CronTickDispatched = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    dispatched: true;</span></span>
<span class="line"><span style="color:#E6DFDE;">    runId: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    deduplicated: boolean;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> CronTickSkipped = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    dispatched: false;</span></span>
<span class="line"><span style="color:#E6DFDE;">    reason: </span><span style="color:#E7C58C;">&#39;overlap&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> CronTickResult = CronTickDispatched | CronTickSkipped;</span></span></code></pre></div>`,16)])])}const D=n(p,[["render",o]]);export{E as __pageData,D as default};
