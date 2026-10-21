/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ScheduleWire } from '../api/types.ts';

export type ScheduleGroup = { agent: string; schedules: ScheduleWire[] };

/** By agent name, each agent's triggers by their next fire time. */
export function groupByAgent(schedules: readonly ScheduleWire[]): ScheduleGroup[] {
    const groups = new Map<string, ScheduleWire[]>();
    for (const schedule of schedules) groups.set(schedule.agent, [...groups.get(schedule.agent) ?? [], schedule]);
    return groups.entries().toArray()
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([agent, list]) => ({ agent, schedules: list.sort((a, b) => Date.parse(a.nextAt) - Date.parse(b.nextAt)) }));
}

/** `Thu 22 Oct, 08:00` in the trigger's time zone (the browser's without one). */
export function formatFireTime(iso: string, timezone?: string): string {
    return new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
        ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(iso));
}
