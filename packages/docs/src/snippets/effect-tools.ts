import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
    defineAgent,
    defineEffectTool,
    effectMarker,
} from '@chamberu/core';

interface Comment {
    id: number;
    url: string;
}

declare function findComment(issue: number, marker: string): Promise<Comment | undefined>;
declare function postComment(issue: number, body: string): Promise<Comment>;

export function createResponder(model: LanguageModel) {
    // #region reconcile
    const responder = defineAgent({
        name: 'responder',
        model,
        instructions: 'Answer new issues.',
        tools: ({ run }) => {
            const keyOf = ({ issue }: { issue: number }) => `${run.runId}:comment:${issue}`;

            return {
                comment: defineEffectTool({
                    description: 'Posts a comment on the issue.',
                    inputSchema: z.object({ issue: z.number(), body: z.string() }),
                    // one comment per run and issue, whatever the body says
                    effectKey: keyOf,
                    // finds a comment an earlier, crashed attempt already posted
                    alreadyApplied: async (key, { issue }) => findComment(issue, effectMarker(key)),
                    execute: async (input) => postComment(
                        input.issue,
                        `${input.body}\n${effectMarker(keyOf(input))}`,
                    ),
                }),
            };
        },
    });
    // #endregion reconcile

    return responder;
}
