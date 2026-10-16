import type { StandardSchemaV1 } from '@standard-schema/spec';

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
