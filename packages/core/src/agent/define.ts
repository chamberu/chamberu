import { InvalidAgentDefinitionError } from '../errors.ts';
import type { StateSchema } from '../state/api.ts';
import type { Agent, AgentDefinition } from './types.ts';

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NAME_MAX_LENGTH = 64;

export const DEFAULT_MAX_STEPS = 20;
export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export function defineAgent<S extends StateSchema = StateSchema>(def: AgentDefinition<S>): Agent<S> {
    if (
        typeof def.name !== 'string' ||
        def.name.length > NAME_MAX_LENGTH ||
        !NAME_PATTERN.test(def.name)
    ) {
        throw new InvalidAgentDefinitionError(
            `Invalid agent name "${String(def.name)}": must match ${NAME_PATTERN} and be at most ${NAME_MAX_LENGTH} characters.`,
        );
    }

    const seen = new Set<string>();
    for (const trigger of def.triggers ?? []) {
        if (seen.has(trigger.id)) {
            throw new InvalidAgentDefinitionError(
                `Agent "${def.name}" has duplicate trigger id "${trigger.id}".`,
            );
        }
        seen.add(trigger.id);
    }

    return {
        name: def.name,
        definition: {
            ...def,
            budget: {
                maxSteps: DEFAULT_MAX_STEPS,
                timeoutMs: DEFAULT_TIMEOUT_MS,
                ...def.budget,
            },
        },
    };
}
