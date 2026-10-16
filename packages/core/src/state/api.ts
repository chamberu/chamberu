import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { StateStore } from '../store/types.ts';

export type StateSchema = Record<string, StandardSchemaV1>;
export type Infer<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>;

export interface AgentState<S extends StateSchema = StateSchema> {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    collection<K extends keyof S & string>(name: K): {
        list(q?: { where?: Partial<Infer<S[K]>>; limit?: number }): Promise<Array<{ id: string } & Infer<S[K]>>>;
        upsert(id: string, doc: Infer<S[K]>): Promise<void>;
        remove(id: string): Promise<void>;
    };
}

/**
 * Store-backed AgentState scoped to one agent. Values are not validated
 * against the state schema yet.
 */
export function createAgentState<S extends StateSchema = StateSchema>(store: StateStore, agent: string): AgentState<S> {
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
            upsert: (id: string, doc: Infer<S[K]>) => store.docUpsert(agent, name, id, doc),
            remove: (id: string) => store.docDelete(agent, name, id),
        }),
    };
}
