/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineAgent, http } from '@chamberu/core';
import {
    ADMIN_TOKEN,
    call,
    createRunAgents,
    createRunTestApp,
    tokenFor,
} from '../../utils/app.ts';
import { textModel } from '../../utils/model.ts';
import { callTool, connectMcp, textOf } from '../../utils/mcp.ts';

type TreeNode = { name: string; children: TreeNode[] };

const TreeNodeSchema: z.ZodType<TreeNode> = z.object({
    name: z.string(),
    get children() { return z.array(TreeNodeSchema); },
});

function recursiveAgent() {
    return defineAgent({
        name: 'tree',
        model: textModel(),
        instructions: 'Tree runs.',
        triggers: [http({ schema: z.object({ root: TreeNodeSchema, alias: TreeNodeSchema }) })],
    });
}

/** Every local `$ref` in `schema`, resolved as a JSON pointer from `root`. */
function resolveRefs(root: unknown, node: unknown = root): unknown[] {
    if (Array.isArray(node)) return node.flatMap((item) => resolveRefs(root, item));
    if (typeof node !== 'object' || node === null) return [];
    const resolved: unknown[] = [];
    for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') {
            expect(value.startsWith('#')).toBe(true);
            const target = value.slice(1).split('/').filter(Boolean)
                .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
                .reduce<unknown>((current, segment) => (current as Record<string, unknown> | undefined)?.[segment], root);
            resolved.push(target);
        } else {
            resolved.push(...resolveRefs(root, value));
        }
    }
    return resolved;
}

function typedAgent() {
    return defineAgent({
        name: 'typed',
        model: textModel(),
        instructions: 'Typed runs.\nSecond line.',
        triggers: [http({ schema: z.object({ n: z.number() }) })],
    });
}

describe('mcp run_<agent>', () => {
    it('lists one tool per agent with an http() trigger', async () => {
        const { app } = createRunTestApp();
        const client = await connectMcp(app, ADMIN_TOKEN);
        const names = (await client.listTools()).tools.map((t) => t.name);
        expect(names).toEqual(expect.arrayContaining(['run_echo', 'run_gate']));
        expect(names).not.toContain('run_sweep');
        expect(names).not.toContain('run_hooked');
        await client.close();
    });

    it('lists only the agents the principal may run', async () => {
        const { app } = createRunTestApp();
        const client = await connectMcp(app, tokenFor('agent:echo:run'));
        const names = (await client.listTools()).tools.map((t) => t.name);
        expect(names).toContain('run_echo');
        expect(names).not.toContain('run_gate');
        await client.close();
    });

    it('describes its input, including the payload schema', async () => {
        const { app } = createRunTestApp({ agents: [...createRunAgents(), typedAgent()] });
        const client = await connectMcp(app, ADMIN_TOKEN);
        const { tools } = await client.listTools();
        const echo = tools.find((t) => t.name === 'run_echo')!;
        expect(echo.inputSchema.properties).toHaveProperty('waitSeconds');

        const typed = tools.find((t) => t.name === 'run_typed')!;
        expect(typed.description).toContain('Typed runs.');
        expect(typed.description).not.toContain('Second line.');
        expect(typed.inputSchema.properties?.payload).toMatchObject({
            type: 'object',
            properties: { n: { type: 'number' } },
        });
        await client.close();
    });

    it('dispatches through the http() trigger with source mcp', async () => {
        const { app, store } = createRunTestApp();
        const client = await connectMcp(app, ADMIN_TOKEN);
        const result = await callTool(client, 'run_echo', { payload: { n: 1 } });
        expect(result.isError).toBeFalsy();
        const content = result.structuredContent as { runId: string };
        expect(content).toEqual({
            runId: expect.any(String),
            status: 'queued',
            deduplicated: false,
        });
        expect((await store.getRun(content.runId))?.trigger).toMatchObject({
            agent: 'echo',
            trigger: 'http',
            source: 'mcp',
            payload: { n: 1 },
        });
        await client.close();
    });

    it('dedupes an idempotencyKey within mcp, not across transports', async () => {
        const { app, store } = createRunTestApp();
        const client = await connectMcp(app, ADMIN_TOKEN);
        const first = await callTool(client, 'run_echo', { idempotencyKey: 'k-1' });
        const second = await callTool(client, 'run_echo', { idempotencyKey: 'k-1' });
        expect(second.structuredContent).toMatchObject({
            runId: (first.structuredContent as { runId: string }).runId,
            status: 'queued',
            deduplicated: true,
        });

        await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body: { idempotencyKey: 'k-1' } });
        expect((await store.listRuns({ agent: 'echo' })).total).toBe(2);
        await client.close();
    });

    it('rejects an invalid payload without dispatching', async () => {
        const { app, store } = createRunTestApp({ agents: [...createRunAgents(), typedAgent()] });
        const client = await connectMcp(app, ADMIN_TOKEN);
        const result = await callTool(client, 'run_typed', { payload: { n: 'x' } });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain('payload');
        expect((await store.listRuns({ agent: 'typed' })).total).toBe(0);
        await client.close();
    });

    it('rejects unknown arguments', async () => {
        const { app, store } = createRunTestApp();
        const client = await connectMcp(app, ADMIN_TOKEN);
        const result = await callTool(client, 'run_echo', { extra: 1 });
        expect(result.isError).toBe(true);
        expect((await store.listRuns({})).total).toBe(0);
        await client.close();
    });

    it('advertises a recursive payload schema whose refs resolve from the tool schema', async () => {
        const { app, store } = createRunTestApp({ agents: [...createRunAgents(), recursiveAgent()] });
        const client = await connectMcp(app, ADMIN_TOKEN);
        const { tools } = await client.listTools();
        const tree = tools.find((t) => t.name === 'run_tree')!;
        const targets = resolveRefs(tree.inputSchema);
        expect(targets.length).toBeGreaterThan(0);
        for (const target of targets) expect(target).toMatchObject({ type: 'object' });

        const payload = {
            root: { name: 'a', children: [{ name: 'b', children: [] }] },
            alias: { name: 'c', children: [] },
        };
        const result = await callTool(client, 'run_tree', { payload });
        expect(result.isError, textOf(result)).toBeFalsy();
        const { runId } = result.structuredContent as { runId: string };
        expect((await store.getRun(runId))?.trigger.payload).toEqual(payload);

        const invalid = await callTool(client, 'run_tree', { payload: { root: { name: 'a', children: [{ name: 1 }] }, alias: payload.alias } });
        expect(invalid.isError).toBe(true);
        await client.close();
    });
});
