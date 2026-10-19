/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    InvalidAgentDefinitionError,
    cron,
    http,
    webhook,
} from '@chamberu/core';
import type { TriggerEnvelope } from '@chamberu/core';

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

describe('http', () => {
    it('is the control-plane trigger with id http', () => {
        const t = http();
        expect(t.source).toBe('http');
        expect(t.id).toBe('http');
        expect(t.options.schema).toBeUndefined();
    });

    it('keeps the schema', () => {
        const schema = z.object({ n: z.number() });
        expect(http({ schema }).options.schema).toBe(schema);
    });
});

describe('webhook', () => {
    it('builds the id from the path and keeps the keys', () => {
        const def = webhook({
            path: '/issues',
            idempotencyKey: (p) => (p as { id: string }).id,
            concurrencyKey: () => 'k',
        });
        expect(def.source).toBe('webhook');
        expect(def.id).toBe('webhook:/issues');
        expect(def.options.path).toBe('/issues');
        expect(def.idempotencyKey?.({ id: '7' })).toBe('7');
        expect(def.concurrencyKey?.({})).toBe('k');
    });

    it('omits keys that were not given', () => {
        const def = webhook({ path: '/raw' });
        expect('idempotencyKey' in def).toBe(false);
        expect('concurrencyKey' in def).toBe(false);
    });

    it('rejects a path that does not start with a slash', () => {
        expect(() => webhook({ path: '' })).toThrow(InvalidAgentDefinitionError);
        expect(() => webhook({ path: 'issues' })).toThrow(InvalidAgentDefinitionError);
    });
});

describe('TriggerEnvelope source', () => {
    it('accepts webhook and rejects manual', () => {
        const base = {
            id: 'e1',
            agent: 'a',
            trigger: 'webhook:/issues',
            payload: {},
            receivedAt: new Date(0),
        };
        const ok: TriggerEnvelope = { ...base, source: 'webhook' };
        // @ts-expect-error manual() is gone
        const gone: TriggerEnvelope = { ...base, source: 'manual' };
        expect(ok.source).toBe('webhook');
        expect(gone.source).toBe('manual');
    });
});
