/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Output, tool } from 'ai';
import type { LanguageModel, ToolSet } from 'ai';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import { RunEngine, defineAgent } from '@chamberu/core';
import { MemoryStore } from '../../../src/store/index.ts';
import { mockModel } from '../../utils/mock-model.ts';
import type { MockResponse } from '../../utils/mock-model.ts';

const engines: RunEngine[] = [];

afterEach(() => {
    for (const e of engines) e.stop();
    engines.length = 0;
});

const env = {
    agent: 'triage',
    trigger: 'http',
    source: 'http' as const,
    payload: { issue: 42 },
};

const output = Output.object({ schema: z.object({ label: z.enum(['bug', 'feature']) }) });

function make(model: LanguageModel, opts: {
    tools?: () => ToolSet; 
    maxSteps?: number; 
    output?: typeof output 
} = {}) {
    const store = new MemoryStore();
    const agent = defineAgent({
        name: 'triage',
        instructions: 'You triage.',
        model,
        tools: opts.tools,
        output: 'output' in opts ? opts.output : output,
        ...(opts.maxSteps ? { budget: { maxSteps: opts.maxSteps } } : {}),
    });
    const engine = new RunEngine({
        store,
        agents: [agent],
        resumeSecret: 's',
        onError: () => {},
    });
    engines.push(engine);
    return { store, engine };
}

async function runOnce(model: LanguageModel, opts: Parameters<typeof make>[1] = {}) {
    const { engine, store } = make(model, opts);
    await engine.start();
    const { runId } = await engine.dispatch(env);
    await engine.idle();
    return store.getRun(runId);
}

const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });

describe('structured output', () => {
    it('stores the parsed object as the run output', async () => {
        const run = await runOnce(mockModel([text('{"label":"bug"}')]));
        expect(run?.status).toBe('completed');
        expect(run?.output).toEqual({ label: 'bug' });
    });

    it('parses the final answer after tool calls', async () => {
        const run = await runOnce(mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'lookup',
                    input: { q: 1 },
                }],
            },
            text('{"label":"feature"}'),
        ]), {
            tools: () => ({
                lookup: tool({
                    inputSchema: z.object({ q: z.number() }),
                    execute: async () => 'found',
                }),
            }),
        });
        expect(run?.status).toBe('completed');
        expect(run?.output).toEqual({ label: 'feature' });
    });

    it('fails with a validation error on invalid JSON', async () => {
        const run = await runOnce(mockModel([text('not json')]));
        expect(run?.status).toBe('failed');
        expect(run?.error?.code).toBe('validation_error');
        expect(run?.error?.message).toMatch(/could not parse/);
        // the cause names the offending text
        expect(run?.error?.message).toMatch(/not json/);
    });

    it('fails with a validation error on a schema mismatch', async () => {
        const run = await runOnce(mockModel([text('{"label":"other"}')]));
        expect(run?.status).toBe('failed');
        expect(run?.error?.code).toBe('validation_error');
        expect(run?.error?.message).toMatch(/did not match schema/);
        // the cause names the offending field
        expect(run?.error?.message).toMatch(/"path":\s*\[\s*"label"\s*\]/);
    });

    it('plain agents keep the text output', async () => {
        const run = await runOnce(mockModel([text('{"label":"bug"}')]), { output: undefined });
        expect(run?.output).toBe('{"label":"bug"}');
    });

    it.each([
        ['{"label":"bug"}', 'completed'],
        ['oops', 'failed'],
    ])('parses the answer of an earlier execution at the step limit (%s)', async (answer, status) => {
        const model = mockModel([]);
        const { engine, store } = make(model, { maxSteps: 2 });
        const { runId } = await engine.dispatch(env);
        await store.saveCheckpoint({
            runId,
            stepIndex: 1,
            messages: [
                { role: 'user', content: 'q' },
                { role: 'assistant', content: [{ type: 'text', text: answer }] },
            ],
            finishReason: 'stop',
            createdAt: new Date(),
        });
        await engine.start();
        await engine.idle();
        const run = await store.getRun(runId);
        expect(run?.status).toBe(status);
        if (status === 'completed') expect(run?.output).toEqual({ label: 'bug' });
        else expect(run?.error?.code).toBe('validation_error');
        expect(model.doStreamCalls).toHaveLength(0);
    });
});
