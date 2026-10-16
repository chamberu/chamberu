import { generateText } from 'ai';
import { describe, expect, it } from 'vitest';
import { mockModel } from '../../utils/mock-model.ts';

describe('mockModel', () => {
    it('replays scripted responses with usage', async () => {
        const model = mockModel([
            {
                type: 'tool-call', 
                toolName: 'lookup', 
                input: { q: 1 }, 
                usage: { inputTokens: 3, outputTokens: 4 }, 
            },
            { type: 'text', text: 'done' },
        ]);
        const first = await generateText({ model, prompt: 'hi' });
        expect(first.toolCalls[0]?.toolName).toBe('lookup');
        expect(first.usage.inputTokens).toBe(3);
        const second = await generateText({ model, prompt: 'hi' });
        expect(second.text).toBe('done');
    });
});
