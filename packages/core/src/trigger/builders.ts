import { CronExpressionParser } from 'cron-parser';
import { InvalidAgentDefinitionError } from '../errors.ts';
import type {
    CronOptions, 
    HttpTriggerOptions, 
    ManualTriggerOptions, 
    TriggerDefinition,
} from './types.ts';

export function cron(expression: string, opts: CronOptions = {}): TriggerDefinition {
    try {
        CronExpressionParser.parse(expression, opts.timezone ? { tz: opts.timezone } : {});
    } catch (e) {
        throw new InvalidAgentDefinitionError(
            `Invalid cron expression "${expression}": ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    return {
        source: 'cron',
        id: `cron:${expression}`,
        options: {
            expression,
            timezone: opts.timezone,
            overlap: opts.overlap ?? 'skip',
            payload: opts.payload,
        },
    };
}

export function http(opts: HttpTriggerOptions = {}): TriggerDefinition {
    const path = opts.path ?? '/';
    return {
        source: 'http',
        id: `http:${path}`,
        options: { path, schema: opts.schema },
    };
}

export function manual(opts: ManualTriggerOptions = {}): TriggerDefinition {
    return {
        source: 'manual',
        id: 'manual',
        options: { schema: opts.schema },
    };
}
