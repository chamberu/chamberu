/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IRunArtifacts } from '../artifact/types.ts';
import type { ToolChannels } from '../channel/types.ts';
import type { RunContext } from '../run/types.ts';
import type { IAgentState, StateSchema } from '../state/types.ts';

/**
 * What a chamvi tool (built with `defineTool` or `defineEffectTool`) gets as
 * `context` in `execute`: one object per execution, shared by every call of
 * it and by the tools factory. Treat it as immutable. Values provided on the
 * engine (`engine.provide`) are reached with `inject(ctx, key)`, never as a field.
 */
export type ToolContext<S extends StateSchema = StateSchema> = {
    /**
     * Run-bound handles on the engine's channels with `out`: `findOne(name?)`
     * (no name: the channel the run came from), `findOneOrFail(name?)`, `find()`.
     */
    channels: ToolChannels;
    run: RunContext;
    state: IAgentState<S>;
    /**
     * The run's artifacts (its attachments and files tools stored). Not an
     * effect: put `put()` inside a `defineEffectTool` to store a file exactly once.
     */
    artifacts: IRunArtifacts;
};
