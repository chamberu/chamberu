/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ACTIVITY_WINDOW_MS } from '../../../../app/agents/constants.ts';
import {
    failedSummary,
    formatBudgetTime,
    hasHttpTrigger,
    lastRunOf,
    matchesName,
    nextFireOf,
    oldestWaiting,
    parsePayload,
    summarizeActivity,
    tokenShares,
    triggerChips,
} from '../../../../app/agents/helpers.ts';
import type { AgentWire, ScheduleWire } from '../../../../app/api/types.ts';
import { wireRun } from '../../../utils/runs.ts';

const NOW = Date.parse('2026-10-21T12:00:00.000Z');
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

const agent = (overrides: Partial<AgentWire> = {}): AgentWire => ({
    name: 'triage',
    triggers: [],
    budget: { maxSteps: 20 },
    approvals: [],
    state: [],
    ...overrides,
});

const schedule = (overrides: Partial<ScheduleWire> = {}): ScheduleWire => ({
    agent: 'triage',
    trigger: 'cron:0 */2 * * *',
    expression: '0 */2 * * *',
    overlap: 'skip',
    nextAt: '2026-10-21T14:00:00.000Z',
    ...overrides,
});

describe('triggerChips', () => {
    it('labels each trigger by source with its detail', () => {
        const chips = triggerChips(agent({
            triggers: [
                { source: 'github', id: 'github:issues.opened,issue_comment.created' },
                { source: 'cron', id: 'nightly' },
                {
                    source: 'webhook', 
                    id: 'webhook:/refresh', 
                    hook: '/hooks/triage/refresh', 
                },
                { source: 'http', id: 'http' },
            ],
        }), [schedule({ trigger: 'nightly', expression: '0 2 * * *' })]);
        expect(chips).toEqual([
            {
                source: 'github', 
                id: 'github:issues.opened,issue_comment.created', 
                detail: 'issues.opened,issue_comment.created', 
            },
            {
                source: 'cron', 
                id: 'nightly', 
                detail: '0 2 * * *', 
            },
            {
                source: 'webhook', 
                id: 'webhook:/refresh', 
                detail: '/refresh', 
                hook: '/hooks/triage/refresh', 
            },
            { source: 'http', id: 'http' },
        ]);
    });

    it('falls back to the id for a cron trigger without a schedule', () => {
        expect(triggerChips(agent({ triggers: [{ source: 'cron', id: 'cron:0 8 * * *' }] }), [])[0]!.detail).toBe('0 8 * * *');
    });
});

describe('summarizeActivity', () => {
    it('counts the runs of the last 24 h and places a mark per run', () => {
        const runs = [
            wireRun({
                id: 'a', 
                status: 'running', 
                createdAt: ago(0), 
            }),
            wireRun({
                id: 'b',
                status: 'failed',
                createdAt: ago(12),
                error: { code: 'BudgetExceeded', message: 'x' },
                usage: { inputTokens: 1000, outputTokens: 200 },
            }),
            wireRun({
                id: 'c', 
                status: 'completed', 
                createdAt: ago(30), 
            }),
        ];
        const activity = summarizeActivity(runs, NOW, 100);
        expect(activity.count).toBe(2);
        expect(activity.saturated).toBe(false);
        expect(activity.failed).toBe(1);
        expect(activity.lastFailed?.id).toBe('b');
        expect(activity.tokens).toBe(1200);
        expect(failedSummary(activity)).toBe('b · BudgetExceeded');
        expect(failedSummary(summarizeActivity([], NOW, 100))).toBe('no failures');
        expect(activity.marks.map((m) => [m.id, m.status])).toEqual([['a', 'running'], ['b', 'failed']]);
        expect(activity.marks[1]!.left).toBeCloseTo(50, 5);
        expect(activity.marks[0]!.left).toBeLessThanOrEqual(99.4);
    });

    it('is saturated when the limit was reached inside the window', () => {
        const runs = [wireRun({ id: 'a', createdAt: ago(1) }), wireRun({ id: 'b', createdAt: ago(2) })];
        expect(summarizeActivity(runs, NOW, 2).saturated).toBe(true);
        expect(summarizeActivity(runs, NOW, 3).saturated).toBe(false);
        // the oldest run read is outside the window: the window is complete
        expect(summarizeActivity([...runs, wireRun({ id: 'c', createdAt: ago(25) })], NOW, 3).saturated).toBe(false);
    });

    it('uses a 24 h window', () => {
        expect(ACTIVITY_WINDOW_MS).toBe(24 * 3_600_000);
        expect(summarizeActivity([], NOW, 100)).toMatchObject({
            count: 0, 
            marks: [], 
            tokens: 0, 
            failed: 0, 
        });
    });
});

