import { randomUUID } from 'node:crypto';
import type { StandardJSONSchemaV1 } from '@standard-schema/spec';
import { jsonSchema, tool } from 'ai';
import type { JSONSchema7, ToolSet } from 'ai';
import { defineEffectTool } from '../effect/define.ts';
import type { AgentState, StateSchema } from './api.ts';

/** The collection's JSON Schema when its Standard Schema can produce one, else any object. */
function docJsonSchema(schema: StateSchema[string]): JSONSchema7 {
    const converter = (schema['~standard'] as Partial<StandardJSONSchemaV1.Props>).jsonSchema;
    if (converter) {
        try {
            const converted = { ...converter.input({ target: 'draft-07' }) } as JSONSchema7;
            delete converted.$schema;
            return converted;
        } catch {
            // not representable as JSON Schema: fall through
        }
    }
    return { type: 'object' };
}

/**
 * State writes are idempotent but not commutative: memoizing them by input
 * would drop the last write of upsert A, upsert B, upsert A (in a run or its
 * replay). Every invocation therefore gets its own effect key, so a write is
 * always applied.
 */
const perCallKey = (tool: string) => (_input: unknown, ctx: { runId: string }) => `${ctx.runId}:${tool}:${randomUUID()}`;

/**
 * Tools exposing the agent's state collections to the model:
 * `state_<coll>_list`, `state_<coll>_upsert` and `state_<coll>_remove`
 * (the latter two are effect tools). Upsert validates via the state API, so an
 * invalid document becomes a tool error the model can correct.
 */
export function createStateTools<S extends StateSchema>(state: AgentState<S>, schema: S): ToolSet {
    const tools: ToolSet = {};
    for (const coll of Object.keys(schema) as Array<keyof S & string>) {
        const collection = state.collection(coll);
        const doc = docJsonSchema(schema[coll] as StateSchema[string]);

        tools[`state_${coll}_list`] = tool({
            description: `List documents of the "${coll}" state collection, optionally filtered by top-level field equality.`,
            inputSchema: jsonSchema<{ where?: Record<string, unknown>; limit?: number }>({
                type: 'object',
                properties: {
                    where: { type: 'object', description: 'Top-level fields that must equal the given values.' },
                    limit: { type: 'integer', minimum: 1 },
                },
                additionalProperties: false,
            }),
            execute: async (input) => collection.list({ where: input.where as never, limit: input.limit }),
        });

        tools[`state_${coll}_upsert`] = defineEffectTool({
            effectKey: perCallKey(`state_${coll}_upsert`),
            description: `Create or replace the document with this id in the "${coll}" state collection.`,
            inputSchema: jsonSchema<{ id: string; doc: unknown }>({
                type: 'object',
                properties: { id: { type: 'string' }, doc },
                required: ['id', 'doc'],
                additionalProperties: false,
            }),
            execute: async (input) => {
                await collection.upsert(input.id, input.doc as never);
                return { ok: true, id: input.id };
            },
        });

        tools[`state_${coll}_remove`] = defineEffectTool({
            effectKey: perCallKey(`state_${coll}_remove`),
            description: `Remove the document with this id from the "${coll}" state collection.`,
            inputSchema: jsonSchema<{ id: string }>({
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
                additionalProperties: false,
            }),
            execute: async (input) => {
                await collection.remove(input.id);
                return { ok: true, id: input.id };
            },
        });
    }
    return tools;
}
