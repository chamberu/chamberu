/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { hasPermission as grantsPermission } from '@chamberu/core';
import type { AgentAction, Principal } from './types.ts';

/** `agent:<agent>:<action>`. */
export function agentPermission(agent: string, action: AgentAction): string {
    return `agent:${agent}:${action}`;
}

/**
 * True when any granted entry is `*`, or has as many `:` segments as
 * `permission` with every segment equal or `*` (a `*` segment matches
 * exactly one segment; case-sensitive).
 */
export function hasPermission(principal: Principal, permission: string): boolean {
    return grantsPermission(principal.permissions, permission);
}
