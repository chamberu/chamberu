import{_ as n,o as a,c as e,a2 as p}from"./chunks/framework.Di-jvWLj.js";const D=JSON.parse('{"title":"@chamberu/http","description":"","frontmatter":{},"headers":[],"relativePath":"reference/http.md","filePath":"reference/http.md","lastUpdated":1792518131000}'),l={name:"reference/http.md"};function o(t,s,c,r,i,y){return a(),e("div",null,[...s[0]||(s[0]=[p(`<h1 id="chamberu-http" tabindex="-1">@chamberu/http <a class="header-anchor" href="#chamberu-http" aria-label="Permalink to &quot;@chamberu/http&quot;">​</a></h1><p>REST, SSE, webhooks and MCP for chamberu agents, on routup. The public API of <code>packages/http/src/index.ts</code>.</p><div class="language-bash"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#E6DFDE;">npm </span><span style="color:#E7C58C;">install</span><span style="color:#E7C58C;"> @chamberu/http</span><span style="color:#E7C58C;"> @chamberu/core</span><span style="color:#E7C58C;"> --save</span></span></code></pre></div><p><code>@chamberu/core</code> is a peer dependency. See <a href="/guide/http">HTTP API &amp; MCP</a> for the behaviour.</p><h2 id="createhttpapp" tabindex="-1">createHttpApp <a class="header-anchor" href="#createhttpapp" aria-label="Permalink to &quot;createHttpApp&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> createHttpApp(options: HttpAppOptions): App; </span><span style="color:#958A8B;">// routup App</span></span></code></pre></div><p>Throws <code>InvalidAgentDefinitionError</code> for duplicate agent names, an empty <code>auth</code> array and an invalid <code>routes</code> entry (a path that is not static, a duplicate method and path, a first segment of a built-in route such as <code>agents</code>, <code>runs</code> or <code>hooks</code>, or the metrics path, all compared case-insensitively).</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> CorsOptions = CorsPluginOptions;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> RateLimitOptions = RateLimitPluginOptions;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> PrometheusOptions = PrometheusPluginOptions;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** routup&#39;s trust-proxy input: a predicate, CIDRs, \`&#39;loopback&#39;\`, a hop count or a boolean. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> TrustProxyInput = NonNullable&lt;AppOptionsInput[</span><span style="color:#E7C58C;">&#39;trustProxy&#39;</span><span style="color:#E6DFDE;">]&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> McpOptions = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    name?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    version?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    maxWaitSeconds?: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> HttpAppOptions = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    engine: RunEngine;</span></span>
<span class="line"><span style="color:#E6DFDE;">    store: IStore;</span></span>
<span class="line"><span style="color:#E6DFDE;">    agents: Agent[];</span></span>
<span class="line"><span style="color:#958A8B;">    /** One authenticator or a chain; the first principal wins. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    auth: Authenticator | Authenticator[];</span></span>
<span class="line"><span style="color:#958A8B;">    /** Prefix of every route, e.g. \`/api\`. Default: none. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    basePath?: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Which proxies \`getRequestIP\` trusts (and so the rate-limit key). Default: none. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    trustProxy?: TrustProxyInput;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Fails \`/readyz\` once shutting down; the app ends its streams on shutdown. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    shutdown?: IShutdown;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Bytes a request body may have. Default: 1 MiB. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    bodyLimit?: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    stream?: {</span></span>
<span class="line"><span style="color:#958A8B;">        /** How often a stream polls the store for runs executing elsewhere. Default: 2 s. */</span></span>
<span class="line"><span style="color:#E6DFDE;">        pollMs?: number;</span></span>
<span class="line"><span style="color:#958A8B;">        /**</span></span>
<span class="line"><span style="color:#958A8B;">         * Open SSE run streams plus waiting MCP \`run_&lt;agent&gt;\` calls, per app</span></span>
<span class="line"><span style="color:#958A8B;">         * (a positive integer). Over it a stream answers 503 with</span></span>
<span class="line"><span style="color:#958A8B;">         * \`Retry-After\`, an MCP call answers without waiting. Default: 1000.</span></span>
<span class="line"><span style="color:#958A8B;">         */</span></span>
<span class="line"><span style="color:#E6DFDE;">        maxOpen?: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    };</span></span>
<span class="line"><span style="color:#E6DFDE;">    mcp?: false | McpOptions;</span></span>
<span class="line"><span style="color:#958A8B;">    /** CORS is off unless given. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    cors?: false | CorsOptions;</span></span>
<span class="line"><span style="color:#E6DFDE;">    rateLimit?: false | Partial&lt;RateLimitOptions&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    metrics?: false | Partial&lt;PrometheusOptions&gt;;</span></span>
<span class="line"><span style="color:#958A8B;">    /** How long \`/readyz\` waits for the store. Default: 2 s. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    readyTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Receives 5xx causes and background failures. Default: \`console.error\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    onError?: (error: unknown) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> void;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Extra routes other packages contribute (e.g. a GitHub webhook), served under \`basePath\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    routes?: HttpRoute[];</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><p><code>routes</code> takes extra routes from other packages, such as the GitHub webhook of <code>@chamberu/github</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> HttpRouteMethod = </span><span style="color:#E7C58C;">&#39;GET&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;POST&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;PUT&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;PATCH&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;DELETE&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> HttpRouteRequest = {</span></span>
<span class="line"><span style="color:#958A8B;">    /** URL, method, headers and signal; without the body, which only readBody() reads. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    request: Request;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * The raw body, at most \`bodyLimit\` bytes: 413 above it (content-length</span></span>
<span class="line"><span style="color:#958A8B;">     * refused unread, else drained like readJsonBody), 415 for a non-JSON</span></span>
<span class="line"><span style="color:#958A8B;">     * media type with a non-empty body; an empty body is a 0-length array.</span></span>
<span class="line"><span style="color:#958A8B;">     * Memoized: every call answers the same bytes (or the same error).</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    readBody(): Promise&lt;Uint8Array&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> HttpRouteResult = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    status: number;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Objects, arrays, numbers and booleans are sent as JSON, a string as</span></span>
<span class="line"><span style="color:#958A8B;">     * \`text/plain\`; \`undefined\` or \`null\` answer an empty body.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    body?: unknown;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> HttpRouteContext = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    engine: RunEngine;</span></span>
<span class="line"><span style="color:#E6DFDE;">    agents: </span><span style="color:#FF7B84;">readonly</span><span style="color:#E6DFDE;"> Agent[];</span></span>
<span class="line"><span style="color:#E6DFDE;">    clock: IClock;</span></span>
<span class="line"><span style="color:#E6DFDE;">    onError: (error: unknown) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> void;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> HttpRoute = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    method: HttpRouteMethod;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Static path under basePath (no &#39;:&#39; &#39;*&#39; &#39;{&#39;), e.g. &#39;/webhooks/github&#39;; also its metrics label. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    path: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** false: skipped by the app&#39;s rate limiter (callers that never retry, e.g. webhook senders). Default: limited. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    rateLimit?: false;</span></span>
<span class="line"><span style="color:#958A8B;">    /**</span></span>
<span class="line"><span style="color:#958A8B;">     * Not authenticated by the app&#39;s authenticators: the route checks its own</span></span>
<span class="line"><span style="color:#958A8B;">     * credentials. Thrown @ebec/http and core errors render like any route&#39;s.</span></span>
<span class="line"><span style="color:#958A8B;">     */</span></span>
<span class="line"><span style="color:#E6DFDE;">    handler: (request: HttpRouteRequest, ctx: HttpRouteContext) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> Promise&lt;HttpRouteResult&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><h2 id="authenticators" tabindex="-1">Authenticators <a class="header-anchor" href="#authenticators" aria-label="Permalink to &quot;Authenticators&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">type</span><span style="color:#E6DFDE;"> Authenticator = (request: Request) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> Promise&lt;Principal | undefined&gt;;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> staticTokens(options: StaticTokensOptions): Authenticator;</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> authup(options: AuthupOptions): Authenticator;</span></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> oidc(options: OidcOptions): Authenticator;</span></span></code></pre></div><p>An authenticator resolves <code>undefined</code> for a request it does not recognize and throws a 401 for credentials it rejects. <code>staticTokens</code> throws <code>InvalidAgentDefinitionError</code> for an empty <code>tokens</code> array, a token <code>value</code> shorter than 16 characters, a missing <code>id</code> or a <code>value</code> given twice; <code>oidc</code> for an empty <code>issuers</code> list, an issuer without <code>audience</code> or a missing <code>principal</code>.</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { Permission } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;./constants.ts&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> PermissionName = </span><span style="color:#FF7B84;">typeof</span><span style="color:#E6DFDE;"> Permission[keyof </span><span style="color:#FF7B84;">typeof</span><span style="color:#E6DFDE;"> Permission];</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> AgentAction = </span><span style="color:#E7C58C;">&#39;run&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;approve&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Principal = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    id: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    kind: </span><span style="color:#E7C58C;">&#39;token&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;authup&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;oidc&#39;</span><span style="color:#E6DFDE;"> | (string &amp; {});</span></span>
<span class="line"><span style="color:#958A8B;">    /** Granted permissions, e.g. \`agent:triage:run\`, \`run:read\` or \`*\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    permissions: </span><span style="color:#FF7B84;">readonly</span><span style="color:#E6DFDE;"> string[];</span></span>
<span class="line"><span style="color:#E6DFDE;">    claims?: Record&lt;string, unknown&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/**</span></span>
<span class="line"><span style="color:#958A8B;"> * Resolves \`undefined\` when the request carries no credentials it</span></span>
<span class="line"><span style="color:#958A8B;"> * recognizes, throws \`UnauthorizedError\` for credentials it rejects.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> Authenticator = (request: Request) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> Promise&lt;Principal | undefined&gt;;</span></span></code></pre></div><h2 id="permissions" tabindex="-1">Permissions <a class="header-anchor" href="#permissions" aria-label="Permalink to &quot;Permissions&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> Permission: {</span></span>
<span class="line"><span style="color:#E6DFDE;">    ALL: </span><span style="color:#E7C58C;">&#39;*&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">    RUN_READ: </span><span style="color:#E7C58C;">&#39;run:read&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">    RUN_CANCEL: </span><span style="color:#E7C58C;">&#39;run:cancel&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">    STATE_READ: </span><span style="color:#E7C58C;">&#39;state:read&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">    STATE_WRITE: </span><span style="color:#E7C58C;">&#39;state:write&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> agentPermission(agent: string, action: </span><span style="color:#E7C58C;">&#39;run&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;approve&#39;</span><span style="color:#E6DFDE;">): string; </span><span style="color:#958A8B;">// agent:&lt;agent&gt;:&lt;action&gt;</span></span></code></pre></div><p>Matching uses core&#39;s <a href="/reference/#permissions"><code>hasPermission(principal.permissions, permission)</code></a>: true for a granted <code>*</code>, or for a grant with the same number of <code>:</code> segments whose every segment is equal or <code>*</code>.</p><h2 id="createshutdown" tabindex="-1">createShutdown <a class="header-anchor" href="#createshutdown" aria-label="Permalink to &quot;createShutdown&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">function</span><span style="color:#E6DFDE;"> createShutdown(options: ShutdownOptions): IShutdown;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> DEFAULT_SHUTDOWN_DRAIN_TIMEOUT_MS: </span><span style="color:#E7C58C;">30_000</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"><span style="color:#FF7B84;">const</span><span style="color:#E6DFDE;"> DEFAULT_SHUTDOWN_CLOSE_TIMEOUT_MS: </span><span style="color:#E7C58C;">5_000</span><span style="color:#E6DFDE;">;</span></span></code></pre></div><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/*</span></span>
<span class="line"><span style="color:#958A8B;"> * Copyright (c) 2026.</span></span>
<span class="line"><span style="color:#958A8B;"> * Author Peter Placzek (tada5hi)</span></span>
<span class="line"><span style="color:#958A8B;"> * For the full copyright and license information,</span></span>
<span class="line"><span style="color:#958A8B;"> * view the LICENSE file that was distributed with this source code.</span></span>
<span class="line"><span style="color:#958A8B;"> */</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">import</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> { IClock, RunEngine } </span><span style="color:#FF7B84;">from</span><span style="color:#E7C58C;"> &#39;@chamberu/core&#39;</span><span style="color:#E6DFDE;">;</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> interface</span><span style="color:#E6DFDE;"> IShutdown {</span></span>
<span class="line"><span style="color:#958A8B;">    /** True from the first \`shutdown()\` call on; \`/readyz\` then fails. */</span></span>
<span class="line"><span style="color:#FF7B84;">    readonly</span><span style="color:#E6DFDE;"> shuttingDown: boolean;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Runs \`fn\` during the shutdown, after the scheduler stopped; returns an unsubscribe. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    onShutdown(fn: () </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> void | Promise&lt;void&gt;): () </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> void;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Idempotent: every call returns the same promise. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    shutdown(): Promise&lt;void&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ShutdownOptions = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    engine: RunEngine;</span></span>
<span class="line"><span style="color:#E6DFDE;">    scheduler?: { stop(): Promise&lt;void&gt; };</span></span>
<span class="line"><span style="color:#958A8B;">    /** srvx \`Server\` (pass \`gracefulShutdown: false\` to \`serve\`). */</span></span>
<span class="line"><span style="color:#E6DFDE;">    server?: { close(closeActiveConnections?: boolean): Promise&lt;void&gt; };</span></span>
<span class="line"><span style="color:#958A8B;">    /** Time for load balancers to see the failing readiness. Default 0. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    readinessDelayMs?: number;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default 30 s. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    drainTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Wait for open connections after the drain, then close them. Default 5 s. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    closeTimeoutMs?: number;</span></span>
<span class="line"><span style="color:#E6DFDE;">    clock?: IClock;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Default \`console.error\`. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    onError?: (error: unknown) </span><span style="color:#FF7B84;">=&gt;</span><span style="color:#E6DFDE;"> void;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><h2 id="wire-types" tabindex="-1">Wire types <a class="header-anchor" href="#wire-types" aria-label="Permalink to &quot;Wire types&quot;">​</a></h2><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#FF7B84;">type</span><span style="color:#E6DFDE;"> InvokerView = Omit&lt;Invoker, </span><span style="color:#E7C58C;">&#39;permissions&#39;</span><span style="color:#E6DFDE;">&gt;;</span></span>
<span class="line"><span style="color:#FF7B84;">type</span><span style="color:#E6DFDE;"> RunView = Omit&lt;Run, </span><span style="color:#E7C58C;">&#39;claim&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;trigger&#39;</span><span style="color:#E6DFDE;">&gt; &amp; {</span></span>
<span class="line"><span style="color:#E6DFDE;">    trigger: Omit&lt;TriggerEnvelope, </span><span style="color:#E7C58C;">&#39;invoker&#39;</span><span style="color:#E6DFDE;">&gt; &amp; { invoker?: InvokerView };</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"><span style="color:#FF7B84;">type</span><span style="color:#E6DFDE;"> RunSummary = Pick&lt;Run, </span><span style="color:#E7C58C;">&#39;id&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;agent&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;status&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;createdAt&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;finishedAt&#39;</span><span style="color:#E6DFDE;"> | </span><span style="color:#E7C58C;">&#39;error&#39;</span><span style="color:#E6DFDE;">&gt;;</span></span>
<span class="line"><span style="color:#FF7B84;">type</span><span style="color:#E6DFDE;"> RunToolResult = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    runId: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    status: RunStatusLiteral;</span></span>
<span class="line"><span style="color:#E6DFDE;">    deduplicated: boolean;</span></span>
<span class="line"><span style="color:#E6DFDE;">    output?: unknown;</span></span>
<span class="line"><span style="color:#E6DFDE;">    error?: { code: string; message: string };</span></span>
<span class="line"><span style="color:#E6DFDE;">    waiting?: { toolName: string; input: unknown; expiresAt: string };</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div><p><code>AgentSummary</code> and <code>ScheduleSummary</code> are the items of <code>GET /agents</code> and <code>GET /schedules</code>:</p><div class="language-ts"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki chamberu vp-code" tabindex="0"><code><span class="line"><span style="color:#958A8B;">/** An agent as \`GET /agents\` lists it. */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> AgentSummary = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    name: string;</span></span>
<span class="line"><span style="color:#958A8B;">    /** \`hook\` is the ready-made path of a \`webhook()\` trigger. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    triggers: Array&lt;{</span></span>
<span class="line"><span style="color:#E6DFDE;">        source: TriggerSource;</span></span>
<span class="line"><span style="color:#E6DFDE;">        id: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">        hook?: string</span></span>
<span class="line"><span style="color:#E6DFDE;">    }&gt;;</span></span>
<span class="line"><span style="color:#E6DFDE;">    budget: Budget;</span></span>
<span class="line"><span style="color:#958A8B;">    /** Tool names that need an approval. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    approvals: string[];</span></span>
<span class="line"><span style="color:#958A8B;">    /** Declared state collections. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    state: string[];</span></span>
<span class="line"><span style="color:#E6DFDE;">    notify?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span>
<span class="line"></span>
<span class="line"><span style="color:#958A8B;">/** A \`cron()\` trigger as \`GET /schedules\` lists it (definitions only, not scheduler health). */</span></span>
<span class="line"><span style="color:#FF7B84;">export</span><span style="color:#FF7B84;"> type</span><span style="color:#E6DFDE;"> ScheduleSummary = {</span></span>
<span class="line"><span style="color:#E6DFDE;">    agent: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    trigger: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    expression: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    timezone?: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">    overlap: OverlapPolicy;</span></span>
<span class="line"><span style="color:#958A8B;">    /** ISO time of the next fire after now. */</span></span>
<span class="line"><span style="color:#E6DFDE;">    nextAt: string;</span></span>
<span class="line"><span style="color:#E6DFDE;">};</span></span></code></pre></div>`,24)])])}const d=n(l,[["render",o]]);export{D as __pageData,d as default};
