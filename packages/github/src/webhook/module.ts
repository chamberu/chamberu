/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DispatchEnvelope, TriggerDefinition } from '@chamberu/core';
import type { HttpRoute, HttpRouteResult } from '@chamberu/http';
import { UnauthorizedError } from '@ebec/http';
import { DEFAULT_WEBHOOK_PATH } from '../app/constants.ts';
import type { IGithubApp } from '../app/types.ts';
import { matchesGithubTrigger } from '../trigger/helpers.ts';
import type { GithubEvent } from '../trigger/types.ts';
import {
    assertDerivedKey,
    readHeaders,
    toGithubEvent,
} from './helpers.ts';
import type { GithubWebhookResult, GithubWebhookRouteOptions } from './types.ts';

/** The 500 body of a delivery some agent could not be dispatched for (shaped like the http app's errors). */
const DISPATCH_FAILED: HttpRouteResult = {
    status: 500,
    body: {
        status: 500,
        code: 'internal_error',
        message: 'Internal Server Error',
    },
};

/** True when the App itself sent the delivery (its comment, label, ...). */
async function isSelfSent(app: IGithubApp, event: GithubEvent): Promise<boolean> {
    const { sender } = event.payload;
    if (sender?.type !== 'Bot') return false;
    return sender.login === await app.botLogin();
}

/**
 * `POST <path>` for GitHub App deliveries: checks the signature over the
 * raw body, then dispatches one run per agent with a matching
 * `githubWebhook()` trigger (its first one), deduplicated by the delivery
 * id. Answers `202` (also for ping, unmatched and self-sent events); a
 * failing agent goes to `onError`, the others are still dispatched, and
 * the answer is then a 500.
 */
export function createWebhookRoute(app: IGithubApp, options: GithubWebhookRouteOptions = {}): HttpRoute {
    return {
        method: 'POST',
        path: options.path ?? DEFAULT_WEBHOOK_PATH,
        rateLimit: false,
        async handler({ request, readBody }, ctx): Promise<HttpRouteResult> {
            const signature = request.headers.get('x-hub-signature-256');
            if (signature === null) {
                throw new UnauthorizedError({ message: 'The X-Hub-Signature-256 header is missing.' });
            }
            const { name, delivery } = readHeaders(request);
            const body = await readBody();
            if (!app.verifySignature(body, signature)) {
                throw new UnauthorizedError({ message: 'The delivery signature does not match.' });
            }
            const event = toGithubEvent(body, name, delivery);

            const envelopes: DispatchEnvelope[] = [];
            for (const agent of ctx.agents) {
                const trigger = (agent.definition.triggers ?? [])
                    .find((t: TriggerDefinition) => matchesGithubTrigger(t, event));
                if (!trigger) continue;
                const idempotencyKey = trigger.idempotencyKey?.(event) ?? delivery;
                const concurrencyKey = trigger.concurrencyKey?.(event);
                assertDerivedKey('idempotency key', idempotencyKey);
                assertDerivedKey('concurrency key', concurrencyKey);
                envelopes.push({
                    agent: agent.name,
                    trigger: trigger.id,
                    source: 'github',
                    payload: event,
                    idempotencyKey,
                    ...(concurrencyKey !== undefined ? { concurrencyKey } : {}),
                });
            }

            const result: GithubWebhookResult = { delivery, runs: [] };
            if (envelopes.length === 0 || await isSelfSent(app, event)) {
                return { status: 202, body: result };
            }

            let failed = false;
            for (const envelope of envelopes) {
                try {
                    const { runId, deduplicated } = await ctx.engine.dispatch(envelope);
                    result.runs.push({
                        agent: envelope.agent,
                        runId,
                        deduplicated,
                    });
                } catch (error) {
                    failed = true;
                    ctx.onError(error);
                }
            }
            return failed ? DISPATCH_FAILED : { status: 202, body: result };
        },
    };
}
