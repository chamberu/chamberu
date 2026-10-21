import{_ as n,o as a,c as e,a2 as l}from"./chunks/framework.Di-jvWLj.js";const D=JSON.parse('{"title":"Quick Start","description":"","frontmatter":{},"headers":[],"relativePath":"getting-started/quick-start.md","filePath":"getting-started/quick-start.md","lastUpdated":1792575534000}'),o={name:"getting-started/quick-start.md"};function t(p,s,r,c,i,d){return a(),e("div",null,[...s[0]||(s[0]=[l(`<h1 id="quick-start" tabindex="-1">Quick Start <a class="header-anchor" href="#quick-start" aria-label="Permalink to &quot;Quick Start&quot;">​</a></h1><p>One agent, an in-memory store and one manually dispatched run. This is the same code as the example in the <code>@chamvi/core</code> README, which the test suite runs against a scripted model.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { LanguageModel } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#E6DFDE;"> { z } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;zod&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#E6DFDE;"> {</span></span>
<span class="line"><span style="color:#E6DFDE;">    Engine,</span></span>
<span class="line"><span style="color:#E6DFDE;">    MemoryStore,</span></span>
<span class="line"><span style="color:#E6DFDE;">    defineAgent,</span></span>
<span class="line"><span style="color:#E6DFDE;">    defineEffectTool,</span></span>
<span class="line"><span style="color:#E6DFDE;">    http,</span></span>
<span class="line"><span style="color:#E6DFDE;">} </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> async</span><span style="color:#FF7B84;"> function</span><span style="color:#E6DFDE;"> triageIssue(model: LanguageModel) {</span></span>
<span class="line"><span style="color:#FF7B84;">    const</span><span style="color:#E6DFDE;"> labels: string[] = [];</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">    const</span><span style="color:#E6DFDE;"> triage = defineAgent({</span></span>
<span class="line"><span style="color:#E6DFDE;">        name: </span><span style="color:#E7C58C;">&#39;triage&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">        model,</span></span>
<span class="line"><span style="color:#E6DFDE;">        instructions: </span><span style="color:#E7C58C;">&#39;Label the issue in the trigger payload as bug, feature or question.&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">        triggers: [http()],</span></span>
<span class="line"><span style="color:#E6DFDE;">        budget: { maxSteps: </span><span style="color:#E7C58C;">5</span><span style="color:#E6DFDE;"> },</span></span>
<span class="line"><span style="color:#E6DFDE;">        tools: {</span></span>
<span class="line"><span style="color:#958A8B;">            // the result is recorded per (run, tool, input): a resumed run reuses it</span></span>
<span class="line"><span style="color:#E6DFDE;">            addLabel: defineEffectTool({</span></span>
<span class="line"><span style="color:#E6DFDE;">                description: </span><span style="color:#E7C58C;">&#39;Adds a label to the issue.&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">                inputSchema: z.object({ label: z.enum([</span><span style="color:#E7C58C;">&#39;bug&#39;</span><span style="color:#E6DFDE;">, </span><span style="color:#E7C58C;">&#39;feature&#39;</span><span style="color:#E6DFDE;">, </span><span style="color:#E7C58C;">&#39;question&#39;</span><span style="color:#E6DFDE;">]) }),</span></span>
<span class="line"><span style="color:#E6DFDE;">                execute: </span><span style="color:#FF7B84;">async</span><span style="color:#E6DFDE;"> ({ label }) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> {</span></span>
<span class="line"><span style="color:#E6DFDE;">                    labels.push(label);</span></span>
<span class="line"><span style="color:#FF7B84;">                    return</span><span style="color:#E6DFDE;"> { added: label };</span></span>
<span class="line"><span style="color:#E6DFDE;">                },</span></span>
<span class="line"><span style="color:#E6DFDE;">            }),</span></span>
<span class="line"><span style="color:#E6DFDE;">        },</span></span>
<span class="line"><span style="color:#E6DFDE;">    });</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">    const</span><span style="color:#E6DFDE;"> engine = </span><span style="color:#FF7B84;">new</span><span style="color:#E6DFDE;"> Engine({</span></span>
<span class="line"><span style="color:#E6DFDE;">        store: </span><span style="color:#FF7B84;">new</span><span style="color:#E6DFDE;"> MemoryStore(),</span></span>
<span class="line"><span style="color:#E6DFDE;">        agents: [triage],</span></span>
<span class="line"><span style="color:#E6DFDE;">        resumeSecret: </span><span style="color:#E7C58C;">&#39;change-me&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">    });</span></span>
<span class="line"><span style="color:#FF7B84;">    await</span><span style="color:#E6DFDE;"> engine.start();</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">    const</span><span style="color:#E6DFDE;"> { runId } = </span><span style="color:#FF7B84;">await</span><span style="color:#E6DFDE;"> engine.dispatch({</span></span>
<span class="line"><span style="color:#E6DFDE;">        agent: </span><span style="color:#E7C58C;">&#39;triage&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">        trigger: </span><span style="color:#E7C58C;">&#39;http&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">        source: </span><span style="color:#E7C58C;">&#39;http&#39;</span><span style="color:#E6DFDE;">,</span></span>
<span class="line"><span style="color:#E6DFDE;">        payload: { title: </span><span style="color:#E7C58C;">&#39;App crashes on start&#39;</span><span style="color:#E6DFDE;"> },</span></span>
<span class="line"><span style="color:#E6DFDE;">    });</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">    await</span><span style="color:#E6DFDE;"> engine.idle();</span></span>
<span class="line"><span style="color:#E6DFDE;">    engine.stop();</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">    return</span><span style="color:#E6DFDE;"> { run: </span><span style="color:#FF7B84;">await</span><span style="color:#E6DFDE;"> engine.getRun(runId), labels };</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span></code></pre></div><p>Pass any AI SDK <code>LanguageModel</code>, for example <code>anthropic(...)</code> from <code>@ai-sdk/anthropic</code>. The function resolves with the settled run and the labels the tool added.</p><h2 id="what-happened" tabindex="-1">What happened <a class="header-anchor" href="#what-happened" aria-label="Permalink to &quot;What happened&quot;">​</a></h2><ol><li><strong><code>defineAgent()</code></strong> checked the name and filled in the default budget. The <code>tools</code> factory runs once per execution and returns an AI SDK <code>ToolSet</code>.</li><li><strong><code>new Engine()</code></strong> validated the setup: a non-empty <code>resumeSecret</code>, unique agent names, known notifiers.</li><li><strong><code>engine.start()</code></strong> recovered abandoned runs (there were none) and started polling.</li><li><strong><code>engine.dispatch()</code></strong> stored a <code>queued</code> run. The trigger envelope (source, trigger id and payload) became the run&#39;s first user message.</li><li>The engine claimed the run, set it <code>running</code> and drove an AI SDK <code>ToolLoopAgent</code>. After every step it appended the steps and saved a checkpoint to the store.</li><li>The model called <code>addLabel</code>. Because it is an <a href="/guide/effect-tools">effect tool</a>, its result was recorded under an effect key, so a resumed run would reuse it instead of labelling twice.</li><li>The model answered with text, and the run settled <code>completed</code>. Its <code>output</code> is the text of the last answer (an agent with <a href="/guide/agents#structured-output">structured output</a> gets the parsed value instead).</li><li><strong><code>engine.idle()</code></strong> resolved once nothing was running, and <strong><code>engine.stop()</code></strong> stopped the poll.</li></ol><h2 id="where-to-go-next" tabindex="-1">Where to go next <a class="header-anchor" href="#where-to-go-next" aria-label="Permalink to &quot;Where to go next&quot;">​</a></h2><ul><li>Replace <code>MemoryStore</code> with a durable store before you rely on restarts. See <a href="/stores/">Stores</a>.</li><li>Add a <a href="/guide/budgets">budget</a>, <a href="/guide/approvals">approvals</a> or <a href="/guide/state">state</a>.</li><li>Shut down with <a href="/guide/recovery"><code>drain()</code></a> instead of <code>stop()</code> in a real process.</li></ul>`,8)])])}const y=n(o,[["render",t]]);export{D as __pageData,y as default};
