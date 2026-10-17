import{_ as n,o as a,c as e,a2 as o}from"./chunks/framework.Di-jvWLj.js";const y=JSON.parse('{"title":"Execution & Checkpoints","description":"","frontmatter":{},"headers":[],"relativePath":"guide/execution.md","filePath":"guide/execution.md","lastUpdated":1792229229000}'),l={name:"guide/execution.md"};function t(p,s,r,c,i,d){return a(),e("div",null,[...s[0]||(s[0]=[o(`<h1 id="execution-checkpoints" tabindex="-1">Execution &amp; Checkpoints <a class="header-anchor" href="#execution-checkpoints" aria-label="Permalink to &quot;Execution &amp; Checkpoints&quot;">​</a></h1><p>One execution is one call of an AI SDK <code>ToolLoopAgent</code> for one claimed, <code>running</code> run. A run may take several executions: one before an approval pause and one after, or one before a crash and one after recovery.</p><h2 id="what-an-execution-does" tabindex="-1">What an execution does <a class="header-anchor" href="#what-an-execution-does" aria-label="Permalink to &quot;What an execution does&quot;">​</a></h2><ol><li><strong>Load the start point.</strong> The latest checkpoint&#39;s messages, or, for a new run, a single user message with the rendered trigger envelope.</li><li><strong>Re-pause if needed.</strong> If the checkpoint ends on an approval request nobody answered, the run goes back to <code>waiting</code> without a model call.</li><li><strong>Check the step budget.</strong> If an earlier execution already used every step, the run settles right away (see <a href="/guide/budgets">Budgets</a>).</li><li><strong>Assemble the tools.</strong> Generated <a href="/guide/state">state tools</a> plus the result of your <code>tools</code> factory, with every <a href="/guide/effect-tools">effect tool</a> wrapped.</li><li><strong>Run the loop.</strong> <code>ToolLoopAgent</code> with your model and instructions, the <code>toolApproval</code> derived from <code>approvals</code>, and stop conditions for the step and token budgets.</li><li><strong>After every step:</strong> append the <code>llm</code> step and one <code>tool</code> step per tool result or error, save a checkpoint, and update the run&#39;s token usage.</li><li><strong>Settle.</strong> <code>completed</code>, <code>failed</code>, <code>cancelled</code>, <code>waiting</code> (approval) or, during a drain, <code>interrupted</code>.</li></ol><h2 id="checkpoints" tabindex="-1">Checkpoints <a class="header-anchor" href="#checkpoints" aria-label="Permalink to &quot;Checkpoints&quot;">​</a></h2><p>A <code>Checkpoint</code> holds the full message history after a step, the step index and the AI SDK finish reason of that step.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
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
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><p>The store keeps the checkpoint with the highest <code>stepIndex</code> per run; saving one with an equal index replaces it. That is how an approval response is appended to the history of the step that asked for it.</p><p>Because the engine saves a checkpoint after every completed step, a recovered run repeats at most the step that was in progress when the process died. If that step called tools, they run again, which is why tools with side effects should be <a href="/guide/effect-tools">effect tools</a>.</p><h3 id="writes-around-an-abort" tabindex="-1">Writes around an abort <a class="header-anchor" href="#writes-around-an-abort" aria-label="Permalink to &quot;Writes around an abort&quot;">​</a></h3><p>A cancel or drain aborts the model call, but the writes of a step that already completed (its tool rows and checkpoint) are allowed to finish before the run settles. A recovery then does not redo a step whose tools already ran. Once the run has settled, a model call that is still running cannot write anymore.</p><h2 id="ownership" tabindex="-1">Ownership <a class="header-anchor" href="#ownership" aria-label="Permalink to &quot;Ownership&quot;">​</a></h2><p>Every write of a <code>running</code> run is conditional on the status and on the engine holding the run&#39;s claim. If another engine took the run over (because this one&#39;s lease expired), the execution is aborted, writes nothing more and reports a <code>LeaseLostError</code> to <code>onError</code>. The run is not failed: its new owner carries it on. See <a href="/guide/concurrency">Concurrency, Leases &amp; Multi-Replica</a>.</p><h2 id="the-first-message" tabindex="-1">The first message <a class="header-anchor" href="#the-first-message" aria-label="Permalink to &quot;The first message&quot;">​</a></h2><p>The model sees the trigger as a JSON block:</p><div class="language-md"><button title="Copy Code" class="copy"></button><span class="lang">md</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#E6DFDE;">\`\`\`json</span></span>
<span class="line"><span style="color:#E6DFDE;">{</span></span>
<span class="line"><span style="color:#E6DFDE;">  &quot;source&quot;: &quot;manual&quot;,</span></span>
<span class="line"><span style="color:#E6DFDE;">  &quot;trigger&quot;: &quot;manual&quot;,</span></span>
<span class="line"><span style="color:#E6DFDE;">  &quot;payload&quot;: {</span></span>
<span class="line"><span style="color:#E6DFDE;">    &quot;title&quot;: &quot;App crashes on start&quot;</span></span>
<span class="line"><span style="color:#E6DFDE;">  }</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span>
<span class="line"><span style="color:#E6DFDE;">\`\`\`</span></span></code></pre></div><p><code>id</code>, keys, <code>thread</code> and <code>receivedAt</code> are not part of the message; they are available to tools through <code>run.trigger</code>.</p>`,17)])])}const D=n(l,[["render",t]]);export{y as __pageData,D as default};
