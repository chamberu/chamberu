/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent, Run, TriggerDefinition } from '@chamberu/core';
import { BadRequestError, NotFoundError } from '@ebec/http';
import { Container } from 'validup';
import { agentPermission, hasPermission } from '../auth/module.ts';
import { Permission } from '../auth/constants.ts';
import type { Principal } from '../auth/types.ts';
import type { HttpContext } from '../app/types.ts';
import { isDefined, isString } from '../request/validators.ts';
import { KEY_MAX_LENGTH } from './constants.ts';
import type { RunView, StartRunBody } from './types.ts';

/** Drops the internal `claim` (owner and lease expiry) from a run. */
export function serializeRun(run: Run): RunView {
    const view: RunView & { claim?: unknown } = { ...run };
    delete view.claim;
    return view;
}

/** `run:read`, or `agent:<run.agent>:run`. */
export function canReadRun(principal: Principal, run: Run): boolean {
    return hasPermission(principal, Permission.RUN_READ) ||
        hasPermission(principal, agentPermission(run.agent, 'run'));
}

/** The agent by name, else 404. */
export function requireAgent(ctx: HttpContext, name: string): Agent {
    const agent = ctx.agents.get(name);
    if (!agent) throw new NotFoundError({ message: `Agent "${name}" was not found.` });
    return agent;
}

/** The agent's `http()` trigger, else 404. */
export function requireHttpTrigger(agent: Agent): TriggerDefinition {
    const trigger = agent.definition.triggers?.find((t) => t.source === 'http');
    if (!trigger) throw new NotFoundError({ message: `Agent "${agent.name}" declares no http() trigger.` });
    return trigger;
}

/** An `Idempotency-Key` header: 1 to 256 characters, else 400. */
export function readIdempotencyHeader(request: Request): string | undefined {
    const value = request.headers.get('idempotency-key');
    if (value === null) return undefined;
    if (value.length < 1 || value.length > KEY_MAX_LENGTH) {
        throw new BadRequestError({ message: `The Idempotency-Key header must have 1 to ${KEY_MAX_LENGTH} characters.` });
    }
    return value;
}

export function createStartRunContainer(): Container<StartRunBody> {
    const container = new Container<StartRunBody>();
    container.mount('payload', { optional: true }, isDefined());
    container.mount('idempotencyKey', { optional: true }, isString({ min: 1, max: KEY_MAX_LENGTH }));
    container.mount('thread', { optional: true }, isString({ min: 1, max: KEY_MAX_LENGTH }));
    return container;
}