describe('tokenShares', () => {
    it('splits the tokens by agent, largest first', () => {
        const runs = [
            wireRun({ agent: 'triage', usage: { inputTokens: 700, outputTokens: 0 } }),
            wireRun({ agent: 'digest', usage: { inputTokens: 300, outputTokens: 0 } }),
        ];
        expect(tokenShares(runs)).toBe('triage 70% · digest 30%');
        expect(tokenShares([])).toBe('');
    });
});

describe('agent helpers', () => {
    it('hasHttpTrigger', () => {
        expect(hasHttpTrigger(agent({ triggers: [{ source: 'http', id: 'http' }] }))).toBe(true);
        expect(hasHttpTrigger(agent({ triggers: [{ source: 'cron', id: 'c' }] }))).toBe(false);
    });

    it('matchesName ignores case and blanks', () => {
        expect(matchesName(agent({ name: 'release-notes' }), ' Notes ')).toBe(true);
        expect(matchesName(agent({ name: 'triage' }), 'x')).toBe(false);
        expect(matchesName(agent(), '')).toBe(true);
    });

    it('nextFireOf picks the agent\'s earliest schedule', () => {
        const list = [
            schedule({ trigger: 'a', nextAt: '2026-10-22T08:00:00.000Z' }),
            schedule({ trigger: 'b', nextAt: '2026-10-21T14:00:00.000Z' }),
            schedule({
                agent: 'digest', 
                trigger: 'c', 
                nextAt: '2026-10-21T13:00:00.000Z', 
            }),
        ];
        expect(nextFireOf('triage', list)?.trigger).toBe('b');
        expect(nextFireOf('none', list)).toBeUndefined();
    });

    it('lastRunOf finds the newest run of a trigger', () => {
        const runs = [
            wireRun({ id: 'new', trigger: { ...wireRun().trigger, trigger: 'http' } }),
            wireRun({ id: 'cron', trigger: { ...wireRun().trigger, trigger: 'nightly' } }),
        ];
        expect(lastRunOf(runs, 'nightly')?.id).toBe('cron');
        expect(lastRunOf(runs, 'other')).toBeNull();
    });

    it('oldestWaiting is the earliest updatedAt', () => {
        const runs = [wireRun({ id: 'a', updatedAt: ago(1) }), wireRun({ id: 'b', updatedAt: ago(5) })];
        expect(oldestWaiting(runs)?.id).toBe('b');
        expect(oldestWaiting([])).toBeUndefined();
    });

    it('formatBudgetTime reads a timeout', () => {
        expect(formatBudgetTime(900_000)).toBe('15 min');
        expect(formatBudgetTime(45_000)).toBe('45 s');
        expect(formatBudgetTime(7_200_000)).toBe('2 h');
        expect(formatBudgetTime(5_400_000)).toBe('90 min');
        expect(formatBudgetTime(undefined)).toBe('none');
    });

    it('parsePayload reads JSON and explains a mistake', () => {
        expect(parsePayload('{ "a": 1 }')).toEqual({ ok: true, value: { a: 1 } });
        expect(parsePayload('  ')).toEqual({ ok: true, value: {} });
        const bad = parsePayload('{ a: 1 }');
        expect(bad.ok).toBe(false);
        expect(bad.ok ? '' : bad.message).toMatch(/not valid JSON/);
    });
});
