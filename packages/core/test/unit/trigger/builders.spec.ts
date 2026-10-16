import { describe, expect, it } from 'vitest';
import { 
    InvalidAgentDefinitionError, 
    cron, 
    http, 
    manual, 
} from '@chamberu/core';

describe('cron', () => {
    it('rejects invalid expression', () => {
        expect(() => cron('not a cron')).toThrow(InvalidAgentDefinitionError);
    });

    it('defaults overlap to skip', () => {
        expect(cron('*/5 * * * *').options.overlap).toBe('skip');
    });

    it('trigger id is stable', () => {
        const t = cron('*/5 * * * *');
        expect(t.id).toBe('cron:*/5 * * * *');
        expect(t.source).toBe('cron');
        expect(t.options.expression).toBe('*/5 * * * *');
    });

    it('keeps timezone, overlap and payload', () => {
        const t = cron('0 * * * *', {
            timezone: 'Europe/Berlin', 
            overlap: 'allow', 
            payload: { a: 1 }, 
        });
        expect(t.options).toMatchObject({
            timezone: 'Europe/Berlin', 
            overlap: 'allow', 
            payload: { a: 1 }, 
        });
    });
});

describe('http / manual', () => {
    it('http defaults', () => {
        const t = http();
        expect(t.source).toBe('http');
        expect(t.id).toBe('http:/');
    });

    it('http custom path', () => {
        expect(http({ path: '/hook' }).id).toBe('http:/hook');
    });

    it('manual', () => {
        const t = manual();
        expect(t.source).toBe('manual');
        expect(t.id).toBe('manual');
    });
});
