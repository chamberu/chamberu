import{_ as n,o as a,c as e,a2 as l}from"./chunks/framework.Di-jvWLj.js";const E=JSON.parse('{"title":"@chamvi/core","description":"","frontmatter":{},"headers":[],"relativePath":"reference/index.md","filePath":"reference/index.md","lastUpdated":1792596719000}'),p={name:"reference/index.md"};function o(t,s,c,r,i,y){return a(),e("div",null,[...s[0]||(s[0]=[l(`<h1 id="chamvi-core" tabindex="-1">@chamvi/core <a class="header-anchor" href="#chamvi-core" aria-label="Permalink to &quot;@chamvi/core&quot;">​</a></h1><p>The public API of <code>@chamvi/core</code>, taken from <code>packages/core/src/index.ts</code>. Contract interfaces carry an <code>I</code> prefix (<code>IStore</code>, <code>IClock</code>, <code>INotifier</code>, <code>IAgentState</code>); data shapes are unprefixed types.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">import</span><span style="color:#E6DFDE;"> { Engine, defineAgent } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E6DFDE;">;</span></span></code></pre></div><p>Test helpers live in <a href="/reference/test-kit"><code>@chamvi/test-kit</code></a>.</p><h2 id="agents" tabindex="-1">Agents <a class="header-anchor" href="#agents" aria-label="Permalink to &quot;Agents&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> defineAgent&lt;S </span><span style="color:#FF7B84;">extends</span><span style="color:#E6DFDE;"> StateSchema = StateSchema&gt;(def: AgentDefinition&lt;S&gt;): Agent&lt;S&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> DEFAULT_MAX_STEPS: </span><span style="color:#E7C58C;">20</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> DEFAULT_TIMEOUT_MS: </span><span style="color:#E7C58C;">900_000</span><span style="color:#E6DFDE;">; </span><span style="color:#958A8B;">// 15 minutes</span></span></code></pre></div><p>Throws <code>InvalidAgentDefinitionError</code> for an invalid name, duplicate trigger ids, or a <code>toolsContext</code> entry naming a chamvi tool or no tool of a plain tool set. See <a href="/guide/agents">Agents</a>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { LanguageModel, OutputInterface, ToolSet } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { Budget, RunContext } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../run/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { StateSchema } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../state/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { ToolContext } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../tool/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { TriggerDefinition } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../trigger/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** The factory&#39;s argument: the same ToolContext the run&#39;s chamvi tools get. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ToolFactoryContext&lt;S </span><span style="color:#FF7B84;">extends</span><span style="color:#E6DFDE;"> StateSchema = StateSchema&gt; = ToolContext&lt;S&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ApprovalPolicy = </span><span style="color:#E7C58C;">&#39;user&#39;</span><span style="color:#E6DFDE;"> | ((input: unknown, ctx: { runtimeContext: RunContext }) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E7C58C;"> &#39;user&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;allow&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;deny&#39;</span><span style="color:#E6DFDE;">);</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/**</span></span>
<span class="line"><span style="color:#958A8B;"> * Decides per tool name whether a run may use a tool. A refused tool is not</span></span>
<span class="line"><span style="color:#958A8B;"> * offered to the model (it is left out of \`activeTools\`). A call to it that</span></span>
<span class="line"><span style="color:#958A8B;"> * still arrives is a tool error, never a run failure, and its tool step</span></span>
<span class="line"><span style="color:#958A8B;"> * records \`tool_not_allowed\` (ToolNotAllowedError) on both paths:</span></span>
<span class="line"><span style="color:#958A8B;"> * - the model calls it anyway: the AI SDK answers the model with its</span></span>
<span class="line"><span style="color:#958A8B;"> *   unavailable-tool error (NoSuchToolError), the engine records the step</span></span>
<span class="line"><span style="color:#958A8B;"> *   as ToolNotAllowedError;</span></span>
<span class="line"><span style="color:#958A8B;"> * - an approved call from an older history (the policy changed before the</span></span>
<span class="line"><span style="color:#958A8B;"> *   resume) reaches the engine&#39;s per-call re-check, which answers the model</span></span>
<span class="line"><span style="color:#958A8B;"> *   with ToolNotAllowedError.</span></span>
<span class="line"><span style="color:#958A8B;"> * Should depend only on the run snapshot (e.g. \`run.trigger.invoker\`), so</span></span>
<span class="line"><span style="color:#958A8B;"> * the tool set is stable across executions.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ToolPolicy = (toolName: string, ctx: { run: RunContext }) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> boolean;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> AgentDefinition&lt;S </span><span style="color:#FF7B84;">extends</span><span style="color:#E6DFDE;"> StateSchema = StateSchema&gt; = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    name: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    model: LanguageModel;</span></span>
<span class="line"><span style="color:#E6DFDE;">    instructions: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    triggers?: TriggerDefinition[];</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * The agent&#39;s tools: a plain \`ToolSet\` (the default), or a factory for</span></span>
<span class="line"><span style="color:#958A8B;">     * dynamic sets, called once per execution with the same ToolContext the</span></span>
<span class="line"><span style="color:#958A8B;">     * tools get. Tools built with \`defineTool\`/\`defineEffectTool\` receive that</span></span>
<span class="line"><span style="color:#958A8B;">     * context as \`context\` in \`execute\`.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    tools?: ToolSet | ((ctx: ToolContext&lt;S&gt;) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> ToolSet);</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Per tool name, the context of a tool that is not chamvi&#39;s (e.g. a</span></span>
<span class="line"><span style="color:#958A8B;">     * third-party tool with its own \`contextSchema\`), passed through unchanged</span></span>
<span class="line"><span style="color:#958A8B;">     * by reference to every call of every run: treat it as immutable. An entry</span></span>
<span class="line"><span style="color:#958A8B;">     * naming a chamvi tool or no tool is an InvalidAgentDefinitionError (at</span></span>
<span class="line"><span style="color:#958A8B;">     * defineAgent for a plain set, a failed run for a factory).</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    toolsContext?: Record&lt;string, unknown&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Filters the merged tool set (state tools included) per run, e.g. requireToolPermission(). */</span></span>
<span class="line"><span style="color:#E6DFDE;">    toolPolicy?: ToolPolicy;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Record&lt;collection, StandardSchemaV1&gt;. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    state?: S;</span></span>
<span class="line"><span style="color:#E6DFDE;">    budget?: Partial&lt;Budget&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Tool name to policy (maps to AI SDK toolApproval). A call needing approval</span></span>
<span class="line"><span style="color:#958A8B;">     * pauses the run in \`waiting\`; one approval per pause: when a step asks for</span></span>
<span class="line"><span style="color:#958A8B;">     * several, the run waits on the first and the other calls are dropped from</span></span>
<span class="line"><span style="color:#958A8B;">     * the history, so the model requests them again after the resume.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    approvals?: Record&lt;string, ApprovalPolicy&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default 24h; on timeout the call is denied. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    approvalTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Notifier name registered on the engine. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    notify?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Structured output (AI SDK \`Output\`, e.g. \`Output.object({ schema })\`):</span></span>
<span class="line"><span style="color:#958A8B;">     * a completed run&#39;s \`output\` is the parsed value instead of the text; a</span></span>
<span class="line"><span style="color:#958A8B;">     * final answer that does not parse fails the run with a ValidationError.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    output?: OutputInterface;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Agent&lt;S </span><span style="color:#FF7B84;">extends</span><span style="color:#E6DFDE;"> StateSchema = StateSchema&gt; = {</span></span>
<span class="line"><span style="color:#FF7B84;">    readonly</span><span style="color:#E6DFDE;"> name: string;</span></span>
<span class="line"><span style="color:#FF7B84;">    readonly</span><span style="color:#E6DFDE;"> definition: Required&lt;Pick&lt;AgentDefinition&lt;S&gt;, </span><span style="color:#E7C58C;">&#39;budget&#39;</span><span style="color:#E6DFDE;">&gt;&gt; &amp; AgentDefinition&lt;S&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><h2 id="permissions" tabindex="-1">Permissions <a class="header-anchor" href="#permissions" aria-label="Permalink to &quot;Permissions&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> matchesPermission(granted: string, wanted: string): boolean;</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> hasPermission(permissions: </span><span style="color:#FF7B84;">readonly</span><span style="color:#E6DFDE;"> string[], wanted: string): boolean;</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> toolPermission(agent: string, tool: string): string; </span><span style="color:#958A8B;">// tool:&lt;agent&gt;:&lt;tool&gt;</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> requireToolPermission(opts?: RequireToolPermissionOptions): ToolPolicy;</span></span></code></pre></div><p><code>*</code> alone grants everything, a <code>*</code> segment matches exactly one segment, and segment counts must match. <code>requireToolPermission()</code> offers a tool when the run&#39;s invoker holds <code>toolPermission(agent, tool)</code>; runs without an invoker follow <code>withoutInvoker</code> (default <code>&#39;deny&#39;</code>). See <a href="/guide/tools#restricting-tools-per-invoker">Restricting tools per invoker</a>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> RequireToolPermissionOptions = {</span></span>
<span class="line"><span style="color:#958A8B;">    /** What a run without an invoker (cron, webhook) may use. Default \`&#39;deny&#39;\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    withoutInvoker?: </span><span style="color:#E7C58C;">&#39;allow&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;deny&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><h2 id="triggers" tabindex="-1">Triggers <a class="header-anchor" href="#triggers" aria-label="Permalink to &quot;Triggers&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> cron(expression: string, opts?: CronOptions): TriggerDefinition;</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> http(opts?: HttpTriggerOptions): TriggerDefinition;</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> webhook(opts: WebhookTriggerOptions): TriggerDefinition;</span></span></code></pre></div><p><code>TriggerSource</code>, <code>TriggerDefinition</code> and <code>TriggerEnvelope</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { Artifact } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../artifact/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> TriggerSource = </span><span style="color:#E7C58C;">&#39;cron&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;http&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;webhook&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;github&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;mcp&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> TriggerDefinition&lt;P = unknown&gt; = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    source: TriggerSource;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Unique within an agent, e.g. &#39;cron:*\\/30 * * * *&#39;. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    id: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Source-specific (cron: { expression, timezone?, overlap }). */</span></span>
<span class="line"><span style="color:#E6DFDE;">    options: Record&lt;string, unknown&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    // method signatures (bivariant): a TriggerDefinition&lt;P&gt; fits AgentDefinition.triggers</span></span>
<span class="line"><span style="color:#E6DFDE;">    concurrencyKey?(payload: P): string | undefined;</span></span>
<span class="line"><span style="color:#E6DFDE;">    idempotencyKey?(payload: P): string | undefined;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/**</span></span>
<span class="line"><span style="color:#958A8B;"> * Who started a run (or answered an approval), as an authenticator resolved</span></span>
<span class="line"><span style="color:#958A8B;"> * it: a snapshot of identity and grants taken at dispatch, never a token.</span></span>
<span class="line"><span style="color:#958A8B;"> * Revoking a grant later does not reach a run that already holds it.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Invoker = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    id: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * The authenticator&#39;s label: \`@chamvi/http\`&#39;s staticTokens() sets</span></span>
<span class="line"><span style="color:#958A8B;">     * &#39;token&#39; and authup() sets &#39;authup&#39;; oidc() keeps the kind its</span></span>
<span class="line"><span style="color:#958A8B;">     * \`principal\` mapper returns (the docs use &#39;oidc&#39;); a custom authenticator</span></span>
<span class="line"><span style="color:#958A8B;">     * or a direct dispatch may use its own (e.g. &#39;user&#39;).</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    kind: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    name?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    permissions: </span><span style="color:#FF7B84;">readonly</span><span style="color:#E6DFDE;"> string[];</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> TriggerEnvelope&lt;P = unknown&gt; = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    id: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    agent: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    trigger: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    source: TriggerSource;</span></span>
<span class="line"><span style="color:#E6DFDE;">    payload: P;</span></span>
<span class="line"><span style="color:#E6DFDE;">    idempotencyKey?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    concurrencyKey?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    thread?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Files the run was started with, stored as artifacts of the run; the model gets them as file parts. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    attachments?: Artifact[];</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Who started the run; only ever set from an authenticator (never from a</span></span>
<span class="line"><span style="color:#958A8B;">     * payload). Absent for cron and webhook runs. With an invoker the</span></span>
<span class="line"><span style="color:#958A8B;">     * idempotency key is scoped to it, so only the same invoker&#39;s dispatch</span></span>
<span class="line"><span style="color:#958A8B;">     * is deduplicated (and gets its own first run).</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    invoker?: Invoker;</span></span>
<span class="line"><span style="color:#E6DFDE;">    receivedAt: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><p><code>CronOptions</code> and <code>OverlapPolicy</code>, <code>HttpTriggerOptions</code>, <code>WebhookTriggerOptions</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> OverlapPolicy = </span><span style="color:#E7C58C;">&#39;skip&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;queue-one&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;allow&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> CronOptions = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    timezone?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    overlap?: OverlapPolicy;</span></span>
<span class="line"><span style="color:#E6DFDE;">    payload?: unknown;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { StandardSchemaV1 } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@standard-schema/spec&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> HttpTriggerOptions = {</span></span>
<span class="line"><span style="color:#958A8B;">    /** Validates the payload of a REST, UI or MCP start. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    schema?: StandardSchemaV1;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { StandardSchemaV1 } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@standard-schema/spec&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> WebhookTriggerOptions = {</span></span>
<span class="line"><span style="color:#958A8B;">    /** Starts with \`/\`; the trigger id is \`webhook:&lt;path&gt;\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    path: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Validates the delivered payload. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    schema?: StandardSchemaV1;</span></span>
<span class="line"><span style="color:#E6DFDE;">    idempotencyKey?: (payload: unknown) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> string | undefined;</span></span>
<span class="line"><span style="color:#E6DFDE;">    concurrencyKey?: (payload: unknown) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> string | undefined;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><p>See <a href="/guide/triggers">Triggers &amp; the Envelope</a>.</p><h2 id="engine" tabindex="-1">Engine <a class="header-anchor" href="#engine" aria-label="Permalink to &quot;Engine&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">class</span><span style="color:#E6DFDE;"> Engine {</span></span>
<span class="line"><span style="color:#FF7B84;">    constructor</span><span style="color:#E6DFDE;">(opts: EngineOptions);</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">    readonly</span><span style="color:#E6DFDE;"> store: IStore;</span></span>
<span class="line"><span style="color:#FF7B84;">    readonly</span><span style="color:#E6DFDE;"> clock: IClock;</span></span>
<span class="line"><span style="color:#E6DFDE;">    getAgent(name: string): Agent | undefined;</span></span>
<span class="line"><span style="color:#E6DFDE;">    listAgents(): Agent[];</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E6DFDE;">    dispatch(envelope: DispatchEnvelope): Promise&lt;{ runId: string; deduplicated: boolean }&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    getRun(id: string): Promise&lt;Run | undefined&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    on(event: RunEvent[</span><span style="color:#E7C58C;">&#39;type&#39;</span><span style="color:#E6DFDE;">], listener: (e: RunEvent) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> void): () </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> void;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E6DFDE;">    start(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    stop(): void;</span></span>
<span class="line"><span style="color:#E6DFDE;">    drain(opts?: { timeoutMs?: number }): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    idle(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#FF7B84;">    readonly</span><span style="color:#E6DFDE;"> isDraining: boolean;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#E6DFDE;">    cancel(runId: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    resume(token: string, decision: ResumeDecision): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    tick(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    recover(): Promise&lt;number&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span></code></pre></div><table tabindex="0"><thead><tr><th>Method</th><th>Description</th><th>Guide</th></tr></thead><tbody><tr><td><code>store</code>, <code>clock</code></td><td>The store and clock the engine was built with (<code>clock</code> defaults to <code>systemClock</code>)</td><td></td></tr><tr><td><code>getAgent</code>, <code>listAgents</code></td><td>One registered agent by name; all of them in registration order (a new array)</td><td></td></tr><tr><td><code>dispatch</code></td><td>Stores a <code>queued</code> run (and its attachments as artifacts); deduplicates by <code>idempotencyKey</code></td><td><a href="/guide/triggers">Triggers</a></td></tr><tr><td><code>getRun</code></td><td>Reads a run from the store</td><td><a href="/guide/run-lifecycle">Run Lifecycle</a></td></tr><tr><td><code>on</code></td><td>Subscribes to <code>run.updated</code>, <code>step.appended</code> or <code>run.delta</code>; returns an unsubscribe function</td><td><a href="/guide/run-lifecycle#watching-runs">Run Lifecycle</a></td></tr><tr><td><code>start</code></td><td>Recovers, starts polling and starts queued runs</td><td><a href="/guide/recovery">Recovery</a></td></tr><tr><td><code>stop</code></td><td>Stops polling only</td><td><a href="/guide/recovery">Recovery</a></td></tr><tr><td><code>drain</code></td><td>Waits for in-flight runs (default 30 s), then marks the rest <code>interrupted</code></td><td><a href="/guide/recovery#drain">Recovery</a></td></tr><tr><td><code>idle</code></td><td>Resolves when nothing runs and nothing more can start</td><td></td></tr><tr><td><code>cancel</code></td><td>Cancels locally, in the store, or requests it from the owning replica</td><td><a href="/guide/recovery#cancel">Recovery</a></td></tr><tr><td><code>resume</code></td><td>Answers the approval a waiting run waits on</td><td><a href="/guide/approvals">Approvals</a></td></tr><tr><td><code>tick</code></td><td>Denies expired approvals and re-sends undelivered notifications; runs every poll</td><td><a href="/guide/approvals">Approvals</a></td></tr><tr><td><code>recover</code></td><td>Requeues abandoned runs; runs on start and every poll</td><td><a href="/guide/recovery#recovery">Recovery</a></td></tr></tbody></table><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { Agent } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../agent/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { ArtifactInput } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../artifact/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { IClock } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../clock/index.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { INotifier } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../notify/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { Run, Step } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../run/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { IStore } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../store/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { Invoker, TriggerEnvelope } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../trigger/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/**</span></span>
<span class="line"><span style="color:#958A8B;"> * A piece of model output while it streams; never stored. \`step\` is the</span></span>
<span class="line"><span style="color:#958A8B;"> * checkpoint step index the step it belongs to is saved under.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> RunDelta = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    runId: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    step: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    kind: </span><span style="color:#E7C58C;">&#39;text&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;reasoning&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">    text: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> RunEvent = { type: </span><span style="color:#E7C58C;">&#39;run.updated&#39;</span><span style="color:#E6DFDE;">; run: Run } |</span></span>
<span class="line"><span style="color:#E6DFDE;">    { type: </span><span style="color:#E7C58C;">&#39;step.appended&#39;</span><span style="color:#E6DFDE;">; step: Step } |</span></span>
<span class="line"><span style="color:#E6DFDE;">    { type: </span><span style="color:#E7C58C;">&#39;run.delta&#39;</span><span style="color:#E6DFDE;">; delta: RunDelta };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> EngineOptions = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    store: IStore;</span></span>
<span class="line"><span style="color:#E6DFDE;">    agents: Agent[];</span></span>
<span class="line"><span style="color:#E6DFDE;">    notifiers?: Record&lt;string, INotifier&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default \`\${hostname}-\${pid}\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    owner?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default 4. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    maxConcurrentRuns?: number;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default 60_000, renewed every ttl/3 while running. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    claimTtlMs?: number;</span></span>
<span class="line"><span style="color:#958A8B;">    /** HMAC secret for resume tokens; must not be empty. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    resumeSecret: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Receives errors that have no caller to throw to. Default console.error. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    onError?: (error: unknown, run?: Run) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> void;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> DispatchEnvelope = Omit&lt;TriggerEnvelope, </span><span style="color:#E7C58C;">&#39;id&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;receivedAt&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;attachments&#39;</span><span style="color:#E6DFDE;">&gt; &amp;</span></span>
<span class="line"><span style="color:#E6DFDE;">    Partial&lt;Pick&lt;TriggerEnvelope, </span><span style="color:#E7C58C;">&#39;id&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;receivedAt&#39;</span><span style="color:#E6DFDE;">&gt;&gt; &amp; {</span></span>
<span class="line"><span style="color:#958A8B;">        /** Files to start the run with; stored as artifacts of the run before it is created. */</span></span>
<span class="line"><span style="color:#E6DFDE;">        attachments?: ArtifactInput[];</span></span>
<span class="line"><span style="color:#E6DFDE;">    };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ResumeDecision = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    approved: boolean;</span></span>
<span class="line"><span style="color:#E6DFDE;">    reason?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Who answered; recorded on the wait step (\\\`output.approver\\\`). */</span></span>
<span class="line"><span style="color:#E6DFDE;">    approver?: Invoker;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** A token-less answer to the run&#39;s current wait point (\`Engine.approve()\`). */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ApprovalAnswer = ResumeDecision &amp; {</span></span>
<span class="line"><span style="color:#958A8B;">    /** Must equal \`run.waiting.approvalId\`, else InvalidRunStateError. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    approvalId: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><table tabindex="0"><thead><tr><th>Option</th><th>Default</th></tr></thead><tbody><tr><td><code>notifiers</code></td><td><code>{}</code></td></tr><tr><td><code>owner</code></td><td><code>\`\${hostname}-\${pid}\`</code></td></tr><tr><td><code>maxConcurrentRuns</code></td><td><code>4</code></td></tr><tr><td><code>claimTtlMs</code></td><td><code>60_000</code>, renewed and polled every <code>claimTtlMs / 3</code></td></tr><tr><td><code>clock</code></td><td><code>systemClock</code></td></tr><tr><td><code>onError</code></td><td>logs to <code>console.error</code></td></tr></tbody></table><p><code>ApprovalRequest</code> (<code>{ approvalId, toolName, input }</code>) is the tool call a waiting run waits on.</p><h2 id="runs" tabindex="-1">Runs <a class="header-anchor" href="#runs" aria-label="Permalink to &quot;Runs&quot;">​</a></h2><p><code>Run</code>, <code>RunStatusLiteral</code>, <code>RunContext</code>, <code>Step</code>, <code>Checkpoint</code>, <code>WaitPoint</code>, <code>Budget</code> and <code>Usage</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { ModelMessage } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { TriggerEnvelope } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../trigger/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { RunStatus } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;./constants.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> RunStatusLiteral = </span><span style="color:#E7C58C;">\`</span><span style="color:#E6DFDE;">\${</span><span style="color:#E7C58C;">RunStatus</span><span style="color:#E6DFDE;">}</span><span style="color:#E7C58C;">\`</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Usage = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    inputTokens: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    outputTokens: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Budget = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    maxSteps: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    maxTokens?: number;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Wall-clock limit per execution (not cumulative across resumes): each</span></span>
<span class="line"><span style="color:#958A8B;">     * execution of the run gets the full timeout again.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    timeoutMs?: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> RunContext = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    runId: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    agent: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    trigger: TriggerEnvelope;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Aborts on cancel, drain, a lost lease or the run timeout, and once the execution has ended. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    signal: AbortSignal;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> WaitPoint = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    kind: </span><span style="color:#E7C58C;">&#39;approval&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">    approvalId: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    toolName: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    input: unknown;</span></span>
<span class="line"><span style="color:#E6DFDE;">    expiresAt: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">    tokenId: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Set once the agent&#39;s notifier accepted the approval request; tick() re-sends until then. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    notifiedAt?: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Run = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    id: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    agent: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    status: RunStatusLiteral;</span></span>
<span class="line"><span style="color:#E6DFDE;">    trigger: TriggerEnvelope;</span></span>
<span class="line"><span style="color:#E6DFDE;">    concurrencyKey?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    thread?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    output?: unknown;</span></span>
<span class="line"><span style="color:#E6DFDE;">    error?: { code: string; message: string };</span></span>
<span class="line"><span style="color:#E6DFDE;">    usage: Usage;</span></span>
<span class="line"><span style="color:#E6DFDE;">    waiting?: WaitPoint;</span></span>
<span class="line"><span style="color:#E6DFDE;">    claim?: { owner: string; expiresAt: Date };</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Set by cancel() on a replica that does not execute the run: the owner</span></span>
<span class="line"><span style="color:#958A8B;">     * aborts it on its next poll, and a later execution settles it cancelled.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    cancelRequested?: boolean;</span></span>
<span class="line"><span style="color:#E6DFDE;">    createdAt: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">    updatedAt: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">    startedAt?: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">    finishedAt?: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Step = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    runId: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    index: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    kind: </span><span style="color:#E7C58C;">&#39;llm&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;tool&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;wait&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">    name?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    input?: unknown;</span></span>
<span class="line"><span style="color:#E6DFDE;">    output?: unknown;</span></span>
<span class="line"><span style="color:#E6DFDE;">    error?: unknown;</span></span>
<span class="line"><span style="color:#E6DFDE;">    startedAt: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">    finishedAt: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Checkpoint = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    runId: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    stepIndex: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    messages: ModelMessage[];</span></span>
<span class="line"><span style="color:#958A8B;">    /** AI SDK finish reason of the step this checkpoint was taken after. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    finishReason?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    createdAt: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><p>The <code>RunStatus</code> enum, whose values <code>RunStatusLiteral</code> is built from:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> enum</span><span style="color:#E6DFDE;"> RunStatus {</span></span>
<span class="line"><span style="color:#E6DFDE;">    QUEUED = </span><span style="color:#E7C58C;">&#39;queued&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    RUNNING = </span><span style="color:#E7C58C;">&#39;running&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    WAITING = </span><span style="color:#E7C58C;">&#39;waiting&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    COMPLETED = </span><span style="color:#E7C58C;">&#39;completed&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    FAILED = </span><span style="color:#E7C58C;">&#39;failed&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    CANCELLED = </span><span style="color:#E7C58C;">&#39;cancelled&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    INTERRUPTED = </span><span style="color:#E7C58C;">&#39;interrupted&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span></code></pre></div><h2 id="stores" tabindex="-1">Stores <a class="header-anchor" href="#stores" aria-label="Permalink to &quot;Stores&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">class</span><span style="color:#E6DFDE;"> MemoryStore </span><span style="color:#FF7B84;">implements</span><span style="color:#E6DFDE;"> IStore {</span></span>
<span class="line"><span style="color:#FF7B84;">    constructor</span><span style="color:#E6DFDE;">(opts?: { clock?: IClock });</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span></code></pre></div><p><code>IStore</code> and its parts (<code>IRunStore</code>, <code>IStepStore</code>, <code>ICheckpointStore</code>, <code>IIdempotencyStore</code>, <code>ILockStore</code>, <code>IEffectStore</code>, <code>IStateStore</code>, <code>IArtifactStore</code>) are listed on the <a href="/stores/">Store Contract</a> page.</p><h2 id="artifacts" tabindex="-1">Artifacts <a class="header-anchor" href="#artifacts" aria-label="Permalink to &quot;Artifacts&quot;">​</a></h2><p><code>Artifact</code> (metadata), <code>ArtifactInput</code> (a file to store) and <code>IRunArtifacts</code> (the tool context&#39;s <code>artifacts</code>):</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** Metadata of a file stored for a run (an attachment or a tool output); the bytes are read separately. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Artifact = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    id: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    runId: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    agent: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    mediaType: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    filename?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Byte length of the data. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    size: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    createdAt: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** A file to store: an attachment at dispatch or a tool&#39;s \`artifacts.put()\`. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ArtifactInput = {</span></span>
<span class="line"><span style="color:#958A8B;">    /** \`type/subtype\`, e.g. \`image/png\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    mediaType: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    filename?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    data: Uint8Array;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/**</span></span>
<span class="line"><span style="color:#958A8B;"> * The artifacts of one run, part of the tool context. Not an effect by</span></span>
<span class="line"><span style="color:#958A8B;"> * itself: put \`put()\` inside a \`defineEffectTool\` to store a file exactly once.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> interface</span><span style="color:#E6DFDE;"> IRunArtifacts {</span></span>
<span class="line"><span style="color:#958A8B;">    /** Stores a file as an artifact of the run. Throws ValidationError for an invalid input. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    put(input: ArtifactInput): Promise&lt;Artifact&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    /** An artifact of this run with its bytes; undefined for an unknown id or another run&#39;s artifact. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    get(id: string): Promise&lt;{ artifact: Artifact; data: Uint8Array } | undefined&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    /** The run&#39;s artifacts, by createdAt then id. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    list(): Promise&lt;Artifact[]&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span></code></pre></div><p><code>isArtifactMediaType(value: unknown): value is string</code> is the media type rule <code>dispatch</code> and <code>artifacts.put()</code> apply: <code>type/subtype</code> (RFC 6838 restricted names) without parameters. An intake layer can check attachments with it before dispatching (<code>@chamvi/http</code> does).</p><p>See <a href="/guide/agents#files">Files</a> and <a href="/guide/triggers#attachments">Attachments</a>.</p><h2 id="tools" tabindex="-1">Tools <a class="header-anchor" href="#tools" aria-label="Permalink to &quot;Tools&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> defineTool&lt;I, O, S </span><span style="color:#FF7B84;">extends</span><span style="color:#E6DFDE;"> StateSchema = StateSchema&gt;(</span></span>
<span class="line"><span style="color:#E6DFDE;">    def: Tool&lt;I, O, ToolContext&lt;S&gt;&gt; &amp; {</span></span>
<span class="line"><span style="color:#E6DFDE;">        execute: ToolExecuteFunction&lt;I, O, ToolContext&lt;S&gt;&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">        contextSchema?: never;</span></span>
<span class="line"><span style="color:#E6DFDE;">    },</span></span>
<span class="line"><span style="color:#E6DFDE;">): Tool&lt;I, O, ToolContext&lt;S&gt;&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> toolContextSchema: StandardSchemaV1&lt;ToolContext, ToolContext&gt;; </span><span style="color:#958A8B;">// vendor &#39;chamvi&#39;</span></span></code></pre></div><p><code>defineTool()</code> is <code>tool()</code> with <code>contextSchema: toolContextSchema</code>; the engine hands the run&#39;s <code>ToolContext</code> to every tool carrying that schema (by reference, so a copy of the tool keeps it). Its <code>validate</code> returns the context unchanged and rejects a missing one, which fails the run (<code>validation_error</code>) with <code>Type validation failed for tool context (&lt;tool&gt;): No chamvi tool context: the tool was built by another copy of @chamvi/core, or runs outside a chamvi agent.</code> (the marker is the schema object itself, so a tool from a second copy of <code>@chamvi/core</code> gets no context).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { IRunArtifacts } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../artifact/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { RunContext } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../run/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { IAgentState, StateSchema } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../state/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/**</span></span>
<span class="line"><span style="color:#958A8B;"> * What a chamvi tool (built with \`defineTool\` or \`defineEffectTool\`) gets as</span></span>
<span class="line"><span style="color:#958A8B;"> * \`context\` in \`execute\`: one object per execution, shared by every call of</span></span>
<span class="line"><span style="color:#958A8B;"> * it and by the tools factory. Treat it as immutable.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ToolContext&lt;S </span><span style="color:#FF7B84;">extends</span><span style="color:#E6DFDE;"> StateSchema = StateSchema&gt; = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    run: RunContext;</span></span>
<span class="line"><span style="color:#E6DFDE;">    state: IAgentState&lt;S&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * The run&#39;s artifacts (its attachments and files tools stored). Not an</span></span>
<span class="line"><span style="color:#958A8B;">     * effect: put \`put()\` inside a \`defineEffectTool\` to store a file exactly once.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    artifacts: IRunArtifacts;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><p>See <a href="/guide/agents#tools-and-their-context">Tools and their context</a>.</p><h2 id="effect-tools" tabindex="-1">Effect tools <a class="header-anchor" href="#effect-tools" aria-label="Permalink to &quot;Effect tools&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> defineEffectTool&lt;I, O, S </span><span style="color:#FF7B84;">extends</span><span style="color:#E6DFDE;"> StateSchema = StateSchema&gt;(def: Tool&lt;I, O, ToolContext&lt;S&gt;&gt; &amp; {</span></span>
<span class="line"><span style="color:#E6DFDE;">    execute: ToolExecuteFunction&lt;I, O, ToolContext&lt;S&gt;&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    contextSchema?: never;</span></span>
<span class="line"><span style="color:#E6DFDE;">    effectKey?: (input: I, ctx: ToolContext&lt;S&gt;, options: ToolExecutionOptions&lt;ToolContext&lt;S&gt;&gt;) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    alreadyApplied?: (effectKey: string, input: I, ctx: ToolContext&lt;S&gt;) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> Promise&lt;O | undefined&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">}): EffectTool&lt;I, O, S&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> effectMarker(effectKey: string): string; </span><span style="color:#958A8B;">// &#39;&lt;!-- chamvi:effect=&lt;key&gt; --&gt;&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> wrapToolsForRun(</span></span>
<span class="line"><span style="color:#E6DFDE;">    tools: ToolSet,</span></span>
<span class="line"><span style="color:#E6DFDE;">    ctx: ToolContext,</span></span>
<span class="line"><span style="color:#E6DFDE;">    store: IEffectStore,</span></span>
<span class="line"><span style="color:#E6DFDE;">    allow?: (toolName: string) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> boolean,</span></span>
<span class="line"><span style="color:#E6DFDE;">): ToolSet;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> EFFECT: unique symbol; </span><span style="color:#958A8B;">// marks a tool as an effect tool</span></span></code></pre></div><p>See <a href="/guide/effect-tools">Effect Tools &amp; Reconciliation</a>.</p><h2 id="approvals" tabindex="-1">Approvals <a class="header-anchor" href="#approvals" aria-label="Permalink to &quot;Approvals&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> createResumeToken(secret: string, p: ResumeTokenClaims &amp; { expiresAt: Date }): string;</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> verifyResumeToken(secret: string, token: string, now: Date): ResumeTokenClaims;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">type</span><span style="color:#E6DFDE;"> ResumeTokenClaims = { runId: string; approvalId: string; tokenId: string };</span></span></code></pre></div><p><code>verifyResumeToken</code> throws <code>InvalidResumeTokenError</code> for every failure. See <a href="/guide/approvals">Approvals &amp; Resume Tokens</a>.</p><h2 id="state" tabindex="-1">State <a class="header-anchor" href="#state" aria-label="Permalink to &quot;State&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> createAgentState&lt;S </span><span style="color:#FF7B84;">extends</span><span style="color:#E6DFDE;"> StateSchema = StateSchema&gt;(</span></span>
<span class="line"><span style="color:#E6DFDE;">    agent: string,</span></span>
<span class="line"><span style="color:#E6DFDE;">    schema: S | undefined,</span></span>
<span class="line"><span style="color:#E6DFDE;">    store: IStateStore,</span></span>
<span class="line"><span style="color:#E6DFDE;">): IAgentState&lt;S&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> createStateTools&lt;S </span><span style="color:#FF7B84;">extends</span><span style="color:#E6DFDE;"> StateSchema&gt;(schema: S): ToolSet; </span><span style="color:#958A8B;">// the tools read context.state</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { StandardSchemaV1 } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@standard-schema/spec&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> StateSchema = Record&lt;string, StandardSchemaV1&gt;;</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Infer&lt;T </span><span style="color:#FF7B84;">extends</span><span style="color:#E6DFDE;"> StandardSchemaV1&gt; = StandardSchemaV1.InferOutput&lt;T&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> interface</span><span style="color:#E6DFDE;"> IAgentState&lt;S </span><span style="color:#FF7B84;">extends</span><span style="color:#E6DFDE;"> StateSchema = StateSchema&gt; {</span></span>
<span class="line"><span style="color:#E6DFDE;">    get&lt;T = unknown&gt;(key: string): Promise&lt;T | undefined&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    set(key: string, value: unknown): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    collection&lt;K </span><span style="color:#FF7B84;">extends</span><span style="color:#FF7B84;"> keyof</span><span style="color:#E6DFDE;"> S &amp; string&gt;(name: K): {</span></span>
<span class="line"><span style="color:#E6DFDE;">        list(q?: { where?: Partial&lt;Infer&lt;S[K]&gt;&gt;; limit?: number }): Promise&lt;Array&lt;{ id: string } &amp; Infer&lt;S[K]&gt;&gt;&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">        /** Validates \`doc\` via the collection&#39;s Standard Schema; throws ValidationError and stores nothing on failure. */</span></span>
<span class="line"><span style="color:#E6DFDE;">        upsert(id: string, doc: Infer&lt;S[K]&gt;): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">        remove(id: string): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    };</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span></code></pre></div><p>See <a href="/guide/state">Agent State</a>.</p><h2 id="notifiers" tabindex="-1">Notifiers <a class="header-anchor" href="#notifiers" aria-label="Permalink to &quot;Notifiers&quot;">​</a></h2><p><code>INotifier</code>, <code>Notification</code>, <code>NotifyOptions</code> and <code>ConsoleNotifierOptions</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { TriggerEnvelope } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../trigger/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Notification = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    kind: </span><span style="color:#E7C58C;">&#39;approval&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;stuck&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;result&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;info&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">    agent: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    runId: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    title: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    body: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** The wait point&#39;s approval id (kind &#39;approval&#39;), e.g. for a link into the UI&#39;s approval. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    approvalId?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Signed token resuming the run (kind &#39;approval&#39;). */</span></span>
<span class="line"><span style="color:#E6DFDE;">    resumeToken?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    expiresAt?: Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> NotifyOptions = {</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Stable per logical notification (\`runId:approvalId\` for approvals), so</span></span>
<span class="line"><span style="color:#958A8B;">     * transports can dedupe a resend.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    idempotencyKey: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * The run&#39;s trigger envelope as stored; read the source, payload and</span></span>
<span class="line"><span style="color:#958A8B;">     * receivedAt, never write it.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    trigger: TriggerEnvelope;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> interface</span><span style="color:#E6DFDE;"> INotifier {</span></span>
<span class="line"><span style="color:#FF7B84;">    readonly</span><span style="color:#E6DFDE;"> name: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Delivers a notification and throws on failure (the engine retries an</span></span>
<span class="line"><span style="color:#958A8B;">     * approval until one send succeeds), idempotent on \`opts.idempotencyKey\`.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    notify(n: Notification, opts: NotifyOptions): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ConsoleNotifierOptions = {</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default \`&#39;console&#39;\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    name?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Receives each line; default \`console.log\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    write?: (line: string) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> void;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> consoleNotifier(options?: ConsoleNotifierOptions): INotifier;</span></span></code></pre></div><p>A development notifier: writes <code>[chamvi] &lt;kind&gt;: &lt;title&gt; (agent &lt;agent&gt;, run &lt;runId&gt;, key &lt;idempotencyKey&gt;)</code>, the body and, for an approval, <code>resume token: &lt;token&gt; (expires &lt;ISO&gt;)</code>, one <code>write</code> call per line. It never throws; an empty <code>name</code> throws <code>InvalidAgentDefinitionError</code>.</p><p>See <a href="/guide/notifiers">Notifiers</a>.</p><h2 id="clock" tabindex="-1">Clock <a class="header-anchor" href="#clock" aria-label="Permalink to &quot;Clock&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> systemClock: IClock;</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ClockTimerOptions = {</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Keep the process alive until the timer fires (default false: engine</span></span>
<span class="line"><span style="color:#958A8B;">     * timers never hold the event loop open). Test clocks ignore it.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    keepAlive?: boolean;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> interface</span><span style="color:#E6DFDE;"> IClock {</span></span>
<span class="line"><span style="color:#E6DFDE;">    now(): Date;</span></span>
<span class="line"><span style="color:#E6DFDE;">    setTimeout(fn: () </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> void, ms: number, opts?: ClockTimerOptions): { clear(): void };</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span></code></pre></div><p><code>systemClock</code> timers never keep the process alive unless <code>keepAlive</code> is set; only the drain deadline sets it.</p><h2 id="errors" tabindex="-1">Errors <a class="header-anchor" href="#errors" aria-label="Permalink to &quot;Errors&quot;">​</a></h2><p><code>ChamviError</code>, <code>InvalidAgentDefinitionError</code>, <code>InvalidResumeTokenError</code>, <code>InvalidRunStateError</code>, <code>RunNotFoundError</code>, <code>ArtifactNotFoundError</code>, <code>BudgetExceededError</code>, <code>TimeoutError</code>, <code>FatalToolError</code>, <code>IncompleteResponseError</code>, <code>ToolNotAllowedError</code>, <code>LeaseLostError</code>, <code>SandboxError</code>, <code>ValidationError</code> and <code>ErrorCode</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> const</span><span style="color:#E6DFDE;"> ErrorCode = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    ARTIFACT_NOT_FOUND: </span><span style="color:#E7C58C;">&#39;artifact_not_found&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    BUDGET_EXCEEDED: </span><span style="color:#E7C58C;">&#39;BudgetExceeded&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    FATAL_TOOL: </span><span style="color:#E7C58C;">&#39;FatalToolError&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    INCOMPLETE_RESPONSE: </span><span style="color:#E7C58C;">&#39;incomplete_response&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    INVALID_AGENT_DEFINITION: </span><span style="color:#E7C58C;">&#39;invalid_agent_definition&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    INVALID_RESUME_TOKEN: </span><span style="color:#E7C58C;">&#39;invalid_resume_token&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    INVALID_RUN_STATE: </span><span style="color:#E7C58C;">&#39;invalid_run_state&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    LEASE_LOST: </span><span style="color:#E7C58C;">&#39;lease_lost&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    RUN_NOT_FOUND: </span><span style="color:#E7C58C;">&#39;run_not_found&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    SANDBOX: </span><span style="color:#E7C58C;">&#39;sandbox_error&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    TIMEOUT: </span><span style="color:#E7C58C;">&#39;Timeout&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    TOOL_NOT_ALLOWED: </span><span style="color:#E7C58C;">&#39;tool_not_allowed&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    VALIDATION: </span><span style="color:#E7C58C;">&#39;validation_error&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">} </span><span style="color:#FF7B84;">as</span><span style="color:#FF7B84;"> const</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ErrorCode = </span><span style="color:#FF7B84;">typeof</span><span style="color:#E6DFDE;"> ErrorCode[keyof </span><span style="color:#FF7B84;">typeof</span><span style="color:#E6DFDE;"> ErrorCode];</span></span></code></pre></div><p>See <a href="/guide/errors">Errors</a> for when each is thrown.</p>`,69)])])}const D=n(p,[["render",o]]);export{E as __pageData,D as default};
