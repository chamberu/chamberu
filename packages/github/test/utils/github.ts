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

export type FakeRouteResult = { status: number; body?: unknown };

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
    /** Adds a route for an installation token, e.g. `route('GET', '/repos/:owner/:repo/issues/:number', ...)`. */
    route(method: string, path: string, handler: FakeRouteHandler): void;
    /** The next request matching method and path answers `status` (once). */
    failNext(method: string, path: string, status: number): void;
};

function json(status: number, body?: unknown): Response {
    if (body === undefined || status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

function compile(path: string): { pattern: RegExp; names: string[] } {
    const names: string[] = [];
    const source = path.replace(/:([a-z_]+)/gi, (_match, name: string) => {
        names.push(name);
        return '([^/]+)';
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
        route(method, path, handler) {
            routes.push({
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
            return json(result.status, result.body);
        }
        return json(404, { message: 'Not Found' });
    };

    fake.route('GET', '/rate_limit', () => ({ status: 200, body: { resources: {} } }));
    return fake;
}
