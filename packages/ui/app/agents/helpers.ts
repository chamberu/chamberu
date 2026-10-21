/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AgentWire, RunWire, ScheduleWire } from '../api/types.ts';
import { ACTIVITY_WINDOW_MS } from './constants.ts';
import type {
    Activity,
    PayloadResult,
    TriggerChip,
} from './types.ts';

function withoutPrefix(id: string, prefix: string): string {
    return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/** One chip per trigger: the source and what it listens to (events, cron expression, hook path). */
export function triggerChips(agent: AgentWire, schedules: readonly ScheduleWire[]): TriggerChip[] {
    return agent.triggers.map((trigger): TriggerChip => {
        if (trigger.source === 'http') return { source: trigger.source, id: trigger.id };
        if (trigger.source === 'cron') {
            const schedule = schedules.find((s) => s.agent === agent.name && s.trigger === trigger.id);
            return {
                source: trigger.source, 
                id: trigger.id, 
                detail: schedule?.expression ?? withoutPrefix(trigger.id, 'cron:'), 
            };
        }
        const chip: TriggerChip = {
            source: trigger.source, 
            id: trigger.id, 
            detail: withoutPrefix(trigger.id, `${trigger.source}:`), 
        };
        if (trigger.hook) chip.hook = trigger.hook;
        return chip;
    });
}

const tokensOf = (run: RunWire) => run.usage.inputTokens + run.usage.outputTokens;

/**
 * The runs of the last 24 h among `runs` (newest first, at most `limit` read).
 * When the read hit the limit inside the window, `saturated` says the count is a floor.
 */
export function summarizeActivity(runs: readonly RunWire[], now: number, limit: number): Activity {
    const start = now - ACTIVITY_WINDOW_MS;
    const inside = runs.filter((run) => Date.parse(run.createdAt) >= start);
    const failed = inside.filter((run) => run.status === 'failed');
    const activity: Activity = {
        count: inside.length,
        saturated: runs.length >= limit && inside.length === runs.length,
        marks: inside.map((run) => ({
            id: run.id,
            status: run.status,
            left: Math.min(99.4, Math.max(0.6, (Date.parse(run.createdAt) - start) / ACTIVITY_WINDOW_MS * 100)),
        })),
        failed: failed.length,
        tokens: inside.reduce((sum, run) => sum + tokensOf(run), 0),
        runs: inside,
    };
    if (failed[0]) activity.lastFailed = failed[0];
    return activity;
}

/** "triage 71% · digest 29%": the two largest token shares by agent. */
export function tokenShares(runs: readonly RunWire[]): string {
    const total = runs.reduce((sum, run) => sum + tokensOf(run), 0);
    if (total === 0) return '';
    const byAgent = new Map<string, number>();
    for (const run of runs) byAgent.set(run.agent, (byAgent.get(run.agent) ?? 0) + tokensOf(run));
    return byAgent.entries().toArray()
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name, tokens]) => `${name} ${Math.round(tokens / total * 100)}%`)
        .join(' · ');
}

export function hasHttpTrigger(agent: AgentWire): boolean {
    return agent.triggers.some((trigger) => trigger.source === 'http');
}

export function matchesName(agent: AgentWire, query: string): boolean {
    const needle = query.trim().toLowerCase();
    return !needle || agent.name.toLowerCase().includes(needle);
}

export function nextFireOf(agent: string, schedules: readonly ScheduleWire[]): ScheduleWire | undefined {
    return schedules.filter((s) => s.agent === agent)
        .sort((a, b) => Date.parse(a.nextAt) - Date.parse(b.nextAt))[0];
}

/** The newest run of a trigger among `runs` (newest first); `null` when none is among them. */
export function lastRunOf(runs: readonly RunWire[], trigger: string): RunWire | null {
    return runs.find((run) => run.trigger.trigger === trigger) ?? null;
}

export function oldestWaiting(runs: readonly RunWire[]): RunWire | undefined {
    return [...runs].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))[0];
}

/** The start-run payload: JSON, an empty text being `{}`. */
export function parsePayload(text: string): PayloadResult {
    if (!text.trim()) return { ok: true, value: {} };
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (e) {
        return { ok: false, message: `The payload is not valid JSON (${e instanceof Error ? e.message : String(e)}). Fix it, or send {} for an empty payload.` };
    }
}

/** A budget timeout as "15 min", "45 s" or "2 h". */
export function formatBudgetTime(ms: number | undefined): string {
    if (ms === undefined) return 'none';
    if (ms % 3_600_000 === 0) return `${ms / 3_600_000} h`;
    if (ms % 60_000 === 0) return `${ms / 60_000} min`;
    return `${Math.round(ms / 1000)} s`;
}

/** The failed tile's line: the newest failed run and its error code. */
export function failedSummary(activity: Activity): string {
    const run = activity.lastFailed;
    return run ? `${run.id.slice(0, 8)} · ${run.error?.code ?? 'failed'}` : 'no failures';
}
