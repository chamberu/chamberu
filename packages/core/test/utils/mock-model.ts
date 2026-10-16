import type { LanguageModelV4GenerateResult, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

export type MockResponse =    | {
    type: 'text'; 
    text: string; 
    usage?: { inputTokens: number; outputTokens: number } 
} |
    {
        type: 'tool-call'; 
        toolName: string; 
        input: unknown; 
        toolCallId?: string; 
        usage?: { inputTokens: number; outputTokens: number } 
    };

const DEFAULT_USAGE = { inputTokens: 1, outputTokens: 1 };

function usageOf(r: MockResponse) {
    const u = r.usage ?? DEFAULT_USAGE;
    return {
        inputTokens: {
            total: u.inputTokens, 
            noCache: u.inputTokens, 
            cacheRead: undefined, 
            cacheWrite: undefined, 
        },
        outputTokens: {
            total: u.outputTokens, 
            text: u.outputTokens, 
            reasoning: undefined, 
        },
    } as LanguageModelV4GenerateResult['usage'];
}

function contentOf(r: MockResponse, index: number): LanguageModelV4GenerateResult['content'] {
    if (r.type === 'text') return [{ type: 'text', text: r.text }];
    return [{
        type: 'tool-call',
        toolCallId: r.toolCallId ?? `call-${index}`,
        toolName: r.toolName,
        input: JSON.stringify(r.input),
    }];
}

/**
 * Mock language model that answers call N with responses[N] (the last one
 * repeats). Works for generate and stream.
 */
export function mockModel(responses: MockResponse[]) {
    let generateCalls = 0;
    let streamCalls = 0;
    const pick = (n: number) => {
        const index = Math.min(n, responses.length - 1);
        return { r: responses[index]!, index };
    };
    const finishReason = (r: MockResponse) => ({ unified: r.type === 'text' ? 'stop' : 'tool-calls', raw: undefined }) as LanguageModelV4GenerateResult['finishReason'];

    return new MockLanguageModelV4({
        doGenerate: async () => {
            const { r, index } = pick(generateCalls++);
            return {
                content: contentOf(r, index),
                finishReason: finishReason(r),
                usage: usageOf(r),
                warnings: [],
            };
        },
        doStream: async () => {
            const { r, index } = pick(streamCalls++);
            const chunks: LanguageModelV4StreamPart[] = [{ type: 'stream-start', warnings: [] }];
            for (const part of contentOf(r, index)) {
                if (part.type === 'text') {
                    chunks.push(
                        { type: 'text-start', id: 't' },
                        {
                            type: 'text-delta', 
                            id: 't', 
                            delta: part.text, 
                        },
                        { type: 'text-end', id: 't' },
                    );
                } else if (part.type === 'tool-call') {
                    chunks.push(part);
                }
            }
            chunks.push({
                type: 'finish', 
                finishReason: finishReason(r), 
                usage: usageOf(r), 
            });
            return { stream: simulateReadableStream({ chunks }) };
        },
    });
}
