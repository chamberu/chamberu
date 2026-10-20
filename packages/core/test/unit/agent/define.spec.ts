/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { tool } from 'ai';
import type { LanguageModel } from 'ai';
import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import { z } from 'zod';
import {
    InvalidAgentDefinitionError,
    cron,
    defineAgent,
    defineTool,
    http,
    webhook,
} from '@chamberu/core';
import type { AgentDefinition, TriggerDefinition } from '@chamberu/core';

const model = {} as LanguageModel;
const base = { model, instructions: 'do things' };

describe('defineAgent', () => {
    it('rejects invalid names', () => {
        for (const name of ['Triage', 'a--b', 'a'.repeat(65), '', '-a', 'a-']) {
            expect(() => defineAgent({ ...base, name })).toThrow(InvalidAgentDefinitionError);
        }
    });

    it('accepts valid names', () => {
        expect(defineAgent({ ...base, name: 'triage-2' }).name).toBe('triage-2');
        expect(() => defineAgent({ ...base, name: 'a'.repeat(64) })).not.toThrow();
    });

    it('applies budget defaults', () => {
        const agent = defineAgent({ ...base, name: 'a' });
        expect(agent.definition.budget.maxSteps).toBe(20);
        expect(agent.definition.budget.timeoutMs).toBe(900_000);
        expect(agent.definition.budget.maxTokens).toBeUndefined();
    });

    it('keeps budget overrides', () => {
        const agent = defineAgent({
            ...base, 
            name: 'a', 
            budget: { maxSteps: 3, maxTokens: 10 }, 
        });
        expect(agent.definition.budget).toEqual({
            maxSteps: 3, 
            maxTokens: 10, 
            timeoutMs: 900_000, 
        });
    });

    it('rejects duplicate trigger ids', () => {
        expect(() => defineAgent({
            ...base,
            name: 'a',
            triggers: [cron('*/5 * * * *'), cron('*/5 * * * *')],
        })).toThrow(InvalidAgentDefinitionError);
        expect(() => defineAgent({
            ...base,
            name: 'a',
            triggers: [cron('*/5 * * * *'), http()],
        })).not.toThrow();
    });

    it('allows at most one http() trigger and many webhook() triggers', () => {
        expect(() => defineAgent({
            ...base,
            name: 'a',
            triggers: [http(), http()],
        })).toThrow(InvalidAgentDefinitionError);
        expect(() => defineAgent({
            ...base,
            name: 'a',
            triggers: [http(), webhook({ path: '/a' }), webhook({ path: '/b' }), cron('*/5 * * * *')],
        })).not.toThrow();
    });

    it('accepts a trigger typed by its payload', () => {
        const githubTrigger: TriggerDefinition<{ repo: string }> = {
            source: 'github',
            id: 'github:issues',
            options: {},
            concurrencyKey: (payload) => payload.repo,
            idempotencyKey: (payload) => `${payload.repo}:1`,
        };
        expectTypeOf(githubTrigger).toExtend<TriggerDefinition>();
        const agent = defineAgent({
            ...base,
            name: 'a',
            triggers: [githubTrigger],
        });
        expectTypeOf(agent.definition.triggers).toEqualTypeOf<AgentDefinition['triggers']>();
        expect(agent.definition.triggers?.[0]?.concurrencyKey?.({ repo: 'o/r' })).toBe('o/r');
    });

    it('accepts a plain tool set', () => {
        const tools = { lookup: defineTool({ inputSchema: z.object({}), execute: async () => 'ok' }) };
        expect(defineAgent({
            ...base, 
            name: 'a', 
            tools, 
        }).definition.tools).toBe(tools);
    });

    it('keeps toolsContext by reference', () => {
        const entry = { token: 't' };
        const map = { third: entry };
        const third = tool({ inputSchema: z.object({}), execute: async () => 'ok' });
        const agent = defineAgent({
            ...base,
            name: 'a',
            tools: { third },
            toolsContext: map,
        });
        expect(agent.definition.toolsContext).toBe(map);
        expect(agent.definition.toolsContext?.third).toBe(entry);
    });

    it('checks toolsContext only for a plain set', () => {
        expect(() => defineAgent({
            ...base,
            name: 'a',
            tools: () => ({}),
            toolsContext: { missing: {} },
        })).not.toThrow();
    });
});
