import { describe, expect, it } from 'vitest';
import * as core from '@chamberu/core';
import * as testing from '@chamberu/core/testing';

describe('public api', () => {
    it.each([
        'defineAgent',
        'cron',
        'http',
        'manual',
        'RunEngine',
        'MemoryStore',
        'defineEffectTool',
        'effectMarker',
        'createResumeToken',
        'verifyResumeToken',
        'ChamberuError',
        'InvalidResumeTokenError',
        'BudgetExceededError',
    ])('exports %s', (name) => {
        expect(core).toHaveProperty(name);
        expect(core[name as keyof typeof core]).toBeTypeOf('function');
    });

    it('exports describeStoreContract from @chamberu/core/testing', () => {
        expect(testing.describeStoreContract).toBeTypeOf('function');
    });
});
