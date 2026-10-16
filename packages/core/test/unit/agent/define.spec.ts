import type { LanguageModel } from 'ai';
import { describe, expect, it } from 'vitest';
import { 
    InvalidAgentDefinitionError, 
    cron, 
    defineAgent, 
    manual, 
} from '@chamberu/core';

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
});
