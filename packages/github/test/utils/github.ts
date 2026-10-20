/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createVerify, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import type { ControllableClock } from '@chamberu/test-kit';

export type FakeRequest = {
    method: string;
    path: string;
    query: Record<string, string>;
    body: unknown;
    authorization: string | null;
};

export type JwtClaims = {
    iat: number; 
    exp: number; 
    iss: string 
};

export type FakeRouteInput = {
    params: Record<string, string>;
    query: Record<string, string>;
    body: unknown;
    /** The installation the token belongs to. */
    installationId: number;
};

export type FakeRouteResult = {
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
};

export type FakeRouteHandler = (input: FakeRouteInput) => FakeRouteResult | Promise<FakeRouteResult>;

type Route = {
    method: string;
    pattern: RegExp;
    names: string[];
    handler: FakeRouteHandler;
};

type IssuedToken = { installationId: number; expiresAt: number };

export type FakeGithub = {
    fetch: typeof globalThis.fetch;
    /** PKCS#1 PEM of the App's private key. */
    privateKey: string;
    publicKey: KeyObject;
    requests: FakeRequest[];
    /** Claims of every JWT the fake accepted, in order. */
    jwtClaims: JwtClaims[];
    readonly tokensIssued: number;
    /** Installation id of every issued token, in order. */
    tokenInstallations: number[];
    issues: Map<string, Record<string, unknown>>;
    comments: Map<string, Array<Record<string, unknown>>>;
    labels: Map<string, Array<Record<string, unknown>>>;
    releases: Map<string, Array<Record<string, unknown>>>;
    files: Map<string, Record<string, unknown>>;
    pulls: Map<string, Record<string, unknown>>;
    /** Adds a route (it wins over the built-in ones) for an installation token, e.g. `route('GET', '/repos/:owner/:repo/issues/:number', ...)`. */
    route(method: string, path: string, handler: FakeRouteHandler): void;
    /** The next request matching method and path answers `status` (once). */
    failNext(method: string, path: string, status: number): void;
};

function json(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
    if (body === undefined || status === 204) return new Response(null, { status, headers });
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    });
}

function compile(path: string): { pattern: RegExp; names: string[] } {
    const names: string[] = [];
    // ':name' is one segment, '*name' the rest of the path
    const source = path.replace(/([:*])([a-z_]+)/gi, (_match, kind: string, name: string) => {
        names.push(name);
        return kind === '*' ? '(.+)' : '([^/]+)';
    });
    return { pattern: new RegExp(`^${source}$`), names };
}

