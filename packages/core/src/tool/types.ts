/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IRunArtifacts } from '../artifact/types.ts';
import type { RunContext } from '../run/types.ts';
import type { IAgentState, StateSchema } from '../state/types.ts';

/**
 * What a chamberu tool (built with `defineTool` or `defineEffectTool`) gets as
 * `context` in `execute`: one object per execution, shared by every call of
 * it and by the tools factory. Treat it as immutable.
 */
export type ToolContext<S extends StateSchema = StateSchema> = {
    run: RunContext;
    state: IAgentState<S>;
    /**
     * The run's artifacts (its attachments and files tools stored). Not an
     * effect: put `put()` inside a `defineEffectTool` to store a file exactly once.
     */
    artifacts: IRunArtifacts;
};
