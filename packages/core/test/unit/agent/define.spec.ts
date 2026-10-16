import type { LanguageModel } from 'ai';
import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import { 
    InvalidAgentDefinitionError, 
    cron, 
    defineAgent, 
    manual, 
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
            triggers: [cron('*/5 * * * *'), manual()],
        })).not.toThrow();
    });

    it('accepts a trigger typed by its payload', () => {
        const webhook: TriggerDefinition<{ repo: string }> = {
            source: 'github',
            id: 'github:issues',
            options: {},
            concurrencyKey: (payload) => payload.repo,
            idempotencyKey: (payload) => `${payload.repo}:1`,
        };
        expectTypeOf(webhook).toExtend<TriggerDefinition>();
        const agent = defineAgent({
            ...base,
            name: 'a',
            triggers: [webhook],
        });
        expectTypeOf(agent.definition.triggers).toEqualTypeOf<AgentDefinition['triggers']>();
        expect(agent.definition.triggers?.[0]?.concurrencyKey?.({ repo: 'o/r' })).toBe('o/r');
    });
});