function base64UrlJson(part: string): unknown {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/**
 * An in-process GitHub: verifies App JWTs (RS256 under the fake's public key,
 * `iss`, at most 600 s) on `/app*` and installation tokens on every other
 * route, issues tokens valid for one hour on the fake's clock, answers 404
 * for unknown routes. Never touches the network.
 */
export function createFakeGithub(input: {
    appId: string; 
    slug?: string; 
    clock: ControllableClock 
}): FakeGithub {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    const tokens = new Map<string, IssuedToken>();
    const routes: Route[] = [];
    const failures: Array<{
        method: string; 
        path: string; 
        status: number 
    }> = [];
    let issued = 0;

    const fake: FakeGithub = {
        fetch: undefined as unknown as typeof globalThis.fetch,
        privateKey: pem,
        publicKey,
        requests: [],
        jwtClaims: [],
        get tokensIssued() {
            return issued;
        },
        tokenInstallations: [],
        issues: new Map(),
        comments: new Map(),
        labels: new Map(),
        releases: new Map(),
        files: new Map(),
        pulls: new Map(),
        route(method, path, handler) {
            routes.unshift({
                method, 
                ...compile(path), 
                handler, 
            });
        },
        failNext(method, path, status) {
            failures.push({
                method, 
                path, 
                status, 
            });
        },
    };

    function verifyJwt(authorization: string | null): boolean {
        const match = /^bearer (.+)$/i.exec(authorization ?? '');
        if (!match?.[1]) return false;
        const [header, payload, signature] = match[1].split('.');
        if (!header || !payload || !signature) return false;
        const verifier = createVerify('RSA-SHA256');
        verifier.update(`${header}.${payload}`);
        if (!verifier.verify(publicKey, Buffer.from(signature, 'base64url'))) return false;
        const head = base64UrlJson(header) as { alg?: string };
        const claims = base64UrlJson(payload) as JwtClaims;
        const now = Math.floor(input.clock.now().getTime() / 1000);
        if (head.alg !== 'RS256' || String(claims.iss) !== input.appId) return false;
        if (claims.exp - claims.iat > 600 || claims.exp <= now || claims.iat > now) return false;
        fake.jwtClaims.push(claims);
        return true;
    }

    function installationOf(authorization: string | null): number | undefined {
        const match = /^token (ghs_\d+)$/.exec(authorization ?? '');
        if (!match?.[1]) return undefined;
        const token = tokens.get(match[1]);
        if (!token || token.expiresAt <= input.clock.now().getTime()) return undefined;
        return token.installationId;
    }

    fake.fetch = async (resource, init) => {
        const request = new Request(resource as RequestInfo, init);
        const url = new URL(request.url);
        const { method } = request;
        const path = url.pathname;
        const text = await request.text();
        const body: unknown = text ? JSON.parse(text) : undefined;
        const authorization = request.headers.get('authorization');
        fake.requests.push({
            method,
            path,
            query: Object.fromEntries(url.searchParams),
            body,
            authorization,
        });

        const failure = failures.findIndex((f) => f.method === method && f.path === path);
        if (failure !== -1) {
            const { status } = failures.splice(failure, 1)[0]!;
            return json(status, { message: 'Injected failure' });
        }

        if (path === '/app' || path.startsWith('/app/')) {
            if (!verifyJwt(authorization)) return json(401, { message: 'Bad credentials' });
            if (method === 'GET' && path === '/app') {
                return json(200, { id: Number(input.appId), slug: input.slug ?? 'chamberu-test' });
            }
            const exchange = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(path);
            if (method === 'POST' && exchange?.[1]) {
                issued++;
                const token = `ghs_${issued}`;
                const installationId = Number(exchange[1]);
                const expiresAt = input.clock.now().getTime() + 3_600_000;
                tokens.set(token, { installationId, expiresAt });
                fake.tokenInstallations.push(installationId);
                return json(201, { token, expires_at: new Date(expiresAt).toISOString() });
            }
            return json(404, { message: 'Not Found' });
        }

        const installationId = installationOf(authorization);
        if (installationId === undefined) return json(401, { message: 'Bad credentials' });

        for (const route of routes) {
            if (route.method !== method) continue;
            const match = route.pattern.exec(path);
            if (!match) continue;
            const params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(match[i + 1] ?? '')]));
            const result = await route.handler({
                params,
                query: Object.fromEntries(url.searchParams),
                body,
                installationId,
            });
            return json(result.status, result.body, result.headers);
        }
        return json(404, { message: 'Not Found' });
    };

    fake.route('GET', '/rate_limit', () => ({ status: 200, body: { resources: {} } }));
    addRepoRoutes(fake, `${input.slug ?? 'chamberu-test'}[bot]`, input.clock);
    return fake;
}

const NOT_FOUND: FakeRouteResult = { status: 404, body: { message: 'Not Found' } };

/** One page of `items` (`per_page`, `page`), with a `link` header to the next page. */
function page(path: string, query: Record<string, string>, items: unknown[]): FakeRouteResult {
    const perPage = Number(query.per_page ?? 30);
    const current = Number(query.page ?? 1);
    const body = items.slice((current - 1) * perPage, current * perPage);
    if (current * perPage >= items.length) return { status: 200, body };
    const next = new URLSearchParams({ ...query, page: String(current + 1) });
    return {
        status: 200,
        body,
        headers: { link: `<https://api.github.com${path}?${next}>; rel="next"` },
    };
}

