import{_ as n,o as a,c as e,a2 as p}from"./chunks/framework.Di-jvWLj.js";const d=JSON.parse('{"title":"@chamvi/github","description":"","frontmatter":{},"headers":[],"relativePath":"reference/github.md","filePath":"reference/github.md","lastUpdated":1792690510000}'),l={name:"reference/github.md"};function o(t,s,c,i,r,y){return a(),e("div",null,[...s[0]||(s[0]=[p(`<h1 id="chamvi-github" tabindex="-1">@chamvi/github <a class="header-anchor" href="#chamvi-github" aria-label="Permalink to &quot;@chamvi/github&quot;">​</a></h1><p>GitHub App webhooks and tools for chamvi agents. The public API of <code>packages/github/src/index.ts</code>.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#E6DFDE;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamvi/github</span><span style="color:#E7C58C;"> @chamvi/http</span><span style="color:#E7C58C;"> @chamvi/core</span><span style="color:#E7C58C;"> ai</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p><code>@chamvi/core</code>, <code>@chamvi/http</code> and <code>ai</code> are peer dependencies. See <a href="/deployment/github-app">GitHub App</a> for setup and behaviour.</p><h2 id="creategithubapp" tabindex="-1">createGithubApp <a class="header-anchor" href="#creategithubapp" aria-label="Permalink to &quot;createGithubApp&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> createGithubApp(options: GithubAppOptions): IGithubApp;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> DEFAULT_GITHUB_API_URL: </span><span style="color:#E7C58C;">&#39;https://api.github.com&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> DEFAULT_WEBHOOK_PATH: </span><span style="color:#E7C58C;">&#39;/webhooks/github&#39;</span><span style="color:#E6DFDE;">;</span></span></code></pre></div><p>Throws <code>InvalidAgentDefinitionError</code> for an empty <code>appId</code>, a key that is no RSA private key, an empty webhook secret, an <code>installationId</code> that is no positive integer, a <code>baseUrl</code> that is no absolute https URL without query (empty means <code>https://api.github.com</code>) and a <code>slug</code> that is not the App&#39;s lower-case slug (<code>^[a-z0-9]+(-[a-z0-9]+)*$</code>, as in the App&#39;s URL; a miscased one would silently disable the self guard).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { ToolSet } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;ai&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { IClock } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/core&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { HttpRoute } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/http&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { GithubWebhookRouteOptions } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../webhook/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { PaginatedOctokit } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;./helpers.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubAppOptions = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    appId: string | number;</span></span>
<span class="line"><span style="color:#958A8B;">    /** PEM (PKCS#1 or PKCS#8); literal &quot;\\n&quot; sequences become newlines. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    privateKey: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Several during a secret rotation; a delivery verifies under any. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    webhookSecret: string | </span><span style="color:#FF7B84;">readonly</span><span style="color:#E6DFDE;"> string[];</span></span>
<span class="line"><span style="color:#958A8B;">    /** For runs not started by a delivery (cron, http, mcp). */</span></span>
<span class="line"><span style="color:#E6DFDE;">    installationId?: number;</span></span>
<span class="line"><span style="color:#958A8B;">    /** The App&#39;s slug; skips \`GET /app\` for the bot login. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    slug?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default DEFAULT_GITHUB_API_URL (&#39;https://api.github.com&#39;). */</span></span>
<span class="line"><span style="color:#E6DFDE;">    baseUrl?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#E6DFDE;">    fetch?: </span><span style="color:#FF7B84;">typeof</span><span style="color:#E6DFDE;"> globalThis.fetch;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** An Octokit (\`@octokit/core\` with \`paginate\`). */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubOctokit = InstanceType&lt;</span><span style="color:#FF7B84;">typeof</span><span style="color:#E6DFDE;"> PaginatedOctokit&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> interface</span><span style="color:#E6DFDE;"> IGithubApp {</span></span>
<span class="line"><span style="color:#FF7B84;">    readonly</span><span style="color:#E6DFDE;"> appId: string;</span></span>
<span class="line"><span style="color:#FF7B84;">    readonly</span><span style="color:#E6DFDE;"> installationId?: number;</span></span>
<span class="line"><span style="color:#958A8B;">    /** An Octokit authenticated as the installation (cached token). */</span></span>
<span class="line"><span style="color:#E6DFDE;">    octokit(installationId: number): Promise&lt;GithubOctokit&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    /** \`&lt;slug&gt;[bot]\`, from \`slug\` or one \`GET /app\`; cached, single-flight. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    botLogin(): Promise&lt;string&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    /** \`sha256=&lt;hex&gt;\` of the raw body under any webhook secret, compared in constant time. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    verifySignature(body: Uint8Array, signature: string | null): boolean;</span></span>
<span class="line"><span style="color:#958A8B;">    /** The webhook route for \`createHttpApp({ routes })\`: \`POST /webhooks/github\` unless \`path\` is given. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    webhookRoute(options?: GithubWebhookRouteOptions): HttpRoute;</span></span>
<span class="line"><span style="color:#958A8B;">    /** The read-only tools (\`github_get_issue\`, \`github_search_issues\`, ...), acting as the run&#39;s installation. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    readTools(): ToolSet;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * The write tools (\`github_add_labels\`, \`github_create_comment\`,</span></span>
<span class="line"><span style="color:#958A8B;">     * \`github_close_issue\`), effect tools applied at most once per run.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    writeTools(): ToolSet;</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> GITHUB_REQUEST_ERROR_CODE: </span><span style="color:#E7C58C;">&#39;github_request&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> REPO_PATTERN: string; </span><span style="color:#958A8B;">// &#39;^([\\\\w.-]*[\\\\w-][\\\\w.-]*)/([\\\\w.-]*[\\\\w-][\\\\w.-]*)$&#39;</span></span></code></pre></div><p><code>GITHUB_REQUEST_ERROR_CODE</code> is the <code>code</code> of every failed GitHub request (the tools&#39; errors and <code>@chamvi/notify-github</code>&#39;s); <code>REPO_PATTERN</code> is the <code>owner/name</code> rule the tools apply (GitHub&#39;s name characters, each segment with one that is not a dot, so <code>.</code> and <code>..</code> never fold the URL into another API path). Build a <code>RegExp</code> from it.</p><h2 id="githubwebhook" tabindex="-1">githubWebhook <a class="header-anchor" href="#githubwebhook" aria-label="Permalink to &quot;githubWebhook&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> githubWebhook(options: GithubWebhookTriggerOptions): TriggerDefinition&lt;GithubEvent&gt;;</span></span></code></pre></div><p>Throws <code>InvalidAgentDefinitionError</code> without events or for an event that is not <code>name</code> or <code>name.action</code> (lower case letters, digits and underscores, e.g. <code>projects_v2_item.created</code>).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** The parts of a GitHub webhook body chamvi reads; the rest passes through. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubPayload = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    action?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    installation?: { id: number };</span></span>
<span class="line"><span style="color:#E6DFDE;">    repository?: { full_name: string; [key: string]: unknown };</span></span>
<span class="line"><span style="color:#E6DFDE;">    sender?: {</span></span>
<span class="line"><span style="color:#E6DFDE;">        login: string; </span></span>
<span class="line"><span style="color:#E6DFDE;">        type: string; </span></span>
<span class="line"><span style="color:#E6DFDE;">        [key: string]: unknown </span></span>
<span class="line"><span style="color:#E6DFDE;">    };</span></span>
<span class="line"><span style="color:#E6DFDE;">    issue?: { number: number; [key: string]: unknown };</span></span>
<span class="line"><span style="color:#E6DFDE;">    pull_request?: { number: number; [key: string]: unknown };</span></span>
<span class="line"><span style="color:#E6DFDE;">    [key: string]: unknown;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** The envelope payload of a \`source: &#39;github&#39;\` run. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubEvent = {</span></span>
<span class="line"><span style="color:#958A8B;">    /** X-GitHub-Event, e.g. &#39;issues&#39;; not covered by the signature, so never a key on its own. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    name: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    action?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** X-GitHub-Delivery; not covered by the signature. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    delivery: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    installationId?: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    payload: GithubPayload;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubWebhookTriggerOptions = {</span></span>
<span class="line"><span style="color:#958A8B;">    /** &#39;issues&#39; (every action) or &#39;issues.opened&#39;; at least one. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    events: </span><span style="color:#FF7B84;">readonly</span><span style="color:#E6DFDE;"> string[];</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default \`github:&lt;events joined by &#39;,&#39;&gt;\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    id?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Runs after the event match; a delivery it refuses starts no run of this trigger. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    filter?: (event: GithubEvent) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> boolean;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Default: the delivery id (applied by the route). The signature does not</span></span>
<span class="line"><span style="color:#958A8B;">     * cover that header, so a replayed body under a new id is a new run;</span></span>
<span class="line"><span style="color:#958A8B;">     * derive the key from the content on an exposed endpoint.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    idempotencyKey?: (event: GithubEvent) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> string | undefined;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default: \`&lt;full_name&gt;#&lt;issue|pull_request number&gt;\`, else \`&lt;full_name&gt;\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    concurrencyKey?: (event: GithubEvent) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> string | undefined;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><h2 id="webhook-route" tabindex="-1">Webhook route <a class="header-anchor" href="#webhook-route" aria-label="Permalink to &quot;Webhook route&quot;">​</a></h2><p><code>gh.webhookRoute(options?)</code> returns an <code>HttpRoute</code> for <code>createHttpApp({ routes })</code>; it answers <code>202</code> with a <code>GithubWebhookResult</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubWebhookRouteOptions = {</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default DEFAULT_WEBHOOK_PATH (&#39;/webhooks/github&#39;), under the http app&#39;s \`basePath\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    path?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** The \`202\` answer to a delivery: the run each matching agent got (deduplicated on a redelivery). */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubWebhookResult = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    delivery: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    runs: Array&lt;{</span></span>
<span class="line"><span style="color:#E6DFDE;">        agent: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">        runId: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">        deduplicated: boolean;</span></span>
<span class="line"><span style="color:#E6DFDE;">    }&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><h2 id="tools" tabindex="-1">Tools <a class="header-anchor" href="#tools" aria-label="Permalink to &quot;Tools&quot;">​</a></h2><p><code>gh.readTools()</code> and <code>gh.writeTools()</code> return plain AI SDK <code>ToolSet</code>s; the results are these shapes.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** The input of a tool on a repository. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> RepoInput = { repo: string };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** The input of a tool on an issue or pull request. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> NumberInput = RepoInput &amp; { number: number };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** \`github_get_issue\`. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubIssue = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    number: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    title: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    body: string | null;</span></span>
<span class="line"><span style="color:#E6DFDE;">    state: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    labels: string[];</span></span>
<span class="line"><span style="color:#E6DFDE;">    author: string | null;</span></span>
<span class="line"><span style="color:#E6DFDE;">    url: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    createdAt: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    comments: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    isPullRequest: boolean;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** \`github_search_issues\`. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubIssueSearch = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    total: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    items: Array&lt;{</span></span>
<span class="line"><span style="color:#E6DFDE;">        repo: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">        number: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">        title: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">        state: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">        url: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    }&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** One entry of \`github_list_labels\`. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubLabel = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    name: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    description: string | null;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** \`github_get_pull_request\`; \`base\` and \`head\` are branch names. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubPullRequest = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    number: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    title: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    body: string | null;</span></span>
<span class="line"><span style="color:#E6DFDE;">    state: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    draft: boolean;</span></span>
<span class="line"><span style="color:#E6DFDE;">    merged: boolean;</span></span>
<span class="line"><span style="color:#E6DFDE;">    base: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    head: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    author: string | null;</span></span>
<span class="line"><span style="color:#E6DFDE;">    url: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    changedFiles: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** \`github_get_file\` for a file: UTF-8 text, cut at FILE_MAX_CHARS characters. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubFile = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    path: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    size: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    content: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    truncated: boolean;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** \`github_get_file\` for a directory. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubDirectory = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    path: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    entries: Array&lt;{</span></span>
<span class="line"><span style="color:#E6DFDE;">        name: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">        type: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">        path: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    }&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** \`github_get_latest_release\`; \`{ none: true }\` when the repository has no release. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubRelease = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    tag: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    name: string | null;</span></span>
<span class="line"><span style="color:#E6DFDE;">    publishedAt: string | null;</span></span>
<span class="line"><span style="color:#E6DFDE;">    url: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    body: string | null;</span></span>
<span class="line"><span style="color:#E6DFDE;">} | { none: true };</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** \`github_create_comment\`: the posted (or found) comment. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubComment = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    id: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    url: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** \`github_add_labels\`: every label the issue carries afterwards. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubIssueLabels = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    labels: string[];</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** \`github_close_issue\`. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubClosedIssue = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    number: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    state: </span><span style="color:#E7C58C;">&#39;closed&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">    stateReason: string | null;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><h2 id="context" tabindex="-1">Context <a class="header-anchor" href="#context" aria-label="Permalink to &quot;Context&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> provideGithubContext(provider: IContextProvider, app: IGithubApp): void; </span><span style="color:#958A8B;">// engine.provide under the key &#39;github&#39;</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> injectGithubContext(ctx: ToolContext): IGithubApp;                    </span><span style="color:#958A8B;">// else ContextNotProvidedError</span></span></code></pre></div><p><code>githubModule()</code> provides its app; with a hand-built engine call <code>provideGithubContext(engine, gh)</code> after <code>new Engine()</code>. Inject in a tools factory (<code>tools: (ctx) =&gt; injectGithubContext(ctx).readTools()</code>), in a tool&#39;s <code>execute</code> or in an effect hook; see <a href="/guide/tools#context-shared-instances-for-tools">Context</a>. One app per engine: a second provide throws <code>InvalidAgentDefinitionError</code>.</p><h2 id="module" tabindex="-1">Module <a class="header-anchor" href="#module" aria-label="Permalink to &quot;Module&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">// @chamvi/github/module, needs @chamvi/app</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> githubModule(options?: GithubModuleOptions): GithubModule; </span><span style="color:#958A8B;">// name GITHUB_MODULE_NAME &#39;chamvi:github&#39;, .app: IGithubApp</span></span></code></pre></div><p>Reads <code>GITHUB_APP_ID</code>, <code>GITHUB_APP_PRIVATE_KEY</code>, <code>GITHUB_WEBHOOK_SECRET</code> (comma-separated), <code>GITHUB_INSTALLATION_ID</code>, <code>GITHUB_APP_SLUG</code> and <code>GITHUB_API_URL</code> from <code>options.env ?? process.env</code> when it is called, unless <code>options.app</code> is given; explicit options win. <code>setup</code> contributes the signed webhook route (<code>webhookPath</code>, default <code>/webhooks/github</code>) to the app&#39;s routes, and the <code>engineCreated</code> hook provides <code>.app</code>. <code>@chamvi/app</code> is an optional peer: the main entry never imports it. See <a href="/guide/app#modules">Apps &amp; Modules</a>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamvi vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { Env } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@chamvi/app&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { GithubAppOptions, IGithubApp } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;../app/types.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> GithubModuleOptions = Partial&lt;GithubAppOptions&gt; &amp; {</span></span>
<span class="line"><span style="color:#958A8B;">    /** Used as is; no env is read then. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    app?: IGithubApp;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default \`process.env\`, read when the factory is called. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    env?: Env;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default \`/webhooks/github\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    webhookPath?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div>`,27)])])}const h=n(l,[["render",o]]);export{d as __pageData,h as default};
