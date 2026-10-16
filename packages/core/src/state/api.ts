import type { StandardSchemaV1 } from '@standard-schema/spec';
import { ValidationError } from '../errors.ts';
import type { StateStore } from '../store/types.ts';

export type StateSchema = Record<string, StandardSchemaV1>;
export type Infer<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>;

export interface AgentState<S extends StateSchema = StateSchema> {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    collection<K extends keyof S & string>(name: K): {
        list(q?: { where?: Partial<Infer<S[K]>>; limit?: number }): Promise<Array<{ id: string } & Infer<S[K]>>>;
        /** Validates `doc` via the collection's Standard Schema; throws ValidationError and stores nothing on failure. */
        upsert(id: string, doc: Infer<S[K]>): Promise<void>;
        remove(id: string): Promise<void>;
    };
}

function describeIssues(issues: ReadonlyArray<StandardSchemaV1.Issue>): string {
    return issues.map((issue) => {
        const path = (issue.path ?? [])
            .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
            .join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
    }).join('; ');
}

async function validate(agent: string, coll: string, schema: StateSchema | undefined, doc: unknown): Promise<unknown> {
    if (!schema) return doc;
    const collSchema = Object.hasOwn(schema, coll) ? schema[coll] : undefined;
    if (!collSchema) {
        throw new ValidationError(`Agent "${agent}" declares no state collection "${coll}".`);
    }
    const result = await collSchema['~standard'].validate(doc);
    if (result.issues) {
        const issues = result.issues.map((issue) => ({
            message: issue.message,
            path: issue.path?.map((segment) => (typeof segment === 'object' ? segment.key : segment)),
        }));
        throw new ValidationError(
            `Invalid "${coll}" document: ${describeIssues(result.issues)}`,
            issues,
        );
    }
    return result.value;
}

/**
 * Store-backed AgentState scoped to one agent. With a schema, collection
 * documents are validated (and stored as the schema's output) on upsert, and
 * only declared collections are writable; without one, nothing is validated.
 */
export function createAgentState<S extends StateSchema = StateSchema>(
    agent: string,
    schema: S | undefined,
    store: StateStore,
): AgentState<S> {
    return {
        get: async <T = unknown>(key: string) => await store.kvGet(agent, key) as T | undefined,
        set: (key, value) => store.kvSet(agent, key, value),
        collection: <K extends keyof S & string>(name: K) => ({
            list: async (q?: { where?: Partial<Infer<S[K]>>; limit?: number }) => {
                const rows = await store.docList(agent, name, {
                    where: q?.where as Record<string, unknown> | undefined,
                    limit: q?.limit,
                });
                return rows.map(({ id, doc }) => ({ ...(doc as object), id }) as { id: string } & Infer<S[K]>);
            },
            upsert: async (id: string, doc: Infer<S[K]>) => {
                const value = await validate(agent, name, schema, doc);
                await store.docUpsert(agent, name, id, value);
            },
            remove: (id: string) => store.docDelete(agent, name, id),
        }),
    };
}