/** Issues, comments, labels, pulls, contents and releases backed by the fake's maps. */
function addRepoRoutes(fake: FakeGithub, botLogin: string, clock: ControllableClock): void {
    let nextCommentId = 9000;
    const issueKey = (p: Record<string, string>) => `${p.owner}/${p.repo}#${p.number}`;

    fake.route('GET', '/repos/:owner/:repo/issues/:number', ({ params }) => {
        const issue = fake.issues.get(issueKey(params));
        return issue ? { status: 200, body: issue } : NOT_FOUND;
    });
    fake.route('PATCH', '/repos/:owner/:repo/issues/:number', ({ params, body }) => {
        const issue = fake.issues.get(issueKey(params));
        if (!issue) return NOT_FOUND;
        Object.assign(issue, body as Record<string, unknown>);
        return { status: 200, body: issue };
    });
    fake.route('GET', '/repos/:owner/:repo/issues/:number/comments', ({ params, query }) => {
        const since = query.since ? Date.parse(query.since) : 0;
        const comments = (fake.comments.get(issueKey(params)) ?? [])
            .filter((c) => Date.parse(String(c.updated_at)) >= since);
        return page(`/repos/${params.owner}/${params.repo}/issues/${params.number}/comments`, query, comments);
    });
    fake.route('POST', '/repos/:owner/:repo/issues/:number/comments', ({ params, body }) => {
        const key = issueKey(params);
        if (!fake.issues.has(key)) return NOT_FOUND;
        const id = nextCommentId++;
        const now = clock.now().toISOString();
        const comment = {
            id,
            body: (body as { body: string }).body,
            html_url: `https://github.com/${params.owner}/${params.repo}/issues/${params.number}#issuecomment-${id}`,
            user: { login: botLogin, type: 'Bot' },
            created_at: now,
            updated_at: now,
        };
        fake.comments.set(key, [...(fake.comments.get(key) ?? []), comment]);
        return { status: 201, body: comment };
    });
    fake.route('POST', '/repos/:owner/:repo/issues/:number/labels', ({ params, body }) => {
        const issue = fake.issues.get(issueKey(params));
        if (!issue) return NOT_FOUND;
        const current = (issue.labels as Array<{ name: string }> | undefined) ?? [];
        const names = new Set([...current.map((l) => l.name), ...(body as { labels: string[] }).labels]);
        issue.labels = [...names].map((name) => ({ name }));
        return { status: 200, body: issue.labels };
    });
    fake.route('GET', '/repos/:owner/:repo/labels', ({ params, query }) => page(
        `/repos/${params.owner}/${params.repo}/labels`,
        query,
        fake.labels.get(`${params.owner}/${params.repo}`) ?? [],
    ));
    fake.route('GET', '/search/issues', ({ query }) => {
        const items = fake.issues.values().toArray().filter((i) => String(i.title).includes(query.q ?? ''));
        const perPage = Number(query.per_page ?? 30);
        return { status: 200, body: { total_count: items.length, items: items.slice(0, perPage) } };
    });
    fake.route('GET', '/repos/:owner/:repo/pulls/:number', ({ params }) => {
        const pull = fake.pulls.get(issueKey(params));
        return pull ? { status: 200, body: pull } : NOT_FOUND;
    });
    fake.route('GET', '/repos/:owner/:repo/contents/*path', ({ params }) => {
        const prefix = `${params.owner}/${params.repo}:`;
        const file = fake.files.get(`${prefix}${params.path}`);
        if (file) return { status: 200, body: file };
        const below = `${prefix}${params.path}/`;
        const entries = fake.files.entries().toArray()
            .filter(([key]) => key.startsWith(below) && !key.slice(below.length).includes('/'))
            .map(([, value]) => ({
                name: value.name, 
                path: value.path, 
                type: value.type, 
            }));
        return entries.length > 0 ? { status: 200, body: entries } : NOT_FOUND;
    });
    fake.route('GET', '/repos/:owner/:repo/releases/latest', ({ params }) => {
        const release = fake.releases.get(`${params.owner}/${params.repo}`)?.at(-1);
        return release ? { status: 200, body: release } : NOT_FOUND;
    });
}
